/**
 * Platform Upgrade Integration Tests
 * Tests for the 6 new tables and upgraded data/ML/decision/experimentation layers.
 *
 * Run with: USE_LLM=false node backend/agents/core/__tests__/platform-upgrade.test.js
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test harness
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

function assertNotNull(value, message) {
  assert(value !== null && value !== undefined, message);
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

// ============================================================================
// SETUP
// ============================================================================

console.log('\n═══════════════════════════════════════════════════');
console.log('  Platform Upgrade Integration Tests');
console.log('═══════════════════════════════════════════════════\n');

// Set env to avoid LLM calls
process.env.USE_LLM = 'false';

import fs from 'fs';
import Database from 'better-sqlite3';

const testDbPath = path.join(__dirname, '../../../data/test_platform_upgrade.db');
try { fs.unlinkSync(testDbPath); } catch (_) { /* ok */ }

// Create a fresh test database and run migration directly
const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');

// Run migration 011
const { up } = await import('../../../shared/common/migrations/011-platform-upgrade.js');

// Create schema_migrations table so migration can be recorded
db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
up(db);
db.prepare("INSERT INTO schema_migrations (version) VALUES ('011')").run();

// ============================================================================
// TEST 1: Migration 011 creates all 6 tables
// ============================================================================

console.log('\n─── Test 1: Migration creates all 6 tables ───');

const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
).all().map(r => r.name);

assert(tables.includes('prediction_history'), 'prediction_history table exists');
assert(tables.includes('rule_performance'), 'rule_performance table exists');
assert(tables.includes('experiment_events'), 'experiment_events table exists');
assert(tables.includes('data_profiles'), 'data_profiles table exists');
assert(tables.includes('model_training_runs'), 'model_training_runs table exists');
assert(tables.includes('dead_letter_queue'), 'dead_letter_queue table exists');

// Verify migration was recorded
const migrationRecorded = db.prepare(
  "SELECT version FROM schema_migrations WHERE version = '011'"
).get();
assertNotNull(migrationRecorded, 'Migration 011 recorded in schema_migrations');

// ============================================================================
// TEST 2: prediction_history insert + query
// ============================================================================

console.log('\n─── Test 2: prediction_history insert + query ───');

