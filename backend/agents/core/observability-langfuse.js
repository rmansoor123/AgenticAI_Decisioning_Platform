/**
 * Langfuse-backed observability implementations.
 * Replaces trace-collector.js, metrics-collector.js, decision-logger.js, cost-tracker.js
 * when OBSERVABILITY_BACKEND=langfuse.
 *
 * Every Langfuse call is wrapped in try/catch — failures never break the agent reasoning loop.
 */

import { getLangfuseClient } from '../../shared/common/langfuse-client.js';

// ============================================================
// LangfuseTraceCollector — mirrors trace-collector.js interface
// ============================================================

class LangfuseTraceCollector {
  constructor() {
    this.traces = new Map();
    this.stats = { tracesStarted: 0, tracesCompleted: 0, spansCreated: 0 };
  }

  startTrace(traceId, agentId, input) {
    try {
      const langfuse = getLangfuseClient();
      const lfTrace = langfuse?.trace({
        id: traceId,
        name: `agent-${agentId}`,
        input: typeof input === 'string' ? input : JSON.stringify(input),
        metadata: { agentId },
      });

      const trace = {
        traceId, agentId, input,
        spans: [], startTime: Date.now(), startedAt: new Date().toISOString(),
        endTime: null, duration: null, status: 'active',
        _lfTrace: lfTrace,
      };
      this.traces.set(traceId, trace);
      this.stats.tracesStarted++;
      return trace;
    } catch (err) {
      console.warn(`[observability-langfuse] startTrace error: ${err.message}`);
      return {
        traceId, agentId, input, spans: [],
        startTime: Date.now(), startedAt: new Date().toISOString(),
        endTime: null, duration: null, status: 'active',
      };
    }
  }

  startSpan(traceId, spanName, data = {}) {
    try {
      const trace = this.traces.get(traceId);
      if (!trace) return null;

      const lfSpan = trace._lfTrace?.span({
        name: spanName,
        input: data,
      });

      const span = {
        spanName, data, startTime: Date.now(), startedAt: new Date().toISOString(),
        endTime: null, duration: null, status: 'active',
        _lfSpan: lfSpan,
      };
      trace.spans.push(span);
      this.stats.spansCreated++;
      return span;
    } catch (err) {
      console.warn(`[observability-langfuse] startSpan error: ${err.message}`);
      return null;
    }
  }

  endSpan(traceId, spanName, result = {}) {
    try {
      const trace = this.traces.get(traceId);
      if (!trace) return null;

      const span = trace.spans.find(s => s.spanName === spanName && s.status === 'active');
      if (!span) return null;

      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
      span.status = result.error ? 'failed' : 'completed';
      span.result = result;

      span._lfSpan?.end({ output: result });

      return span;
    } catch (err) {
      console.warn(`[observability-langfuse] endSpan error: ${err.message}`);
      return null;
    }
  }

  async endTrace(traceId, result = {}) {
    try {
      const trace = this.traces.get(traceId);
      if (!trace) return null;

      trace.endTime = Date.now();
      trace.duration = trace.endTime - trace.startTime;
      trace.status = result.error ? 'failed' : 'completed';
      trace.result = result;

      trace._lfTrace?.update({
        output: result,
        metadata: { duration: trace.duration, status: trace.status },
      });

      this.stats.tracesCompleted++;

      // Keep last 200 traces in memory
      if (this.traces.size > 200) {
        const oldest = this.traces.keys().next().value;
        this.traces.delete(oldest);
      }

      return trace;
    } catch (err) {
      console.warn(`[observability-langfuse] endTrace error: ${err.message}`);
      return null;
    }
  }

  getTrace(traceId) {
    return this.traces.get(traceId) || null;
  }

  getRecentTraces(limit = 20, agentId = null) {
    let traces = [...this.traces.values()];
    if (agentId) traces = traces.filter(t => t.agentId === agentId);
    return traces.slice(-limit).reverse();
  }

  getStats() {
    return {
      ...this.stats,
      activeTraces: [...this.traces.values()].filter(t => t.status === 'active').length,
      completedTraces: this.stats.tracesCompleted,
      backend: 'langfuse',
    };
  }
}

// ============================================================
// LangfuseMetricsCollector — mirrors metrics-collector.js interface
// ============================================================

class LangfuseMetricsCollector {
  constructor() {
    this.metrics = new Map();
    this.stats = { totalRecorded: 0, flushes: 0 };
  }

