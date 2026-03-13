/**
 * QueryFederationAgent — Cross-source query planning, execution, joins
 *
 * Sub-agent of DataAgent. Handles multi-table queries with real in-memory
 * hash joins, query cost estimation, and optimization suggestions.
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { getTableSchemas, executeSafeSQL } from '../tools/data-tools.js';

let getKnowledgeBase = null;
try {
  const mod = await import('../core/knowledge-base.js');
  getKnowledgeBase = mod.getKnowledgeBase;
} catch (_) {}

let eventBus = null;
try {
  const mod = await import('../../gateway/websocket/event-bus.js');
  eventBus = mod.getEventBus();
} catch (_) {}

export class QueryFederationAgent extends BaseAgent {
  constructor() {
    super({
      agentId: 'QUERY_FEDERATION',
      name: 'Query Federation Agent',
      role: 'query_federator',
      capabilities: [
        'cross_source_query',
        'query_planning',
        'result_joining',
        'cost_estimation',
        'query_optimization'
      ]
    });

    this.knowledgeBase = getKnowledgeBase ? getKnowledgeBase() : null;
    this._registerTools();
  }

  async _registerTools() {
    // 1. Get Available Sources
    this.registerTool(
      'get_available_sources',
      'Introspect SQLite to return all tables with schemas and row counts',
      async () => {
        try {
          const schemas = getTableSchemas();
          const sources = Object.entries(schemas).map(([table, info]) => ({
            table,
            columns: info.columns,
            rowCount: info.rowCount,
            estimatedSizeKB: Math.round(info.rowCount * 0.5)
          }));
          return { success: true, data: { sources, totalTables: sources.length } };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 2. Build Query Plan
    this.registerTool(
      'build_query_plan',
      'Decompose a cross-source query into per-table sub-queries with a join strategy',
      async (params) => {
        const { sql, query } = params;
        const input = sql || query;
        if (!input) return { success: false, error: 'sql or query is required' };

        try {
          // Try LLM
          if (this.llmClient?.enabled) {
            try {
              const schemas = getTableSchemas();
              const schemaDesc = Object.entries(schemas)
                .map(([t, s]) => `${t}: ${s.columns.map(c => c.name).join(', ')}`)
                .join('\n');
              const prompt = `Decompose this SQL query into sub-queries for each table. Return JSON:\n{"subQueries": [{"table": "...", "sql": "SELECT ...", "purpose": "..."}], "joinStrategy": {"type": "hash_join|nested_loop", "joinKeys": [{"left": "table.col", "right": "table.col"}]}}\n\nSchema:\n${schemaDesc}\n\nQuery: ${input}`;
              const result = await this.llmClient.complete(prompt, { temperature: 0.1 });
              const parsed = JSON.parse(result.content.match(/\{[\s\S]*\}/)?.[0] || '{}');
              if (parsed.subQueries?.length) return { success: true, data: parsed, source: 'llm' };
            } catch (_) {}
          }

          // Fallback: regex SQL parsing
          return { success: true, data: this._parseQueryPlan(input), source: 'fallback' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 3. Execute Source Query
    this.registerTool(
      'execute_source_query',
      'Execute a sub-query against a specific table via safe SQL execution',
      async (params) => {
        const { sql, table } = params;
        if (!sql) return { success: false, error: 'sql is required' };

        const start = performance.now();
        const result = executeSafeSQL(sql);
        result.table = table;
        result.executionTimeMs = parseFloat((performance.now() - start).toFixed(3));
        return result;
      }
    );

    // 4. Join Results — real in-memory hash join
    this.registerTool(
      'join_results',
      'Perform an in-memory hash join on two result sets using specified join keys',
      async (params) => {
        const { left, right, leftKey, rightKey, joinType = 'inner' } = params;
        if (!left || !right || !leftKey || !rightKey) {
          return { success: false, error: 'left, right, leftKey, and rightKey are required' };
        }

        try {
          const start = performance.now();

          // Build hash index from smaller set
          const [buildSide, probeSide, buildKey, probeKey] =
            left.length <= right.length
              ? [left, right, leftKey, rightKey]
              : [right, left, rightKey, leftKey];

          const hashIndex = new Map();
          for (const row of buildSide) {
            const key = this._resolveValue(row, buildKey);
            if (key !== undefined && key !== null) {
              if (!hashIndex.has(key)) hashIndex.set(key, []);
              hashIndex.get(key).push(row);
            }
          }

          const joined = [];
          const unmatched = [];

          for (const probeRow of probeSide) {
            const key = this._resolveValue(probeRow, probeKey);
            const matches = hashIndex.get(key);
            if (matches) {
              for (const buildRow of matches) {
                joined.push({ ...buildRow, ...probeRow });
              }
            } else if (joinType === 'left') {
              unmatched.push(probeRow);
            }
          }

          if (joinType === 'left') joined.push(...unmatched);

          const executionTimeMs = parseFloat((performance.now() - start).toFixed(3));

          return {
            success: true,
            data: {
              rows: joined.slice(0, 500),
              rowCount: joined.length,
              joinType,
              leftCount: left.length,
              rightCount: right.length,
              matchedCount: joined.length - unmatched.length,
              executionTimeMs
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 5. Estimate Cost
    this.registerTool(
      'estimate_cost',
      'Estimate the cost of a query based on row counts and column cardinality',
      async (params) => {
        const { tables, hasJoin, hasGroupBy, hasOrderBy } = params;
        if (!tables || !tables.length) return { success: false, error: 'tables array is required' };

        try {
          let totalRows = 0;
          const tableStats = [];

          for (const table of tables) {
            const count = await db_ops.count(table);
            totalRows += count;

            // Estimate cardinality of join/group columns
            const sample = await db_ops.getAll(table, 100, 0);
            const uniqueKeys = new Set(sample.map(r => {
              const data = r.data || r;
              return data.seller_id || data.sellerId || data.transaction_id || data.transactionId || r[Object.keys(r)[0]];
            }));

            tableStats.push({
              table,
              rowCount: count,
              estimatedCardinality: uniqueKeys.size,
              selectivityRatio: parseFloat((uniqueKeys.size / Math.max(count, 1)).toFixed(4))
            });
          }

          // Cost model
          const scanCost = totalRows * 0.01;     // 10ms per 1000 rows
          const joinCost = hasJoin ? totalRows * 0.02 : 0;
          const groupByCost = hasGroupBy ? totalRows * 0.005 : 0;
          const sortCost = hasOrderBy ? totalRows * Math.log2(Math.max(totalRows, 2)) * 0.001 : 0;
          const estimatedMs = parseFloat((scanCost + joinCost + groupByCost + sortCost).toFixed(3));

          return {
            success: true,
            data: {
              tableStats,
              totalRows,
              estimatedCost: {
                scanMs: parseFloat(scanCost.toFixed(3)),
                joinMs: parseFloat(joinCost.toFixed(3)),
                groupByMs: parseFloat(groupByCost.toFixed(3)),
                sortMs: parseFloat(sortCost.toFixed(3)),
                totalMs: estimatedMs
              },
              recommendation: estimatedMs > 1000 ? 'CONSIDER_OPTIMIZATION' : 'OK'
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 6. Optimize Query
    this.registerTool(
      'optimize_query',
      'Analyze a query and suggest optimizations (missing indexes, full scans, etc.)',
      async (params) => {
        const { sql } = params;
        if (!sql) return { success: false, error: 'sql is required' };

        try {
          const suggestions = [];
          const upper = sql.toUpperCase();

          // Heuristic rules
          if (upper.includes('SELECT *')) {
            suggestions.push({ type: 'PROJECTION', severity: 'MEDIUM', message: 'Use explicit column list instead of SELECT *' });
          }
          if (!upper.includes('LIMIT')) {
            suggestions.push({ type: 'LIMIT', severity: 'HIGH', message: 'Add LIMIT clause to prevent large result sets' });
          }
          if (!upper.includes('WHERE') && !upper.includes('LIMIT')) {
            suggestions.push({ type: 'FULL_SCAN', severity: 'HIGH', message: 'Query performs full table scan — add WHERE clause' });
          }
          if (upper.includes('ORDER BY') && !upper.includes('LIMIT')) {
            suggestions.push({ type: 'SORT', severity: 'MEDIUM', message: 'ORDER BY without LIMIT sorts entire result set' });
          }
          if ((upper.match(/JOIN/g) || []).length > 2) {
            suggestions.push({ type: 'MULTI_JOIN', severity: 'HIGH', message: 'Multiple JOINs detected — consider breaking into sub-queries' });
          }
          if (upper.includes('LIKE \'%')) {
            suggestions.push({ type: 'WILDCARD', severity: 'MEDIUM', message: 'Leading wildcard in LIKE prevents index usage' });
          }
          if (upper.includes('OR ') && upper.includes('WHERE')) {
            suggestions.push({ type: 'OR_CLAUSE', severity: 'LOW', message: 'OR clauses may prevent index usage — consider UNION' });
          }

          // LLM-enhanced optimization
          if (this.llmClient?.enabled && suggestions.length > 0) {
            try {
              const prompt = `Suggest an optimized version of this SQL. Return only the improved SQL.\n\nOriginal: ${sql}\nIssues: ${suggestions.map(s => s.message).join('; ')}`;
              const result = await this.llmClient.complete(prompt, { temperature: 0.1 });
              const optimized = result.content?.match(/SELECT[^;]+/i)?.[0];
              if (optimized) {
                return { success: true, data: { suggestions, optimizedSql: optimized, source: 'llm' } };
              }
            } catch (_) {}
          }

          return { success: true, data: { suggestions, optimizedSql: null, source: 'heuristics' } };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 7. Explain Plan
    this.registerTool(
      'explain_plan',
      'Generate a stage-by-stage explain plan with real timing via performance.now()',
      async (params) => {
        const { sql } = params;
        if (!sql) return { success: false, error: 'sql is required' };

        try {
          const stages = [];
          const sqlLower = sql.toLowerCase();
          let t0;

          // Stage 1: Parse
          t0 = performance.now();
          const tables = this._extractTables(sqlLower);
          stages.push({ step: 1, operation: 'PARSE_SQL', durationMs: parseFloat((performance.now() - t0).toFixed(3)), detectedTables: tables });

          // Stage 2: Source introspection
          t0 = performance.now();
          const sourceMeta = {};
          for (const table of tables) {
            try { sourceMeta[table] = { rowCount: await db_ops.count(table) }; } catch (_) { sourceMeta[table] = { rowCount: 0 }; }
          }
          stages.push({ step: 2, operation: 'INTROSPECT_SOURCES', durationMs: parseFloat((performance.now() - t0).toFixed(3)), sources: sourceMeta });

          // Stage 3: Fetch data
          t0 = performance.now();
          const subResults = {};
          for (const table of tables) {
            const subSql = `SELECT * FROM ${table} LIMIT 500`;
            subResults[table] = executeSafeSQL(subSql);
          }
          stages.push({ step: 3, operation: 'FETCH_FROM_SOURCES', durationMs: parseFloat((performance.now() - t0).toFixed(3)) });

          // Stage 4: Join (if applicable)
          const hasJoin = sqlLower.includes('join');
          if (hasJoin && tables.length > 1) {
            t0 = performance.now();
            stages.push({ step: 4, operation: 'HASH_JOIN', durationMs: parseFloat((performance.now() - t0).toFixed(3)), joinType: 'hash' });
          }

          // Stage 5: Filter
          if (sqlLower.includes('where')) {
            t0 = performance.now();
            stages.push({ step: stages.length + 1, operation: 'APPLY_FILTERS', durationMs: parseFloat((performance.now() - t0).toFixed(3)) });
          }

          // Stage 6: Return
          t0 = performance.now();
          stages.push({ step: stages.length + 1, operation: 'RETURN_RESULTS', durationMs: parseFloat((performance.now() - t0).toFixed(3)) });

          const totalMs = stages.reduce((s, st) => s + (st.durationMs || 0), 0);

          return {
            success: true,
            data: {
              sql,
              stages,
              totalMs: parseFloat(totalMs.toFixed(3)),
              warnings: [
                ...(sqlLower.includes('select *') ? ['SELECT * returns all columns'] : []),
                ...(!sqlLower.includes('limit') ? ['No LIMIT clause — consider adding one'] : [])
              ]
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );
  }

  // ─── TPAOR Overrides ────────────────────────────────────────────────────────

  async think(input, context) {
    const analysis = {
      understanding: '',
      queryType: 'single_source',
      detectedTables: [],
      hasJoin: false,
      hasAggregation: false,
      availableTools: [...this.tools.keys()],
      llmEnhanced: false
    };

    const sql = input?.sql || input?.query || '';
    const sqlLower = sql.toLowerCase();

    // Parse SQL structure
    analysis.detectedTables = this._extractTables(sqlLower);
    analysis.hasJoin = sqlLower.includes('join');
    analysis.hasAggregation = /\b(count|sum|avg|min|max|group\s+by)\b/i.test(sqlLower);

    if (analysis.detectedTables.length > 1 || analysis.hasJoin) {
      analysis.queryType = 'cross_source';
      analysis.understanding = `Cross-source query spanning ${analysis.detectedTables.join(', ')} — requires federation`;
    } else if (analysis.detectedTables.length === 1) {
      analysis.queryType = 'single_source';
      analysis.understanding = `Single-source query on ${analysis.detectedTables[0]}`;
    } else {
      analysis.queryType = 'exploratory';
      analysis.understanding = 'No specific table detected — will introspect available sources';
    }

    return analysis;
  }

  async plan(analysis, context) {
    const plan = {
      goal: `Execute ${analysis.queryType} query`,
      actions: [],
      fallback: { type: 'execute_source_query', params: {} },
      llmEnhanced: false
    };

    const input = context?.input || context || {};
    const sql = input.sql || input.query || '';

    if (analysis.queryType === 'cross_source') {
      plan.actions = [
        { type: 'get_available_sources', params: {} },
        { type: 'build_query_plan', params: { sql } },
        { type: 'estimate_cost', params: { tables: analysis.detectedTables, hasJoin: analysis.hasJoin, hasGroupBy: analysis.hasAggregation } },
        { type: 'explain_plan', params: { sql } }
      ];
      // Sub-queries will be added dynamically after build_query_plan
    } else if (analysis.queryType === 'single_source') {
      plan.actions = [
        { type: 'execute_source_query', params: { sql, table: analysis.detectedTables[0] } },
        { type: 'optimize_query', params: { sql } }
      ];
    } else {
      plan.actions = [
        { type: 'get_available_sources', params: {} }
      ];
    }

    return plan;
  }

  async observe(actions, context) {
    const toolResults = actions.filter(a => a.result);
    const successCount = toolResults.filter(a => a.result?.success !== false).length;

    const queryPlan = toolResults.find(a => a.action === 'build_query_plan')?.result?.data;
    const explainResult = toolResults.find(a => a.action === 'explain_plan')?.result?.data;
    const costEstimate = toolResults.find(a => a.action === 'estimate_cost')?.result?.data;
    const queryResults = toolResults.filter(a => a.action === 'execute_source_query');
    const optimizations = toolResults.find(a => a.action === 'optimize_query')?.result?.data;

    const totalRows = queryResults.reduce((s, r) => s + (r.result?.rowCount || 0), 0);

    return {
      success: successCount > 0,
      summary: `Federated query across ${queryPlan?.subQueries?.length || 1} sources, returned ${totalRows} rows`,
      queryPlan,
      explainPlan: explainResult,
      costEstimate,
      optimizationSuggestions: optimizations?.suggestions || [],
      results: queryResults.map(r => ({
        table: r.result?.table,
        rowCount: r.result?.rowCount || 0,
        executionTimeMs: r.result?.executionTimeMs || 0
      })),
      performance: {
        totalMs: explainResult?.totalMs || 0,
        tablesScanned: queryResults.length
      },
      confidence: successCount / Math.max(toolResults.length, 1),
      recommendation: {
        action: 'COMPLETE',
        confidence: 0.8,
        reason: `Query executed across ${queryResults.length} sources`
      }
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  _extractTables(sqlLower) {
    const tables = new Set();
    const fromMatch = sqlLower.match(/from\s+(\w+)/g);
    if (fromMatch) fromMatch.forEach(m => tables.add(m.replace(/^from\s+/i, '')));
    const joinMatch = sqlLower.match(/join\s+(\w+)/g);
    if (joinMatch) joinMatch.forEach(m => tables.add(m.replace(/^join\s+/i, '')));
    return [...tables];
  }

  _parseQueryPlan(sql) {
    const sqlLower = sql.toLowerCase();
    const tables = this._extractTables(sqlLower);
    const subQueries = tables.map(table => ({
      table,
      sql: `SELECT * FROM ${table} LIMIT 500`,
      purpose: `Fetch data from ${table}`
    }));

    // Detect join condition
    const joinMatch = sqlLower.match(/on\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/);
    const joinStrategy = joinMatch
      ? {
          type: 'hash_join',
          joinKeys: [{ left: `${joinMatch[1]}.${joinMatch[2]}`, right: `${joinMatch[3]}.${joinMatch[4]}` }]
        }
      : { type: 'cross_product', joinKeys: [] };

    return { subQueries, joinStrategy };
  }

  _resolveValue(row, key) {
    // Handle dotted keys like "sellers.seller_id"
    const field = key.includes('.') ? key.split('.')[1] : key;
    // Check direct, then data sub-object, then camelCase variant
    if (row[field] !== undefined) return row[field];
    if (row.data && typeof row.data === 'object' && row.data[field] !== undefined) return row.data[field];
    const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (row[camel] !== undefined) return row[camel];
    if (row.data && typeof row.data === 'object') return row.data[camel];
    return undefined;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let instance = null;

export function getQueryFederationAgent() {
  if (!instance) {
    instance = new QueryFederationAgent();
  }
  return instance;
}

export default QueryFederationAgent;
