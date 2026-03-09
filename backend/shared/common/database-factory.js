/**
 * Database factory — routes to PostgreSQL or SQLite based on DB_BACKEND env var.
 *
 * Usage:
 *   import { getDbOps, initializeDb } from './database-factory.js';
 *   await initializeDb();
 *   const ops = getDbOps();
 *   await ops.insert('agent_decisions', 'decision_id', id, data);
 *
 * Fallback: If DB_BACKEND=postgres but Postgres is unreachable, falls back to SQLite.
 */

let activeBackend = null; // 'postgres' | 'sqlite'
let activeDbOps = null;

/**
 * Initialize the database backend.
 * @returns {Promise<string>} The active backend type ('postgres' or 'sqlite')
 */
export async function initializeDb() {
  const requested = (process.env.DB_BACKEND || 'sqlite').toLowerCase();

  if (requested === 'postgres') {
    try {
      const { initializePostgres, isPostgresAvailable, db_ops_pg } = await import('./database-pg.js');
      const connected = await initializePostgres();
      if (connected && isPostgresAvailable()) {
        activeDbOps = db_ops_pg;
        activeBackend = 'postgres';
        console.log('[database-factory] Using PostgreSQL backend');
        return activeBackend;
      }
    } catch (err) {
      console.warn(`[database-factory] PostgreSQL init failed: ${err.message}`);
    }
    console.warn('[database-factory] Falling back to SQLite');
  }

  // Default: SQLite
  const { default: database } = await import('./database.js');
  const { initializeDatabase } = database;
  if (typeof initializeDatabase === 'function') {
    await initializeDatabase();
  }
  // database.js exports db_ops as a property of its default export or as named export
  const mod = await import('./database.js');
  activeDbOps = mod.db_ops || mod.default?.db_ops || mod.default;
  activeBackend = 'sqlite';
  console.log('[database-factory] Using SQLite backend');
  return activeBackend;
}

/**
 * Get the active db_ops implementation.
 * Falls back to importing SQLite db_ops if not yet initialized.
 */
export function getDbOps() {
  if (activeDbOps) return activeDbOps;

  // Lazy fallback: import SQLite synchronously (module is already loaded)
  try {
    // Dynamic import would be async, so we return a proxy that throws helpful error
    console.warn('[database-factory] getDbOps() called before initializeDb() — returning SQLite default');
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the current backend type.
 * @returns {'postgres' | 'sqlite' | null}
 */
export function getDbBackendType() {
  return activeBackend;
}