  recordExecution(agentId, durationMs, success) {
    try {
      if (!this.metrics.has(agentId)) {
        this.metrics.set(agentId, {
          agentId, executions: 0, successes: 0, failures: 0,
          durations: [], toolUsage: {}, lastExecution: null,
        });
      }
      const m = this.metrics.get(agentId);
      m.executions++;
      if (success) m.successes++;
      else m.failures++;
      m.durations.push(durationMs);
      if (m.durations.length > 100) m.durations.shift();
      m.lastExecution = new Date().toISOString();

      // Report to Langfuse as a score
      const langfuse = getLangfuseClient();
      langfuse?.score({
        name: 'agent-execution',
        value: success ? 1 : 0,
        comment: `${agentId}: ${durationMs}ms`,
      });

      this.stats.totalRecorded++;
    } catch (err) {
      console.warn(`[observability-langfuse] recordExecution error: ${err.message}`);
    }
  }

  recordToolUse(agentId, toolName, durationMs, success = true) {
    try {
      if (!this.metrics.has(agentId)) {
        this.metrics.set(agentId, {
          agentId, executions: 0, successes: 0, failures: 0,
          durations: [], toolUsage: {}, lastExecution: null,
        });
      }
      const m = this.metrics.get(agentId);
      if (!m.toolUsage[toolName]) {
        m.toolUsage[toolName] = { calls: 0, successes: 0, failures: 0, totalDuration: 0 };
      }
      const t = m.toolUsage[toolName];
      t.calls++;
      if (success) t.successes++;
      else t.failures++;
      t.totalDuration += durationMs;
    } catch (err) {
      console.warn(`[observability-langfuse] recordToolUse error: ${err.message}`);
    }
  }

  getMetrics(agentId) {
    const m = this.metrics.get(agentId);
    if (!m) return null;
    const sorted = [...m.durations].sort((a, b) => a - b);
    const p95Idx = Math.floor(sorted.length * 0.95);
    return {
      agentId: m.agentId,
      executions: m.executions,
      successes: m.successes,
      failures: m.failures,
      successRate: m.executions > 0 ? ((m.successes / m.executions) * 100).toFixed(1) + '%' : '0%',
      avgDuration: sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
      p95Duration: sorted[p95Idx] || 0,
      toolUsage: m.toolUsage,
      lastExecution: m.lastExecution,
    };
  }

  getAllMetrics() {
    return [...this.metrics.keys()].map(id => this.getMetrics(id)).filter(Boolean);
  }

  flush() {
    try {
      const langfuse = getLangfuseClient();
      langfuse?.flush();
      this.stats.flushes++;
    } catch {
      // Fire-and-forget
    }
  }

  getStats() {
    return { ...this.stats, agentsTracked: this.metrics.size, backend: 'langfuse' };
  }
}

// ============================================================
// LangfuseDecisionLogger — mirrors decision-logger.js interface
// ============================================================

class LangfuseDecisionLogger {
  constructor() {
    this.decisions = [];
    this.maxRecent = 200;
    this.stats = { totalDecisions: 0 };
  }

  logDecision(agentId, decision, context = {}, reasoning = '') {
    try {
      const decisionId = `DEC-${agentId.slice(0, 8)}-${Date.now().toString(36)}`;
      const entry = { decisionId, agentId, decision, context, reasoning, timestamp: new Date().toISOString() };

      this.decisions.push(entry);
      if (this.decisions.length > this.maxRecent) this.decisions.shift();
      this.stats.totalDecisions++;

      // Log to Langfuse as an event
      const langfuse = getLangfuseClient();
      langfuse?.event({
        name: 'agent-decision',
        input: { agentId, decision, context },
        output: { reasoning },
        metadata: { decisionId },
      });

      return entry;
    } catch (err) {
      console.warn(`[observability-langfuse] logDecision error: ${err.message}`);
      const decisionId = `DEC-${agentId.slice(0, 8)}-${Date.now().toString(36)}`;
      return { decisionId, agentId, decision, context, reasoning, timestamp: new Date().toISOString() };
    }
  }

  getDecisions(filters = {}) {
    let results = [...this.decisions];
    if (filters.agentId) results = results.filter(d => d.agentId === filters.agentId);
    const limit = filters.limit || 50;
    return results.slice(-limit).reverse();
  }

  getDecisionsByAgent(agentId, limit = 20) {
    return this.decisions.filter(d => d.agentId === agentId).slice(-limit).reverse();
  }

  getStats() {
    return { ...this.stats, recentCount: this.decisions.length, backend: 'langfuse' };
  }
}

// ============================================================
// LangfuseCostTracker — mirrors cost-tracker.js interface
// ============================================================

class LangfuseCostTracker {
  constructor() {
    this.agentCosts = new Map();
    this.recentCosts = [];
    this.budgets = new Map();
    this.pricing = {
      'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
      'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
      'claude-opus-4-6': { input: 15.00, output: 75.00 },
      '_default': { input: 3.00, output: 15.00 },
    };
    this.stats = { totalCalls: 0, flushes: 0 };
  }

