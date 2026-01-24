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

    const quality = {
      datasetId: dataset.data.datasetId,
      name: dataset.data.name,
      metrics: dataset.data.quality || {
        completeness: 0.98,
        freshness: '< 1 HOUR',
        accuracy: 0.995
      },
      lastChecked: new Date().toISOString(),
      issues: []
    };

    // Add any quality issues
    if (quality.metrics.completeness < 0.95) {
      quality.issues.push({ type: 'COMPLETENESS', message: 'Dataset has missing values' });
    }

    res.json({ success: true, data: quality });
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

export default router;
