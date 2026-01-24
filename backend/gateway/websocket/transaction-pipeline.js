/**
 * Transaction Pipeline - Full transaction flow simulation
 * Simulates the complete lifecycle of a transaction through the fraud detection system
 */

import { v4 as uuidv4 } from 'uuid';
import { getEventBus, EVENT_TYPES } from './event-bus.js';
import generators from '../../shared/synthetic-data/generators.js';

const { generateTransaction, generateMetricsSnapshot } = generators;

/**
 * Pipeline stages
 */
const PIPELINE_STAGES = {
  RECEIVED: 'received',
  ENRICHED: 'enriched',
  SCORED: 'scored',
  RULES_EVALUATED: 'rules_evaluated',
  DECIDED: 'decided',
  COMPLETED: 'completed'
};

/**
 * Transaction Pipeline Class
 */
class TransactionPipeline {
  constructor() {
    this.eventBus = getEventBus();
    this.isRunning = false;
    this.transactionInterval = null;
    this.metricsInterval = null;
    this.config = {
      transactionIntervalMs: 1500,
      metricsIntervalMs: 5000,
      pipelineDelayMs: 200 // Delay between stages
    };
    this.stats = {
      transactionsProcessed: 0,
      totalLatency: 0,
      decisions: {
        APPROVED: 0,
        BLOCKED: 0,
        REVIEW: 0
      }
    };
  }

