import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { generateDataset } from '../../../shared/synthetic-data/generators.js';

const router = express.Router();

// Get all datasets
router.get('/datasets', (req, res) => {
  try {
    const { limit = 50, offset = 0, type, tag } = req.query;

    let datasets = db_ops.getAll('datasets', parseInt(limit), parseInt(offset));
    datasets = datasets.map(d => d.data);

    if (type) datasets = datasets.filter(d => d.type === type);
    if (tag) datasets = datasets.filter(d => d.tags?.includes(tag));

    res.json({
      success: true,
      data: datasets,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: db_ops.count('datasets')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get dataset by ID
router.get('/datasets/:datasetId', (req, res) => {
  try {
    const dataset = db_ops.getById('datasets', 'dataset_id', req.params.datasetId);
    if (!dataset) {
      return res.status(404).json({ success: false, error: 'Dataset not found' });
    }
    res.json({ success: true, data: dataset.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Register new dataset
router.post('/datasets', (req, res) => {
  try {
    const datasetData = req.body.datasetId ? req.body : generateDataset();
    datasetData.createdAt = new Date().toISOString();

    db_ops.insert('datasets', 'dataset_id', datasetData.datasetId, datasetData);

    res.status(201).json({ success: true, data: datasetData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update dataset metadata
router.put('/datasets/:datasetId', (req, res) => {
  try {
    const existing = db_ops.getById('datasets', 'dataset_id', req.params.datasetId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Dataset not found' });
    }

    const updated = { ...existing.data, ...req.body, lastUpdated: new Date().toISOString() };
    db_ops.update('datasets', 'dataset_id', req.params.datasetId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get dataset lineage
router.get('/datasets/:datasetId/lineage', (req, res) => {
  try {
    const dataset = db_ops.getById('datasets', 'dataset_id', req.params.datasetId);
    if (!dataset) {
      return res.status(404).json({ success: false, error: 'Dataset not found' });
    }

    const lineage = dataset.data.lineage || { upstream: [], downstream: [] };

    // Enrich with actual dataset info if available
    const allDatasets = db_ops.getAll('datasets', 1000, 0).map(d => d.data);

    const upstream = lineage.upstream.map(name => {
      const ds = allDatasets.find(d => d.name === name);
      return ds ? { datasetId: ds.datasetId, name: ds.name, type: ds.type } : { name };
    });

    const downstream = lineage.downstream.map(name => {
      const ds = allDatasets.find(d => d.name === name);
      return ds ? { datasetId: ds.datasetId, name: ds.name, type: ds.type } : { name };
    });

    res.json({
      success: true,
      data: {
        datasetId: dataset.data.datasetId,
        name: dataset.data.name,
        upstream,
        downstream
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get dataset schema
router.get('/datasets/:datasetId/schema', (req, res) => {
  try {
    const dataset = db_ops.getById('datasets', 'dataset_id', req.params.datasetId);
    if (!dataset) {
      return res.status(404).json({ success: false, error: 'Dataset not found' });
    }

    // Generate sample schema
    const schema = {
      datasetId: dataset.data.datasetId,
      name: dataset.data.name,
      format: dataset.data.format,
      fields: generateSampleSchema(dataset.data.name),
      primaryKey: dataset.data.schema?.primaryKey || 'id',
      partitionKey: dataset.data.schema?.partitionKey
    };

    res.json({ success: true, data: schema });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get dataset quality metrics
router.get('/datasets/:datasetId/quality', (req, res) => {
  try {
    const dataset = db_ops.getById('datasets', 'dataset_id', req.params.datasetId);
    if (!dataset) {
      return res.status(404).json({ success: false, error: 'Dataset not found' });
    }

    // Query latest profile from data_profiles table
    const profiles = db_ops.raw(
      'SELECT * FROM data_profiles WHERE dataset_id = ? ORDER BY profiled_at DESC LIMIT 1',
      [req.params.datasetId]
    );
    const profile = profiles[0];

    const quality = {
      datasetId: dataset.data.datasetId,
      name: dataset.data.name,
      metrics: profile ? {
        completeness: profile.completeness || 0,
        freshness: profile.freshness_seconds != null
          ? (profile.freshness_seconds < 3600 ? `< ${Math.ceil(profile.freshness_seconds / 60)} MIN` : `< ${Math.ceil(profile.freshness_seconds / 3600)} HOUR`)
          : 'UNKNOWN',
        accuracy: dataset.data.quality?.accuracy || null,
        totalRows: profile.total_rows || 0,
        nullCounts: profile.null_counts ? JSON.parse(profile.null_counts) : {},
        valueDistributions: profile.value_distributions ? JSON.parse(profile.value_distributions) : {}
      } : dataset.data.quality || {
        completeness: null,
        freshness: 'NO_PROFILE',
        accuracy: null,
        message: 'No profile data yet. Run POST /datasets/:datasetId/profile to generate.'
      },
      lastChecked: profile?.profiled_at || null,
      issues: []
    };

    // Add quality issues based on real data
    if (profile) {
      if (quality.metrics.completeness < 0.95) {
        quality.issues.push({ type: 'COMPLETENESS', message: `Dataset completeness is ${(quality.metrics.completeness * 100).toFixed(1)}%` });
      }
      if (profile.freshness_seconds > 86400) {
        quality.issues.push({ type: 'FRESHNESS', message: 'Data is older than 24 hours' });
      }
    }

    res.json({ success: true, data: quality });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Profile dataset - compute real quality metrics
router.post('/datasets/:datasetId/profile', (req, res) => {
  try {
    const dataset = db_ops.getById('datasets', 'dataset_id', req.params.datasetId);
    if (!dataset) {
      return res.status(404).json({ success: false, error: 'Dataset not found' });
    }

    // Determine backing table from dataset name/type
    const tableMap = {
      'transactions_raw': 'transactions',
      'seller_profiles': 'sellers',
      'fraud_labels': 'transactions',
      'payouts': 'payouts',
      'listings': 'listings'
    };
    const tableName = tableMap[dataset.data.name] || 'transactions';

    // Read sample data from backing table
    const rows = db_ops.getAll(tableName, 500, 0);
    const totalRows = db_ops.count(tableName);

    // Compute profiling metrics
    const nullCounts = {};
    const numericValues = {};

    rows.forEach(row => {
      const data = row.data || row;
      for (const [key, value] of Object.entries(data)) {
        if (value === null || value === undefined || value === '') {
          nullCounts[key] = (nullCounts[key] || 0) + 1;
        }
        if (typeof value === 'number') {
          if (!numericValues[key]) numericValues[key] = [];
          numericValues[key].push(value);
        }
      }
    });

    // Compute distributions for numeric fields
    const valueDistributions = {};
    for (const [field, values] of Object.entries(numericValues)) {
      values.sort((a, b) => a - b);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
      valueDistributions[field] = {
        min: values[0],
        max: values[values.length - 1],
        mean: parseFloat(mean.toFixed(4)),
        stddev: parseFloat(Math.sqrt(variance).toFixed(4))
      };
    }

    // Compute completeness
    const totalFields = rows.length > 0 ? Object.keys(rows[0].data || rows[0]).length * rows.length : 1;
    const totalNulls = Object.values(nullCounts).reduce((s, c) => s + c, 0);
    const completeness = parseFloat((1 - totalNulls / totalFields).toFixed(4));

    // Freshness: time since newest record
    const newestRecord = rows[0]?.created_at || rows[0]?.data?.createdAt;
    const freshnessSeconds = newestRecord
      ? (Date.now() - new Date(newestRecord).getTime()) / 1000
      : null;

    const profileId = `PROF-${Date.now().toString(36).toUpperCase()}`;

    // Store profile
    db_ops.run(
      'INSERT INTO data_profiles (profile_id, dataset_id, table_name, total_rows, null_counts, value_distributions, freshness_seconds, completeness, profiled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [profileId, req.params.datasetId, tableName, totalRows, JSON.stringify(nullCounts), JSON.stringify(valueDistributions), freshnessSeconds, completeness, new Date().toISOString()]
    );

    res.status(201).json({
      success: true,
      data: {
        profileId,
        datasetId: req.params.datasetId,
        tableName,
        totalRows,
        nullCounts,
        valueDistributions,
        freshnessSeconds,
        completeness,
        profiledAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search datasets
router.get('/search', (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ success: false, error: 'Query parameter required' });
    }

    const allDatasets = db_ops.getAll('datasets', 1000, 0).map(d => d.data);
    const queryLower = q.toLowerCase();

    const results = allDatasets.filter(d =>
      d.name?.toLowerCase().includes(queryLower) ||
      d.description?.toLowerCase().includes(queryLower) ||
      d.tags?.some(t => t.toLowerCase().includes(queryLower))
    ).slice(0, parseInt(limit));

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get catalog statistics
router.get('/stats', (req, res) => {
  try {
    const allDatasets = db_ops.getAll('datasets', 1000, 0).map(d => d.data);

    const stats = {
      total: allDatasets.length,
      byType: {},
      byFormat: {},
      totalSizeGB: 0,
      totalRows: 0,
      tags: {}
    };

    allDatasets.forEach(d => {
      stats.byType[d.type] = (stats.byType[d.type] || 0) + 1;
      stats.byFormat[d.format] = (stats.byFormat[d.format] || 0) + 1;
      stats.totalSizeGB += d.storage?.sizeGB || 0;
      stats.totalRows += d.storage?.rowCount || 0;

      d.tags?.forEach(tag => {
        stats.tags[tag] = (stats.tags[tag] || 0) + 1;
      });
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to generate sample schema
function generateSampleSchema(datasetName) {
  const schemas = {
    transactions_raw: [
      { name: 'transaction_id', type: 'STRING', nullable: false },
      { name: 'seller_id', type: 'STRING', nullable: false },
      { name: 'amount', type: 'DECIMAL', nullable: false },
      { name: 'currency', type: 'STRING', nullable: false },
      { name: 'status', type: 'STRING', nullable: false },
      { name: 'timestamp', type: 'TIMESTAMP', nullable: false }
    ],
    seller_profiles: [
      { name: 'seller_id', type: 'STRING', nullable: false },
      { name: 'business_name', type: 'STRING', nullable: false },
      { name: 'risk_score', type: 'INTEGER', nullable: true },
      { name: 'status', type: 'STRING', nullable: false },
      { name: 'created_at', type: 'TIMESTAMP', nullable: false }
    ],
    default: [
      { name: 'id', type: 'STRING', nullable: false },
      { name: 'data', type: 'JSON', nullable: true },
      { name: 'created_at', type: 'TIMESTAMP', nullable: false }
    ]
  };

  return schemas[datasetName] || schemas.default;
}

// ─── Agent-Enhanced Routes ───────────────────────────────────────────────────

router.post('/agent/curate', (req, res) => {
  const correlationId = `CURATE-${Date.now().toString(36).toUpperCase()}`;

  import('../../../agents/specialized/data-agent.js')
    .then(({ getDataAgent }) => {
      const agent = getDataAgent();
      agent.reason({ operation: 'curate', ...req.body }, { correlationId })
        .then(() => console.log(`[DataAgent:Curate] Completed ${correlationId}`))
        .catch(err => console.error(`[DataAgent:Curate] Error ${correlationId}:`, err.message));
    })
    .catch(err => console.error('[DataAgent:Curate] Import error:', err.message));

  res.status(202).json({
    success: true,
    data: { correlationId, status: 'ACCEPTED', message: 'Curation analysis started' }
  });
});

router.post('/agent/features', (req, res) => {
  const correlationId = `FEAT-${Date.now().toString(36).toUpperCase()}`;

  import('../../../agents/specialized/feature-engineering-agent.js')
    .then(({ getFeatureEngineeringAgent }) => {
      const agent = getFeatureEngineeringAgent();
      agent.reason(req.body, { correlationId })
        .then(() => console.log(`[FeatureEngineering] Completed ${correlationId}`))
        .catch(err => console.error(`[FeatureEngineering] Error ${correlationId}:`, err.message));
    })
    .catch(err => console.error('[FeatureEngineering] Import error:', err.message));

  res.status(202).json({
    success: true,
    data: { correlationId, status: 'ACCEPTED', message: 'Feature engineering started' }
  });
});

export default router;
