/**
 * DataPlaygroundAgent — NL-to-SQL, entity profiling, anomaly detection
 *
 * Sub-agent of DataAgent. Handles interactive data exploration:
 * natural language queries, entity deep-dives, statistical anomalies.
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import {
  getTableSchemas,
  executeSafeSQL,
  computeZScores,
  computeDistribution,
  nlToSqlFallback
} from '../tools/data-tools.js';

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

export class DataPlaygroundAgent extends BaseAgent {
  constructor() {
    super({
      agentId: 'DATA_PLAYGROUND',
      name: 'Data Playground Agent',
      role: 'data_explorer',
      capabilities: [
        'nl_to_sql',
        'entity_profiling',
        'anomaly_detection',
        'data_aggregation',
        'distribution_analysis'
      ]
    });

    this.knowledgeBase = getKnowledgeBase ? getKnowledgeBase() : null;
    this._registerTools();
  }

  _registerTools() {
    // 1. Natural Language to SQL
    this.registerTool(
      'nl_to_sql',
      'Convert a natural language question into SQL and execute it against the database',
      async (params) => {
        const { question } = params;
        if (!question) return { success: false, error: 'question is required' };

        try {
          const schemas = getTableSchemas();
          let sql;

          // Try LLM first
          if (this.llmClient?.enabled) {
            try {
              const schemaDesc = Object.entries(schemas)
                .map(([t, s]) => `${t} (${s.rowCount} rows): ${s.columns.map(c => `${c.name} ${c.type}`).join(', ')}`)
                .join('\n');
              const prompt = `Convert this question to a SQLite SELECT query. Return ONLY the SQL, nothing else.\n\nDatabase schema:\n${schemaDesc}\n\nNote: Data is stored in a JSON 'data' column. Use json_extract(data, '$.fieldName') to access fields.\n\nQuestion: ${question}`;
              const result = await this.llmClient.complete(prompt, { temperature: 0.1 });
              const extracted = result.content?.match(/SELECT[^;]+/i);
              if (extracted) sql = extracted[0];
            } catch (_) {}
          }

          if (!sql) sql = nlToSqlFallback(question, schemas);

          const queryResult = executeSafeSQL(sql);
          return {
            success: queryResult.success,
            data: {
              question,
              sql: queryResult.sql || sql,
              rows: queryResult.rows || [],
              rowCount: queryResult.rowCount || 0,
              executionTimeMs: queryResult.executionTimeMs || 0,
              source: this.llmClient?.enabled && sql ? 'llm' : 'fallback'
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 2. Execute SQL
    this.registerTool(
      'execute_sql',
      'Execute a safe read-only SQL query against the database',
      async (params) => {
        const { sql, parameters } = params;
        if (!sql) return { success: false, error: 'sql is required' };
        return executeSafeSQL(sql, parameters || []);
      }
    );

    // 3. Profile Entity
    this.registerTool(
      'profile_entity',
      'Build a comprehensive profile of a seller by aggregating data across all tables',
      async (params) => {
        const { sellerId } = params;
        if (!sellerId) return { success: false, error: 'sellerId is required' };

        try {
          const seller = db_ops.getById('sellers', 'seller_id', sellerId);
          const transactions = db_ops.getAll('transactions', 1000, 0)
            .map(t => t.data || t)
            .filter(t => t.sellerId === sellerId);
          const payouts = db_ops.getAll('payouts', 1000, 0)
            .map(p => p.data || p)
            .filter(p => p.sellerId === sellerId);
          const listings = db_ops.getAll('listings', 1000, 0)
            .map(l => l.data || l)
            .filter(l => l.sellerId === sellerId);
          const riskEvents = db_ops.raw(
            "SELECT * FROM risk_events WHERE json_extract(data, '$.sellerId') = ? ORDER BY created_at DESC LIMIT 50",
            [sellerId]
          ).map(r => r.data ? (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) : r);

          const amounts = transactions.map(t => t.amount).filter(a => typeof a === 'number');
          const amountStats = amounts.length > 0 ? computeDistribution(amounts) : null;

          return {
            success: true,
            data: {
              sellerId,
              profile: seller?.data || null,
              transactionSummary: {
                total: transactions.length,
                totalAmount: amounts.reduce((s, a) => s + a, 0),
                avgAmount: amountStats?.mean || 0,
                amountDistribution: amountStats
              },
              payoutSummary: {
                total: payouts.length,
                totalPaidOut: payouts.filter(p => p.status === 'COMPLETED').reduce((s, p) => s + (p.amount || 0), 0),
                pending: payouts.filter(p => p.status === 'PENDING').length,
                held: payouts.filter(p => p.status === 'HELD').length
              },
              listingSummary: {
                total: listings.length,
                active: listings.filter(l => l.status === 'ACTIVE').length,
                flagged: listings.filter(l => l.status === 'FLAGGED').length
              },
              riskHistory: {
                totalEvents: riskEvents.length,
                recentEvents: riskEvents.slice(0, 10),
                domains: [...new Set(riskEvents.map(e => e.domain).filter(Boolean))]
              }
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 4. Detect Anomalies
    this.registerTool(
      'detect_anomalies',
      'Compute z-scores on numeric columns from query results to flag outliers',
      async (params) => {
        const { tableName, column, sql } = params;

        try {
          let values = [];

          if (sql) {
            const result = executeSafeSQL(sql);
            if (!result.success) return result;
            values = result.rows
              .map(r => {
                const val = r[column] || (r.data && typeof r.data === 'object' ? r.data[column] : null);
                return typeof val === 'number' ? val : parseFloat(val);
              })
              .filter(v => !isNaN(v));
          } else if (tableName && column) {
            const rows = db_ops.getAll(tableName, 500, 0);
            values = rows
              .map(r => {
                const data = r.data || r;
                const val = data[column];
                return typeof val === 'number' ? val : parseFloat(val);
              })
              .filter(v => !isNaN(v));
          } else {
            return { success: false, error: 'Provide either sql+column or tableName+column' };
          }

          if (values.length < 3) {
            return { success: true, data: { outliers: [], message: 'Too few values for anomaly detection' } };
          }

          const scored = computeZScores(values);
          const outliers = scored.filter(s => s.isOutlier);
          const distribution = computeDistribution(values);

          return {
            success: true,
            data: {
              totalValues: values.length,
              outlierCount: outliers.length,
              outliers: outliers.slice(0, 20),
              distribution,
              threshold: 2.5
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 5. Compute Aggregations
    this.registerTool(
      'compute_aggregations',
      'Run parameterized aggregation queries (COUNT, SUM, AVG, GROUP BY)',
      async (params) => {
        const { tableName, aggregation = 'COUNT', column = '*', groupBy, where } = params;
        if (!tableName) return { success: false, error: 'tableName is required' };

        try {
          const agg = aggregation.toUpperCase();
          const validAggs = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
          if (!validAggs.includes(agg)) return { success: false, error: `Invalid aggregation: ${agg}` };

          let colRef = column === '*' ? '*' : `json_extract(data, '$.${column}')`;
          if (agg !== 'COUNT' && column === '*') colRef = '1';

          let sql = `SELECT ${agg}(${colRef}) as result`;
          if (groupBy) {
            const groupRef = `json_extract(data, '$.${groupBy}')`;
            sql = `SELECT ${groupRef} as group_key, ${agg}(${colRef}) as result`;
            sql += ` FROM ${tableName}`;
            if (where) sql += ` WHERE ${where}`;
            sql += ` GROUP BY group_key ORDER BY result DESC`;
          } else {
            sql += ` FROM ${tableName}`;
            if (where) sql += ` WHERE ${where}`;
          }

          return executeSafeSQL(sql);
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 6. Visualize Distribution
    this.registerTool(
      'visualize_distribution',
      'Compute histogram, percentiles, and statistics for a numeric column (for charting)',
      async (params) => {
        const { tableName, column, sql } = params;

        try {
          let values = [];
          if (sql) {
            const result = executeSafeSQL(sql);
            if (!result.success) return result;
            values = result.rows.map(r => {
              const val = r[column] || (r.data ? r.data[column] : null);
              return typeof val === 'number' ? val : parseFloat(val);
            }).filter(v => !isNaN(v));
          } else if (tableName && column) {
            const rows = db_ops.getAll(tableName, 500, 0);
            values = rows.map(r => {
              const data = r.data || r;
              return typeof data[column] === 'number' ? data[column] : parseFloat(data[column]);
            }).filter(v => !isNaN(v));
          } else {
            return { success: false, error: 'Provide either sql+column or tableName+column' };
          }

          if (values.length === 0) {
            return { success: true, data: { message: 'No numeric values found' } };
          }

          return { success: true, data: computeDistribution(values) };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 7. Search Knowledge Base
    this.registerTool(
      'search_knowledge_base',
      'Search the knowledge base for similar past analyses and insights',
      async (params) => {
        const { query } = params;
        if (!query) return { success: false, error: 'query is required' };

        try {
          if (this.knowledgeBase) {
            const results = await this.knowledgeBase.searchKnowledge(query, { limit: 5, threshold: 0.3 });
            return { success: true, data: { results, source: 'knowledge_base' } };
          }
          return { success: true, data: { results: [], source: 'none', message: 'Knowledge base not available' } };
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
      operationType: 'general_query',
      riskIndicators: [],
      availableTools: [...this.tools.keys()],
      llmEnhanced: false
    };

    // Try LLM
    if (this.llmClient?.enabled) {
      try {
        const schemas = getTableSchemas();
        const schemaNames = Object.keys(schemas).join(', ');
        const prompt = `You are a data exploration agent. Classify this request and identify the best approach.\n\nRequest: ${JSON.stringify(input)}\nAvailable tables: ${schemaNames}\nAvailable tools: ${analysis.availableTools.join(', ')}\n\nReturn JSON: {"understanding": "...", "operationType": "entity_profile|aggregate_query|anomaly_scan|general_query", "suggestedTools": ["tool1", "tool2"]}`;
        const result = await this.llmClient.complete(prompt, { temperature: 0.2 });
        const parsed = JSON.parse(result.content.match(/\{[\s\S]*\}/)?.[0] || '{}');
        if (parsed.understanding) {
          analysis.understanding = parsed.understanding;
          analysis.operationType = parsed.operationType || 'general_query';
          analysis.suggestedTools = parsed.suggestedTools;
          analysis.llmEnhanced = true;
          return analysis;
        }
      } catch (_) {}
    }

    // Fallback: regex classification
    const q = JSON.stringify(input).toLowerCase();
    if (q.includes('seller') && (q.includes('profile') || q.includes('slr-'))) {
      analysis.operationType = 'entity_profile';
      analysis.understanding = 'Entity profile request — aggregate seller data across tables';
    } else if (q.includes('count') || q.includes('average') || q.includes('sum') || q.includes('group')) {
      analysis.operationType = 'aggregate_query';
      analysis.understanding = 'Aggregation query — compute statistics';
    } else if (q.includes('anomal') || q.includes('outlier') || q.includes('unusual') || q.includes('spike')) {
      analysis.operationType = 'anomaly_scan';
      analysis.understanding = 'Anomaly detection — identify statistical outliers';
    } else {
      analysis.operationType = 'general_query';
      analysis.understanding = 'General data query — convert to SQL and execute';
    }

    return analysis;
  }

  async plan(analysis, context) {
    const plan = {
      goal: `Execute ${analysis.operationType || 'general_query'} operation`,
      actions: [],
      fallback: { type: 'execute_sql', params: {} },
      llmEnhanced: false
    };

    // Fixed tool sequences per operation type
    const toolSequences = {
      entity_profile: [
        { type: 'profile_entity', params: { sellerId: this._extractSellerId(context) } },
        { type: 'detect_anomalies', params: { tableName: 'transactions', column: 'amount' } }
      ],
      aggregate_query: [
        { type: 'compute_aggregations', params: this._extractAggParams(context) }
      ],
      anomaly_scan: [
        { type: 'detect_anomalies', params: { tableName: context?.tableName || 'transactions', column: context?.column || 'amount' } },
        { type: 'visualize_distribution', params: { tableName: context?.tableName || 'transactions', column: context?.column || 'amount' } }
      ],
      general_query: [
        { type: 'nl_to_sql', params: { question: this._extractQuestion(context) } }
      ]
    };

    plan.actions = toolSequences[analysis.operationType] || toolSequences.general_query;
    return plan;
  }

  async observe(actions, context) {
    const toolResults = actions.filter(a => a.result);
    const successCount = toolResults.filter(a => a.result?.success !== false).length;

    // Collect insights from results
    const insights = [];
    const anomalies = [];

    for (const action of toolResults) {
      const data = action.result?.data || action.result;
      if (data?.outlierCount > 0) {
        anomalies.push({ source: action.action, count: data.outlierCount });
        insights.push(`Found ${data.outlierCount} outliers in ${action.action}`);
      }
      if (data?.rowCount !== undefined) {
        insights.push(`Query returned ${data.rowCount} rows in ${data.executionTimeMs || 0}ms`);
      }
      if (data?.transactionSummary) {
        insights.push(`Seller has ${data.transactionSummary.total} transactions, avg amount $${data.transactionSummary.avgAmount?.toFixed(2)}`);
      }
    }

    return {
      success: successCount > 0,
      summary: `Completed ${successCount}/${toolResults.length} data operations`,
      insights,
      anomalies,
      toolResults: toolResults.map(a => ({ tool: a.action, result: a.result })),
      confidence: successCount / Math.max(toolResults.length, 1),
      recommendation: {
        action: anomalies.length > 0 ? 'INVESTIGATE' : 'COMPLETE',
        confidence: 0.8,
        reason: anomalies.length > 0
          ? `${anomalies.length} anomaly sources detected — recommend deeper investigation`
          : 'Data exploration completed successfully'
      }
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  _extractSellerId(context) {
    if (typeof context === 'string') return context;
    return context?.sellerId || context?.entityId || context?.input?.sellerId
      || context?.input?.entityId || context?.input?.query?.match(/SLR-\w+/)?.[0] || 'SLR-UNKNOWN';
  }

  _extractQuestion(context) {
    if (typeof context === 'string') return context;
    return context?.question || context?.query || context?.input?.query
      || context?.input?.question || JSON.stringify(context?.input || 'show recent data');
  }

  _extractAggParams(context) {
    const q = this._extractQuestion(context).toLowerCase();
    let tableName = 'transactions';
    if (q.includes('seller')) tableName = 'sellers';
    if (q.includes('payout')) tableName = 'payouts';
    if (q.includes('listing')) tableName = 'listings';
    return { tableName, aggregation: 'COUNT', column: '*', groupBy: 'status' };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let instance = null;

export function getDataPlaygroundAgent() {
  if (!instance) {
    instance = new DataPlaygroundAgent();
  }
  return instance;
}

export default DataPlaygroundAgent;
