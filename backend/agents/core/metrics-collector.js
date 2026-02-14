/**
 * Metrics Collector - Tracks agent execution metrics
 */

import { db_ops } from '../../shared/common/database.js';

class MetricsCollector {
  constructor() {
    this.metrics = new Map(); // agentId -> { executions, successes, failures, durations, toolUsage }
    this.stats = { totalRecorded: 0, flushes: 0 };
    this.flushInterval = setInterval(() => this.flush(), 60000); // Flush every 60s
  }

  recordExecution(agentId, durationMs, success) {
    const m = this._getOrCreate(agentId);
    m.executions++;
    if (success) m.successes++;
    else m.failures++;
    m.durations.push(durationMs);
    if (m.durations.length > 100) m.durations = m.durations.slice(-100);
    m.lastExecution = new Date().toISOString();
    this.stats.totalRecorded++;
  }

  recordToolUse(agentId, toolName, durationMs, success = true) {
    const m = this._getOrCreate(agentId);
    if (!m.toolUsage[toolName]) {
      m.toolUsage[toolName] = { calls: 0, successes: 0, failures: 0, totalDuration: 0 };
    }
    const tool = m.toolUsage[toolName];
    tool.calls++;
    if (success) tool.successes++;
    else tool.failures++;
    tool.totalDuration += durationMs;
  }

  getMetrics(agentId) {
    const m = this.metrics.get(agentId);
    if (!m) return null;
    return {
      agentId,
      executions: m.executions,
      successes: m.successes,
      failures: m.failures,
      successRate: m.executions > 0 ? m.successes / m.executions : 0,
      avgDuration: m.durations.length > 0 ? Math.round(m.durations.reduce((a, b) => a + b, 0) / m.durations.length) : 0,
      p95Duration: this._percentile(m.durations, 0.95),
      toolUsage: m.toolUsage,
      lastExecution: m.lastExecution
    };
  }

  getAllMetrics() {
    return Array.from(this.metrics.keys()).map(id => this.getMetrics(id));
  }

  flush() {
    const allMetrics = this.getAllMetrics();
    for (const m of allMetrics) {
      const metricId = `MET-${m.agentId}-${Date.now().toString(36)}`;
      db_ops.insert('agent_metrics', 'metric_id', metricId, {
        ...m,
        flushedAt: new Date().toISOString()
      });
    }
    this.stats.flushes++;
  }

  getStats() {
    return { ...this.stats, agentsTracked: this.metrics.size };
  }

  _getOrCreate(agentId) {
    if (!this.metrics.has(agentId)) {
      this.metrics.set(agentId, {
        executions: 0, successes: 0, failures: 0,
        durations: [], toolUsage: {}, lastExecution: null
      });
    }
    return this.metrics.get(agentId);
  }

  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, idx)];
  }
}

let instance = null;

export function getMetricsCollector() {
  if (!instance) {
    instance = new MetricsCollector();
  }
  return instance;
}

export default { MetricsCollector, getMetricsCollector };
