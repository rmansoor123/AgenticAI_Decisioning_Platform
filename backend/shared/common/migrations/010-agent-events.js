export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_events (
      event_id TEXT PRIMARY KEY,
      correlation_id TEXT,
      event_type TEXT,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_events_correlation ON agent_events(correlation_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(event_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_events_created ON agent_events(created_at)`);

  console.log('Migration 010-agent-events applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS agent_events');
  console.log('Migration 010-agent-events rolled back');
};

export default { up, down };