  /**
   * Start the transaction pipeline
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('Transaction pipeline started');

    // Start transaction generation
    this.transactionInterval = setInterval(() => {
      this.processTransaction();
    }, this.config.transactionIntervalMs);

    // Start metrics broadcasting
    this.metricsInterval = setInterval(() => {
      this.broadcastMetrics();
    }, this.config.metricsIntervalMs);
  }

  /**
   * Stop the transaction pipeline
   */
  stop() {
    this.isRunning = false;

    if (this.transactionInterval) {
      clearInterval(this.transactionInterval);
      this.transactionInterval = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    console.log('Transaction pipeline stopped');
  }

  /**
   * Process a single transaction through the pipeline
   */
  async processTransaction(customTransaction = null) {
    const pipelineId = `PIPE-${uuidv4().slice(0, 8).toUpperCase()}`;
    const startTime = Date.now();

    // Generate or use provided transaction
    const transaction = customTransaction || generateTransaction();
    transaction.pipelineId = pipelineId;

    try {
      // Stage 1: Transaction Received
      await this.emitStage(PIPELINE_STAGES.RECEIVED, {
        pipelineId,
        transaction,
        stage: PIPELINE_STAGES.RECEIVED
      });

      // Stage 2: Enrichment
      const enrichedData = await this.enrichTransaction(transaction);
      await this.emitStage(PIPELINE_STAGES.ENRICHED, {
        pipelineId,
        transaction,
        enrichment: enrichedData,
        stage: PIPELINE_STAGES.ENRICHED
      });

      // Stage 3: ML Scoring
      const scoreResult = await this.scoreTransaction(transaction, enrichedData);
      this.eventBus.publish(EVENT_TYPES.TRANSACTION_SCORED, {
        pipelineId,
        transactionId: transaction.transactionId,
        score: scoreResult.score,
        confidence: scoreResult.confidence,
        modelId: scoreResult.modelId
      });
      await this.emitStage(PIPELINE_STAGES.SCORED, {
        pipelineId,
        transaction,
        scoring: scoreResult,
        stage: PIPELINE_STAGES.SCORED
      });

      // Stage 4: Rules Evaluation
      const rulesResult = await this.evaluateRules(transaction, scoreResult);
      await this.emitStage(PIPELINE_STAGES.RULES_EVALUATED, {
        pipelineId,
        transaction,
        rules: rulesResult,
        stage: PIPELINE_STAGES.RULES_EVALUATED
      });

      // Stage 5: Decision
      const decision = this.makeDecision(scoreResult, rulesResult);
      transaction.decision = decision.action;
      transaction.riskScore = scoreResult.score;

      this.eventBus.publish(EVENT_TYPES.TRANSACTION_DECIDED, {
        pipelineId,
        transactionId: transaction.transactionId,
        decision: decision.action,
        reason: decision.reason,
        score: scoreResult.score
      });

      this.eventBus.publish(EVENT_TYPES.DECISION_MADE, {
        pipelineId,
        transactionId: transaction.transactionId,
        decision,
        transaction: {
          amount: transaction.amount,
          currency: transaction.currency,
          sellerId: transaction.sellerId
        }
      });

      // Check if alert should be created
      if (decision.action === 'BLOCKED' || decision.action === 'REVIEW') {
        this.createAlert(transaction, decision, scoreResult);
      }

      // Stage 6: Completed
      const latencyMs = Date.now() - startTime;
      await this.emitStage(PIPELINE_STAGES.COMPLETED, {
        pipelineId,
        transaction,
        decision,
        latencyMs,
        stage: PIPELINE_STAGES.COMPLETED
      });

      // Update stats
      this.stats.transactionsProcessed++;
      this.stats.totalLatency += latencyMs;
      this.stats.decisions[decision.action] = (this.stats.decisions[decision.action] || 0) + 1;

      return {
        pipelineId,
        transaction,
        decision,
        latencyMs
      };

    } catch (error) {
      console.error('Pipeline error:', error.message);
      return {
        pipelineId,
        error: error.message
      };
    }
  }

  /**
   * Emit pipeline stage event
   */
  async emitStage(stage, data) {
    this.eventBus.publish(EVENT_TYPES.PIPELINE_STAGE, {
      stage,
      ...data
    });

    // Small delay to simulate processing
    await this.delay(this.config.pipelineDelayMs);
  }

  /**
   * Enrich transaction with additional data
   */
  async enrichTransaction(transaction) {
    // Simulate enrichment
    return {
      deviceTrust: Math.floor(Math.random() * 100),
      ipReputation: Math.random() > 0.8 ? 'suspicious' : 'clean',
      geoRisk: Math.random() > 0.9 ? 'high' : 'low',
      velocityScore: Math.floor(Math.random() * 100),
      accountAge: Math.floor(Math.random() * 365) + 30,
      enrichedAt: new Date().toISOString()
    };
  }

  /**
   * Score transaction with ML model
   */
  async scoreTransaction(transaction, enrichment) {
    // Simulate ML scoring
    let baseScore = Math.random() * 0.5;

    // Increase score based on risk factors
    if (transaction.amount > 5000) baseScore += 0.1;
    if (enrichment.ipReputation === 'suspicious') baseScore += 0.2;
    if (enrichment.geoRisk === 'high') baseScore += 0.15;
    if (enrichment.deviceTrust < 30) baseScore += 0.1;

    const score = Math.min(1, Math.max(0, baseScore));

    return {
      score: parseFloat(score.toFixed(4)),
      confidence: 0.85 + Math.random() * 0.15,
      modelId: 'fraud-detector-v3',
      modelVersion: '3.0.0',
      scoredAt: new Date().toISOString()
    };
  }

  /**
   * Evaluate rules against transaction
   */
  async evaluateRules(transaction, scoring) {
    const triggeredRules = [];

    // Simulate rule evaluation
    if (transaction.amount > 10000) {
      triggeredRules.push({
        ruleId: 'RULE-HIGH-VALUE',
        name: 'High Value Transaction',
        action: 'REVIEW',
        priority: 1
      });
      this.eventBus.publish(EVENT_TYPES.RULE_TRIGGERED, {
        ruleId: 'RULE-HIGH-VALUE',
        transactionId: transaction.transactionId,
        reason: 'Amount exceeds threshold'
      });
    }

    if (scoring.score > 0.7) {
      triggeredRules.push({
        ruleId: 'RULE-HIGH-SCORE',
        name: 'High ML Score',
        action: 'BLOCK',
        priority: 2
      });
      this.eventBus.publish(EVENT_TYPES.RULE_TRIGGERED, {
        ruleId: 'RULE-HIGH-SCORE',
        transactionId: transaction.transactionId,
        reason: 'ML score exceeds threshold'
      });
    }

    return {
      evaluated: 5,
      triggered: triggeredRules.length,
      rules: triggeredRules,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Make final decision
   */
  makeDecision(scoring, rulesResult) {
    // Priority: BLOCK > REVIEW > APPROVE
    const blockRule = rulesResult.rules.find(r => r.action === 'BLOCK');
    const reviewRule = rulesResult.rules.find(r => r.action === 'REVIEW');

    if (blockRule || scoring.score > 0.7) {
      return {
        action: 'BLOCKED',
        reason: blockRule?.name || 'High risk score',
        confidence: scoring.confidence
      };
    }

    if (reviewRule || scoring.score > 0.4) {
      return {
        action: 'REVIEW',
        reason: reviewRule?.name || 'Moderate risk',
        confidence: scoring.confidence
      };
    }

    return {
      action: 'APPROVED',
      reason: 'Within acceptable risk parameters',
      confidence: scoring.confidence
    };
  }

  /**
   * Create alert for suspicious transaction
   */
  createAlert(transaction, decision, scoring) {
    const alertId = `ALT-${uuidv4().slice(0, 8).toUpperCase()}`;

    const alert = {
      alertId,
      transactionId: transaction.transactionId,
      type: decision.action === 'BLOCKED' ? 'HIGH_RISK' : 'SUSPICIOUS',
      severity: decision.action === 'BLOCKED' ? 'CRITICAL' : 'MEDIUM',
      score: scoring.score,
      reason: decision.reason,
      status: 'OPEN',
      createdAt: new Date().toISOString()
    };

    this.eventBus.publish(EVENT_TYPES.ALERT_CREATED, alert);

    return alert;
  }

  /**
   * Broadcast system metrics
   */
  broadcastMetrics() {
    const metrics = generateMetricsSnapshot();

    // Add pipeline stats
    metrics.pipeline = {
      transactionsProcessed: this.stats.transactionsProcessed,
      avgLatency: this.stats.transactionsProcessed > 0
        ? Math.round(this.stats.totalLatency / this.stats.transactionsProcessed)
        : 0,
      decisions: this.stats.decisions
    };

    this.eventBus.publish(EVENT_TYPES.SYSTEM_METRICS, metrics);
  }

  /**
   * Broadcast system health
   */
  broadcastHealth() {
    this.eventBus.publish(EVENT_TYPES.SYSTEM_HEALTH, {
      status: 'healthy',
      uptime: process.uptime(),
      pipeline: this.isRunning ? 'running' : 'stopped',
      stats: this.stats,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Helper delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get pipeline configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Update pipeline configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };

    // Restart intervals if running
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Get pipeline statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgLatency: this.stats.transactionsProcessed > 0
        ? Math.round(this.stats.totalLatency / this.stats.transactionsProcessed)
        : 0,
      isRunning: this.isRunning
    };
  }
}

// Singleton instance
let pipelineInstance = null;

export function getTransactionPipeline() {
  if (!pipelineInstance) {
    pipelineInstance = new TransactionPipeline();
  }
  return pipelineInstance;
}

export { PIPELINE_STAGES };
export default { TransactionPipeline, getTransactionPipeline, PIPELINE_STAGES };
