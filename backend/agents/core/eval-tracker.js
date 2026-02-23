/**
 * EvalTracker — Persistent evaluation tracking for agent decisions.
 *
 * Fires async evaluations after each decision via the Python eval service,
 * persists scores to SQLite, tracks hourly aggregates, and detects regressions.
 */

import { db_ops } from '../../shared/common/database.js';

const EVAL_SERVICE_URL = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
const EVAL_TIMEOUT_MS = 10000;

// Import event bus (optional)
let eventBus = null;
try {
  const module = await import('../../gateway/websocket/event-bus.js');
  eventBus = module.getEventBus();
} catch (e) {
  // Event bus not available
}

class EvalTracker {
  constructor() {
    this.recentEvals = [];       // Circular buffer for fast queries
    this.maxRecent = 200;
    this.stats = { totalEvals: 0, evalErrors: 0 };
  }

  /**
   * Evaluate a decision asynchronously. Called fire-and-forget from BaseAgent.reason().
   */
  async evaluateDecision(agentId, decisionId, input, evidence, result, chainOfThought) {
    try {
      const payload = this._buildEvalPayload(agentId, decisionId, input, evidence, result, chainOfThought);

      // Call Python eval service
      const scores = await this._callEvalService(payload);

      // Build evaluation record
      const evaluationId = `EVAL-${agentId.slice(0, 12)}-${Date.now().toString(36)}`;
      const evaluation = {
        evaluationId,
        decisionId,
        agentId,
        scores,
        aggregateScore: this._computeAggregate(scores),
        evalSource: 'combined',
        decision: result?.recommendation?.action || result?.decision || null,
        riskScore: result?.riskScore || result?.overallRisk?.score || null,
        confidence: result?.confidence || null,
        createdAt: new Date().toISOString()
      };

      // Persist
      this._persistEvaluation(evaluation);
      this._updateHistory(agentId, evaluation);

      // Check for regression
      this.checkForRegression(agentId);

      return evaluation;
    } catch (err) {
      this.stats.evalErrors++;
      console.warn('[EvalTracker] Evaluation failed:', err.message);
      return null;
    }
  }

  /**
   * Build the payload for the Python eval service.
   */
  _buildEvalPayload(agentId, decisionId, input, evidence, result, chainOfThought) {
    const query = typeof input === 'string' ? input : JSON.stringify(input).slice(0, 500);

    const retrievedContexts = (evidence || [])
      .filter(a => a.result?.data)
      .map(a => {
        const toolName = a.action?.type || 'unknown';
        return `[${toolName}] ${JSON.stringify(a.result.data).slice(0, 300)}`;
      })
      .slice(0, 10);

    const agentResponse = [
      `Decision: ${result?.recommendation?.action || result?.decision || 'UNKNOWN'}`,
      `Risk Score: ${result?.riskScore || result?.overallRisk?.score || 'N/A'}`,
      `Confidence: ${result?.confidence || 'N/A'}`,
      `Summary: ${result?.summary || ''}`,
      `Reasoning: ${result?.recommendation?.reason || ''}`
    ].join('\n');

    return {
      query,
      retrieved_contexts: retrievedContexts,
      agent_response: agentResponse,
      use_case: 'agent_decision',
      agent_id: agentId
    };
  }

