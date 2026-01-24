import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Prediction cache
const predictionCache = new Map();

// Real-time prediction
router.post('/predict', (req, res) => {
  try {
    const { modelId, features, context } = req.body;
    const startTime = Date.now();

    // Get model info
    let model = null;
    if (modelId) {
      const modelRecord = db_ops.getById('ml_models', 'model_id', modelId);
      model = modelRecord?.data;
    } else {
      // Use default production model
      const models = db_ops.getAll('ml_models', 100, 0).map(m => m.data);
      model = models.find(m => m.status === 'PRODUCTION') || models[0];
    }

    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    // Generate prediction (simulated)
    const prediction = generatePrediction(model, features, context);
    const latencyMs = Date.now() - startTime;

    // Cache prediction
    const predictionId = `PRED-${uuidv4().substring(0, 10).toUpperCase()}`;
    predictionCache.set(predictionId, {
      predictionId,
      modelId: model.modelId,
      modelVersion: model.version,
      features,
      prediction,
      latencyMs,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        predictionId,
        modelId: model.modelId,
        modelVersion: model.version,
        prediction,
        latencyMs
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Batch prediction
router.post('/batch-predict', (req, res) => {
  try {
    const { modelId, records } = req.body;
    const startTime = Date.now();

    // Get model
    const models = db_ops.getAll('ml_models', 100, 0).map(m => m.data);
    const model = modelId
      ? models.find(m => m.modelId === modelId)
      : models.find(m => m.status === 'PRODUCTION');

    if (!model) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    // Generate predictions for all records
    const predictions = records.map((record, index) => ({
      index,
      entityId: record.entityId,
      prediction: generatePrediction(model, record.features, record.context)
    }));

    const totalLatencyMs = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        modelId: model.modelId,
        modelVersion: model.version,
        predictions,
        summary: {
          totalRecords: records.length,
          totalLatencyMs,
          avgLatencyMs: totalLatencyMs / records.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get prediction by ID
router.get('/predictions/:predictionId', (req, res) => {
  try {
    const prediction = predictionCache.get(req.params.predictionId);
    if (!prediction) {
      return res.status(404).json({ success: false, error: 'Prediction not found' });
    }
    res.json({ success: true, data: prediction });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get model endpoints
router.get('/models', (req, res) => {
  try {
    const models = db_ops.getAll('ml_models', 100, 0).map(m => m.data);

    const endpoints = models
      .filter(m => ['PRODUCTION', 'SHADOW', 'CANARY'].includes(m.status))
      .map(m => ({
        modelId: m.modelId,
        name: m.name,
        type: m.type,
        version: m.version,
        status: m.status,
        metrics: {
          latencyP50: m.metrics.latencyP50,
          latencyP99: m.metrics.latencyP99
        },
        endpoint: `/api/ml/inference/predict?modelId=${m.modelId}`
      }));

    res.json({ success: true, data: endpoints });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check for model serving
router.get('/health', (req, res) => {
  try {
    const models = db_ops.getAll('ml_models', 100, 0).map(m => m.data);
    const productionModels = models.filter(m => m.status === 'PRODUCTION');

    res.json({
      success: true,
      data: {
        status: productionModels.length > 0 ? 'HEALTHY' : 'DEGRADED',
        modelsLoaded: productionModels.length,
        totalModels: models.length,
        cacheSize: predictionCache.size,
        uptime: process.uptime()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Explain prediction
router.post('/explain', (req, res) => {
  try {
    const { predictionId, features } = req.body;

    let predictionData;
    if (predictionId) {
      predictionData = predictionCache.get(predictionId);
    }

    // Generate feature importance (SHAP-like explanation)
    const explanation = {
      predictionId: predictionId || 'inline',
      baseValue: 0.5,
      outputValue: predictionData?.prediction?.score || 0.7,
      featureImportance: [
        { feature: 'transaction_amount', importance: 0.25, direction: 'positive' },
        { feature: 'seller_risk_score', importance: 0.20, direction: 'positive' },
        { feature: 'device_is_new', importance: 0.15, direction: 'positive' },
        { feature: 'velocity_1h', importance: 0.12, direction: 'positive' },
        { feature: 'geo_distance', importance: 0.10, direction: 'negative' },
        { feature: 'account_age_days', importance: -0.08, direction: 'negative' },
        { feature: 'historical_fraud_rate', importance: 0.18, direction: 'positive' }
      ],
      topContributors: [
        { feature: 'transaction_amount', contribution: '+0.25', reason: 'Amount $2,500 is 3x average' },
        { feature: 'seller_risk_score', contribution: '+0.20', reason: 'Seller risk tier is HIGH' },
        { feature: 'device_is_new', contribution: '+0.15', reason: 'First time seeing this device' }
      ]
    };

    res.json({ success: true, data: explanation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Inference statistics
router.get('/stats', (req, res) => {
  try {
    const predictions = Array.from(predictionCache.values());

    const stats = {
      totalPredictions: predictions.length,
      byModel: {},
      latencyStats: {
        avg: 0,
        min: Infinity,
        max: 0,
        p50: 0,
        p99: 0
      },
      scoreDistribution: {
        low: 0,
        medium: 0,
        high: 0
      }
    };

    let totalLatency = 0;
    const latencies = [];

    predictions.forEach(p => {
      stats.byModel[p.modelId] = (stats.byModel[p.modelId] || 0) + 1;

      totalLatency += p.latencyMs;
      latencies.push(p.latencyMs);
      stats.latencyStats.min = Math.min(stats.latencyStats.min, p.latencyMs);
      stats.latencyStats.max = Math.max(stats.latencyStats.max, p.latencyMs);

      const score = p.prediction?.score || 0;
      if (score < 0.3) stats.scoreDistribution.low++;
      else if (score < 0.7) stats.scoreDistribution.medium++;
      else stats.scoreDistribution.high++;
    });

    if (predictions.length > 0) {
      stats.latencyStats.avg = totalLatency / predictions.length;
      latencies.sort((a, b) => a - b);
      stats.latencyStats.p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
      stats.latencyStats.p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
    }

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to generate prediction
function generatePrediction(model, features, context) {
  // Simulate ML prediction based on model type
  const baseScore = Math.random();

  // Adjust based on features
  let score = baseScore;

  if (features) {
    if (features.amount > 1000) score += 0.1;
    if (features.isNewDevice) score += 0.15;
    if (features.riskScore > 50) score += 0.1;
    if (features.velocitySpike) score += 0.2;
  }

  score = Math.min(1, Math.max(0, score));

  // Generate decision based on model type
  let decision, label;

  if (model.type === 'FRAUD_DETECTION') {
    label = score > 0.7 ? 'FRAUD' : score > 0.4 ? 'SUSPICIOUS' : 'LEGITIMATE';
    decision = score > 0.7 ? 'BLOCK' : score > 0.4 ? 'REVIEW' : 'APPROVE';
  } else if (model.type === 'ATO_PREVENTION') {
    label = score > 0.6 ? 'ATO_RISK' : 'NORMAL';
    decision = score > 0.6 ? 'CHALLENGE' : 'ALLOW';
  } else {
    label = score > 0.5 ? 'HIGH_RISK' : 'LOW_RISK';
    decision = score > 0.5 ? 'FLAG' : 'PASS';
  }

  return {
    score: parseFloat(score.toFixed(4)),
    label,
    decision,
    confidence: parseFloat((0.7 + Math.random() * 0.25).toFixed(4)),
    modelType: model.type,
    timestamp: new Date().toISOString()
  };
}

export default router;
