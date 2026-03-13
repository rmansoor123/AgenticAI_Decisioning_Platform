/**
 * Shared Data Tools — utility functions for all data agents
 *
 * Provides schema introspection, safe SQL execution, statistical helpers,
 * and NL-to-SQL fallback for the data agent system.
 */

import { db_ops } from '../../shared/common/database.js';

// ─── Schema Introspection ────────────────────────────────────────────────────

const KNOWN_TABLES = [
  'sellers', 'transactions', 'listings', 'payouts', 'ato_events',
  'shipments', 'cases', 'risk_events', 'datasets', 'pipeline_runs',
  'data_profiles', 'dead_letter_queue', 'prediction_history',
  'rule_performance', 'experiment_events', 'knowledge_entries'
];

export function getTableSchemas() {
  const schemas = {};
  for (const table of KNOWN_TABLES) {
    try {
      const info = db_ops.raw(`PRAGMA table_info(${table})`, []);
      if (info && info.length > 0) {
        schemas[table] = {
          columns: info.map(col => ({
            name: col.name,
            type: col.type,
            notnull: !!col.notnull
          })),
          rowCount: db_ops.count(table)
        };
      }
    } catch (_) {
      // Table may not exist — skip
    }
  }
  return schemas;
}

// ─── Safe SQL Execution ──────────────────────────────────────────────────────

const MAX_ROWS = 500;

export function executeSafeSQL(sql, params = []) {
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  // Reject non-SELECT statements
  if (!upper.startsWith('SELECT') && !upper.startsWith('PRAGMA') && !upper.startsWith('EXPLAIN')) {
    return { success: false, error: 'Only SELECT queries are allowed', sql };
  }

  // Reject dangerous patterns
  const forbidden = ['DROP ', 'DELETE ', 'INSERT ', 'UPDATE ', 'ALTER ', 'CREATE ', 'ATTACH '];
  for (const f of forbidden) {
    if (upper.includes(f)) {
      return { success: false, error: `Forbidden SQL keyword: ${f.trim()}`, sql };
    }
  }

  // Enforce LIMIT
  let safeSql = trimmed;
  if (!upper.includes('LIMIT')) {
    safeSql = safeSql.replace(/;?\s*$/, '') + ` LIMIT ${MAX_ROWS}`;
  } else {
    // Cap existing LIMIT
    safeSql = safeSql.replace(/LIMIT\s+(\d+)/i, (_, n) => `LIMIT ${Math.min(parseInt(n), MAX_ROWS)}`);
  }

  const start = performance.now();
  try {
    const rows = db_ops.raw(safeSql, params);
    const executionTimeMs = parseFloat((performance.now() - start).toFixed(3));
    return {
      success: true,
      rows,
      rowCount: rows.length,
      executionTimeMs,
      sql: safeSql
    };
  } catch (error) {
    return { success: false, error: error.message, sql: safeSql };
  }
}

// ─── Statistical Helpers ─────────────────────────────────────────────────────

export function computeZScores(values) {
  if (!values || values.length < 3) return [];
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);

  if (stddev === 0) return values.map((v, i) => ({ index: i, value: v, zScore: 0, isOutlier: false }));

  return values.map((v, i) => {
    const zScore = parseFloat(((v - mean) / stddev).toFixed(4));
    return { index: i, value: v, zScore, isOutlier: Math.abs(zScore) > 2.5 };
  });
}

export function computePSI(baseline, current, buckets = 10) {
  if (!baseline?.length || !current?.length) {
    return { psi: 0, bucketDetails: [], isDrifted: false };
  }

  const allValues = [...baseline, ...current];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const step = (max - min) / buckets || 1;

  const baseHist = new Array(buckets).fill(0);
  const currHist = new Array(buckets).fill(0);

  for (const v of baseline) {
    const idx = Math.min(Math.floor((v - min) / step), buckets - 1);
    baseHist[idx]++;
  }
  for (const v of current) {
    const idx = Math.min(Math.floor((v - min) / step), buckets - 1);
    currHist[idx]++;
  }

  // Convert to proportions with smoothing
  const epsilon = 0.0001;
  const baseProp = baseHist.map(c => (c / baseline.length) + epsilon);
  const currProp = currHist.map(c => (c / current.length) + epsilon);

  let psi = 0;
  const bucketDetails = [];
  for (let i = 0; i < buckets; i++) {
    const contribution = (currProp[i] - baseProp[i]) * Math.log(currProp[i] / baseProp[i]);
    psi += contribution;
    bucketDetails.push({
      bucket: i,
      range: `${(min + i * step).toFixed(2)} - ${(min + (i + 1) * step).toFixed(2)}`,
      baselinePct: parseFloat((baseProp[i] * 100).toFixed(2)),
      currentPct: parseFloat((currProp[i] * 100).toFixed(2)),
      contribution: parseFloat(contribution.toFixed(6))
    });
  }

  psi = parseFloat(psi.toFixed(6));
  return { psi, bucketDetails, isDrifted: psi > 0.2 };
}

