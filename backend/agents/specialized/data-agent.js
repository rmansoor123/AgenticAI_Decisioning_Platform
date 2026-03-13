/**
 * DataAgent — Orchestrator for the Smart Data Agent System
 *
 * Top-level data agent that delegates to sub-agents:
 * - DataPlaygroundAgent: NL-to-SQL, entity profiling, anomaly detection
 * - QueryFederationAgent: cross-source queries, joins, optimization
 * - FeatureEngineeringAgent: feature discovery, extraction, drift detection
 *
 * Also provides its own tools for data quality assessment, pipeline health,
 * dataset management, and ingestion monitoring.
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { getTableSchemas, executeSafeSQL } from '../tools/data-tools.js';
import { getDataPlaygroundAgent } from './data-playground-agent.js';
import { getQueryFederationAgent } from './query-federation-agent.js';
import { getFeatureEngineeringAgent } from './feature-engineering-agent.js';

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

export class DataAgent extends BaseAgent {
  constructor() {
    super({
      agentId: 'DATA_AGENT',
      name: 'Data Agent',
      role: 'data_orchestrator',
      capabilities: [
        'data_quality_assessment',
        'pipeline_monitoring',
        'dataset_management',
        'data_exploration_delegation',
        'query_federation_delegation',
        'feature_engineering_delegation'
      ]
    });

    this.knowledgeBase = getKnowledgeBase ? getKnowledgeBase() : null;
    this._registerTools();
  }

  _registerTools() {
    // 1. Assess Data Quality
    this.registerTool(
      'assess_data_quality',
      'Read data_profiles table to compute completeness, freshness, and drift across datasets',
      async () => {
        try {
          const profiles = db_ops.raw(
            'SELECT * FROM data_profiles ORDER BY profiled_at DESC LIMIT 50',
            []
          );

          const schemas = getTableSchemas();
          const qualitySummary = {};

          // Build summary per dataset
          for (const profile of profiles) {
            const dsId = profile.dataset_id;
            if (!qualitySummary[dsId]) {
              qualitySummary[dsId] = {
                datasetId: dsId,
                tableName: profile.table_name,
                completeness: profile.completeness || 0,
                freshness: profile.freshness_seconds != null
                  ? (profile.freshness_seconds < 3600 ? 'FRESH' : profile.freshness_seconds < 86400 ? 'STALE' : 'OLD')
                  : 'UNKNOWN',
                freshnessSeconds: profile.freshness_seconds,
                totalRows: profile.total_rows || 0,
                profiledAt: profile.profiled_at,
                issues: []
              };

              if (profile.completeness < 0.95) {
                qualitySummary[dsId].issues.push(`Low completeness: ${(profile.completeness * 100).toFixed(1)}%`);
              }
              if (profile.freshness_seconds > 86400) {
                qualitySummary[dsId].issues.push('Data older than 24 hours');
              }
            }
          }

          // Add table-level stats
          const tableStats = {};
          for (const [table, info] of Object.entries(schemas)) {
            tableStats[table] = {
              rowCount: info.rowCount,
              columnCount: info.columns.length
            };
          }

          const totalIssues = Object.values(qualitySummary).reduce((s, d) => s + d.issues.length, 0);

          return {
            success: true,
            data: {
              datasets: Object.values(qualitySummary),
              tableStats,
              overallHealth: totalIssues === 0 ? 'HEALTHY' : totalIssues < 3 ? 'DEGRADED' : 'UNHEALTHY',
              totalIssues,
              profileCount: profiles.length
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 2. Inspect Pipeline Health
    this.registerTool(
      'inspect_pipeline_health',
      'Read pipeline_runs and dead_letter_queue tables for pipeline status',
      async () => {
        try {
          const recentRuns = (await db_ops.raw(
            'SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 20',
            []
          )).map(r => ({
            ...r,
            data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data
          }));

          const dlqCount = await db_ops.count('dead_letter_queue');
          const recentDLQ = db_ops.raw(
            'SELECT * FROM dead_letter_queue ORDER BY created_at DESC LIMIT 10',
            []
          );

          const runsByStatus = {};
          for (const run of recentRuns) {
            const status = run.status || 'UNKNOWN';
            runsByStatus[status] = (runsByStatus[status] || 0) + 1;
          }

          const failedRuns = recentRuns.filter(r => r.status === 'FAILED');

          return {
            success: true,
            data: {
              recentRuns: recentRuns.slice(0, 10),
              runsByStatus,
              failedRunCount: failedRuns.length,
              deadLetterQueue: {
                totalCount: dlqCount,
                recentErrors: recentDLQ.slice(0, 5).map(e => ({
                  pipeline: e.pipeline,
                  error: e.error_message,
                  createdAt: e.created_at
                }))
              },
              health: failedRuns.length === 0 && dlqCount < 10 ? 'HEALTHY'
                : failedRuns.length > 3 || dlqCount > 50 ? 'CRITICAL'
                : 'DEGRADED'
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 3. List Datasets
    this.registerTool(
      'list_datasets',
      'List and search datasets with optional type and tag filters',
      async (params) => {
        const { type, tag, search, limit = 50 } = params || {};

        try {
          let datasets = (await db_ops.getAll('datasets', parseInt(limit), 0)).map(d => d.data || d);

          if (type) datasets = datasets.filter(d => d.type === type);
          if (tag) datasets = datasets.filter(d => d.tags?.includes(tag));
          if (search) {
            const q = search.toLowerCase();
            datasets = datasets.filter(d =>
              d.name?.toLowerCase().includes(q) ||
              d.description?.toLowerCase().includes(q)
            );
          }

          return {
            success: true,
            data: {
              datasets: datasets.slice(0, limit),
              totalCount: datasets.length,
              byType: datasets.reduce((acc, d) => {
                acc[d.type || 'unknown'] = (acc[d.type || 'unknown'] || 0) + 1;
                return acc;
              }, {})
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 4. Delegate to DataPlaygroundAgent
    this.registerTool(
      'delegate_playground',
      'Delegate a data exploration request to the DataPlaygroundAgent sub-agent',
      async (params) => {
        try {
          const agent = getDataPlaygroundAgent();
          const result = await agent.reason(params, { delegatedBy: 'DATA_AGENT' });
          return {
            success: true,
            data: {
              delegatedTo: 'DATA_PLAYGROUND',
              result: result?.result || result,
              latencyMs: result?.latencyMs
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 5. Delegate to QueryFederationAgent
    this.registerTool(
      'delegate_query',
      'Delegate a cross-source query request to the QueryFederationAgent sub-agent',
      async (params) => {
        try {
          const agent = getQueryFederationAgent();
          const result = await agent.reason(params, { delegatedBy: 'DATA_AGENT' });
          return {
            success: true,
            data: {
              delegatedTo: 'QUERY_FEDERATION',
              result: result?.result || result,
              latencyMs: result?.latencyMs
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 6. Delegate to FeatureEngineeringAgent
    this.registerTool(
      'delegate_feature_engineering',
      'Delegate a feature engineering request to the FeatureEngineeringAgent sub-agent',
      async (params) => {
        try {
          const agent = getFeatureEngineeringAgent();
          const result = await agent.reason(params, { delegatedBy: 'DATA_AGENT' });
          return {
            success: true,
            data: {
              delegatedTo: 'FEATURE_ENGINEERING',
              result: result?.result || result,
              latencyMs: result?.latencyMs
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 7. Search Knowledge Base
    this.registerTool(
      'search_knowledge_base',
      'Search the knowledge base for past data analyses and insights',
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

    // 8. Get Ingestion Stats
    this.registerTool(
      'get_ingestion_stats',
      'Read stream buffer statistics and recent ingestion latency',
      async () => {
        try {
          // Read recent pipeline runs for latency info
          const recentRuns = db_ops.raw(
            'SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 5',
            []
          );

          // Count recent events (proxy for throughput)
          const recentTransactions = db_ops.raw(
            "SELECT COUNT(*) as count FROM transactions WHERE created_at > datetime('now', '-1 hour')",
            []
          );

          const recentDLQ = db_ops.raw(
            "SELECT COUNT(*) as count FROM dead_letter_queue WHERE created_at > datetime('now', '-1 hour')",
            []
          );

          return {
            success: true,
            data: {
              recentPipelineRuns: recentRuns.map(r => ({
                runId: r.run_id,
                pipelineName: r.pipeline_name,
                status: r.status,
                startedAt: r.started_at,
                completedAt: r.completed_at
              })),
              throughput: {
                transactionsLastHour: recentTransactions[0]?.count || 0,
                errorsLastHour: recentDLQ[0]?.count || 0
              },
              tables: {
                transactions: await db_ops.count('transactions'),
                sellers: await db_ops.count('sellers'),
                payouts: await db_ops.count('payouts'),
                listings: await db_ops.count('listings')
              }
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
      operationType: 'QUALITY_CHECK',
      delegationTarget: null,
      availableTools: [...this.tools.keys()],
      llmEnhanced: false
    };

    // Try LLM
    if (this.llmClient?.enabled) {
      try {
        const prompt = `You are a data orchestrator agent. Classify this request into one operation type.\n\nRequest: ${JSON.stringify(input)}\n\nOperation types:\n- EXPLORE: interactive data exploration, entity profiling, NL-to-SQL queries\n- QUERY: cross-source queries, joins, federated queries, SQL execution\n- FEATURE: feature engineering, extraction, drift detection, importance\n- QUALITY_CHECK: data quality assessment, profiling, health check\n- INGEST: ingestion monitoring, pipeline health, throughput stats\n- CURATE: dataset management, catalog operations\n\nReturn JSON: {"operationType": "...", "understanding": "...", "delegationTarget": "playground|query|feature|none"}`;
        const result = await this.llmClient.complete(prompt, { temperature: 0.2 });
        const parsed = JSON.parse(result.content.match(/\{[\s\S]*\}/)?.[0] || '{}');
        if (parsed.operationType) {
          analysis.operationType = parsed.operationType;
          analysis.understanding = parsed.understanding;
          analysis.delegationTarget = parsed.delegationTarget;
          analysis.llmEnhanced = true;
          return analysis;
        }
      } catch (_) {}
    }

    // Fallback: keyword classification
    const q = JSON.stringify(input).toLowerCase();

    if (q.includes('explor') || q.includes('show me') || q.includes('find') || q.includes('profile') || q.includes('playground') || q.includes('nl') || q.includes('question')) {
      analysis.operationType = 'EXPLORE';
      analysis.delegationTarget = 'playground';
      analysis.understanding = 'Data exploration request — delegating to DataPlaygroundAgent';
    } else if (q.includes('query') || q.includes('sql') || q.includes('join') || q.includes('federat') || q.includes('cross')) {
      analysis.operationType = 'QUERY';
      analysis.delegationTarget = 'query';
      analysis.understanding = 'Cross-source query — delegating to QueryFederationAgent';
    } else if (q.includes('feature') || q.includes('drift') || q.includes('engineer') || q.includes('importance') || q.includes('extract')) {
      analysis.operationType = 'FEATURE';
      analysis.delegationTarget = 'feature';
      analysis.understanding = 'Feature engineering request — delegating to FeatureEngineeringAgent';
    } else if (q.includes('ingest') || q.includes('pipeline') || q.includes('stream') || q.includes('throughput')) {
      analysis.operationType = 'INGEST';
      analysis.delegationTarget = null;
      analysis.understanding = 'Ingestion monitoring — checking pipeline health and stats';
    } else if (q.includes('curate') || q.includes('dataset') || q.includes('catalog')) {
      analysis.operationType = 'CURATE';
      analysis.delegationTarget = null;
      analysis.understanding = 'Dataset management — listing and searching datasets';
    } else {
      analysis.operationType = 'QUALITY_CHECK';
      analysis.delegationTarget = null;
      analysis.understanding = 'Data quality check — assessing data health and pipeline status';
    }

    return analysis;
  }

  async plan(analysis, context) {
    const plan = {
      goal: `Execute ${analysis.operationType} operation`,
      actions: [],
      fallback: { type: 'assess_data_quality', params: {} },
      llmEnhanced: false
    };

    const input = context?.input || context || {};

    const toolSequences = {
      EXPLORE: [
        { type: 'assess_data_quality', params: {} },
        { type: 'delegate_playground', params: input }
      ],
      QUERY: [
        { type: 'list_datasets', params: {} },
        { type: 'delegate_query', params: input }
      ],
      FEATURE: [
        { type: 'assess_data_quality', params: {} },
        { type: 'delegate_feature_engineering', params: input }
      ],
      QUALITY_CHECK: [
        { type: 'assess_data_quality', params: {} },
        { type: 'inspect_pipeline_health', params: {} }
      ],
      INGEST: [
        { type: 'inspect_pipeline_health', params: {} },
        { type: 'get_ingestion_stats', params: {} }
      ],
      CURATE: [
        { type: 'list_datasets', params: input },
        { type: 'assess_data_quality', params: {} }
      ]
    };

    plan.actions = toolSequences[analysis.operationType] || toolSequences.QUALITY_CHECK;
    return plan;
  }

  async observe(actions, context) {
    const toolResults = actions.filter(a => a.result);
    const successCount = toolResults.filter(a => a.result?.success !== false).length;

    // Collect key outputs
    const qualityData = toolResults.find(a => a.action === 'assess_data_quality')?.result?.data;
    const pipelineData = toolResults.find(a => a.action === 'inspect_pipeline_health')?.result?.data;
    const delegationResults = toolResults.filter(a => a.action?.startsWith('delegate_'));
    const datasets = toolResults.find(a => a.action === 'list_datasets')?.result?.data;
    const ingestionStats = toolResults.find(a => a.action === 'get_ingestion_stats')?.result?.data;

    // Build unified summary
    const summary = [];
    if (qualityData) summary.push(`Data health: ${qualityData.overallHealth} (${qualityData.totalIssues} issues)`);
    if (pipelineData) summary.push(`Pipeline health: ${pipelineData.health}`);
    if (datasets) summary.push(`${datasets.totalCount} datasets found`);
    if (ingestionStats) summary.push(`Throughput: ${ingestionStats.throughput?.transactionsLastHour || 0} txns/hr`);

    for (const d of delegationResults) {
      const target = d.result?.data?.delegatedTo || 'sub-agent';
      const subResult = d.result?.data?.result;
      if (subResult?.summary) summary.push(`${target}: ${subResult.summary}`);
    }

    return {
      success: successCount > 0,
      summary: summary.join(' | ') || `Completed ${successCount} operations`,
      quality: qualityData,
      pipelineHealth: pipelineData,
      delegationResults: delegationResults.map(d => ({
        target: d.result?.data?.delegatedTo,
        summary: d.result?.data?.result?.summary,
        latencyMs: d.result?.data?.latencyMs
      })),
      datasets: datasets?.datasets?.length || 0,
      ingestion: ingestionStats,
      confidence: successCount / Math.max(toolResults.length, 1),
      recommendation: {
        action: qualityData?.overallHealth === 'UNHEALTHY' ? 'INVESTIGATE' : 'COMPLETE',
        confidence: 0.8,
        reason: qualityData?.overallHealth === 'UNHEALTHY'
          ? `${qualityData.totalIssues} data quality issues detected`
          : 'Data operations completed successfully'
      }
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let instance = null;

export function getDataAgent() {
  if (!instance) {
    instance = new DataAgent();
  }
  return instance;
}

export default DataAgent;