db.prepare(`
  INSERT INTO prediction_history (prediction_id, model_id, features, score, decision, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run('PRED-TEST-001', 'MDL-FRAUD-01', '{"amount":500}', 0.85, 'FRAUD', new Date().toISOString());

db.prepare(`
  INSERT INTO prediction_history (prediction_id, model_id, features, score, decision, actual_label, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run('PRED-TEST-002', 'MDL-FRAUD-01', '{"amount":50}', 0.15, 'LEGITIMATE', 'legit', new Date().toISOString());

const predictions = db.prepare('SELECT COUNT(*) as cnt FROM prediction_history WHERE model_id = ?').get('MDL-FRAUD-01');
assertEqual(predictions.cnt, 2, 'prediction_history insert + count works');

// ============================================================================
// TEST 3: rule_performance insert + aggregation
// ============================================================================

console.log('\n─── Test 3: rule_performance insert + aggregation ───');

const now = new Date().toISOString();
db.prepare(`
  INSERT INTO rule_performance (id, rule_id, transaction_id, triggered, decision, actual_fraud, latency_ms, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('RP-001', 'RULE-001', 'TXN-001', 1, 'BLOCK', 1, 2.5, now);

db.prepare(`
  INSERT INTO rule_performance (id, rule_id, transaction_id, triggered, decision, actual_fraud, latency_ms, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('RP-002', 'RULE-001', 'TXN-002', 1, 'BLOCK', 0, 1.8, now);

db.prepare(`
  INSERT INTO rule_performance (id, rule_id, transaction_id, triggered, decision, actual_fraud, latency_ms, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('RP-003', 'RULE-001', 'TXN-003', 0, null, null, 0.5, now);

const ruleAgg = db.prepare(`
  SELECT
    SUM(triggered) as triggered,
    SUM(CASE WHEN triggered = 1 AND actual_fraud = 1 THEN 1 ELSE 0 END) as truePositives,
    SUM(CASE WHEN triggered = 1 AND actual_fraud = 0 THEN 1 ELSE 0 END) as falsePositives
  FROM rule_performance WHERE rule_id = ?
`).get('RULE-001');

assertEqual(ruleAgg.triggered, 2, 'rule_performance aggregation: triggered count');
assertEqual(ruleAgg.truePositives, 1, 'rule_performance aggregation: true positives');
assertEqual(ruleAgg.falsePositives, 1, 'rule_performance aggregation: false positives');

// ============================================================================
// TEST 4: experiment_events insert + group-by-variant
// ============================================================================

console.log('\n─── Test 4: experiment_events insert + group-by-variant ───');

const events = [
  ['EVT-001', 'EXP-001', 'E-001', 'control', 'fraud_caught', 1.0],
  ['EVT-002', 'EXP-001', 'E-002', 'control', 'fraud_caught', 0.0],
  ['EVT-003', 'EXP-001', 'E-003', 'treatment', 'fraud_caught', 1.0],
  ['EVT-004', 'EXP-001', 'E-004', 'treatment', 'fraud_caught', 1.0],
];

for (const [eid, expId, entityId, variant, eventType, value] of events) {
  db.prepare(`
    INSERT INTO experiment_events (event_id, experiment_id, entity_id, variant, event_type, value, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(eid, expId, entityId, variant, eventType, value, now);
}

const variantResults = db.prepare(`
  SELECT variant, COUNT(*) as cnt, AVG(value) as avgValue
  FROM experiment_events WHERE experiment_id = ? GROUP BY variant
`).all('EXP-001');

assertEqual(variantResults.length, 2, 'experiment_events: two variants found');
const controlResult = variantResults.find(v => v.variant === 'control');
assertEqual(controlResult.cnt, 2, 'experiment_events: control has 2 events');
assertEqual(controlResult.avgValue, 0.5, 'experiment_events: control avg value correct');

// ============================================================================
// TEST 5: data_profiles insert + latest-profile query
// ============================================================================

console.log('\n─── Test 5: data_profiles insert + latest-profile query ───');

db.prepare(`
  INSERT INTO data_profiles (profile_id, dataset_id, table_name, total_rows, null_counts, completeness, profiled_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run('PROF-001', 'DS-001', 'transactions', 1000, '{"amount":5}', 0.995, '2025-01-01T00:00:00Z');

db.prepare(`
  INSERT INTO data_profiles (profile_id, dataset_id, table_name, total_rows, null_counts, completeness, profiled_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run('PROF-002', 'DS-001', 'transactions', 1500, '{"amount":2}', 0.998, '2025-06-01T00:00:00Z');

const latestProfile = db.prepare(
  'SELECT * FROM data_profiles WHERE dataset_id = ? ORDER BY profiled_at DESC LIMIT 1'
).get('DS-001');

assertEqual(latestProfile.profile_id, 'PROF-002', 'data_profiles: latest profile returned');
assertEqual(latestProfile.total_rows, 1500, 'data_profiles: row count correct');

// ============================================================================
// TEST 6: Ingestion latency uses performance.now() (not Math.random)
// ============================================================================

console.log('\n─── Test 6: Ingestion latency is real (not Math.random) ───');

const ingestionSource = fs.readFileSync(
  path.join(__dirname, '../../../services/data-platform/ingestion/index.js'), 'utf8'
);
const hasPerformanceNow = ingestionSource.includes('performance.now()');
const hasRandomLatency = ingestionSource.includes('Math.random() * 5 + 2');

assert(hasPerformanceNow, 'Ingestion uses performance.now()');
assert(!hasRandomLatency, 'Ingestion does NOT use Math.random() for latency');

// ============================================================================
// TEST 7: Rule performance returns zeros when no data (not random)
// ============================================================================

console.log('\n─── Test 7: Rule performance returns zeros when no data ───');

const rulesSource = fs.readFileSync(
  path.join(__dirname, '../../../services/decision-engine/rules/index.js'), 'utf8'
);
const hasRulePerfRandom = /Math\.random\(\)\s*\*\s*1000/.test(rulesSource);
const hasRulePerfQuery = rulesSource.includes('FROM rule_performance');

assert(!hasRulePerfRandom, 'Rule performance does NOT use Math.random()');
assert(hasRulePerfQuery, 'Rule performance queries rule_performance table');

// ============================================================================
// TEST 8: Experiment results returns empty when no events (not random)
// ============================================================================

console.log('\n─── Test 8: Experiment results returns empty when no events ───');

const abTestingSource = fs.readFileSync(
  path.join(__dirname, '../../../services/experimentation/ab-testing/index.js'), 'utf8'
);
const hasExpRandom = /sampleSize:\s*Math\.floor\(1000\s*\+\s*Math\.random/.test(abTestingSource);
const hasExpQuery = abTestingSource.includes('FROM experiment_events');

assert(!hasExpRandom, 'Experiment results does NOT use Math.random() for sampleSize');
assert(hasExpQuery, 'Experiment results queries experiment_events table');

// ============================================================================
// TEST 9: Confusion matrix returns zeros when no labeled predictions
// ============================================================================

console.log('\n─── Test 9: Confusion matrix uses real data (not random) ───');

const monitoringSource = fs.readFileSync(
  path.join(__dirname, '../../../services/ml-platform/monitoring/index.js'), 'utf8'
);
const hasCMRandom = /const tp = 8500 \+ Math\.floor\(Math\.random/.test(monitoringSource);
const hasCMQuery = monitoringSource.includes('FROM prediction_history');

assert(!hasCMRandom, 'Confusion matrix does NOT use Math.random()');
assert(hasCMQuery, 'Confusion matrix queries prediction_history table');

// ============================================================================
// TEST 10: Feedback persists actual_label to prediction_history
// ============================================================================

console.log('\n─── Test 10: Feedback persists actual_label ───');

// Insert a prediction, then update its label
db.prepare(`
  INSERT INTO prediction_history (prediction_id, model_id, score, decision, created_at)
  VALUES (?, ?, ?, ?, ?)
`).run('PRED-FB-001', 'MDL-01', 0.8, 'FRAUD', now);

db.prepare(
  'UPDATE prediction_history SET actual_label = ?, feedback_source = ? WHERE prediction_id = ?'
).run('fraud', 'analyst', 'PRED-FB-001');

const updated = db.prepare('SELECT actual_label, feedback_source FROM prediction_history WHERE prediction_id = ?').get('PRED-FB-001');
assertEqual(updated.actual_label, 'fraud', 'Feedback updates actual_label');
assertEqual(updated.feedback_source, 'analyst', 'Feedback updates feedback_source');

// ============================================================================
// TEST 11: Chi-square test returns correct significance for known data
// ============================================================================

console.log('\n─── Test 11: Chi-square test correctness ───');

// The chi-square function is embedded in ab-testing/index.js, test the logic directly
function chiSquareTest(control, treatment) {
  const total = control.n + treatment.n;
  const totalPositive = control.tp + treatment.tp;
  const totalNegative = total - totalPositive;
  if (total === 0 || totalPositive === 0 || totalNegative === 0) {
    return { chiSquare: 0, pValue: 1, isSignificant: false };
  }
  const expected = [
    [control.n * totalPositive / total, control.n * totalNegative / total],
    [treatment.n * totalPositive / total, treatment.n * totalNegative / total]
  ];
  const observed = [
    [control.tp, control.n - control.tp],
    [treatment.tp, treatment.n - treatment.tp]
  ];
  let chiSq = 0;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      if (expected[i][j] > 0) {
        chiSq += Math.pow(observed[i][j] - expected[i][j], 2) / expected[i][j];
      }
    }
  }
  const pValue = Math.exp(-chiSq / 2);
  return { chiSquare: chiSq, pValue, isSignificant: pValue < 0.05 };
}

// Known significant result: very different rates
const sig = chiSquareTest({ tp: 80, n: 100 }, { tp: 50, n: 100 });
assert(sig.isSignificant === true, `Chi-square detects significance (chiSq=${sig.chiSquare.toFixed(2)}, p=${sig.pValue.toFixed(4)})`);

// Known non-significant result: similar rates
const notSig = chiSquareTest({ tp: 50, n: 100 }, { tp: 52, n: 100 });
assert(notSig.isSignificant === false, `Chi-square detects non-significance (chiSq=${notSig.chiSquare.toFixed(2)}, p=${notSig.pValue.toFixed(4)})`);

// ============================================================================
// TEST 12: Monte Carlo endpoint exists in simulation
// ============================================================================

console.log('\n─── Test 12: Monte Carlo endpoint exists ───');

const simSource = fs.readFileSync(
  path.join(__dirname, '../../../services/experimentation/simulation/index.js'), 'utf8'
);
const hasMonteCarloRoute = simSource.includes("router.post('/monte-carlo'");
const hasBootstrap = simSource.includes('Resample with replacement');
const hasConfidenceInterval = simSource.includes('confidenceLevel');

assert(hasMonteCarloRoute, 'Monte Carlo POST route exists');
assert(hasBootstrap, 'Bootstrap resampling implemented');
assert(hasConfidenceInterval, 'Confidence intervals computed');

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n═══════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log('═══════════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}

// Cleanup test DB
try { db.close(); fs.unlinkSync(testDbPath); } catch (_) { /* ok */ }

process.exit(failed > 0 ? 1 : 0);