  /**
   * Call the Python eval service (TruLens + RAGAS).
   */
  async _callEvalService(payload) {
    try {
      const response = await fetch(`${EVAL_SERVICE_URL}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(EVAL_TIMEOUT_MS)
      });

      if (response.ok) {
        const data = await response.json();
        const scores = {};
        for (const s of (data.scores || [])) {
          scores[s.metric] = s.score;
        }
        return scores;
      }
    } catch (e) {
      // Eval service unavailable
    }

    return {};
  }

  /**
   * Compute weighted aggregate score from individual metrics.
   */
  _computeAggregate(scores) {
    const values = Object.values(scores).filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) return null;
    return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
  }

  /**
   * Persist evaluation to database.
   */
  _persistEvaluation(evaluation) {
    db_ops.insert('agent_evaluations', 'evaluation_id', evaluation.evaluationId, evaluation);

    this.recentEvals.push(evaluation);
    if (this.recentEvals.length > this.maxRecent) {
      this.recentEvals.shift();
    }
    this.stats.totalEvals++;
  }

  /**
   * Update hourly time-series aggregation.
   */
  _updateHistory(agentId, evaluation) {
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();
    const historyId = `EVALH-${agentId.slice(0, 12)}-${windowStart.replace(/[^0-9]/g, '').slice(0, 10)}`;

    const existing = db_ops.getById('agent_eval_history', 'history_id', historyId);
    const existingData = existing?.data ? (typeof existing.data === 'string' ? JSON.parse(existing.data) : existing.data) : null;

    if (existingData) {
      const count = existingData.evalCount + 1;
      const newAvg = ((existingData.avgScore || 0) * existingData.evalCount + (evaluation.aggregateScore || 0)) / count;

      existingData.evalCount = count;
      existingData.avgScore = Math.round(newAvg * 100) / 100;
      existingData.minScore = Math.min(existingData.minScore, evaluation.aggregateScore || 1);
      existingData.maxScore = Math.max(existingData.maxScore, evaluation.aggregateScore || 0);

      db_ops.insert('agent_eval_history', 'history_id', historyId, existingData);
    } else {
      const windowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1).toISOString();
      db_ops.insert('agent_eval_history', 'history_id', historyId, {
        historyId,
        agentId,
        windowStart,
        windowEnd,
        avgScore: evaluation.aggregateScore || 0,
        minScore: evaluation.aggregateScore || 0,
        maxScore: evaluation.aggregateScore || 0,
        evalCount: 1,
        scoreTrend: 'stable'
      });
    }
  }

  /**
   * Check for regression: current window avg vs trailing avg.
   */
  checkForRegression(agentId) {
    const recent = this.recentEvals
      .filter(e => e.agentId === agentId && e.aggregateScore != null);

    if (recent.length < 5) return null;

    const currentAvg = recent.slice(-5).reduce((s, e) => s + e.aggregateScore, 0) / 5;

    const trailing = recent.slice(0, -5);
    if (trailing.length < 5) return null;
    const trailingAvg = trailing.reduce((s, e) => s + e.aggregateScore, 0) / trailing.length;

    if (trailingAvg > 0) {
      const dropPct = ((trailingAvg - currentAvg) / trailingAvg) * 100;
      if (dropPct > 15) {
        const alert = {
          agentId,
          type: 'EVAL_REGRESSION',
          currentAvg: Math.round(currentAvg * 100) / 100,
          trailingAvg: Math.round(trailingAvg * 100) / 100,
          dropPct: Math.round(dropPct * 10) / 10,
          timestamp: new Date().toISOString()
        };

        if (eventBus) {
          eventBus.publish('agent:eval:regression', alert);
        }
        console.warn(`[EvalTracker] REGRESSION DETECTED for ${agentId}: ${alert.dropPct}% drop`);
        return alert;
      }
    }
    return null;
  }

  /**
   * Get recent evaluations for an agent.
   */
  getEvalHistory(agentId, limit = 50) {
    return this.recentEvals
      .filter(e => e.agentId === agentId)
      .slice(-limit);
  }

  /**
   * Get aggregate eval stats for an agent.
   */
  getAgentEvalStats(agentId) {
    const evals = this.recentEvals.filter(e => e.agentId === agentId && e.aggregateScore != null);
    if (evals.length === 0) {
      return { agentId, totalEvals: 0, avgScore: null, recentTrend: 'insufficient_data' };
    }

    const avgScore = evals.reduce((s, e) => s + e.aggregateScore, 0) / evals.length;

    let recentTrend = 'stable';
    if (evals.length >= 20) {
      const last10 = evals.slice(-10).reduce((s, e) => s + e.aggregateScore, 0) / 10;
      const prev10 = evals.slice(-20, -10).reduce((s, e) => s + e.aggregateScore, 0) / 10;
      if (last10 > prev10 * 1.05) recentTrend = 'improving';
      else if (last10 < prev10 * 0.95) recentTrend = 'degrading';
    }

    return {
      agentId,
      totalEvals: evals.length,
      avgScore: Math.round(avgScore * 100) / 100,
      recentTrend,
      regressionAlert: this.checkForRegression(agentId)
    };
  }

  /**
   * Get aggregate stats across all agents.
   */
  getSystemEvalStats() {
    const agentIds = [...new Set(this.recentEvals.map(e => e.agentId))];
    return {
      totalEvals: this.stats.totalEvals,
      evalErrors: this.stats.evalErrors,
      agents: agentIds.map(id => this.getAgentEvalStats(id))
    };
  }
}

// Singleton
let instance = null;
export function getEvalTracker() {
  if (!instance) instance = new EvalTracker();
  return instance;
}
