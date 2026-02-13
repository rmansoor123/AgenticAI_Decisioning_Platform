export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_short_term_memory (
      memory_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stm_created ON agent_short_term_memory(created_at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_long_term_memory (
      memory_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ltm_created ON agent_long_term_memory(created_at)`);

  console.log('Migration 005-agent-memory applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS agent_long_term_memory');
  db.exec('DROP TABLE IF EXISTS agent_short_term_memory');
  console.log('Migration 005-agent-memory rolled back');
};

export default { up, down };
