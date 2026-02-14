/**
 * Decision Logger - Structured agent decision audit trail
 */

import { db_ops } from '../../shared/common/database.js';

class DecisionLogger {
  constructor() {
    this.recentDecisions = [];
    this.maxRecent = 200;
    this.stats = { totalDecisions: 0 };
  }

  logDecision(agentId, decision, context = {}, reasoning = '') {
    const decisionId = `DEC-${agentId.slice(0, 8)}-${Date.now().toString(36)}`;
    const entry = {
      decisionId,
      agentId,
      decision,
      context: typeof context === 'string' ? context : JSON.stringify(context).slice(0, 500),
      reasoning,
      timestamp: new Date().toISOString()
    };

    this.recentDecisions.push(entry);
    if (this.recentDecisions.length > this.maxRecent) {
      this.recentDecisions = this.recentDecisions.slice(-this.maxRecent);
    }

    db_ops.insert('agent_decisions', 'decision_id', decisionId, entry);
    this.stats.totalDecisions++;

    return entry;
  }

  getDecisions(filters = {}) {
    let decisions = [...this.recentDecisions];
    if (filters.agentId) {
      decisions = decisions.filter(d => d.agentId === filters.agentId);
    }
    const limit = filters.limit || 50;
    return decisions.slice(-limit).reverse();
  }

  getDecisionsByAgent(agentId, limit = 20) {
    return this.recentDecisions
      .filter(d => d.agentId === agentId)
      .slice(-limit)
      .reverse();
  }

  getStats() {
    return { ...this.stats, recentCount: this.recentDecisions.length };
  }
}

let instance = null;

export function getDecisionLogger() {
  if (!instance) {
    instance = new DecisionLogger();
  }
  return instance;
}

export default { DecisionLogger, getDecisionLogger };