  recordCost(agentId, model, inputTokens, outputTokens, latencyMs = 0) {
    try {
      const rates = this.pricing[model] || this.pricing['_default'];
      const costUsd = ((inputTokens * rates.input) + (outputTokens * rates.output)) / 1_000_000;

      if (!this.agentCosts.has(agentId)) {
        this.agentCosts.set(agentId, {
          agentId, inputTokens: 0, outputTokens: 0, totalCostUsd: 0, calls: 0, lastCallAt: null,
        });
      }
      const ac = this.agentCosts.get(agentId);
      ac.inputTokens += inputTokens;
      ac.outputTokens += outputTokens;
      ac.totalCostUsd += costUsd;
      ac.calls++;
      ac.lastCallAt = new Date().toISOString();

      this.recentCosts.push({ agentId, model, inputTokens, outputTokens, costUsd, latencyMs, timestamp: ac.lastCallAt });
      if (this.recentCosts.length > 500) this.recentCosts.shift();
      this.stats.totalCalls++;

      // Report to Langfuse
      const langfuse = getLangfuseClient();
      langfuse?.generation({
        name: `llm-${agentId}`,
        model,
        usage: { input: inputTokens, output: outputTokens },
        metadata: { costUsd, latencyMs },
      });

      const budget = this.budgets.get(agentId);
      return {
        costUsd,
        agentTotalUsd: ac.totalCostUsd,
        budgetRemaining: budget ? budget.maxCostUsd - ac.totalCostUsd : null,
      };
    } catch (err) {
      console.warn(`[observability-langfuse] recordCost error: ${err.message}`);
      return { costUsd: 0, agentTotalUsd: 0, budgetRemaining: null };
    }
  }

  setBudget(agentId, maxCostUsd, alertThreshold = 0.8) {
    this.budgets.set(agentId, { maxCostUsd, alertThreshold });
  }

  getAgentCost(agentId) {
    const ac = this.agentCosts.get(agentId);
    if (!ac) return null;
    const budget = this.budgets.get(agentId);
    return {
      agentId: ac.agentId,
      inputTokens: ac.inputTokens,
      outputTokens: ac.outputTokens,
      totalTokens: ac.inputTokens + ac.outputTokens,
      totalCostUsd: ac.totalCostUsd,
      calls: ac.calls,
      avgCostPerCall: ac.calls > 0 ? ac.totalCostUsd / ac.calls : 0,
      lastCallAt: ac.lastCallAt,
      budget: budget ? {
        maxCostUsd: budget.maxCostUsd,
        remaining: budget.maxCostUsd - ac.totalCostUsd,
        usedPct: ((ac.totalCostUsd / budget.maxCostUsd) * 100).toFixed(1) + '%',
      } : null,
    };
  }

  getAllAgentCosts() {
    return [...this.agentCosts.keys()].map(id => this.getAgentCost(id)).filter(Boolean);
  }

  getSystemCost() {
    const agents = this.getAllAgentCosts();
    const totals = agents.reduce((acc, a) => ({
      totalCostUsd: acc.totalCostUsd + a.totalCostUsd,
      totalCalls: acc.totalCalls + a.calls,
      totalInputTokens: acc.totalInputTokens + a.inputTokens,
      totalOutputTokens: acc.totalOutputTokens + a.outputTokens,
    }), { totalCostUsd: 0, totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0 });

    return {
      ...totals,
      totalTokens: totals.totalInputTokens + totals.totalOutputTokens,
      avgCostPerCall: totals.totalCalls > 0 ? totals.totalCostUsd / totals.totalCalls : 0,
      agents,
      topSpenders: [...agents].sort((a, b) => b.totalCostUsd - a.totalCostUsd).slice(0, 5),
    };
  }

  getRecentCosts(limit = 50) {
    return this.recentCosts.slice(-limit).reverse();
  }

  flush() {
    try {
      const langfuse = getLangfuseClient();
      langfuse?.flush();
      this.stats.flushes++;
    } catch {
      // Fire-and-forget
    }
  }

  getPricingTable() {
    return { ...this.pricing };
  }
}

// ============================================================
// Singletons
// ============================================================

let traceInstance = null;
let metricsInstance = null;
let decisionInstance = null;
let costInstance = null;

export function getLangfuseTraceCollector() {
  if (!traceInstance) traceInstance = new LangfuseTraceCollector();
  return traceInstance;
}

export function getLangfuseMetricsCollector() {
  if (!metricsInstance) metricsInstance = new LangfuseMetricsCollector();
  return metricsInstance;
}

export function getLangfuseDecisionLogger() {
  if (!decisionInstance) decisionInstance = new LangfuseDecisionLogger();
  return decisionInstance;
}

export function getLangfuseCostTracker() {
  if (!costInstance) costInstance = new LangfuseCostTracker();
  return costInstance;
}

export {
  LangfuseTraceCollector,
  LangfuseMetricsCollector,
  LangfuseDecisionLogger,
  LangfuseCostTracker,
};
