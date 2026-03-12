export const up = (db) => {
  // Track every prediction for confusion matrix + drift detection
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_history (
      prediction_id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      features TEXT,
      score REAL NOT NULL,
      decision TEXT,
      actual_label TEXT,
      feedback_source TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pred_model ON prediction_history(model_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pred_created ON prediction_history(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pred_label ON prediction_history(actual_label)`);

  // Track every rule trigger for real performance metrics
  db.exec(`
    CREATE TABLE IF NOT EXISTS rule_performance (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      transaction_id TEXT,
      triggered INTEGER NOT NULL,
      decision TEXT,
      actual_fraud INTEGER,
      latency_ms REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ruleperf_rule ON rule_performance(rule_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ruleperf_created ON rule_performance(created_at)`);

  // Persist experiment events for real results
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiment_events (
      event_id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      event_type TEXT NOT NULL,
      value REAL,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_expevt_experiment ON experiment_events(experiment_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_expevt_variant ON experiment_events(variant)`);

  // Data quality profiling results
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_profiles (
      profile_id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      table_name TEXT,
      total_rows INTEGER,
      null_counts TEXT,
      value_distributions TEXT,
      freshness_seconds REAL,
      completeness REAL,
      profiled_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dataprof_dataset ON data_profiles(dataset_id)`);

  // Model training run history
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_training_runs (
      run_id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      training_data_count INTEGER,
      validation_data_count INTEGER,
      epochs INTEGER,
      final_loss REAL,
      final_accuracy REAL,
      metrics TEXT,
      status TEXT DEFAULT 'RUNNING',
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trainrun_model ON model_training_runs(model_id)`);

  // Dead letter queue for failed ingestion
  db.exec(`
    CREATE TABLE IF NOT EXISTS dead_letter_queue (
      id TEXT PRIMARY KEY,
      pipeline TEXT NOT NULL,
      event_data TEXT NOT NULL,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dlq_pipeline ON dead_letter_queue(pipeline)`);

  console.log('Migration 011-platform-upgrade applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS prediction_history');
  db.exec('DROP TABLE IF EXISTS rule_performance');
  db.exec('DROP TABLE IF EXISTS experiment_events');
  db.exec('DROP TABLE IF EXISTS data_profiles');
  db.exec('DROP TABLE IF EXISTS model_training_runs');
  db.exec('DROP TABLE IF EXISTS dead_letter_queue');
  console.log('Migration 011-platform-upgrade rolled back');
};

export default { up, down };
