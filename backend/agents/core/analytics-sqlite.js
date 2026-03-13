/**
 * Analytics SQLite Backend — queries risk_events, agent_decisions, agent_metrics
 * via db_ops. Default backend when ANALYTICS_BACKEND=sqlite (or unset).
 *
 * Ingestion methods are no-ops: data already flows into SQLite through db_ops.insert
 * in the normal agent decision pipeline.
 */

import { db_ops } from '../../shared/common/database.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTimeWindow(timeWindow) {
  const match = (timeWindow || '24h').match(/^(\d+)(m|h|d)$/);
  if (!match) return 24 * 60 * 60 * 1000;
  const [, val, unit] = match;
  const multipliers = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  return parseInt(val) * (multipliers[unit] || 3_600_000);
}

function cutoffISO(timeWindowMs) {
  return new Date(Date.now() - timeWindowMs).toISOString();
}

function granularityMs(granularity) {
  const map = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '6h': 21_600_000, '1d': 86_400_000 };
  return map[granularity] || 3_600_000;
}

function bucketKey(ts, granMs) {
  const t = new Date(ts).getTime();
  return new Date(Math.floor(t / granMs) * granMs).toISOString();
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Backend ──────────────────────────────────────────────────────────────────

class AnalyticsSQLiteBackend {
  constructor() {
    this.type = 'sqlite';
  }

  /**
   * Risk trends — avg score + count by time bucket and domain.
   */
  async queryRiskTrends({ domain, timeWindow = '24h', sellerId, granularity = '1h' } = {}) {
    const cutoff = cutoffISO(parseTimeWindow(timeWindow));
    const granMs = granularityMs(granularity);

    let events = (await db_ops.getAll('risk_events', 100_000, 0)).map(r => r.data)
      .filter(e => e.createdAt >= cutoff);

    if (domain) events = events.filter(e => e.domain === domain);
    if (sellerId) events = events.filter(e => e.sellerId === sellerId);

    // Group by bucket + domain
    const groups = {};
    for (const e of events) {
      const bucket = bucketKey(e.createdAt, granMs);
      const key = `${bucket}|${e.domain}`;
      if (!groups[key]) groups[key] = { timestamp: bucket, domain: e.domain, totalScore: 0, count: 0 };
      groups[key].totalScore += e.riskScore || 0;
      groups[key].count++;
    }

    return Object.values(groups)
      .map(g => ({
        timestamp: g.timestamp,
        domain: g.domain,
        avgScore: Math.round((g.totalScore / g.count) * 100) / 100,
        eventCount: g.count
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Agent performance — execution count + latency percentiles + success rate.
   */
  async queryAgentPerformance({ agentId, timeWindow = '24h' } = {}) {
    const cutoff = cutoffISO(parseTimeWindow(timeWindow));

    let decisions = (await db_ops.getAll('agent_decisions', 100_000, 0)).map(r => r.data)
      .filter(d => d.createdAt >= cutoff);

    if (agentId) decisions = decisions.filter(d => d.agentId === agentId);

    // Group by agentId
    const agents = {};
    for (const d of decisions) {
      const aid = d.agentId || 'unknown';
      if (!agents[aid]) agents[aid] = { latencies: [], total: 0, successes: 0 };
      agents[aid].total++;
      if (d.latencyMs != null) agents[aid].latencies.push(d.latencyMs);
      if (d.success !== false) agents[aid].successes++;
    }

    const results = [];
    for (const [aid, data] of Object.entries(agents)) {
      const sorted = data.latencies.slice().sort((a, b) => a - b);
      results.push({
        agentId: aid,
        executions: data.total,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        p99Ms: percentile(sorted, 99),
        successRate: data.total > 0 ? Math.round((data.successes / data.total) * 10000) / 10000 : 0
      });
    }

    return agentId && results.length === 1 ? results[0] : results;
  }

  /**
   * Velocity — event count + unique sellers by time bucket.
   */
  async queryVelocity({ sellerId, deviceFingerprint, timeWindow = '1h' } = {}) {
    const cutoff = cutoffISO(parseTimeWindow(timeWindow));
    const granMs = granularityMs('5m');

    let events = (await db_ops.getAll('risk_events', 100_000, 0)).map(r => r.data)
      .filter(e => e.createdAt >= cutoff);

    if (sellerId) events = events.filter(e => e.sellerId === sellerId);
    if (deviceFingerprint) events = events.filter(e => e.metadata?.deviceFingerprint === deviceFingerprint);

    const groups = {};
    for (const e of events) {
      const bucket = bucketKey(e.createdAt, granMs);
      if (!groups[bucket]) groups[bucket] = { timestamp: bucket, count: 0, sellers: new Set() };
      groups[bucket].count++;
      if (e.sellerId) groups[bucket].sellers.add(e.sellerId);
    }

    return Object.values(groups)
      .map(g => ({ timestamp: g.timestamp, eventCount: g.count, uniqueSellers: g.sellers.size }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Decision distribution — count + avg risk by agent + action.
   */
  async queryDecisionDistribution({ agentId, action, timeWindow = '24h' } = {}) {
    const cutoff = cutoffISO(parseTimeWindow(timeWindow));

    let decisions = (await db_ops.getAll('agent_decisions', 100_000, 0)).map(r => r.data)
      .filter(d => d.createdAt >= cutoff);

    if (agentId) decisions = decisions.filter(d => d.agentId === agentId);
    if (action) decisions = decisions.filter(d => d.action === action);

    const groups = {};
    for (const d of decisions) {
      const key = `${d.agentId || 'unknown'}|${d.action || 'UNKNOWN'}`;
      if (!groups[key]) groups[key] = { agentId: d.agentId || 'unknown', action: d.action || 'UNKNOWN', count: 0, totalRisk: 0 };
      groups[key].count++;
      groups[key].totalRisk += d.riskScore || 0;
    }

    return Object.values(groups).map(g => ({
      agentId: g.agentId,
      action: g.action,
      count: g.count,
      avgRiskScore: Math.round((g.totalRisk / g.count) * 100) / 100
    }));
  }

  /**
   * Health check.
   */
  async health() {
    try {
      const eventCount = await db_ops.count('risk_events');
      return { status: 'ok', backend: 'sqlite', details: { eventCount } };
    } catch (err) {
      return { status: 'degraded', backend: 'sqlite', details: { error: err.message } };
    }
  }

  // ── Ingestion (no-ops for SQLite — data already persisted via db_ops) ──────

  ingestRiskEvent(_event) { /* no-op */ }
  ingestDecision(_decision) { /* no-op */ }
  ingestMetrics(_metrics) { /* no-op */ }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let instance = null;

export function getAnalyticsSQLiteBackend() {
  if (!instance) instance = new AnalyticsSQLiteBackend();
  return instance;
}

export default { AnalyticsSQLiteBackend, getAnalyticsSQLiteBackend };
