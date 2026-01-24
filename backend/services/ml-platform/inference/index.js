/**
 * ML Inference Service
 * Real-time prediction using TensorFlow.js neural networks
 */

import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { v4 as uuidv4 } from 'uuid';
import { getModelLoader } from '../models/model-loader.js';
import { extractFeatures, calculateFeatureContributions, getFeatureImportance } from '../models/feature-extractor.js';

const router = express.Router();

// Prediction cache
const predictionCache = new Map();

// Get the model loader
const modelLoader = getModelLoader();

/**
 * Real-time prediction endpoint
 */
router.post('/predict', async (req, res) => {
  try {
    const { modelId, features, context } = req.body;
    const startTime = Date.now();

    // Get model info from database (for metadata)
    let modelRecord = null;
    if (modelId) {
      modelRecord = db_ops.getById('ml_models', 'model_id', modelId);
    } else {
      // Use default production model
      const models = db_ops.getAll('ml_models', 100, 0).map(m => m.data);
      modelRecord = { data: models.find(m => m.status === 'PRODUCTION') || models[0] };
    }

    const modelMeta = modelRecord?.data || {
      modelId: 'fraud-detector-v3',
      name: 'Fraud Detection Model',
      type: 'FRAUD_DETECTION',
      version: '3.0.0',
      status: 'PRODUCTION'
    };

    // Load the TensorFlow model
    const model = await modelLoader.ensureLoaded(modelMeta.modelId || 'fraud-detector-v3');

    // Extract features from input
    const extractedFeatures = extractFeatures(features || {});

    // Make prediction with real ML model
    const mlResult = await model.predict(extractedFeatures.vector);

    // Generate decision based on score
    const prediction = generateDecision(mlResult.score, modelMeta.type || 'FRAUD_DETECTION');

    const totalLatencyMs = Date.now() - startTime;

    // Cache prediction
    const predictionId = `PRED-${uuidv4().substring(0, 10).toUpperCase()}`;
    const predictionData = {
      predictionId,
      modelId: modelMeta.modelId,
      modelVersion: modelMeta.version || mlResult.modelVersion,
      features: extractedFeatures.raw,
      normalizedFeatures: extractedFeatures.normalized,
      prediction,
      mlLatencyMs: mlResult.latencyMs,
      totalLatencyMs,
      timestamp: new Date().toISOString()
    };

    predictionCache.set(predictionId, predictionData);

    res.json({
      success: true,
      data: {
        predictionId,
        modelId: modelMeta.modelId,
        modelVersion: modelMeta.version || mlResult.modelVersion,
        prediction,
        featureCount: extractedFeatures.featureCount,
        latencyMs: totalLatencyMs,
        mlLatencyMs: mlResult.latencyMs
      }
    });
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Batch prediction endpoint
 */
router.post('/batch-predict', async (req, res) => {
  try {
    const { modelId, records } = req.body;
    const startTime = Date.now();

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: 'Records array is required' });
    }

    // Get model metadata
    const models = db_ops.getAll('ml_models', 100, 0).map(m => m.data);
    const modelMeta = modelId
      ? models.find(m => m.modelId === modelId)
      : models.find(m => m.status === 'PRODUCTION') || models[0];

    if (!modelMeta) {
      return res.status(404).json({ success: false, error: 'Model not found' });
    }

    // Load the TensorFlow model
    const model = await modelLoader.ensureLoaded(modelMeta.modelId || 'fraud-detector-v3');

    // Extract features for all records
    const featureVectors = records.map(record => {
      const extracted = extractFeatures(record.features || record);
      return extracted.vector;
    });

    // Make batch predictions
    const mlResult = await model.predictBatch(featureVectors);

    // Generate predictions with decisions
    const predictions = mlResult.scores.map((score, index) => ({
      index,
      entityId: records[index].entityId || `entity-${index}`,
      prediction: generateDecision(score, modelMeta.type || 'FRAUD_DETECTION')
    }));

    const totalLatencyMs = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        modelId: modelMeta.modelId,
        modelVersion: modelMeta.version || mlResult.modelVersion,
        predictions,
        summary: {
          totalRecords: records.length,
          totalLatencyMs,
          avgLatencyMs: mlResult.avgLatencyMs,
          mlLatencyMs: mlResult.totalLatencyMs
        }
      }
    });
  } catch (error) {
    console.error('Batch prediction error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get prediction by ID
 */
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

/**
 * Get model endpoints
 */
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
          latencyP50: m.metrics?.latencyP50 || 10,
          latencyP99: m.metrics?.latencyP99 || 50
        },
        endpoint: `/api/ml/inference/predict?modelId=${m.modelId}`
      }));

    // Add loaded model info
    const loaderStats = modelLoader.getStats();

    res.json({
      success: true,
      data: endpoints,
      loadedModels: loaderStats.models
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Health check for model serving
 */
router.get('/health', (req, res) => {
  try {
    const models = db_ops.getAll('ml_models', 100, 0).map(m => m.data);
    const productionModels = models.filter(m => m.status === 'PRODUCTION');
    const loaderStats = modelLoader.getStats();

    res.json({
      success: true,
      data: {
        status: loaderStats.loadedModels > 0 ? 'HEALTHY' : 'DEGRADED',
        modelsLoaded: loaderStats.loadedModels,
        totalModels: models.length,
        productionModels: productionModels.length,
        cacheSize: predictionCache.size,
        uptime: process.uptime(),
        modelDetails: loaderStats.models
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Explain prediction with feature importance
 */
router.post('/explain', async (req, res) => {
  try {
    const { predictionId, features } = req.body;

    let predictionData;
    let extractedFeatures;
    let score;

    if (predictionId) {
      predictionData = predictionCache.get(predictionId);
      if (predictionData) {
        extractedFeatures = {
          raw: predictionData.features,
          normalized: predictionData.normalizedFeatures
        };
        score = predictionData.prediction.score;
      }
    }

    // If no cached prediction, compute features from input
    if (!extractedFeatures && features) {
      extractedFeatures = extractFeatures(features);
      const model = await modelLoader.ensureLoaded('fraud-detector-v3');
      const result = await model.predict(extractedFeatures.vector);
      score = result.score;
    }

    if (!extractedFeatures) {
      return res.status(400).json({
        success: false,
        error: 'Either predictionId or features must be provided'
      });
    }

    // Calculate feature contributions
    const contributions = calculateFeatureContributions(extractedFeatures, score);

    const explanation = {
      predictionId: predictionId || 'inline',
      baseValue: 0.5,
      outputValue: score,
      featureImportance: contributions.slice(0, 10),
      topContributors: contributions
        .filter(c => Math.abs(c.contribution) > 0.01)
        .slice(0, 5)
        .map(c => ({
          feature: c.feature,
          contribution: c.contribution > 0 ? `+${c.contribution.toFixed(3)}` : c.contribution.toFixed(3),
          reason: `${c.description}: ${c.value?.toFixed?.(2) || c.value} (${c.direction} impact)`
        }))
    };

    res.json({ success: true, data: explanation });
  } catch (error) {
    console.error('Explain error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Inference statistics
 */
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

      const latency = p.totalLatencyMs || p.mlLatencyMs || 0;
      totalLatency += latency;
      latencies.push(latency);
      stats.latencyStats.min = Math.min(stats.latencyStats.min, latency);
      stats.latencyStats.max = Math.max(stats.latencyStats.max, latency);

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
      stats.latencyStats.min = stats.latencyStats.min === Infinity ? 0 : stats.latencyStats.min;
    } else {
      stats.latencyStats.min = 0;
    }

    // Add model loader stats
    stats.modelLoader = modelLoader.getStats();

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Feature importance endpoint
 */
router.get('/feature-importance', (req, res) => {
  try {
    const importance = getFeatureImportance();
    res.json({ success: true, data: importance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Generate decision based on ML score and model type
 */
function generateDecision(score, modelType) {
  let decision, label;

  if (modelType === 'FRAUD_DETECTION') {
    label = score > 0.7 ? 'FRAUD' : score > 0.4 ? 'SUSPICIOUS' : 'LEGITIMATE';
    decision = score > 0.7 ? 'BLOCK' : score > 0.4 ? 'REVIEW' : 'APPROVE';
  } else if (modelType === 'ATO_PREVENTION') {
    label = score > 0.6 ? 'ATO_RISK' : 'NORMAL';
    decision = score > 0.6 ? 'CHALLENGE' : 'ALLOW';
  } else {
    label = score > 0.5 ? 'HIGH_RISK' : 'LOW_RISK';
    decision = score > 0.5 ? 'FLAG' : 'PASS';
  }

  // Calculate confidence based on how far from decision boundary
  const boundary = modelType === 'FRAUD_DETECTION' ? 0.5 : 0.5;
  const distanceFromBoundary = Math.abs(score - boundary);
  const confidence = Math.min(0.99, 0.5 + distanceFromBoundary);

  return {
    score: parseFloat(score.toFixed(6)),
    label,
    decision,
    confidence: parseFloat(confidence.toFixed(4)),
    modelType,
    timestamp: new Date().toISOString()
  };
}

export default router;
