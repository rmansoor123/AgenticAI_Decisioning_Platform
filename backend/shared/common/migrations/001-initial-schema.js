/**
 * Initial database schema migration
 * Creates all tables for the Fraud Detection Platform
 */

export const up = (db) => {
  // Create sellers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sellers (
      seller_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sellers_created ON sellers(created_at)`);

  // Create transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      transaction_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at)`);

  // Create listings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      listing_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at)`);

  // Create payouts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS payouts (
      payout_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_payouts_created ON payouts(created_at)`);

  // Create ato_events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ato_events (
      event_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ato_events_created ON ato_events(created_at)`);

  // Create shipments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shipments (
      shipment_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shipments_created ON shipments(created_at)`);

  // Create ml_models table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ml_models (
      model_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ml_models_created ON ml_models(created_at)`);

  // Create rules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      rule_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rules_created ON rules(created_at)`);

  // Create experiments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiments (
      experiment_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_experiments_created ON experiments(created_at)`);

  // Create datasets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS datasets (
      dataset_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_datasets_created ON datasets(created_at)`);

  // Create metrics_history table (time-series data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_metrics_history_timestamp ON metrics_history(timestamp)`);

  // Create pipeline_runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      run_id TEXT PRIMARY KEY,
      pipeline_name TEXT NOT NULL,
      status TEXT NOT NULL,
      data TEXT NOT NULL,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON pipeline_runs(started_at)`);

  // Create alerts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      alert_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at)`);

  // Create investigations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS investigations (
      investigation_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_investigations_created ON investigations(created_at)`);

  // Create schema version tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Migration 001-initial-schema applied successfully');
};

export const down = (db) => {
  const tables = [
    'sellers', 'transactions', 'listings', 'payouts', 'ato_events',
    'shipments', 'ml_models', 'rules', 'experiments', 'datasets',
    'metrics_history', 'pipeline_runs', 'alerts', 'investigations',
    'schema_migrations'
  ];

  tables.forEach(table => {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  });

  console.log('Migration 001-initial-schema rolled back');
};

export default { up, down };
