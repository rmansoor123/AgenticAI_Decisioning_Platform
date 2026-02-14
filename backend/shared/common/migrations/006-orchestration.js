export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON workflow_checkpoints(created_at)`);
  console.log('Migration 006-orchestration applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS workflow_checkpoints');
  console.log('Migration 006-orchestration rolled back');
};

export default { up, down };
