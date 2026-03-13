/**
 * Platform Integrator — bridges the 4 platform layers into the agent TPAOR loop
 *
 * Runs ML inference, decision-engine rules, and experimentation concurrently
 * via Promise.allSettled(). Returns enriched signals that base-agent.js folds
 * into the risk calculation between REFLECT/MULTI-TURN and POLICY.
 *
 * Design principles:
 *   - NEVER throws — every sub-method is internally try/catch'd
 *   - Fire-and-forget DB writes for audit trail
 *   - Lazy-loads ML model (heavy) only on first call
 *   - Opt-out per agent via this.skipPlatformEnrich = true
 *   - All layers individually toggleable via env vars
 */

import { v4 as uuidv4 } from 'uuid';
import { db_ops } from '../../shared/common/database.js';
import { extractFeatures as extractMLFeatures } from '../../services/ml-platform/models/feature-extractor.js';
import { generateDecision } from '../../services/ml-platform/inference/decision-generator.js';
import { evaluateRule, calculateRiskScore } from '../../services/decision-engine/execution/rule-evaluator.js';
import { assignVariant } from '../../services/experimentation/ab-testing/variant-assigner.js';

class PlatformIntegrator {
  constructor() {
    this.modelLoader = null; // lazy-loaded
    this.enableML = process.env.PLATFORM_ML !== 'false';
    this.enableRules = process.env.PLATFORM_RULES !== 'false';
    this.enableExperimentation = process.env.PLATFORM_EXPERIMENTS !== 'false';
  }

  /**
   * Main entry point — called from base-agent.js PLATFORM_ENRICH step
   *
   * @param {string} agentId - e.g. 'SELLER_ONBOARDING'
   * @param {string} domain - e.g. 'seller-onboarding'
   * @param {object} input - the original agent input (seller data, transaction, etc.)
   * @param {object} observeResult - thought.result from OBSERVE step
   * @returns {object} enrichment signals
   */
  async enrich(agentId, domain, input, observeResult) {
    const startTime = performance.now();

    const promises = [
      this.enableML ? this._enrichML(agentId, domain, input, observeResult) : Promise.resolve(null),
      this.enableRules ? this._enrichRules(agentId, domain, input, observeResult) : Promise.resolve({ triggeredRules: [], ruleRiskScore: 0, enrichedRiskFactors: [] }),
      this.enableExperimentation ? this._enrichExperimentation(agentId, domain, input) : Promise.resolve(null)
    ];

    const [mlResult, rulesResult, expResult] = await Promise.allSettled(promises);

    const mlScore = mlResult.status === 'fulfilled' ? mlResult.value : null;
    const rules = rulesResult.status === 'fulfilled' ? rulesResult.value : { triggeredRules: [], ruleRiskScore: 0, enrichedRiskFactors: [] };
    const experimentVariant = expResult.status === 'fulfilled' ? expResult.value : null;

    // Merge enriched risk factors from ML + rules
    const enrichedRiskFactors = [];
    if (mlScore?.enrichedRiskFactors) enrichedRiskFactors.push(...mlScore.enrichedRiskFactors);
    if (rules?.enrichedRiskFactors) enrichedRiskFactors.push(...rules.enrichedRiskFactors);

    return {
      mlScore: mlScore ? {
        score: mlScore.score,
        label: mlScore.label,
        decision: mlScore.decision,
        confidence: mlScore.confidence,
        modelVersion: mlScore.modelVersion,
        latencyMs: mlScore.latencyMs
      } : null,
      triggeredRules: rules.triggeredRules || [],
      ruleRiskScore: rules.ruleRiskScore || 0,
      experimentVariant: experimentVariant || null,
      enrichedRiskFactors,
      platformLatencyMs: performance.now() - startTime,
      _platformEnriched: true
    };
  }

