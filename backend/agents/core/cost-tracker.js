/**
 * Cost Tracker — LLM cost attribution, budgets, and alerts.
 *
 * Converts token usage into USD cost per model, tracks spend per agent,
 * enforces budget limits, and persists cost data to SQLite.
 *
 * Pricing is based on Anthropic's published rates (per million tokens).
 * Update PRICING_TABLE when models or rates change.
 */

import { db_ops } from '../../shared/common/database.js';

// Import event bus (optional)
let eventBus = null;
try {
  const module = await import('../../gateway/websocket/event-bus.js');
  eventBus = module.getEventBus();
} catch (e) {
  // Event bus not available
}

// Pricing per million tokens (USD). Update when rates change.
const PRICING_TABLE = {
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00 },
  // Fallback for unknown models
  '_default':                   { input: 3.00, output: 15.00 }
};

class CostTracker {
  constructor() {
    // Per-agent cost tracking: agentId -> { inputTokens, outputTokens, totalCostUsd, calls, history[] }
    this.agentCosts = new Map();
    // Global totals
    this.totals = { inputTokens: 0, outputTokens: 0, totalCostUsd: 0, calls: 0 };
    // Budget configuration: agentId -> { maxCostUsd, alertThreshold (0-1) }
    this.budgets = new Map();
    // Alerts emitted (avoid duplicates within same budget period)
    this.alertsEmitted = new Set();
    // Circular buffer of all cost events
    this.recentCosts = [];
    this.maxRecent = 500;
    // Flush to DB every 60 seconds
    this.flushInterval = setInterval(() => this.flush(), 60000);
  }

  /**
   * Record cost for an LLM call. Called by LLMClient after each completion.
   * @param {string} agentId - The agent that triggered the call (or 'SYSTEM' for non-agent calls)
   * @param {string} model - Model used (e.g. 'claude-sonnet-4-20250514')
   * @param {number} inputTokens - Input token count
   * @param {number} outputTokens - Output token count
   * @param {number} latencyMs - Call duration
   * @returns {{ costUsd: number, agentTotalUsd: number, budgetRemaining: number|null }}
   */
  recordCost(agentId, model, inputTokens, outputTokens, latencyMs = 0) {
    const pricing = PRICING_TABLE[model] || PRICING_TABLE['_default'];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const costUsd = Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal precision

    // Update agent-level tracking
    const agent = this._getOrCreateAgent(agentId);
    agent.inputTokens += inputTokens;
    agent.outputTokens += outputTokens;
    agent.totalCostUsd += costUsd;
    agent.calls++;
    agent.lastCallAt = new Date().toISOString();

    // Update global totals
    this.totals.inputTokens += inputTokens;
    this.totals.outputTokens += outputTokens;
    this.totals.totalCostUsd += costUsd;
    this.totals.calls++;

    // Store in circular buffer
    const costEvent = {
      agentId,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      timestamp: new Date().toISOString()
    };
    this.recentCosts.push(costEvent);
    if (this.recentCosts.length > this.maxRecent) {
      this.recentCosts = this.recentCosts.slice(-this.maxRecent);
    }

    // Check budget alerts
    const budgetRemaining = this._checkBudget(agentId, agent);

    return {
      costUsd,
      agentTotalUsd: Math.round(agent.totalCostUsd * 1_000_000) / 1_000_000,
      budgetRemaining
    };
  }

  /**
   * Set a cost budget for a specific agent.
   * @param {string} agentId
   * @param {number} maxCostUsd - Maximum spend in USD
   * @param {number} alertThreshold - Fraction (0-1) at which to emit a warning (default 0.8)
   */
  setBudget(agentId, maxCostUsd, alertThreshold = 0.8) {
    this.budgets.set(agentId, { maxCostUsd, alertThreshold });
  }

  /**
   * Get cost breakdown for a specific agent.
   */
  getAgentCost(agentId) {
    const agent = this.agentCosts.get(agentId);
    if (!agent) return null;

    const budget = this.budgets.get(agentId);
    return {
      agentId,
      inputTokens: agent.inputTokens,
      outputTokens: agent.outputTokens,
      totalTokens: agent.inputTokens + agent.outputTokens,
      totalCostUsd: Math.round(agent.totalCostUsd * 1_000_000) / 1_000_000,
      calls: agent.calls,
      avgCostPerCall: agent.calls > 0
        ? Math.round((agent.totalCostUsd / agent.calls) * 1_000_000) / 1_000_000
        : 0,
      lastCallAt: agent.lastCallAt,
      budget: budget ? {
        maxCostUsd: budget.maxCostUsd,
        remaining: Math.round((budget.maxCostUsd - agent.totalCostUsd) * 1_000_000) / 1_000_000,
        usedPct: Math.round((agent.totalCostUsd / budget.maxCostUsd) * 10000) / 100
      } : null
    };
  }

