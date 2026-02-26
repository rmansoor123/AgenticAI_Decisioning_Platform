export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_feedback (
      feedback_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feedback_created ON agent_feedback(created_at)`);
  console.log('Migration 009-agent-feedback applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS agent_feedback');
  console.log('Migration 009-agent-feedback rolled back');
};

export default { up, down };