  /**
   * ML Inference enrichment
   */
  async _enrichML(agentId, domain, input, observeResult) {
    try {
      // Build feature object from input
      const featureData = {
        amount: input?.amount || input?.sellerData?.amount || input?.transactionData?.amount || 0,
        velocity: input?.velocity || {},
        deviceFingerprint: input?.deviceFingerprint || input?.device?.fingerprint || 'unknown',
        geoData: input?.geoData || { country: input?.country || input?.sellerData?.country || 'US' },
        accountAge: input?.accountAge || 30,
        sellerId: input?.sellerId || input?.sellerData?.sellerId || 'unknown',
        email: input?.email || input?.sellerData?.email || '',
        businessCategory: input?.businessCategory || input?.sellerData?.businessCategory || 'general'
      };

      // Extract features
      const extracted = extractMLFeatures(featureData);

      // Lazy-load model
      if (!this.modelLoader) {
        const { getModelLoader } = await import('../../services/ml-platform/models/model-loader.js');
        this.modelLoader = getModelLoader();
      }

      const model = await this.modelLoader.ensureLoaded('fraud-detector-v3');
      const mlResult = await model.predict(extracted.vector);

      // Generate decision
      const decisionResult = generateDecision(mlResult.score, 'FRAUD_DETECTION');

      // Fire-and-forget: persist prediction
      const predictionId = `PRED-${uuidv4().substring(0, 10).toUpperCase()}`;
      try {
        db_ops.run(
          'INSERT INTO prediction_history (prediction_id, model_id, features, score, decision, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [predictionId, 'fraud-detector-v3', JSON.stringify(extracted.normalized || {}), mlResult.score, decisionResult.label, new Date().toISOString()]
        );
      } catch (_) { /* best-effort */ }

      // Build enriched risk factors from ML score
      const enrichedRiskFactors = [];
      if (mlResult.score > 0.7) {
        enrichedRiskFactors.push({
          factor: `ML_HIGH_FRAUD_SCORE (${mlResult.score.toFixed(3)})`,
          severity: 'HIGH',
          score: Math.round(mlResult.score * 40),
          source: 'ml-platform'
        });
      } else if (mlResult.score > 0.4) {
        enrichedRiskFactors.push({
          factor: `ML_MEDIUM_FRAUD_SCORE (${mlResult.score.toFixed(3)})`,
          severity: 'MEDIUM',
          score: Math.round(mlResult.score * 20),
          source: 'ml-platform'
        });
      }

      return {
        score: decisionResult.score,
        label: decisionResult.label,
        decision: decisionResult.decision,
        confidence: decisionResult.confidence,
        modelVersion: mlResult.modelVersion || '3.0.0',
        latencyMs: mlResult.latencyMs || 0,
        enrichedRiskFactors
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Decision Engine rules enrichment
   */
  async _enrichRules(agentId, domain, input, observeResult) {
    try {
      const allRules = db_ops.getAll('rules', 1000, 0)
        .map(r => r.data)
        .filter(r => r.status === 'ACTIVE');

      // Build transaction-like object for rule evaluation
      const transaction = {
        ...(input?.sellerData || input?.transactionData || input || {}),
        riskScore: observeResult?.overallRisk?.score || 0,
        amount: input?.amount || input?.sellerData?.amount || input?.transactionData?.amount || 0,
        country: input?.country || input?.sellerData?.country || 'US',
        domain
      };

      const triggeredRules = [];
      const ruleResults = [];

      for (const rule of allRules) {
        const ruleStartTime = Date.now();
        try {
          const result = evaluateRule(rule, transaction, {});
          const ruleLatency = Date.now() - ruleStartTime;

          ruleResults.push({ ruleId: rule.ruleId, triggered: result.triggered, latency: ruleLatency });

          // Fire-and-forget: record rule performance
          try {
            db_ops.run(
              'INSERT INTO rule_performance (id, rule_id, transaction_id, triggered, decision, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [uuidv4(), rule.ruleId, input?.sellerId || input?.transactionId || null, result.triggered ? 1 : 0, result.triggered ? rule.action : null, ruleLatency, new Date().toISOString()]
            );
          } catch (_) { /* best-effort */ }

          if (result.triggered) {
            triggeredRules.push({ ruleId: rule.ruleId, ruleName: rule.name, action: rule.action });
          }
        } catch (_) {
          // Skip individual rule failures
        }
      }

      const ruleRiskScore = calculateRiskScore(
        triggeredRules.map(r => ({ action: r.action })),
        { riskScore: 0 }
      );

      // Build enriched risk factors from triggered rules
      const enrichedRiskFactors = triggeredRules.map(r => {
        let severity, score;
        if (r.action === 'BLOCK') { severity = 'CRITICAL'; score = 30; }
        else if (r.action === 'REVIEW') { severity = 'HIGH'; score = 20; }
        else if (r.action === 'FLAG') { severity = 'MEDIUM'; score = 10; }
        else { severity = 'LOW'; score = 5; }

        return {
          factor: `RULE_${r.ruleId}: ${r.ruleName || r.action}`,
          severity,
          score,
          source: 'decision-engine'
        };
      });

      return { triggeredRules, ruleRiskScore, enrichedRiskFactors };
    } catch (e) {
      return { triggeredRules: [], ruleRiskScore: 0, enrichedRiskFactors: [] };
    }
  }

  /**
   * Experimentation enrichment
   */
  async _enrichExperimentation(agentId, domain, input) {
    try {
      const experiments = db_ops.getAll('experiments', 100, 0)
        .map(e => e.data)
        .filter(e => e.status === 'RUNNING');

      if (experiments.length === 0) return null;

      const entityId = input?.sellerId || input?.transactionId || input?.entityId || 'unknown';
      const experiment = experiments[0]; // Use first running experiment

      const assignment = assignVariant(experiment, entityId);

      if (!assignment.inExperiment) return null;

      // Fire-and-forget: record experiment event
      try {
        db_ops.run(
          'INSERT INTO experiment_events (event_id, experiment_id, entity_id, variant, event_type, value, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [`EVT-${uuidv4().substring(0, 8).toUpperCase()}`, experiment.experimentId, entityId, assignment.variant, `${domain}_evaluated`, null, JSON.stringify({ agentId }), new Date().toISOString()]
        );
      } catch (_) { /* best-effort */ }

      return {
        experimentId: experiment.experimentId,
        variant: assignment.variant,
        variantName: assignment.variantName,
        config: assignment.config
      };
    } catch (e) {
      return null;
    }
  }
}

// Singleton
let instance = null;

export function getPlatformIntegrator() {
  if (!instance) {
    instance = new PlatformIntegrator();
  }
  return instance;
}