export function computeDistribution(values) {
  if (!values || values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, stddev: 0, percentiles: {}, histogram: [] };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const variance = sorted.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
  const stddev = Math.sqrt(variance);

  const percentile = (p) => {
    const idx = (p / 100) * (n - 1);
    const lower = Math.floor(idx);
    const frac = idx - lower;
    return lower + 1 < n
      ? parseFloat((sorted[lower] * (1 - frac) + sorted[lower + 1] * frac).toFixed(4))
      : sorted[lower];
  };

  // Histogram with 10 buckets
  const min = sorted[0];
  const max = sorted[n - 1];
  const bucketSize = (max - min) / 10 || 1;
  const histogram = [];
  for (let i = 0; i < 10; i++) {
    const lo = min + i * bucketSize;
    const hi = lo + bucketSize;
    const count = sorted.filter(v => v >= lo && (i === 9 ? v <= hi : v < hi)).length;
    histogram.push({ range: `${lo.toFixed(2)}-${hi.toFixed(2)}`, count });
  }

  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean: parseFloat(mean.toFixed(4)),
    median: parseFloat(percentile(50).toFixed ? percentile(50).toFixed(4) : percentile(50)),
    stddev: parseFloat(stddev.toFixed(4)),
    percentiles: {
      p10: percentile(10),
      p25: percentile(25),
      p50: percentile(50),
      p75: percentile(75),
      p90: percentile(90),
      p95: percentile(95),
      p99: percentile(99)
    },
    histogram
  };
}

// ─── NL-to-SQL Fallback ──────────────────────────────────────────────────────

const NL_PATTERNS = [
  { pattern: /top\s+(\d+)\s+sellers?\s+by\s+transaction/i, sql: (m) => `SELECT s.seller_id, s.data FROM sellers s ORDER BY s.created_at DESC LIMIT ${m[1]}` },
  { pattern: /how many (sellers|transactions|listings|payouts)/i, sql: (m) => `SELECT COUNT(*) as count FROM ${m[1]}` },
  { pattern: /show\s+(?:me\s+)?all\s+(sellers|transactions|listings|payouts)/i, sql: (m) => `SELECT * FROM ${m[1]} LIMIT 100` },
  { pattern: /seller\s+(SLR-\w+)/i, sql: (m) => `SELECT * FROM sellers WHERE seller_id = '${m[1]}'` },
  { pattern: /transaction.+amount\s*>\s*(\d+)/i, sql: (m) => `SELECT * FROM transactions WHERE CAST(json_extract(data, '$.amount') AS REAL) > ${m[1]} LIMIT 100` },
  { pattern: /risk.+score\s*>\s*(\d+)/i, sql: (m) => `SELECT * FROM sellers WHERE CAST(json_extract(data, '$.riskScore') AS REAL) > ${m[1]} LIMIT 100` },
  { pattern: /recent\s+(transactions|payouts|listings)/i, sql: (m) => `SELECT * FROM ${m[1]} ORDER BY created_at DESC LIMIT 20` },
  { pattern: /high.?risk\s+sellers?/i, sql: () => `SELECT * FROM sellers WHERE CAST(json_extract(data, '$.riskScore') AS INTEGER) > 60 LIMIT 100` },
  { pattern: /count.+by\s+status/i, sql: () => `SELECT json_extract(data, '$.status') as status, COUNT(*) as count FROM sellers GROUP BY status` },
  { pattern: /average\s+(?:transaction\s+)?amount/i, sql: () => `SELECT AVG(CAST(json_extract(data, '$.amount') AS REAL)) as avg_amount FROM transactions` },
];

export function nlToSqlFallback(question, schemas) {
  for (const { pattern, sql } of NL_PATTERNS) {
    const match = question.match(pattern);
    if (match) return sql(match);
  }

  // Generic fallback: look for table names in the question
  const qLower = question.toLowerCase();
  const tables = Object.keys(schemas || {});
  const mentioned = tables.find(t => qLower.includes(t.replace(/_/g, ' ')) || qLower.includes(t));
  if (mentioned) {
    return `SELECT * FROM ${mentioned} LIMIT 50`;
  }

  return 'SELECT * FROM sellers LIMIT 20';
}
