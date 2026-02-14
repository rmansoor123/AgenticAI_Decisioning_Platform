export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_metrics (
      metric_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_metrics_created ON agent_metrics(created_at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_traces (
      trace_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_traces_created ON agent_traces(created_at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_decisions (
      decision_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_decisions_created ON agent_decisions(created_at)`);

  console.log('Migration 007-observability applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS agent_decisions');
  db.exec('DROP TABLE IF EXISTS agent_traces');
  db.exec('DROP TABLE IF EXISTS agent_metrics');
  console.log('Migration 007-observability rolled back');
};

export default { up, down };
