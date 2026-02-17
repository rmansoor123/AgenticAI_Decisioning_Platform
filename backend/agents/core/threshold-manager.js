/**
 * Threshold Manager — Adaptive risk thresholds based on agent accuracy.
 *
 * Tracks rolling window (last 100 decisions) of false positive rate and
 * false negative rate per agent. Adjusts risk thresholds dynamically.
 * Persists to SQLite.
 */

import { db_ops } from '../../shared/common/database.js';

const WINDOW_SIZE = 100;
const MAX_ADJUSTMENT = 15; // Max +/- from baseline

const BASELINE_THRESHOLDS = {
  AUTO_APPROVE_MAX_RISK: 30,
  AUTO_REJECT_MIN_RISK: 80,
  ESCALATE_MIN_RISK: 60
};

class ThresholdManager {
  constructor() {
    this.agentWindows = new Map(); // agentId → circular buffer of outcomes
    this.thresholds = new Map();   // agentId → current thresholds
    this.adjustmentLog = [];

    // Load persisted thresholds
    this._loadFromDB();

    console.log('[ThresholdManager] Initialized');
  }

  /**
   * Record a decision outcome for threshold adjustment.
   * @param {string} agentId
   * @param {string} action - The agent's decision (APPROVE, REJECT, REVIEW)
   * @param {string} outcome - The actual outcome (confirmed_fraud, legitimate, etc.)
   * @param {number} riskScore - The risk score at decision time
   */
  recordOutcome(agentId, action, outcome, riskScore) {
    if (!this.agentWindows.has(agentId)) {
      this.agentWindows.set(agentId, []);
    }

    const window = this.agentWindows.get(agentId);
    window.push({ action, outcome, riskScore, timestamp: Date.now() });

    // Keep window at WINDOW_SIZE
    while (window.length > WINDOW_SIZE) {
      window.shift();
    }

    // Recalculate thresholds
    this._adjustThresholds(agentId);
  }

  /**
   * Get current thresholds for an agent.
   * @param {string} agentId
   * @returns {Object} { AUTO_APPROVE_MAX_RISK, AUTO_REJECT_MIN_RISK, ESCALATE_MIN_RISK }
   */
  getThresholds(agentId) {
    if (this.thresholds.has(agentId)) {
      return { ...this.thresholds.get(agentId) };
    }
    return { ...BASELINE_THRESHOLDS };
  }

  /**
   * Adjust thresholds based on rolling accuracy.
   */
  _adjustThresholds(agentId) {
    const window = this.agentWindows.get(agentId);
    if (!window || window.length < 10) return; // Need at least 10 decisions

    // Calculate false positive rate (rejected legitimate)
    const rejects = window.filter(w => w.action === 'REJECT' || w.action === 'BLOCK');
    const falsePositives = rejects.filter(w => w.outcome === 'false_positive' || w.outcome === 'legitimate');
    const fpRate = rejects.length > 0 ? falsePositives.length / rejects.length : 0;

    // Calculate false negative rate (approved fraud)
    const approvals = window.filter(w => w.action === 'APPROVE');
    const falseNegatives = approvals.filter(w => w.outcome === 'false_negative' || w.outcome === 'confirmed_fraud');
    const fnRate = approvals.length > 0 ? falseNegatives.length / approvals.length : 0;

    const current = this.getThresholds(agentId);
    let adjusted = false;

    // If false negative rate > 15% → lower auto-approve threshold (more cautious)
    if (fnRate > 0.15) {
      const reduction = Math.min(Math.round(fnRate * 20), MAX_ADJUSTMENT);
      current.AUTO_APPROVE_MAX_RISK = Math.max(
        BASELINE_THRESHOLDS.AUTO_APPROVE_MAX_RISK - MAX_ADJUSTMENT,
        BASELINE_THRESHOLDS.AUTO_APPROVE_MAX_RISK - reduction
      );
      adjusted = true;
    }

    // If false positive rate > 25% → raise auto-reject threshold (less aggressive)
    if (fpRate > 0.25) {
      const increase = Math.min(Math.round(fpRate * 20), MAX_ADJUSTMENT);
      current.AUTO_REJECT_MIN_RISK = Math.min(
        BASELINE_THRESHOLDS.AUTO_REJECT_MIN_RISK + MAX_ADJUSTMENT,
        BASELINE_THRESHOLDS.AUTO_REJECT_MIN_RISK + increase
      );
      adjusted = true;
    }

    // Adjust escalation threshold to stay between approve and reject
    current.ESCALATE_MIN_RISK = Math.round(
      (current.AUTO_APPROVE_MAX_RISK + current.AUTO_REJECT_MIN_RISK) / 2
    );

    if (adjusted) {
      this.thresholds.set(agentId, current);
      this._persistToDB(agentId, current);

      this.adjustmentLog.push({
        agentId,
        fpRate: fpRate.toFixed(3),
        fnRate: fnRate.toFixed(3),
        newThresholds: { ...current },
        windowSize: window.length,
        timestamp: new Date().toISOString()
      });

      // Keep log manageable
      if (this.adjustmentLog.length > 200) {
        this.adjustmentLog = this.adjustmentLog.slice(-100);
      }
    }
  }

  _persistToDB(agentId, thresholds) {
    try {
      db_ops.upsert('agent_thresholds', 'agent_id', agentId, {
        agentId,
        thresholds,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      // DB persistence failed — thresholds still in memory
    }
  }

  _loadFromDB() {
    try {
      const records = db_ops.getAll('agent_thresholds', 100, 0);
      for (const record of records) {
        const data = record.data;
        if (data?.agentId && data?.thresholds) {
          this.thresholds.set(data.agentId, data.thresholds);
        }
      }
    } catch (e) {
      // DB load failed — use defaults
    }
  }

  getStats() {
    const agentStats = {};
    for (const [agentId, window] of this.agentWindows) {
      agentStats[agentId] = {
        windowSize: window.length,
        thresholds: this.getThresholds(agentId)
      };
    }
    return {
      agents: agentStats,
      recentAdjustments: this.adjustmentLog.slice(-5),
      baselineThresholds: BASELINE_THRESHOLDS
    };
  }
}

// Singleton
let instance = null;

export function getThresholdManager() {
  if (!instance) {
    instance = new ThresholdManager();
  }
  return instance;
}

export { BASELINE_THRESHOLDS };
export default { getThresholdManager, BASELINE_THRESHOLDS };