  /**
   * Get cost summary for all agents.
   */
  getAllAgentCosts() {
    return Array.from(this.agentCosts.keys()).map(id => this.getAgentCost(id));
  }

  /**
   * Get system-wide cost summary.
   */
  getSystemCost() {
    const agentCosts = this.getAllAgentCosts();
    return {
      totalCostUsd: Math.round(this.totals.totalCostUsd * 1_000_000) / 1_000_000,
      totalCalls: this.totals.calls,
      totalInputTokens: this.totals.inputTokens,
      totalOutputTokens: this.totals.outputTokens,
      totalTokens: this.totals.inputTokens + this.totals.outputTokens,
      avgCostPerCall: this.totals.calls > 0
        ? Math.round((this.totals.totalCostUsd / this.totals.calls) * 1_000_000) / 1_000_000
        : 0,
      agents: agentCosts,
      topSpenders: [...agentCosts].sort((a, b) => b.totalCostUsd - a.totalCostUsd).slice(0, 5)
    };
  }

  /**
   * Get recent cost events.
   */
  getRecentCosts(limit = 50) {
    return this.recentCosts.slice(-limit);
  }

  /**
   * Flush cost data to SQLite.
   */
  flush() {
    const allAgentCosts = this.getAllAgentCosts();
    for (const agentCost of allAgentCosts) {
      const costId = `COST-${agentCost.agentId}-${Date.now().toString(36)}`;
      db_ops.insert('agent_costs', 'cost_id', costId, {
        ...agentCost,
        flushedAt: new Date().toISOString()
      });
    }
  }

  /**
   * Get supported pricing models.
   */
  getPricingTable() {
    return { ...PRICING_TABLE };
  }

  // ── Internal ──

  _getOrCreateAgent(agentId) {
    if (!this.agentCosts.has(agentId)) {
      this.agentCosts.set(agentId, {
        inputTokens: 0,
        outputTokens: 0,
        totalCostUsd: 0,
        calls: 0,
        lastCallAt: null
      });
    }
    return this.agentCosts.get(agentId);
  }

  _checkBudget(agentId, agent) {
    const budget = this.budgets.get(agentId);
    if (!budget) return null;

    const remaining = budget.maxCostUsd - agent.totalCostUsd;
    const usedPct = agent.totalCostUsd / budget.maxCostUsd;

    // Alert at threshold
    const alertKey = `${agentId}-threshold`;
    if (usedPct >= budget.alertThreshold && !this.alertsEmitted.has(alertKey)) {
      this.alertsEmitted.add(alertKey);
      const alert = {
        type: 'COST_BUDGET_WARNING',
        agentId,
        usedPct: Math.round(usedPct * 10000) / 100,
        totalCostUsd: Math.round(agent.totalCostUsd * 1_000_000) / 1_000_000,
        maxCostUsd: budget.maxCostUsd,
        timestamp: new Date().toISOString()
      };
      console.warn(`[CostTracker] BUDGET WARNING: ${agentId} at ${alert.usedPct}% of $${budget.maxCostUsd} budget`);
      if (eventBus) eventBus.publish('agent:cost:budget_warning', alert);
    }

    // Alert at exceeded
    const exceededKey = `${agentId}-exceeded`;
    if (usedPct >= 1.0 && !this.alertsEmitted.has(exceededKey)) {
      this.alertsEmitted.add(exceededKey);
      const alert = {
        type: 'COST_BUDGET_EXCEEDED',
        agentId,
        totalCostUsd: Math.round(agent.totalCostUsd * 1_000_000) / 1_000_000,
        maxCostUsd: budget.maxCostUsd,
        timestamp: new Date().toISOString()
      };
      console.warn(`[CostTracker] BUDGET EXCEEDED: ${agentId} spent $${alert.totalCostUsd} / $${budget.maxCostUsd}`);
      if (eventBus) eventBus.publish('agent:cost:budget_exceeded', alert);
    }

    return Math.round(remaining * 1_000_000) / 1_000_000;
  }
}

// Singleton
let instance = null;

export function getCostTracker() {
  if (!instance) {
    instance = new CostTracker();
  }
  return instance;
}

export default { CostTracker, getCostTracker };
