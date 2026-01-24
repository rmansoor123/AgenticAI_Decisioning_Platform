import express from 'express';
import { db_ops } from '../../../shared/common/database.js';

const router = express.Router();

// Model metrics history (in-memory for demo)
const metricsHistory = new Map();

// Get model performance metrics
router.get('/models/:modelId/metrics', (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    const model = db_ops.getById('ml_models', 'model_id', req.params.modelId);

    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    // Generate time series metrics
    const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 24;
    const metrics = generateTimeSeriesMetrics(req.params.modelId, hours);

    res.json({
      success: true,
      data: {
        modelId: req.params.modelId,
        timeRange,
        current: model.data.metrics,
        timeSeries: metrics
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get model drift detection
router.get('/models/:modelId/drift', (req, res) => {
  try {
    const model = db_ops.getById('ml_models', 'model_id', req.params.modelId);

    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    const driftAnalysis = {
      modelId: req.params.modelId,
      analysisTimestamp: new Date().toISOString(),
      featureDrift: [
        { feature: 'transaction_amount', psiScore: 0.08, status: 'STABLE', threshold: 0.2 },
        { feature: 'seller_age_days', psiScore: 0.15, status: 'WARNING', threshold: 0.2 },
        { feature: 'device_type', psiScore: 0.05, status: 'STABLE', threshold: 0.2 },
        { feature: 'geo_region', psiScore: 0.22, status: 'DRIFT_DETECTED', threshold: 0.2 },
        { feature: 'time_of_day', psiScore: 0.03, status: 'STABLE', threshold: 0.2 }
      ],
      predictionDrift: {
        ksDivergence: 0.12,
        status: Math.random() > 0.7 ? 'WARNING' : 'STABLE',
        threshold: 0.15
      },
      labelDrift: {
        fraudRateChange: (Math.random() * 0.02 - 0.01).toFixed(4),
        status: 'STABLE'
      },
      recommendation: Math.random() > 0.8 ? 'RETRAIN_RECOMMENDED' : 'NO_ACTION_NEEDED',
      lastChecked: new Date().toISOString()
    };

    res.json({ success: true, data: driftAnalysis });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get model alerts
router.get('/alerts', (req, res) => {
  try {
    const { status, severity, modelId } = req.query;

    let alerts = [
      {
        alertId: 'ALT-001',
        modelId: 'MDL-FRAUD-01',
        type: 'LATENCY_SPIKE',
        severity: 'WARNING',
        status: 'ACTIVE',
        message: 'P99 latency exceeded threshold (150ms > 100ms)',
        triggeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        acknowledgedBy: null
      },
      {
        alertId: 'ALT-002',
        modelId: 'MDL-ATO-01',
        type: 'ACCURACY_DROP',
        severity: 'CRITICAL',
        status: 'ACKNOWLEDGED',
        message: 'Model accuracy dropped below threshold (0.89 < 0.90)',
        triggeredAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        acknowledgedBy: 'admin@company.com'
      },
      {
        alertId: 'ALT-003',
        modelId: 'MDL-FRAUD-02',
        type: 'DRIFT_DETECTED',
        severity: 'WARNING',
        status: 'RESOLVED',
        message: 'Feature drift detected in geo_region',
        triggeredAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        resolvedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
      }
    ];

    if (status) alerts = alerts.filter(a => a.status === status);
    if (severity) alerts = alerts.filter(a => a.severity === severity);
    if (modelId) alerts = alerts.filter(a => a.modelId === modelId);

    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Acknowledge alert
router.post('/alerts/:alertId/acknowledge', (req, res) => {
  try {
    const { acknowledgedBy } = req.body;

    res.json({
      success: true,
      data: {
        alertId: req.params.alertId,
        status: 'ACKNOWLEDGED',
        acknowledgedBy,
        acknowledgedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get model SLA metrics
router.get('/models/:modelId/sla', (req, res) => {
  try {
    const model = db_ops.getById('ml_models', 'model_id', req.params.modelId);

    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    const slaMetrics = {
      modelId: req.params.modelId,
      period: 'last_30_days',
      availability: {
        target: 99.9,
        actual: 99.95,
        status: 'MEETING_SLA'
      },
      latency: {
        p50Target: 20,
        p50Actual: model.data.metrics?.latencyP50 || 15,
        p99Target: 100,
        p99Actual: model.data.metrics?.latencyP99 || 75,
        status: 'MEETING_SLA'
      },
      accuracy: {
        target: 0.95,
        actual: model.data.metrics?.accuracy || 0.97,
        status: 'MEETING_SLA'
      },
      throughput: {
        targetQPS: 1000,
        actualQPS: 850 + Math.floor(Math.random() * 300),
        status: 'MEETING_SLA'
      }
    };

    res.json({ success: true, data: slaMetrics });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get prediction feedback (for labeling)
router.post('/feedback', (req, res) => {
  try {
    const { predictionId, modelId, actualLabel, feedbackSource } = req.body;

    const feedback = {
      feedbackId: `FB-${Date.now()}`,
      predictionId,
      modelId,
      actualLabel,
      feedbackSource,
      timestamp: new Date().toISOString()
    };

    // In production, this would update the labels database for retraining

    res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get confusion matrix
router.get('/models/:modelId/confusion-matrix', (req, res) => {
  try {
    const model = db_ops.getById('ml_models', 'model_id', req.params.modelId);

    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    // Generate realistic confusion matrix
    const tp = 8500 + Math.floor(Math.random() * 500);
    const tn = 85000 + Math.floor(Math.random() * 5000);
    const fp = 500 + Math.floor(Math.random() * 200);
    const fn = 200 + Math.floor(Math.random() * 100);

    const confusionMatrix = {
      modelId: req.params.modelId,
      period: 'last_7_days',
      matrix: {
        truePositive: tp,
        trueNegative: tn,
        falsePositive: fp,
        falseNegative: fn
      },
      derivedMetrics: {
        accuracy: ((tp + tn) / (tp + tn + fp + fn)).toFixed(4),
        precision: (tp / (tp + fp)).toFixed(4),
        recall: (tp / (tp + fn)).toFixed(4),
        f1Score: (2 * tp / (2 * tp + fp + fn)).toFixed(4),
        falsePositiveRate: (fp / (fp + tn)).toFixed(4),
        falseNegativeRate: (fn / (fn + tp)).toFixed(4)
      }
    };

    res.json({ success: true, data: confusionMatrix });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Monitoring dashboard summary
router.get('/summary', (req, res) => {
  try {
    const models = db_ops.getAll('ml_models', 100, 0).map(m => m.data);
    const productionModels = models.filter(m => m.status === 'PRODUCTION');

    const summary = {
      totalModels: models.length,
      productionModels: productionModels.length,
      healthStatus: {
        healthy: productionModels.filter(m => (m.metrics?.accuracy || 0) > 0.9).length,
        warning: productionModels.filter(m => (m.metrics?.accuracy || 0) <= 0.9 && (m.metrics?.accuracy || 0) > 0.85).length,
        critical: productionModels.filter(m => (m.metrics?.accuracy || 0) <= 0.85).length
      },
      activeAlerts: {
        critical: 1,
        warning: 2,
        info: 3
      },
      avgLatency: productionModels.reduce((sum, m) => sum + (m.metrics?.latencyP50 || 0), 0) / (productionModels.length || 1),
      avgAccuracy: productionModels.reduce((sum, m) => sum + (m.metrics?.accuracy || 0), 0) / (productionModels.length || 1),
      lastUpdated: new Date().toISOString()
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to generate time series metrics
function generateTimeSeriesMetrics(modelId, hours) {
  const metrics = [];
  const now = Date.now();

  for (let i = hours - 1; i >= 0; i--) {
    metrics.push({
      timestamp: new Date(now - i * 60 * 60 * 1000).toISOString(),
      predictions: 1000 + Math.floor(Math.random() * 500),
      latencyP50: 10 + Math.random() * 15,
      latencyP99: 50 + Math.random() * 50,
      accuracy: 0.95 + Math.random() * 0.04,
      errorRate: Math.random() * 0.005
    });
  }

  return metrics;
}

export default router;
