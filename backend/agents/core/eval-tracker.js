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

    // Populate retrieved_contexts from tool evidence
    const toolContexts = (evidence || [])
      .filter(a => a.result?.data)
      .map(a => {
        const toolName = a.action?.type || 'unknown';
        return `[${toolName}] ${JSON.stringify(a.result.data).slice(0, 300)}`;
      })
      .slice(0, 10);

    // For non-retrieval agents: synthesize contexts from chain-of-thought + risk factors
    // so RAGAS can still evaluate faithfulness and answer relevancy
    if (toolContexts.length === 0) {
      if (chainOfThought?.steps) {
        for (const step of chainOfThought.steps.slice(0, 5)) {
          if (step.summary || step.result) {
            toolContexts.push(`[${step.phase || 'reasoning'}] ${step.summary || JSON.stringify(step.result).slice(0, 300)}`);
          }
        }
      }
      if (result?.riskFactors) {
        toolContexts.push(`[risk_factors] ${JSON.stringify(result.riskFactors).slice(0, 500)}`);
      }
      if (result?.evidence) {
        for (const e of (Array.isArray(result.evidence) ? result.evidence : []).slice(0, 5)) {
          toolContexts.push(`[${e.source || 'evidence'}] ${JSON.stringify(e.data || e).slice(0, 300)}`);
        }
      }
    }

    const retrievedContexts = toolContexts;

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
  async _persistEvaluation(evaluation) {
    await db_ops.insert('agent_evaluations', 'evaluation_id', evaluation.evaluationId, evaluation);

    this.recentEvals.push(evaluation);
    if (this.recentEvals.length > this.maxRecent) {
      this.recentEvals.shift();
    }
    this.stats.totalEvals++;
  }

  /**
   * Update hourly time-series aggregation.
   */
  async _updateHistory(agentId, evaluation) {
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();
    const historyId = `EVALH-${agentId.slice(0, 12)}-${windowStart.replace(/[^0-9]/g, '').slice(0, 10)}`;

    const existing = await db_ops.getById('agent_eval_history', 'history_id', historyId);
    const existingData = existing?.data ? (typeof existing.data === 'string' ? JSON.parse(existing.data) : existing.data) : null;

    if (existingData) {
      const count = existingData.evalCount + 1;
      const newAvg = ((existingData.avgScore || 0) * existingData.evalCount + (evaluation.aggregateScore || 0)) / count;

      existingData.evalCount = count;
      existingData.avgScore = Math.round(newAvg * 100) / 100;
      existingData.minScore = Math.min(existingData.minScore, evaluation.aggregateScore || 1);
      existingData.maxScore = Math.max(existingData.maxScore, evaluation.aggregateScore || 0);

      await db_ops.insert('agent_eval_history', 'history_id', historyId, existingData);
    } else {
      const windowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1).toISOString();
      await db_ops.insert('agent_eval_history', 'history_id', historyId, {
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

  // ── A/B Testing ──

  /**
   * Register an experiment comparing two agent strategies.
   */
  registerExperiment(experimentId, config) {
    if (!this.experiments) this.experiments = new Map();
    this.experiments.set(experimentId, {
      experimentId,
      name: config.name,
      controlStrategy: config.controlStrategy,
      treatmentStrategy: config.treatmentStrategy,
      splitRatio: config.splitRatio || 0.5,
      metrics: [],
      startedAt: new Date().toISOString(),
      status: 'active',
    });
    return experimentId;
  }

  /**
   * Assign a decision to an experiment group.
   */
  assignGroup(experimentId, decisionId) {
    const experiment = this.experiments?.get(experimentId);
    if (!experiment || experiment.status !== 'active') return 'control';
    const hash = decisionId.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    return Math.abs(hash) % 100 < experiment.splitRatio * 100 ? 'treatment' : 'control';
  }

  /**
   * Record an experiment metric.
   */
  recordExperimentMetric(experimentId, group, metric) {
    const experiment = this.experiments?.get(experimentId);
    if (!experiment) return;
    experiment.metrics.push({ group, ...metric, recordedAt: new Date().toISOString() });
    if (experiment.metrics.length > 1000) {
      experiment.metrics = experiment.metrics.slice(-500);
    }
  }

  /**
   * Get experiment results with statistical comparison.
   */
  getExperimentResults(experimentId) {
    const experiment = this.experiments?.get(experimentId);
    if (!experiment) return null;

    const control = experiment.metrics.filter(m => m.group === 'control');
    const treatment = experiment.metrics.filter(m => m.group === 'treatment');
    const avgScore = (arr) => {
      const scores = arr.map(m => m.score).filter(s => typeof s === 'number');
      return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    };

    return {
      experimentId: experiment.experimentId,
      name: experiment.name,
      status: experiment.status,
      startedAt: experiment.startedAt,
      control: { count: control.length, avgScore: avgScore(control) ? Math.round(avgScore(control) * 100) / 100 : null },
      treatment: { count: treatment.length, avgScore: avgScore(treatment) ? Math.round(avgScore(treatment) * 100) / 100 : null },
      winner: (() => {
        const cAvg = avgScore(control);
        const tAvg = avgScore(treatment);
        if (cAvg == null || tAvg == null) return 'insufficient_data';
        if (control.length < 10 || treatment.length < 10) return 'insufficient_data';
        if (tAvg > cAvg * 1.05) return 'treatment';
        if (cAvg > tAvg * 1.05) return 'control';
        return 'no_significant_difference';
      })(),
    };
  }

  /**
   * End an experiment.
   */
  endExperiment(experimentId) {
    const experiment = this.experiments?.get(experimentId);
    if (experiment) {
      experiment.status = 'completed';
      experiment.completedAt = new Date().toISOString();
    }
  }
}

/**
 * Online Evaluator - Continuous live monitoring of agent decisions.
 */
class OnlineEvaluator {
  constructor() {
    this.windows = new Map();
    this.alerts = [];
    this.maxAlerts = 100;
    this.stats = { decisionsTracked: 0, alertsRaised: 0 };
  }

  recordDecision(agentId, decision) {
    const entry = {
      timestamp: Date.now(),
      decision: decision.action || decision.recommendation?.action || 'UNKNOWN',
      confidence: decision.confidence || 0,
      riskScore: decision.riskScore || 0,
      toolsUsed: decision._toolsUsed || [],
      toolFailures: decision._toolFailures || 0,
    };

    if (!this.windows.has(agentId)) {
      this.windows.set(agentId, { entries: [] });
    }
    const agentWindow = this.windows.get(agentId);
    agentWindow.entries.push(entry);

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    agentWindow.entries = agentWindow.entries.filter(e => e.timestamp > oneHourAgo);
    this.stats.decisionsTracked++;
    this._checkAnomalies(agentId, agentWindow);
  }

  _checkAnomalies(agentId, agentWindow) {
    const now = Date.now();
    const fiveMinEntries = agentWindow.entries.filter(e => e.timestamp > now - 5 * 60 * 1000);
    const hourEntries = agentWindow.entries;
    if (fiveMinEntries.length < 5 || hourEntries.length < 10) return;

    const fiveMinDist = this._getDistribution(fiveMinEntries);
    const hourDist = this._getDistribution(hourEntries);

    for (const action of ['REJECT', 'BLOCK']) {
      const recentRate = fiveMinDist[action] || 0;
      const baselineRate = hourDist[action] || 0;
      if (recentRate > 0.5 && baselineRate < 0.3) {
        this._raiseAlert(agentId, 'decision_shift', {
          action,
          recentRate: Math.round(recentRate * 100),
          baselineRate: Math.round(baselineRate * 100),
          message: `${action} rate spiked to ${Math.round(recentRate * 100)}% (baseline: ${Math.round(baselineRate * 100)}%)`,
        });
      }
    }

    const recentAvgConf = fiveMinEntries.reduce((s, e) => s + e.confidence, 0) / fiveMinEntries.length;
    const baselineAvgConf = hourEntries.reduce((s, e) => s + e.confidence, 0) / hourEntries.length;
    if (baselineAvgConf > 0.5 && recentAvgConf < baselineAvgConf * 0.7) {
      this._raiseAlert(agentId, 'confidence_drop', {
        recentAvg: Math.round(recentAvgConf * 100) / 100,
        baselineAvg: Math.round(baselineAvgConf * 100) / 100,
        message: `Confidence dropped to ${recentAvgConf.toFixed(2)} (baseline: ${baselineAvgConf.toFixed(2)})`,
      });
    }

    const recentFailures = fiveMinEntries.filter(e => e.toolFailures > 0).length;
    const recentFailureRate = recentFailures / fiveMinEntries.length;
    if (recentFailureRate > 0.3) {
      this._raiseAlert(agentId, 'tool_failure_spike', {
        failureRate: Math.round(recentFailureRate * 100),
        message: `Tool failure rate at ${Math.round(recentFailureRate * 100)}% in last 5 minutes`,
      });
    }
  }

  _getDistribution(entries) {
    const counts = {};
    for (const e of entries) counts[e.decision] = (counts[e.decision] || 0) + 1;
    const total = entries.length;
    const dist = {};
    for (const [k, v] of Object.entries(counts)) dist[k] = v / total;
    return dist;
  }

  _raiseAlert(agentId, type, details) {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    if (this.alerts.find(a => a.agentId === agentId && a.type === type && a.timestamp > fiveMinAgo)) return;

    const alert = {
      alertId: `OALERT-${agentId.slice(0, 8)}-${Date.now().toString(36)}`,
      agentId, type, details,
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
    };
    this.alerts.push(alert);
    if (this.alerts.length > this.maxAlerts) this.alerts = this.alerts.slice(-this.maxAlerts);
    this.stats.alertsRaised++;

    if (eventBus) eventBus.publish('agent:online:alert', alert);
    console.warn(`[OnlineEval] Alert for ${agentId}: ${details.message}`);
  }

  getSnapshot(agentId) {
    const agentWindow = this.windows.get(agentId);
    if (!agentWindow || agentWindow.entries.length === 0) return { agentId, hasData: false };

    const now = Date.now();
    const minuteEntries = agentWindow.entries.filter(e => e.timestamp > now - 60 * 1000);
    const fiveMinEntries = agentWindow.entries.filter(e => e.timestamp > now - 5 * 60 * 1000);
    const hourEntries = agentWindow.entries;

    return {
      agentId, hasData: true,
      windows: {
        minute: { count: minuteEntries.length, distribution: this._getDistribution(minuteEntries) },
        fiveMin: { count: fiveMinEntries.length, distribution: this._getDistribution(fiveMinEntries) },
        hour: { count: hourEntries.length, distribution: this._getDistribution(hourEntries) },
      },
      avgConfidence: Math.round((hourEntries.reduce((s, e) => s + e.confidence, 0) / hourEntries.length) * 100) / 100,
      avgRiskScore: Math.round((hourEntries.reduce((s, e) => s + e.riskScore, 0) / hourEntries.length) * 100) / 100,
      recentAlerts: this.alerts.filter(a => a.agentId === agentId).slice(-5),
    };
  }

  getRecentAlerts(limit = 20) {
    return this.alerts.slice(-limit);
  }

  getStats() {
    return { ...this.stats, activeAgents: this.windows.size, totalAlerts: this.alerts.length };
  }
}

// Singleton
let instance = null;
export function getEvalTracker() {
  if (!instance) {
    instance = new EvalTracker();
    instance.onlineEvaluator = new OnlineEvaluator();
  }
  return instance;
}

export function getOnlineEvaluator() {
  return getEvalTracker().onlineEvaluator;
}
