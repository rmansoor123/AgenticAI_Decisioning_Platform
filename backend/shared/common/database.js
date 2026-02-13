/**
 * Database Layer - SQLite persistence with better-sqlite3
 * Falls back to in-memory storage if SQLite is unavailable
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file location
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/fraud_detection.db');

let db = null;
let usingSqlite = false;

// In-memory fallback store
const memoryStore = {
  sellers: new Map(),
  transactions: new Map(),
  listings: new Map(),
  payouts: new Map(),
  ato_events: new Map(),
  shipments: new Map(),
  ml_models: new Map(),
  rules: new Map(),
  experiments: new Map(),
  datasets: new Map(),
  metrics_history: [],
  pipeline_runs: new Map(),
  alerts: new Map(),
  investigations: new Map(),
  seller_images: new Map(),
  seller_risk_profiles: new Map(),
  risk_events: new Map(),
  knowledge_entries: new Map(),
  agent_short_term_memory: new Map(),
  agent_long_term_memory: new Map()
};

/**
 * Try to load better-sqlite3
 */
async function loadSqlite() {
  try {
    const Database = (await import('better-sqlite3')).default;
    return Database;
  } catch (error) {
    console.warn('better-sqlite3 not available, using in-memory storage:', error.message);
    return null;
  }
}

/**
 * Initialize the database
 */
