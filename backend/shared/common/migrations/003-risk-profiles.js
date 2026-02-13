export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seller_risk_profiles (
      seller_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_risk_profiles_created ON seller_risk_profiles(created_at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS risk_events (
      event_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_risk_events_created ON risk_events(created_at)`);

  console.log('Migration 003-risk-profiles applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS risk_events');
  db.exec('DROP TABLE IF EXISTS seller_risk_profiles');
  console.log('Migration 003-risk-profiles rolled back');
};

export default { up, down };
