/**
 * Analytics Pinot Backend — sub-second OLAP queries via Apache Pinot Broker REST API.
 * Activated when ANALYTICS_BACKEND=pinot.
 *
 * Uses native fetch() against PINOT_BROKER_URL/query/sql for reads and
 * PINOT_CONTROLLER_URL for table management / writes.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BROKER_URL = process.env.PINOT_BROKER_URL || 'http://localhost:8099';
const CONTROLLER_URL = process.env.PINOT_CONTROLLER_URL || 'http://localhost:9000';

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

function pinotGranularity(granularity) {
  const map = {
    '1m': "'1:MINUTES:SIMPLE_DATE_FORMAT:yyyy-MM-dd HH:mm:00'",
    '5m': "'5:MINUTES:SIMPLE_DATE_FORMAT:yyyy-MM-dd HH:mm:00'",
    '15m': "'15:MINUTES:SIMPLE_DATE_FORMAT:yyyy-MM-dd HH:mm:00'",
    '1h': "'1:HOURS:SIMPLE_DATE_FORMAT:yyyy-MM-dd HH:00:00'",
    '6h': "'6:HOURS:SIMPLE_DATE_FORMAT:yyyy-MM-dd HH:00:00'",
    '1d': "'1:DAYS:SIMPLE_DATE_FORMAT:yyyy-MM-dd'"
  };
  return map[granularity] || map['1h'];
}

async function pinotQuery(sql) {
  const resp = await fetch(`${BROKER_URL}/query/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(10_000)
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Pinot query failed (${resp.status}): ${text}`);
  }

  const result = await resp.json();

  if (result.exceptions && result.exceptions.length > 0) {
    throw new Error(`Pinot query error: ${result.exceptions[0].message}`);
  }

  // Convert Pinot response format to row objects
  const columns = result.resultTable?.dataSchema?.columnNames || [];
  const rows = result.resultTable?.rows || [];
  return rows.map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

async function pinotIngest(tableName, records) {
  const resp = await fetch(`${CONTROLLER_URL}/ingestFromFile?tableNameWithType=${tableName}_REALTIME&batchConfigMapStr={}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(records),
    signal: AbortSignal.timeout(10_000)
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Pinot ingest failed (${resp.status}): ${text}`);
  }
}

// ── Backend ──────────────────────────────────────────────────────────────────

class AnalyticsPinotBackend {
  constructor() {
    this.type = 'pinot';
    this._tablesEnsured = false;
  }

  /**
   * Create Pinot tables from schema JSON files if they don't already exist.
   */
  async _ensureTables() {
    if (this._tablesEnsured) return;

    const schemas = ['risk_events_rt', 'agent_decisions_rt', 'agent_metrics_rt'];
    for (const schemaName of schemas) {
      try {
        // Check if table exists
        const checkResp = await fetch(`${CONTROLLER_URL}/tables/${schemaName}`, {
          signal: AbortSignal.timeout(5_000)
        });
        if (checkResp.ok) continue;

        // Load schema + table config
        const schemaPath = join(__dirname, 'pinot-schemas', `${schemaName}.json`);
        const config = JSON.parse(readFileSync(schemaPath, 'utf8'));

        // Create schema
        await fetch(`${CONTROLLER_URL}/schemas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config.schema),
          signal: AbortSignal.timeout(5_000)
        });

        // Create table
        await fetch(`${CONTROLLER_URL}/tables`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config.table),
          signal: AbortSignal.timeout(5_000)
        });

        console.log(`[analytics-pinot] Created table: ${schemaName}`);
      } catch (err) {
        console.warn(`[analytics-pinot] Failed to ensure table ${schemaName}: ${err.message}`);
      }
    }

    this._tablesEnsured = true;
  }

  /**
   * Risk trends — avg score + count by time bucket and domain.
   */
  async queryRiskTrends({ domain, timeWindow = '24h', sellerId, granularity = '1h' } = {}) {
    await this._ensureTables();
    const cutoff = cutoffISO(parseTimeWindow(timeWindow));
    const gran = pinotGranularity(granularity);

    let where = `WHERE createdAt >= '${cutoff}'`;
    if (domain) where += ` AND domain = '${domain}'`;
    if (sellerId) where += ` AND sellerId = '${sellerId}'`;

    const sql = `
      SELECT
        DATETIMECONVERT(createdAt, '1:MILLISECONDS:EPOCH', '1:MILLISECONDS:EPOCH', ${gran}) AS bucket,
        domain,
        AVG(riskScore) AS avgScore,
        COUNT(*) AS eventCount
      FROM risk_events_rt
      ${where}
      GROUP BY bucket, domain
      ORDER BY bucket ASC
    `;

    const rows = await pinotQuery(sql);
    return rows.map(r => ({
      timestamp: new Date(r.bucket).toISOString(),
      domain: r.domain,
      avgScore: Math.round(r.avgScore * 100) / 100,
      eventCount: r.eventCount
    }));
  }

  /**
   * Agent performance — execution count + latency percentiles + success rate.
   */
  async queryAgentPerformance({ agentId, timeWindow = '24h' } = {}) {
    await this._ensureTables();
    const cutoff = cutoffISO(parseTimeWindow(timeWindow));

    let where = `WHERE createdAt >= '${cutoff}'`;
    if (agentId) where += ` AND agentId = '${agentId}'`;

    const sql = `
      SELECT
        agentId,
        COUNT(*) AS executions,
        PERCENTILE(latencyMs, 50) AS p50Ms,
        PERCENTILE(latencyMs, 95) AS p95Ms,
        PERCENTILE(latencyMs, 99) AS p99Ms,
        SUM(CASE WHEN success = 'true' THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS successRate
      FROM agent_decisions_rt
      ${where}
      GROUP BY agentId
    `;

    const rows = await pinotQuery(sql);
    const results = rows.map(r => ({
      agentId: r.agentId,
      executions: r.executions,
      p50Ms: Math.round(r.p50Ms),
      p95Ms: Math.round(r.p95Ms),
      p99Ms: Math.round(r.p99Ms),
      successRate: Math.round(r.successRate * 10000) / 10000
    }));

    return agentId && results.length === 1 ? results[0] : results;
  }

  /**
   * Velocity — event count + unique sellers by time bucket.
   */
  async queryVelocity({ sellerId, deviceFingerprint, timeWindow = '1h' } = {}) {
    await this._ensureTables();
    const cutoff = cutoffISO(parseTimeWindow(timeWindow));
    const gran = pinotGranularity('5m');

    let where = `WHERE createdAt >= '${cutoff}'`;
    if (sellerId) where += ` AND sellerId = '${sellerId}'`;
    if (deviceFingerprint) where += ` AND deviceFingerprint = '${deviceFingerprint}'`;

    const sql = `
      SELECT
        DATETIMECONVERT(createdAt, '1:MILLISECONDS:EPOCH', '1:MILLISECONDS:EPOCH', ${gran}) AS bucket,
        COUNT(*) AS eventCount,
        DISTINCTCOUNT(sellerId) AS uniqueSellers
      FROM risk_events_rt
      ${where}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    const rows = await pinotQuery(sql);
    return rows.map(r => ({
      timestamp: new Date(r.bucket).toISOString(),
      eventCount: r.eventCount,
      uniqueSellers: r.uniqueSellers
    }));
  }

  /**
   * Decision distribution — count + avg risk by agent + action.
   */
  async queryDecisionDistribution({ agentId, action, timeWindow = '24h' } = {}) {
    await this._ensureTables();
    const cutoff = cutoffISO(parseTimeWindow(timeWindow));

    let where = `WHERE createdAt >= '${cutoff}'`;
    if (agentId) where += ` AND agentId = '${agentId}'`;
    if (action) where += ` AND action = '${action}'`;

    const sql = `
      SELECT
        agentId,
        action,
        COUNT(*) AS count,
        AVG(riskScore) AS avgRiskScore
      FROM agent_decisions_rt
      ${where}
      GROUP BY agentId, action
    `;

    const rows = await pinotQuery(sql);
    return rows.map(r => ({
      agentId: r.agentId,
      action: r.action,
      count: r.count,
      avgRiskScore: Math.round(r.avgRiskScore * 100) / 100
    }));
  }

  /**
   * Health check — ping broker.
   */
  async health() {
    try {
      const resp = await fetch(`${BROKER_URL}/health`, {
        signal: AbortSignal.timeout(3_000)
      });
      const ok = resp.ok;
      return {
        status: ok ? 'ok' : 'degraded',
        backend: 'pinot',
        details: {
          brokerUrl: BROKER_URL,
          controllerUrl: CONTROLLER_URL,
          brokerHealthy: ok
        }
      };
    } catch (err) {
      return {
        status: 'degraded',
        backend: 'pinot',
        details: { error: err.message, brokerUrl: BROKER_URL }
      };
    }
  }

  // ── Ingestion ──────────────────────────────────────────────────────────────

  async ingestRiskEvent(events) {
    try {
      const batch = Array.isArray(events) ? events : [events];
      await pinotIngest('risk_events_rt', batch);
    } catch (err) {
      console.warn(`[analytics-pinot] ingestRiskEvent failed: ${err.message}`);
    }
  }

  async ingestDecision(decisions) {
    try {
      const batch = Array.isArray(decisions) ? decisions : [decisions];
      await pinotIngest('agent_decisions_rt', batch);
    } catch (err) {
      console.warn(`[analytics-pinot] ingestDecision failed: ${err.message}`);
    }
  }

  async ingestMetrics(metrics) {
    try {
      const batch = Array.isArray(metrics) ? metrics : [metrics];
      await pinotIngest('agent_metrics_rt', batch);
    } catch (err) {
      console.warn(`[analytics-pinot] ingestMetrics failed: ${err.message}`);
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let instance = null;

export function getAnalyticsPinotBackend() {
  if (!instance) instance = new AnalyticsPinotBackend();
  return instance;
}

export default { AnalyticsPinotBackend, getAnalyticsPinotBackend };
