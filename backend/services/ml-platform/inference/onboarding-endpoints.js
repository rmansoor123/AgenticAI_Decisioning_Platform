/**
 * Onboarding Model API Endpoints
 * Exposes the onboarding-risk-v1 TensorFlow.js model via REST.
 *
 * Routes (all mounted under /api/ml/inference):
 *   GET  /models/onboarding-risk-v1     — model details + architecture
 *   GET  /feature-importance/onboarding — 25-feature importance list
 *   POST /test                          — run a live inference
 *   GET  /cache/stats                   — prediction cache statistics
 */

import express from 'express';
import { getOnboardingRiskModel } from '../models/onboarding-risk-model.js';
import {
  extractOnboardingFeatures,
  getOnboardingFeatureImportance,
  calculateOnboardingContributions,
  ONBOARDING_FEATURE_DEFINITIONS
} from '../models/onboarding-feature-extractor.js';
import { getPredictionCacheStats } from './prediction-cache-redis.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Helper — map a feature name to its display group
// ---------------------------------------------------------------------------
function categorizeFeature(name) {
  const groups = {
    identity:    ['identityVerificationScore', 'documentAuthenticityScore'],
    financial:   ['bankVerificationScore', 'taxIdVerificationScore', 'revenueEstimate', 'employeeCount'],
    compliance:  ['watchlistMatchScore', 'businessRegistrationScore'],
    behavioral:  ['velocityScore', 'deviceTrustScore', 'ipReputationScore', 'duplicateDetectionScore'],
    network:     ['networkRiskScore', 'geographicAnomalyScore', 'historicalFraudFlags']
  };

  for (const [group, features] of Object.entries(groups)) {
    if (features.includes(name)) return group;
  }
  return 'profile';
}

// ---------------------------------------------------------------------------
// GET /models/onboarding-risk-v1
// ---------------------------------------------------------------------------
router.get('/models/onboarding-risk-v1', async (req, res) => {
  try {
    const model = getOnboardingRiskModel();
    const info = model.getInfo();

    res.json({
      modelId: 'onboarding-risk-v1',
      name: 'Seller Onboarding Risk Model',
      framework: 'TensorFlow.js',
      architecture: {
        layers: [
          { index: 0, units: 25,  type: 'input',   activation: null,      dropout: null },
          { index: 1, units: 128, type: 'dense',   activation: 'relu',    dropout: 0.3  },
          { index: 2, units: 64,  type: 'dense',   activation: 'relu',    dropout: 0.2  },
          { index: 3, units: 32,  type: 'dense',   activation: 'relu',    dropout: 0.15 },
          { index: 4, units: 1,   type: 'output',  activation: 'sigmoid', dropout: null }
        ],
        inputFeatures: 25,
        totalParams: info.architecture?.totalParams || null
      },
      version: info.version || '1.0.0',
      status: info.isLoaded ? 'loaded' : 'not_loaded',
      predictionCount: info.stats?.predictions || 0,
      avgLatencyMs: info.stats?.avgLatency || 0,
      thresholds: {
        pipeline: {
          high:    0.65,
          medium:  0.35,
          low:     0.20
        },
        rules: {
          autoReject: 0.80,
          autoApprove: 0.25,
          reviewBand:  [0.35, 0.80]
        }
      },
      createdAt: info.createdAt || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /feature-importance/onboarding
// ---------------------------------------------------------------------------
router.get('/feature-importance/onboarding', (req, res) => {
  try {
    const importance = getOnboardingFeatureImportance();

    const features = importance.map(feat => {
      const def = ONBOARDING_FEATURE_DEFINITIONS[feat.name] || {};
      return {
        name:        feat.name,
        importance:  feat.importance,
        description: feat.description,
        min:         def.min  ?? null,
        max:         def.max  ?? null,
        default:     def.default ?? null,
        group:       categorizeFeature(feat.name)
      };
    });

    const groups = {};
    for (const f of features) {
      groups[f.group] = (groups[f.group] || 0) + f.importance;
    }

    res.json({
      modelId:      'onboarding-risk-v1',
      featureCount: features.length,
      features,
      groupSummary: groups
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /test
// ---------------------------------------------------------------------------
router.post('/test', async (req, res) => {
  try {
    const { features = {} } = req.body || {};
    const startTime = Date.now();

    // 1. Extract + normalise features
    const extracted = extractOnboardingFeatures(features);

    // 2. Run inference
    const model = getOnboardingRiskModel();
    const prediction = await model.predict(extracted.vector);

    const score = prediction.score;

    // 3. Derive decision
    let decision;
    if      (score >= 0.80) decision = 'REJECT';
    else if (score >= 0.35) decision = 'REVIEW';
    else                    decision = 'APPROVE';

    // 4. SHAP-like contributions
    const contributions = calculateOnboardingContributions(extracted, score);

    // 5. Risk breakdown by group
    const riskBreakdown = {};
    for (const contrib of contributions) {
      const group = categorizeFeature(contrib.feature);
      if (!riskBreakdown[group]) riskBreakdown[group] = { totalContribution: 0, features: [] };
      riskBreakdown[group].totalContribution += contrib.contribution;
      riskBreakdown[group].features.push(contrib.feature);
    }

    const latencyMs = Date.now() - startTime;

    res.json({
      score,
      decision,
      riskLevel: score >= 0.65 ? 'HIGH' : score >= 0.35 ? 'MEDIUM' : 'LOW',
      contributions: contributions.slice(0, 10),  // top 10 by absolute value
      allContributions: contributions,
      riskBreakdown,
      latencyMs,
      modelVersion: prediction.modelVersion || '1.0.0',
      extractedFeatureCount: extracted.vector?.length || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /cache/stats
// ---------------------------------------------------------------------------
router.get('/cache/stats', (req, res) => {
  try {
    res.json(getPredictionCacheStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
