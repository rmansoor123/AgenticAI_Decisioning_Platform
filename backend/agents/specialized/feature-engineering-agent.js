/**
 * FeatureEngineeringAgent — Feature discovery, extraction, drift detection
 *
 * Sub-agent of DataAgent. Handles automated feature discovery, quality profiling,
 * PSI drift detection, and feature importance computation from real DB data.
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import {
  getTableSchemas,
  executeSafeSQL,
  computeDistribution,
  computePSI,
  computeZScores
} from '../tools/data-tools.js';
import { v4 as uuidv4 } from 'uuid';

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

export class FeatureEngineeringAgent extends BaseAgent {
  constructor() {
    super({
      agentId: 'FEATURE_ENGINEERING',
      name: 'Feature Engineering Agent',
      role: 'feature_engineer',
      capabilities: [
        'feature_discovery',
        'feature_extraction',
        'feature_quality_profiling',
        'drift_detection',
        'feature_importance'
      ]
    });

    this.knowledgeBase = getKnowledgeBase ? getKnowledgeBase() : null;
    this._registerTools();
  }

  _registerTools() {
    // 1. Discover Features
    this.registerTool(
      'discover_features',
      'Analyze column types to suggest features — numeric yields stats, timestamps yield temporal, strings yield cardinality',
      async (params) => {
        const { entity, tableName } = params;
        const table = tableName || this._entityToTable(entity);

        try {
          const schemas = getTableSchemas();
          const tableSchema = schemas[table];
          if (!tableSchema) return { success: false, error: `Table ${table} not found` };

          // Sample data to understand column types
          const sample = await db_ops.getAll(table, 50, 0);
          const sampleData = sample.map(r => r.data || r);

          // Suggest features per column
          const suggestions = [];

          if (sampleData.length === 0) {
            return { success: true, data: { suggestions: [], message: 'No data to analyze' } };
          }

          const firstRow = sampleData[0];
          for (const [key, value] of Object.entries(firstRow)) {
            if (key === 'data' || key === 'created_at' || key === 'updated_at') continue;

            const valType = typeof value;

            if (valType === 'number') {
              suggestions.push(
                { name: `${key}_zscore`, type: 'statistical', source: key, method: 'z-score normalization', category: 'anomaly' },
                { name: `${key}_log`, type: 'statistical', source: key, method: 'log transform', category: 'normalization' },
                { name: `${key}_bucket`, type: 'statistical', source: key, method: 'quantile bucketing', category: 'discretization' }
              );
            } else if (valType === 'string') {
              if (/\d{4}-\d{2}-\d{2}/.test(value) || key.includes('date') || key.includes('At') || key.includes('timestamp')) {
                suggestions.push(
                  { name: `${key}_hour`, type: 'temporal', source: key, method: 'hour extraction', category: 'time' },
                  { name: `${key}_day_of_week`, type: 'temporal', source: key, method: 'day of week', category: 'time' },
                  { name: `${key}_is_weekend`, type: 'temporal', source: key, method: 'weekend flag', category: 'time' },
                  { name: `${key}_recency_days`, type: 'temporal', source: key, method: 'days since event', category: 'time' }
                );
              } else {
                // Cardinality-based features
                const uniqueValues = new Set(sampleData.map(r => r[key]).filter(Boolean));
                suggestions.push(
                  { name: `${key}_cardinality`, type: 'categorical', source: key, method: 'unique count', uniqueValues: uniqueValues.size, category: 'cardinality' }
                );
                if (uniqueValues.size < 20) {
                  suggestions.push(
                    { name: `${key}_encoded`, type: 'categorical', source: key, method: 'one-hot encoding', category: 'encoding' }
                  );
                }
              }
            } else if (valType === 'boolean') {
              suggestions.push(
                { name: `${key}_flag`, type: 'boolean', source: key, method: 'binary flag', category: 'flag' }
              );
            }
          }

          // Add behavioral/velocity features if entity has sellerId
          if (firstRow.sellerId || entity === 'seller') {
            suggestions.push(
              { name: 'transaction_velocity_1h', type: 'behavioral', source: 'transactions', method: 'count in 1h window', category: 'velocity' },
              { name: 'transaction_velocity_24h', type: 'behavioral', source: 'transactions', method: 'count in 24h window', category: 'velocity' },
              { name: 'amount_velocity_ratio', type: 'behavioral', source: 'transactions', method: 'recent avg / historical avg', category: 'velocity' },
              { name: 'payout_to_revenue_ratio', type: 'behavioral', source: 'payouts+transactions', method: 'total payouts / total revenue', category: 'ratio' }
            );
          }

          // LLM-enhanced discovery
          if (this.llmClient?.enabled) {
            try {
              const prompt = `Given a ${entity || table} table with columns: ${Object.keys(firstRow).join(', ')}, suggest 3 additional creative features for fraud detection. Return JSON: {"features": [{"name": "...", "type": "...", "method": "...", "category": "..."}]}`;
              const result = await this.llmClient.complete(prompt, { temperature: 0.4 });
              const parsed = JSON.parse(result.content.match(/\{[\s\S]*\}/)?.[0] || '{}');
              if (parsed.features) suggestions.push(...parsed.features.map(f => ({ ...f, source: 'llm' })));
            } catch (_) {}
          }

          return { success: true, data: { entity: entity || table, suggestions, totalSuggested: suggestions.length } };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 2. Generate Features
    this.registerTool(
      'generate_features',
      'Extract velocity, temporal, statistical, and behavioral features from real data for a given entity',
      async (params) => {
        const { entity, entityId, tableName } = params;
        const table = tableName || this._entityToTable(entity);

        try {
          const rows = (await db_ops.getAll(table, 1000, 0)).map(r => r.data || r);
          let entityRows = rows;

          // Filter to specific entity if provided
          if (entityId) {
            entityRows = rows.filter(r =>
              r.sellerId === entityId || r.seller_id === entityId ||
              r.transactionId === entityId || r.transaction_id === entityId
            );
          }

          if (entityRows.length === 0) {
            return { success: true, data: { features: {}, message: 'No data found for entity' } };
          }

          const features = {};
          const now = Date.now();

          // Numeric features
          for (const [key, value] of Object.entries(entityRows[0])) {
            if (typeof value !== 'number') continue;
            const values = entityRows.map(r => r[key]).filter(v => typeof v === 'number');
            if (values.length < 2) continue;

            const dist = computeDistribution(values);
            features[`${key}_mean`] = dist.mean;
            features[`${key}_stddev`] = dist.stddev;
            features[`${key}_min`] = dist.min;
            features[`${key}_max`] = dist.max;
            features[`${key}_log`] = parseFloat(Math.log10(dist.mean + 1).toFixed(4));
          }

          // Temporal features
          const timestamps = entityRows
            .map(r => r.createdAt || r.created_at || r.timestamp || r.submittedAt)
            .filter(Boolean)
            .map(t => new Date(t));

          if (timestamps.length > 0) {
            const latest = Math.max(...timestamps.map(t => t.getTime()));
            features.recency_hours = parseFloat(((now - latest) / 3600000).toFixed(2));
            features.latest_hour_of_day = new Date(latest).getHours();
            features.latest_day_of_week = new Date(latest).getDay();
            features.is_weekend = [0, 6].includes(new Date(latest).getDay()) ? 1 : 0;

            // Inter-event time
            if (timestamps.length > 1) {
              const sorted = timestamps.map(t => t.getTime()).sort((a, b) => a - b);
              const gaps = [];
              for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
              features.avg_inter_event_hours = parseFloat((gaps.reduce((s, g) => s + g, 0) / gaps.length / 3600000).toFixed(2));
              features.min_inter_event_hours = parseFloat((Math.min(...gaps) / 3600000).toFixed(2));
            }
          }

          // Velocity features (count in time windows)
          const oneHourAgo = new Date(now - 3600000).toISOString();
          const oneDayAgo = new Date(now - 86400000).toISOString();
          const oneWeekAgo = new Date(now - 604800000).toISOString();
          features.count_1h = entityRows.filter(r => (r.createdAt || r.created_at || '') > oneHourAgo).length;
          features.count_24h = entityRows.filter(r => (r.createdAt || r.created_at || '') > oneDayAgo).length;
          features.count_7d = entityRows.filter(r => (r.createdAt || r.created_at || '') > oneWeekAgo).length;
          features.total_count = entityRows.length;

          return {
            success: true,
            data: {
              entity: entity || table,
              entityId,
              features,
              featureCount: Object.keys(features).length,
              sampleSize: entityRows.length
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 3. Profile Feature Quality
    this.registerTool(
      'profile_feature_quality',
      'Compute null rate, cardinality, correlation, and distribution shape from actual DB data',
      async (params) => {
        const { tableName, columns } = params;
        if (!tableName) return { success: false, error: 'tableName is required' };

        try {
          const rows = await db_ops.getAll(tableName, 500, 0);
          const data = rows.map(r => r.data || r);
          if (data.length === 0) return { success: true, data: { profiles: {}, message: 'No data' } };

          const cols = columns || Object.keys(data[0]).filter(k => k !== 'data');
          const profiles = {};

          for (const col of cols) {
            const values = data.map(r => r[col]);
            const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
            const nullRate = parseFloat((1 - nonNull.length / values.length).toFixed(4));
            const unique = new Set(nonNull);
            const cardinality = unique.size;

            const profile = { nullRate, cardinality, totalRows: values.length };

            // Numeric distribution
            const numValues = nonNull.map(Number).filter(v => !isNaN(v));
            if (numValues.length > values.length * 0.5) {
              profile.type = 'numeric';
              profile.distribution = computeDistribution(numValues);

              // Skewness estimate
              const { mean, stddev } = profile.distribution;
              if (stddev > 0) {
                const skew = numValues.reduce((s, v) => s + Math.pow((v - mean) / stddev, 3), 0) / numValues.length;
                profile.skewness = parseFloat(skew.toFixed(4));
                profile.shape = Math.abs(skew) < 0.5 ? 'symmetric' : skew > 0 ? 'right_skewed' : 'left_skewed';
              }
            } else {
              profile.type = 'categorical';
              profile.topValues = [...unique].slice(0, 10).map(v => ({
                value: v,
                count: nonNull.filter(nv => nv === v).length
              })).sort((a, b) => b.count - a.count);
            }

            profiles[col] = profile;
          }

          return { success: true, data: { tableName, profiles, columnCount: cols.length, rowCount: data.length } };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 4. Detect Feature Drift
    this.registerTool(
      'detect_feature_drift',
      'Compute Population Stability Index (PSI) between time windows to detect feature drift',
      async (params) => {
        const { tableName, column, baselineWindow = 7, currentWindow = 1 } = params;
        if (!tableName || !column) return { success: false, error: 'tableName and column are required' };

        try {
          const now = new Date();
          const baselineStart = new Date(now - baselineWindow * 86400000).toISOString();
          const currentStart = new Date(now - currentWindow * 86400000).toISOString();
          const baselineEnd = currentStart;

          // Fetch baseline and current windows
          const allRows = await db_ops.getAll(tableName, 5000, 0);
          const allData = allRows.map(r => {
            const data = r.data || r;
            const ts = r.created_at || data.createdAt || data.timestamp || '';
            const val = data[column];
            return { ts, value: typeof val === 'number' ? val : parseFloat(val) };
          }).filter(r => !isNaN(r.value));

          const baseline = allData.filter(r => r.ts >= baselineStart && r.ts < baselineEnd).map(r => r.value);
          const current = allData.filter(r => r.ts >= currentStart).map(r => r.value);

          if (baseline.length < 10 || current.length < 5) {
            // Not enough data — use first/second half split instead
            const half = Math.floor(allData.length / 2);
            const fallbackBaseline = allData.slice(0, half).map(r => r.value);
            const fallbackCurrent = allData.slice(half).map(r => r.value);
            const psiResult = computePSI(fallbackBaseline, fallbackCurrent);
            return {
              success: true,
              data: {
                ...psiResult,
                column,
                tableName,
                baselineSamples: fallbackBaseline.length,
                currentSamples: fallbackCurrent.length,
                windowType: 'half_split',
                driftLevel: psiResult.psi > 0.25 ? 'HIGH' : psiResult.psi > 0.1 ? 'MEDIUM' : 'LOW'
              }
            };
          }

          const psiResult = computePSI(baseline, current);

          return {
            success: true,
            data: {
              ...psiResult,
              column,
              tableName,
              baselineSamples: baseline.length,
              currentSamples: current.length,
              baselineWindow: `${baselineWindow}d`,
              currentWindow: `${currentWindow}d`,
              driftLevel: psiResult.psi > 0.25 ? 'HIGH' : psiResult.psi > 0.1 ? 'MEDIUM' : 'LOW'
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 5. Get Feature Catalog
    this.registerTool(
      'get_feature_catalog',
      'List all stored feature definitions from the datasets table',
      async () => {
        try {
          const allDatasets = (await db_ops.getAll('datasets', 1000, 0)).map(d => d.data || d);
          const featureDefinitions = allDatasets.filter(d => d.type === 'FEATURE_DEFINITION');

          return {
            success: true,
            data: {
              features: featureDefinitions,
              totalCount: featureDefinitions.length,
              byCategory: featureDefinitions.reduce((acc, f) => {
                const cat = f.category || 'uncategorized';
                acc[cat] = (acc[cat] || 0) + 1;
                return acc;
              }, {})
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 6. Compute Feature Importance
    this.registerTool(
      'compute_feature_importance',
      'Estimate feature importance via variance ratio and correlation with target variable',
      async (params) => {
        const { tableName, targetColumn = 'riskScore', featureColumns } = params;
        if (!tableName) return { success: false, error: 'tableName is required' };

        try {
          const rows = (await db_ops.getAll(tableName, 500, 0)).map(r => r.data || r);
          if (rows.length < 10) return { success: true, data: { importance: [], message: 'Insufficient data' } };

          const targetValues = rows.map(r => r[targetColumn]).filter(v => typeof v === 'number');
          if (targetValues.length === 0) {
            return { success: true, data: { importance: [], message: `No numeric values found for ${targetColumn}` } };
          }

          const cols = featureColumns || Object.keys(rows[0]).filter(k =>
            k !== targetColumn && k !== 'data' && typeof rows[0][k] === 'number'
          );

          const importance = [];

          for (const col of cols) {
            const featureValues = rows.map(r => r[col]).filter(v => typeof v === 'number');
            if (featureValues.length < 5) continue;

            // Variance ratio
            const featureDist = computeDistribution(featureValues);
            const varianceRatio = featureDist.stddev > 0 ? featureDist.stddev / featureDist.mean : 0;

            // Pearson correlation with target
            const paired = rows
              .filter(r => typeof r[col] === 'number' && typeof r[targetColumn] === 'number')
              .map(r => [r[col], r[targetColumn]]);

            let correlation = 0;
            if (paired.length > 5) {
              const meanX = paired.reduce((s, p) => s + p[0], 0) / paired.length;
              const meanY = paired.reduce((s, p) => s + p[1], 0) / paired.length;
              const num = paired.reduce((s, p) => s + (p[0] - meanX) * (p[1] - meanY), 0);
              const denX = Math.sqrt(paired.reduce((s, p) => s + Math.pow(p[0] - meanX, 2), 0));
              const denY = Math.sqrt(paired.reduce((s, p) => s + Math.pow(p[1] - meanY, 2), 0));
              correlation = denX > 0 && denY > 0 ? parseFloat((num / (denX * denY)).toFixed(4)) : 0;
            }

            importance.push({
              feature: col,
              varianceRatio: parseFloat(Math.abs(varianceRatio).toFixed(4)),
              correlationWithTarget: correlation,
              absCorrelation: parseFloat(Math.abs(correlation).toFixed(4)),
              importance: parseFloat((Math.abs(correlation) * 0.7 + Math.min(Math.abs(varianceRatio), 1) * 0.3).toFixed(4)),
              sampleSize: paired.length
            });
          }

          importance.sort((a, b) => b.importance - a.importance);

          return {
            success: true,
            data: {
              tableName,
              targetColumn,
              importance,
              topFeatures: importance.slice(0, 5).map(f => f.feature)
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 7. Store Feature Definitions
    this.registerTool(
      'store_feature_definitions',
      'Persist feature definitions to the datasets table with type FEATURE_DEFINITION',
      async (params) => {
        const { features, entity, description } = params;
        if (!features || !features.length) return { success: false, error: 'features array is required' };

        try {
          const datasetId = `FD-${uuidv4().substring(0, 8).toUpperCase()}`;
          const featureData = {
            datasetId,
            name: `${entity || 'general'}_features`,
            type: 'FEATURE_DEFINITION',
            description: description || `Auto-discovered features for ${entity || 'general'}`,
            entity: entity || 'general',
            features,
            featureCount: features.length,
            category: entity || 'general',
            tags: ['auto-discovered', entity || 'general', 'feature-engineering'],
            createdAt: new Date().toISOString(),
            createdBy: 'FEATURE_ENGINEERING'
          };

          await db_ops.insert('datasets', 'dataset_id', datasetId, featureData);

          return {
            success: true,
            data: {
              datasetId,
              featureCount: features.length,
              storedAt: featureData.createdAt
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
      operationType: 'full_pipeline',
      entity: null,
      targetTable: null,
      availableTools: [...this.tools.keys()],
      llmEnhanced: false
    };

    const q = JSON.stringify(input).toLowerCase();

    // Determine entity and operation
    if (q.includes('seller') || q.includes('slr-')) {
      analysis.entity = 'seller';
      analysis.targetTable = 'sellers';
    } else if (q.includes('transaction') || q.includes('txn')) {
      analysis.entity = 'transaction';
      analysis.targetTable = 'transactions';
    } else if (q.includes('payout') || q.includes('pay')) {
      analysis.entity = 'payout';
      analysis.targetTable = 'payouts';
    } else {
      analysis.entity = 'seller';
      analysis.targetTable = 'sellers';
    }

    if (q.includes('drift') || q.includes('shift') || q.includes('change')) {
      analysis.operationType = 'drift_detection';
      analysis.understanding = `Detect feature drift for ${analysis.entity} data`;
    } else if (q.includes('importance') || q.includes('rank') || q.includes('significant')) {
      analysis.operationType = 'importance_analysis';
      analysis.understanding = `Compute feature importance for ${analysis.entity} features`;
    } else if (q.includes('quality') || q.includes('profile') || q.includes('null')) {
      analysis.operationType = 'quality_profiling';
      analysis.understanding = `Profile feature quality for ${analysis.entity} data`;
    } else {
      analysis.operationType = 'full_pipeline';
      analysis.understanding = `Full feature engineering pipeline for ${analysis.entity}`;
    }

    return analysis;
  }

  async plan(analysis, context) {
    const plan = {
      goal: `Execute ${analysis.operationType} for ${analysis.entity}`,
      actions: [],
      fallback: { type: 'discover_features', params: { entity: analysis.entity } },
      llmEnhanced: false
    };

    const input = context?.input || context || {};
    const entityId = input.entityId || input.sellerId;

    const pipelines = {
      full_pipeline: [
        { type: 'discover_features', params: { entity: analysis.entity, tableName: analysis.targetTable } },
        { type: 'generate_features', params: { entity: analysis.entity, entityId, tableName: analysis.targetTable } },
        { type: 'profile_feature_quality', params: { tableName: analysis.targetTable } },
        { type: 'detect_feature_drift', params: { tableName: analysis.targetTable, column: 'amount' } }
      ],
      drift_detection: [
        { type: 'detect_feature_drift', params: { tableName: analysis.targetTable, column: 'amount' } },
        { type: 'detect_feature_drift', params: { tableName: analysis.targetTable, column: 'riskScore' } }
      ],
      importance_analysis: [
        { type: 'generate_features', params: { entity: analysis.entity, entityId, tableName: analysis.targetTable } },
        { type: 'compute_feature_importance', params: { tableName: analysis.targetTable } }
      ],
      quality_profiling: [
        { type: 'profile_feature_quality', params: { tableName: analysis.targetTable } },
        { type: 'get_feature_catalog', params: {} }
      ]
    };

    plan.actions = pipelines[analysis.operationType] || pipelines.full_pipeline;
    return plan;
  }

  async observe(actions, context) {
    const toolResults = actions.filter(a => a.result);
    const successCount = toolResults.filter(a => a.result?.success !== false).length;

    const discoveredFeatures = toolResults.find(a => a.action === 'discover_features')?.result?.data;
    const generatedFeatures = toolResults.find(a => a.action === 'generate_features')?.result?.data;
    const qualityProfile = toolResults.find(a => a.action === 'profile_feature_quality')?.result?.data;
    const driftResults = toolResults.filter(a => a.action === 'detect_feature_drift').map(a => a.result?.data).filter(Boolean);
    const importanceResults = toolResults.find(a => a.action === 'compute_feature_importance')?.result?.data;

    const driftAlerts = driftResults.filter(d => d.isDrifted || d.driftLevel === 'HIGH');
    const qualityIssues = [];

    if (qualityProfile?.profiles) {
      for (const [col, profile] of Object.entries(qualityProfile.profiles)) {
        if (profile.nullRate > 0.1) qualityIssues.push({ column: col, issue: 'high_null_rate', value: profile.nullRate });
        if (profile.cardinality === 1) qualityIssues.push({ column: col, issue: 'constant_value', value: profile.cardinality });
      }
    }

    return {
      success: successCount > 0,
      summary: `Feature engineering: ${discoveredFeatures?.totalSuggested || 0} suggested, ${generatedFeatures?.featureCount || 0} generated, ${driftAlerts.length} drift alerts`,
      discoveredFeatures: discoveredFeatures?.suggestions?.slice(0, 15),
      generatedFeatures: generatedFeatures?.features,
      qualityProfile: qualityProfile?.profiles,
      driftResults,
      driftAlerts,
      qualityIssues,
      topFeatures: importanceResults?.topFeatures,
      recommendation: {
        action: driftAlerts.length > 0 ? 'INVESTIGATE_DRIFT' : 'COMPLETE',
        confidence: 0.8,
        reason: driftAlerts.length > 0
          ? `${driftAlerts.length} features show significant drift — recommend retraining`
          : 'Feature engineering pipeline completed successfully'
      },
      confidence: successCount / Math.max(toolResults.length, 1)
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  _entityToTable(entity) {
    const map = { seller: 'sellers', transaction: 'transactions', payout: 'payouts', listing: 'listings' };
    return map[entity] || 'sellers';
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let instance = null;

export function getFeatureEngineeringAgent() {
  if (!instance) {
    instance = new FeatureEngineeringAgent();
  }
  return instance;
}

export default FeatureEngineeringAgent;
