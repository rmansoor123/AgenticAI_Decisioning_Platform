export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_entries (
      knowledge_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_knowledge_created ON knowledge_entries(created_at)`);
  console.log('Migration 004-knowledge-base applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS knowledge_entries');
  console.log('Migration 004-knowledge-base rolled back');
};

export default { up, down };