export async function initializeDatabase() {
  if (db || usingSqlite === false) return db;

  const Database = await loadSqlite();

  if (Database) {
    try {
      console.log(`Initializing SQLite database at: ${DB_PATH}`);

      // Ensure data directory exists
      const fs = await import('fs');
      const dataDir = path.dirname(DB_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Create database connection
      db = new Database(DB_PATH);

      // Enable WAL mode for better performance
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      db.pragma('cache_size = 10000');
      db.pragma('temp_store = MEMORY');

      // Run migrations
      const { runMigrations } = await import('./migrations/index.js');
      runMigrations(db);

      usingSqlite = true;
      console.log('SQLite database initialized successfully');
      return db;
    } catch (error) {
      console.warn('SQLite initialization failed, falling back to in-memory storage:', error.message);
      db = null;
      usingSqlite = false;
    }
  } else {
    usingSqlite = false;
    console.log('Using in-memory database storage');
  }

  return null;
}

// Synchronous version for backward compatibility
export function initializeDatabaseSync() {
  if (!usingSqlite) {
    console.log('In-memory database initialized');
  }
}

/**
 * Get the database instance
 */
export function getDb() {
  return db;
}

/**
 * Check if the database has been seeded
 */
export function isSeeded() {
  if (usingSqlite && db) {
    try {
      const result = db.prepare('SELECT COUNT(*) as count FROM sellers').get();
      return result.count > 0;
    } catch {
      return false;
    }
  }
  return memoryStore.sellers.size > 0;
}

/**
 * Close the database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('Database connection closed');
  }
}

/**
 * Helper function to get ID field name for a table
 */
function getIdField(table) {
  const idFields = {
    sellers: 'seller_id',
    transactions: 'transaction_id',
    listings: 'listing_id',
    payouts: 'payout_id',
    ato_events: 'event_id',
    shipments: 'shipment_id',
    ml_models: 'model_id',
    rules: 'rule_id',
    experiments: 'experiment_id',
    datasets: 'dataset_id',
    alerts: 'alert_id',
    investigations: 'investigation_id',
    pipeline_runs: 'run_id',
    seller_images: 'image_id',
    seller_risk_profiles: 'seller_id',
    risk_events: 'event_id',
    knowledge_entries: 'knowledge_id',
    agent_short_term_memory: 'memory_id',
    agent_long_term_memory: 'memory_id'
  };
  return idFields[table] || 'id';
}

/**
 * Database operations - works with both SQLite and in-memory storage
 */
export const db_ops = {
  /**
   * Insert a record
   */
  insert: (table, idField, id, data) => {
    if (usingSqlite && db) {
      try {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO ${table} (${idField}, data, created_at)
          VALUES (?, ?, ?)
        `);
        const result = stmt.run(id, JSON.stringify(data), new Date().toISOString());
        return { changes: result.changes };
      } catch (error) {
        console.error('SQLite insert error:', error.message);
      }
    }

    // In-memory fallback
    if (!memoryStore[table]) memoryStore[table] = new Map();
    memoryStore[table].set(id, {
      [idField]: id,
      data,
      created_at: new Date().toISOString()
    });
    return { changes: 1 };
  },

  /**
   * Get a record by ID
   */
  getById: (table, idField, id) => {
    if (usingSqlite && db) {
      try {
        const stmt = db.prepare(`SELECT * FROM ${table} WHERE ${idField} = ?`);
        const row = stmt.get(id);
        if (!row) return null;
        return {
          [idField]: row[idField],
          data: JSON.parse(row.data),
          created_at: row.created_at,
          updated_at: row.updated_at
        };
      } catch (error) {
        console.error('SQLite getById error:', error.message);
      }
    }

    // In-memory fallback
    if (!memoryStore[table]) return null;
    return memoryStore[table].get(id) || null;
  },

  /**
   * Get all records from a table
   */
  getAll: (table, limit = 100, offset = 0) => {
    if (usingSqlite && db) {
      try {
        const idField = getIdField(table);
        const stmt = db.prepare(`
          SELECT * FROM ${table}
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `);
        const rows = stmt.all(limit, offset);
        return rows.map(row => ({
          [idField]: row[idField],
          data: JSON.parse(row.data),
          created_at: row.created_at,
          updated_at: row.updated_at
        }));
      } catch (error) {
        console.error('SQLite getAll error:', error.message);
      }
    }

    // In-memory fallback
    if (!memoryStore[table]) return [];
    const all = Array.from(memoryStore[table].values());
    return all.slice(offset, offset + limit);
  },

  /**
   * Query records with filter
   */
  query: (table, where, params = [], limit = 100) => {
    if (usingSqlite && db) {
      try {
        const idField = getIdField(table);
        let sql = `SELECT * FROM ${table}`;
        if (where) {
          sql += ` WHERE ${where}`;
        }
        sql += ` ORDER BY created_at DESC LIMIT ?`;

        const stmt = db.prepare(sql);
        const rows = stmt.all(...params, limit);
        return rows.map(row => ({
          [idField]: row[idField],
          data: JSON.parse(row.data),
          created_at: row.created_at,
          updated_at: row.updated_at
        }));
      } catch (error) {
        console.error('SQLite query error:', error.message);
      }
    }

    // In-memory fallback
    if (!memoryStore[table]) return [];
    const all = Array.from(memoryStore[table].values());
    return all.slice(0, limit);
  },

  /**
   * Update a record
   */
  update: (table, idField, id, data) => {
    if (usingSqlite && db) {
      try {
        const stmt = db.prepare(`
          UPDATE ${table}
          SET data = ?, updated_at = ?
          WHERE ${idField} = ?
        `);
        const result = stmt.run(JSON.stringify(data), new Date().toISOString(), id);
        return { changes: result.changes };
      } catch (error) {
        console.error('SQLite update error:', error.message);
      }
    }

    // In-memory fallback
    if (!memoryStore[table]) return { changes: 0 };
    const existing = memoryStore[table].get(id);
    if (existing) {
      memoryStore[table].set(id, {
        ...existing,
        data,
        updated_at: new Date().toISOString()
      });
      return { changes: 1 };
    }
    return { changes: 0 };
  },

  /**
   * Delete a record
   */
  delete: (table, idField, id) => {
    if (usingSqlite && db) {
      try {
        const stmt = db.prepare(`DELETE FROM ${table} WHERE ${idField} = ?`);
        const result = stmt.run(id);
        return { changes: result.changes };
      } catch (error) {
        console.error('SQLite delete error:', error.message);
      }
    }

    // In-memory fallback
    if (!memoryStore[table]) return { changes: 0 };
    const deleted = memoryStore[table].delete(id);
    return { changes: deleted ? 1 : 0 };
  },

  /**
   * Count records in a table
   */
  count: (table) => {
    if (usingSqlite && db) {
      try {
        const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${table}`);
        const result = stmt.get();
        return result.count;
      } catch (error) {
        console.error('SQLite count error:', error.message);
      }
    }

    // In-memory fallback
    if (!memoryStore[table]) return 0;
    if (Array.isArray(memoryStore[table])) return memoryStore[table].length;
    return memoryStore[table].size;
  },

  /**
   * Raw SQL query (read-only)
   */
  raw: (sql, params = []) => {
    if (usingSqlite && db) {
      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);

        return rows.map(row => {
          if (row.data && typeof row.data === 'string') {
            try {
              return { ...row, data: JSON.parse(row.data) };
            } catch {
              return row;
            }
          }
          return row;
        });
      } catch (error) {
        console.error('Raw query error:', error.message);
      }
    }

    // In-memory fallback - simple table extraction from SQL
    const tableMatch = sql.match(/from\s+(\w+)/i);
    if (tableMatch) {
      const table = tableMatch[1];
      if (memoryStore[table]) {
        const limitMatch = sql.match(/limit\s+(\d+)/i);
        const limit = limitMatch ? parseInt(limitMatch[1]) : 100;
        return Array.from(memoryStore[table].values()).slice(0, limit);
      }
    }
    return [];
  },

  /**
   * Raw SQL run (for inserts/updates/deletes)
   */
  run: (sql, params = []) => {
    if (usingSqlite && db) {
      try {
        // Handle metrics_history specially
        if (sql.includes('metrics_history') && sql.includes('INSERT')) {
          const stmt = db.prepare(`
            INSERT INTO metrics_history (data, timestamp)
            VALUES (?, ?)
          `);
          const data = typeof params[0] === 'string' ? params[0] : JSON.stringify(params[0]);
          const timestamp = params[1] || new Date().toISOString();
          const result = stmt.run(data, timestamp);
          return { changes: result.changes };
        }

        // Handle pipeline_runs specially
        if (sql.includes('pipeline_runs')) {
          if (sql.includes('INSERT')) {
            const stmt = db.prepare(`
              INSERT INTO pipeline_runs (run_id, pipeline_name, status, data, started_at)
              VALUES (?, ?, ?, ?, ?)
            `);
            const data = typeof params[3] === 'string' ? params[3] : JSON.stringify(params[3]);
            const result = stmt.run(params[0], params[1], params[2], data, params[4]);
            return { changes: result.changes };
          } else if (sql.includes('UPDATE')) {
            const stmt = db.prepare(`
              UPDATE pipeline_runs
              SET status = ?, data = ?, completed_at = ?
              WHERE run_id = ?
            `);
            const data = typeof params[1] === 'string' ? params[1] : JSON.stringify(params[1]);
            const result = stmt.run(params[0], data, params[2], params[3]);
            return { changes: result.changes };
          }
        }

        // Generic SQL execution
        const stmt = db.prepare(sql);
        const result = stmt.run(...params);
        return { changes: result.changes };
      } catch (error) {
        console.error('Run error:', error.message);
      }
    }

    // In-memory fallback for metrics_history
    if (sql.includes('metrics_history') && sql.includes('INSERT')) {
      memoryStore.metrics_history.push({
        data: typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0],
        timestamp: params[1] || new Date().toISOString()
      });
      return { changes: 1 };
    }

    // In-memory fallback for pipeline_runs
    if (sql.includes('pipeline_runs')) {
      if (sql.includes('INSERT')) {
        memoryStore.pipeline_runs.set(params[0], {
          run_id: params[0],
          pipeline_name: params[1],
          status: params[2],
          data: typeof params[3] === 'string' ? JSON.parse(params[3]) : params[3],
          started_at: params[4]
        });
      } else if (sql.includes('UPDATE')) {
        const existing = memoryStore.pipeline_runs.get(params[3]);
        if (existing) {
          existing.status = params[0];
          existing.data = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
          existing.completed_at = params[2];
        }
      }
      return { changes: 1 };
    }

    return { changes: 0 };
  },

  /**
   * Get database stats
   */
  getStats: () => {
    const tables = [
      'sellers', 'transactions', 'listings', 'payouts', 'ato_events',
      'shipments', 'ml_models', 'rules', 'experiments', 'datasets',
      'metrics_history', 'pipeline_runs', 'alerts', 'investigations',
      'seller_images',
      'seller_risk_profiles',
      'risk_events',
      'knowledge_entries',
      'agent_short_term_memory',
      'agent_long_term_memory'
    ];

    const stats = { usingSqlite };
    tables.forEach(table => {
      try {
        stats[table] = db_ops.count(table);
      } catch {
        stats[table] = 0;
      }
    });

    return stats;
  }
};

// Handle process exit
process.on('exit', closeDatabase);
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});
process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});

export default { initializeDatabase, initializeDatabaseSync, getDb, isSeeded, closeDatabase, db_ops };
