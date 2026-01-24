// In-memory data store (replaces SQLite for simplicity)

const store = {
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
  pipeline_runs: new Map()
};

export function initializeDatabase() {
  console.log('In-memory database initialized');
}

export const db_ops = {
  // Insert
  insert: (table, idField, id, data) => {
    if (!store[table]) store[table] = new Map();
    store[table].set(id, {
      [idField]: id,
      data,
      created_at: new Date().toISOString()
    });
    return { changes: 1 };
  },

  // Get by ID
  getById: (table, idField, id) => {
    if (!store[table]) return null;
    return store[table].get(id) || null;
  },

  // Get all
  getAll: (table, limit = 100, offset = 0) => {
    if (!store[table]) return [];
    const all = Array.from(store[table].values());
    return all.slice(offset, offset + limit);
  },

  // Query with filter (simplified)
  query: (table, where, params, limit = 100) => {
    if (!store[table]) return [];
    const all = Array.from(store[table].values());
    return all.slice(0, limit);
  },

  // Update
  update: (table, idField, id, data) => {
    if (!store[table]) return { changes: 0 };
    const existing = store[table].get(id);
    if (existing) {
      store[table].set(id, {
        ...existing,
        data,
        updated_at: new Date().toISOString()
      });
      return { changes: 1 };
    }
    return { changes: 0 };
  },

  // Delete
  delete: (table, idField, id) => {
    if (!store[table]) return { changes: 0 };
    const deleted = store[table].delete(id);
    return { changes: deleted ? 1 : 0 };
  },

  // Count
  count: (table) => {
    if (!store[table]) return 0;
    return store[table].size;
  },

  // Raw query (simplified - just returns from table)
  raw: (sql, params = []) => {
    // Very simple SQL parsing for basic queries
    const tableMatch = sql.match(/from\s+(\w+)/i);
    if (tableMatch) {
      const table = tableMatch[1];
      if (store[table]) {
        const limitMatch = sql.match(/limit\s+(\d+)/i);
        const limit = limitMatch ? parseInt(limitMatch[1]) : 100;
        return Array.from(store[table].values()).slice(0, limit);
      }
    }
    return [];
  },

  // Raw run (for inserts/updates)
  run: (sql, params = []) => {
    // Handle metrics_history specially
    if (sql.includes('metrics_history')) {
      if (sql.includes('INSERT')) {
        store.metrics_history.push({
          data: typeof params[0] === 'string' ? JSON.parse(params[0]) : params[0],
          timestamp: params[1] || new Date().toISOString()
        });
      }
      return { changes: 1 };
    }

    // Handle pipeline_runs
    if (sql.includes('pipeline_runs')) {
      if (sql.includes('INSERT')) {
        store.pipeline_runs.set(params[0], {
          run_id: params[0],
          pipeline_name: params[1],
          status: params[2],
          data: typeof params[3] === 'string' ? JSON.parse(params[3]) : params[3],
          started_at: params[4]
        });
      } else if (sql.includes('UPDATE')) {
        const existing = store.pipeline_runs.get(params[3]);
        if (existing) {
          existing.status = params[0];
          existing.data = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
          existing.completed_at = params[2];
        }
      }
      return { changes: 1 };
    }

    return { changes: 0 };
  }
};

export default store;
