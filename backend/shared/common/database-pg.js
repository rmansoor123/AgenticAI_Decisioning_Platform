/**
 * PostgreSQL adapter — drop-in replacement for database.js (SQLite).
 * Implements the same db_ops interface: insert, getById, getAll, query, update, delete, count, raw, run, getStats.
 *
 * All tables use a TEXT primary key + JSONB "data" column + timestamps.
 * Placeholder conversion: SQLite uses "?", Postgres uses "$1", "$2", etc.
 */

import pg from 'pg';

const { Pool } = pg;

let pool = null;
let available = false;

/**
 * Initialize the Postgres connection pool.
 * @returns {Promise<boolean>} true if connection succeeded
 */
export async function initializePostgres() {
  const url = process.env.POSTGRES_URL || 'postgresql://fraud_user:fraud_pass@localhost:5432/fraud_detection';
  try {
    pool = new Pool({
      connectionString: url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Verify connectivity
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    available = true;
    console.log('[database-pg] PostgreSQL connected');
    return true;
  } catch (err) {
    console.warn(`[database-pg] PostgreSQL connection failed: ${err.message}`);
    available = false;
    return false;
  }
}

export function isPostgresAvailable() {
  return available;
}

export async function closePostgres() {
  if (pool) {
    await pool.end();
    pool = null;
    available = false;
  }
}

/**
 * Convert SQLite-style "?" placeholders to Postgres "$1, $2, ..." style.
 */
function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

/**
 * Parse a row from our standard table schema.
 * Tables have: primary_key TEXT, data JSONB, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ.
 */
function parseRow(row, idField) {
  if (!row) return null;
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
  return {
    [idField]: row[idField] || row.id,
    data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ============================================================
// db_ops interface — matches database.js exactly
// ============================================================

const db_ops_pg = {
  async insert(table, idField, id, data) {
    const dataJson = typeof data === 'string' ? data : JSON.stringify(data);
    const sql = `
      INSERT INTO ${table} (${idField}, data, created_at, updated_at)
      VALUES ($1, $2::jsonb, NOW(), NOW())
      ON CONFLICT (${idField}) DO UPDATE SET data = $2::jsonb, updated_at = NOW()
    `;
    const result = await pool.query(sql, [id, dataJson]);
    return { changes: result.rowCount };
  },

  async getById(table, idField, id) {
    const sql = `SELECT * FROM ${table} WHERE ${idField} = $1 LIMIT 1`;
    const result = await pool.query(sql, [id]);
    if (result.rows.length === 0) return null;
    return parseRow(result.rows[0], idField);
  },

  async getAll(table, limit = 100, offset = 0) {
    const sql = `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
    const result = await pool.query(sql, [limit, offset]);
    // Infer the idField from the first column that isn't data/created_at/updated_at
    const idField = result.fields?.find(f => !['data', 'created_at', 'updated_at'].includes(f.name))?.name || 'id';
    return result.rows.map(row => parseRow(row, idField));
  },

  async query(table, where = '', params = [], limit = 100) {
    const pgWhere = where ? convertPlaceholders(where) : '';
    const sql = pgWhere
      ? `SELECT * FROM ${table} WHERE ${pgWhere} ORDER BY created_at DESC LIMIT $${params.length + 1}`
      : `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT $1`;

    const allParams = pgWhere ? [...params, limit] : [limit];
    const result = await pool.query(sql, allParams);
    const idField = result.fields?.find(f => !['data', 'created_at', 'updated_at'].includes(f.name))?.name || 'id';
    return result.rows.map(row => parseRow(row, idField));
  },

  async update(table, idField, id, data) {
    const dataJson = typeof data === 'string' ? data : JSON.stringify(data);
    const sql = `UPDATE ${table} SET data = $1::jsonb, updated_at = NOW() WHERE ${idField} = $2`;
    const result = await pool.query(sql, [dataJson, id]);
    return { changes: result.rowCount };
  },

  async delete(table, idField, id) {
    const sql = `DELETE FROM ${table} WHERE ${idField} = $1`;
    const result = await pool.query(sql, [id]);
    return { changes: result.rowCount };
  },

  async count(table) {
    const sql = `SELECT COUNT(*)::int AS cnt FROM ${table}`;
    const result = await pool.query(sql);
    return result.rows[0]?.cnt || 0;
  },

  async raw(sql, params = []) {
    const pgSql = convertPlaceholders(sql);
    const result = await pool.query(pgSql, params);
    return result.rows;
  },

  async run(sql, params = []) {
    const pgSql = convertPlaceholders(sql);
    const result = await pool.query(pgSql, params);
    return { changes: result.rowCount };
  },

  async getStats() {
    const tables = [
      'agent_short_term_memory', 'agent_long_term_memory', 'agent_shared_memory',
      'agent_episodes', 'knowledge_entries', 'reasoning_checkpoints',
      'workflow_checkpoints', 'agent_decisions', 'agent_traces',
      'agent_metrics', 'agent_evaluations', 'agent_costs',
    ];
    const stats = { backend: 'postgres' };
    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT COUNT(*)::int AS cnt FROM ${table}`);
        stats[table] = result.rows[0]?.cnt || 0;
      } catch {
        stats[table] = 0;
      }
    }
    return stats;
  },
};

export { db_ops_pg };
export default db_ops_pg;
