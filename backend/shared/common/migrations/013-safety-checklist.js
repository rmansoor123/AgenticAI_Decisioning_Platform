export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS safety_checklist (
      item_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_safety_checklist_group ON safety_checklist(json_extract(data, '$.groupOrder'))`);
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS safety_checklist');
};

export default { up, down };
