export const up = (db) => {
  const tables = [
    ['account_setups', 'setup_id'],
    ['item_setups', 'item_id'],
    ['pricing_records', 'pricing_id'],
    ['profile_updates', 'update_id'],
    ['returns', 'return_id'],
    ['agent_evaluations', 'evaluation_id'],
    ['agent_eval_history', 'history_id'],
    ['agent_calibration', 'calibration_id'],
    ['agent_costs', 'cost_id'],
    ['agent_episodes', 'episode_id'],
    ['reasoning_checkpoints', 'checkpoint_id']
  ];

  for (const [table, idCol] of tables) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        ${idCol} TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT
      )
    `);
  }
};

export const down = (db) => {
  const tables = [
    'account_setups', 'item_setups', 'pricing_records',
    'profile_updates', 'returns', 'agent_evaluations',
    'agent_eval_history', 'agent_calibration', 'agent_costs',
    'agent_episodes', 'reasoning_checkpoints'
  ];
  for (const t of tables) {
    db.exec(`DROP TABLE IF EXISTS ${t}`);
  }
};

export default { up, down };
