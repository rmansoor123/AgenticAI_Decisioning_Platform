import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { generateMLModel } from '../../../shared/synthetic-data/generators.js';

const router = express.Router();

// Get all models (model registry)
router.get('/models', (req, res) => {
  try {
    const { limit = 50, status, type } = req.query;

    let models = db_ops.getAll('ml_models', parseInt(limit), 0);
    models = models.map(m => m.data);

    if (status) models = models.filter(m => m.status === status);
    if (type) models = models.filter(m => m.type === type);

    res.json({
      success: true,
      data: models,
      total: db_ops.count('ml_models')
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get model by ID
router.get('/models/:modelId', (req, res) => {
  try {
    const model = db_ops.getById('ml_models', 'model_id', req.params.modelId);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }
    res.json({ success: true, data: model.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Register new model
router.post('/models', (req, res) => {
  try {
    const modelData = req.body.modelId ? req.body : generateMLModel();
    modelData.registeredAt = new Date().toISOString();
    modelData.status = modelData.status || 'TRAINING';

    db_ops.insert('ml_models', 'model_id', modelData.modelId, modelData);

    res.status(201).json({ success: true, data: modelData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update model status (promote/demote)
router.patch('/models/:modelId/status', (req, res) => {
  try {
    const { status, reason, approvedBy } = req.body;
    const existing = db_ops.getById('ml_models', 'model_id', req.params.modelId);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    // Validate status transition
    const validTransitions = {
      'TRAINING': ['SHADOW', 'RETIRED'],
      'SHADOW': ['CANARY', 'RETIRED', 'TRAINING'],
      'CANARY': ['PRODUCTION', 'SHADOW', 'RETIRED'],
      'PRODUCTION': ['RETIRED', 'SHADOW'],
      'RETIRED': ['TRAINING']
    };

    if (!validTransitions[existing.data.status]?.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid transition from ${existing.data.status} to ${status}`
      });
    }

    const updated = {
      ...existing.data,
      status,
      statusHistory: [
        ...(existing.data.statusHistory || []),
        {
          from: existing.data.status,
          to: status,
          reason,
          approvedBy,
          timestamp: new Date().toISOString()
        }
      ]
    };

    if (status === 'PRODUCTION') {
      updated.deployedAt = new Date().toISOString();
    }

    db_ops.update('ml_models', 'model_id', req.params.modelId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get model versions
router.get('/models/:modelId/versions', (req, res) => {
  try {
    const models = db_ops.getAll('ml_models', 1000, 0).map(m => m.data);
    const model = models.find(m => m.modelId === req.params.modelId);

    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    // Find all versions of this model (by name)
    const versions = models
      .filter(m => m.name === model.name)
      .sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));

    res.json({ success: true, data: versions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get model lineage
router.get('/models/:modelId/lineage', (req, res) => {
  try {
    const model = db_ops.getById('ml_models', 'model_id', req.params.modelId);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    // Query actual training runs for the model
    const trainingRuns = db_ops.raw(
      'SELECT * FROM model_training_runs WHERE model_id = ? ORDER BY started_at DESC LIMIT 5',
      [model.data.modelId]
    );

    // Count predictions for this model
    const predCount = db_ops.raw(
      'SELECT COUNT(*) as cnt FROM prediction_history WHERE model_id = ?',
      [model.data.modelId]
    );

    const latestRun = trainingRuns[0];
    const lineage = {
      modelId: model.data.modelId,
      name: model.data.name,
      version: model.data.version,
      trainingData: latestRun ? {
        datasets: [`training_run_${latestRun.run_id}`],
        timeRange: {
          start: latestRun.started_at,
          end: latestRun.completed_at || 'in_progress'
        },
        samples: latestRun.training_data_count || 0,
        validationSamples: latestRun.validation_data_count || 0,
        metrics: latestRun.metrics ? JSON.parse(latestRun.metrics) : null
      } : {
        datasets: model.data.trainingData?.datasets || [],
        samples: model.data.trainingData?.samples || 0,
        message: 'No training runs recorded yet'
      },
      features: {
        featureStore: 'seller_features_v2',
        featureCount: model.data.features || 150
      },
      parentModel: model.data.parentModelId || null,
      derivedModels: [],
      predictionCount: predCount[0]?.cnt || 0,
      trainingHistory: trainingRuns.map(r => ({
        runId: r.run_id,
        status: r.status,
        accuracy: r.final_accuracy,
        loss: r.final_loss,
        startedAt: r.started_at,
        completedAt: r.completed_at
      })),
      checksum: JSON.stringify(model.data.metrics || {}).length,
      artifacts: {
        modelPath: `s3://ml-models/${model.data.modelId}/model.pkl`,
        metricsPath: `s3://ml-models/${model.data.modelId}/metrics.json`,
        configPath: `s3://ml-models/${model.data.modelId}/config.yaml`
      }
    };

    res.json({ success: true, data: lineage });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get model approvals/audit log
router.get('/models/:modelId/audit', (req, res) => {
  try {
    const model = db_ops.getById('ml_models', 'model_id', req.params.modelId);
    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    const auditLog = [
      {
        action: 'MODEL_REGISTERED',
        timestamp: model.data.registeredAt || model.data.createdAt,
        user: model.data.createdBy,
        details: { version: model.data.version }
      },
      ...(model.data.statusHistory || []).map(h => ({
        action: `STATUS_CHANGED`,
        timestamp: h.timestamp,
        user: h.approvedBy,
        details: { from: h.from, to: h.to, reason: h.reason }
      }))
    ];

    res.json({ success: true, data: auditLog });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Compare models
router.post('/compare', (req, res) => {
  try {
    const { modelIds } = req.body;

    const models = modelIds.map(id => {
      const model = db_ops.getById('ml_models', 'model_id', id);
      return model?.data;
    }).filter(Boolean);

    if (models.length < 2) {
      return res.status(400).json({ success: false, error: 'Need at least 2 valid models to compare' });
    }

    const comparison = {
      models: models.map(m => ({
        modelId: m.modelId,
        name: m.name,
        version: m.version,
        status: m.status,
        framework: m.framework
      })),
      metrics: models.map(m => ({
        modelId: m.modelId,
        accuracy: m.metrics?.accuracy,
        precision: m.metrics?.precision,
        recall: m.metrics?.recall,
        f1Score: m.metrics?.f1Score,
        auc: m.metrics?.auc,
        latencyP50: m.metrics?.latencyP50,
        latencyP99: m.metrics?.latencyP99
      })),
      winner: {
        byAccuracy: models.reduce((best, m) =>
          (m.metrics?.accuracy || 0) > (best.metrics?.accuracy || 0) ? m : best
        ).modelId,
        byLatency: models.reduce((best, m) =>
          (m.metrics?.latencyP50 || Infinity) < (best.metrics?.latencyP50 || Infinity) ? m : best
        ).modelId
      }
    };

    res.json({ success: true, data: comparison });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get governance statistics
router.get('/stats', (req, res) => {
  try {
    const models = db_ops.getAll('ml_models', 1000, 0).map(m => m.data);

    const stats = {
      total: models.length,
      byStatus: {},
      byType: {},
      byFramework: {},
      avgMetrics: {
        accuracy: 0,
        precision: 0,
        recall: 0,
        latencyP50: 0
      },
      productionModels: models.filter(m => m.status === 'PRODUCTION').map(m => ({
        modelId: m.modelId,
        name: m.name,
        deployedAt: m.deployedAt
      }))
    };

    let metricsCount = 0;

    models.forEach(m => {
      stats.byStatus[m.status] = (stats.byStatus[m.status] || 0) + 1;
      stats.byType[m.type] = (stats.byType[m.type] || 0) + 1;
      stats.byFramework[m.framework] = (stats.byFramework[m.framework] || 0) + 1;

      if (m.metrics) {
        metricsCount++;
        stats.avgMetrics.accuracy += m.metrics.accuracy || 0;
        stats.avgMetrics.precision += m.metrics.precision || 0;
        stats.avgMetrics.recall += m.metrics.recall || 0;
        stats.avgMetrics.latencyP50 += m.metrics.latencyP50 || 0;
      }
    });

    if (metricsCount > 0) {
      stats.avgMetrics.accuracy /= metricsCount;
      stats.avgMetrics.precision /= metricsCount;
      stats.avgMetrics.recall /= metricsCount;
      stats.avgMetrics.latencyP50 /= metricsCount;
    }

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
