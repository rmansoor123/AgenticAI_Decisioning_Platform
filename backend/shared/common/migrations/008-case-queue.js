export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      case_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cases_created ON cases(created_at)`);
  console.log('Migration 008-case-queue applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS cases');
  console.log('Migration 008-case-queue rolled back');
};

export default { up, down };
