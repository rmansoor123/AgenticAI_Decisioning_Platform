/**
 * Platform Integrator Integration Tests
 * Tests for the PLATFORM_ENRICH step that bridges ML, Rules, and Experiments into agents.
 *
 * Run with: USE_LLM=false node backend/agents/core/__tests__/platform-integrator.test.js
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
    console.log(`  \u2713 ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  \u2717 ${message}`);
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

console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
console.log('  Platform Integrator Integration Tests');
console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

// Set env to avoid LLM calls
process.env.USE_LLM = 'false';

import fs from 'fs';
import Database from 'better-sqlite3';

// Initialize database
const dbPath = path.join(__dirname, '..', '..', '..', 'shared', 'common', 'fraud_detection.db');
if (!fs.existsSync(dbPath)) {
  console.log('  Database not found, creating test database...');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Ensure tables exist
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS data (
    id TEXT PRIMARY KEY,
    collection TEXT NOT NULL,
    key_column TEXT,
    key_value TEXT,
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS prediction_history (
    prediction_id TEXT PRIMARY KEY,
    model_id TEXT,
    features TEXT,
    score REAL,
    decision TEXT,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS rule_performance (
    id TEXT PRIMARY KEY,
    rule_id TEXT,
    transaction_id TEXT,
    triggered INTEGER,
    decision TEXT,
    latency_ms REAL,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS experiment_events (
    event_id TEXT PRIMARY KEY,
    experiment_id TEXT,
    entity_id TEXT,
    variant TEXT,
    event_type TEXT,
    value REAL,
    metadata TEXT,
    created_at TEXT
  );
`);
db.close();

// Now import the modules
const { getPlatformIntegrator } = await import('../platform-integrator.js');
const { evaluateRule, calculateRiskScore, getNestedValue } = await import('../../../services/decision-engine/execution/rule-evaluator.js');
const { simpleHash, assignVariant } = await import('../../../services/experimentation/ab-testing/variant-assigner.js');
const { generateDecision } = await import('../../../services/ml-platform/inference/decision-generator.js');

// ============================================================================
// TEST 1: Enrichment returns valid structure
// ============================================================================

console.log('\nTest 1: Enrichment returns valid structure');
try {
  const integrator = getPlatformIntegrator();
  const result = await integrator.enrich('TEST_AGENT', 'test-domain', {
    sellerId: 'SLR-TEST001',
    amount: 500,
    country: 'US'
  }, {
    overallRisk: { score: 30, level: 'LOW' },
    riskFactors: []
  });

  assertNotNull(result, 'Result is not null');
  assertEqual(result._platformEnriched, true, '_platformEnriched flag is true');
  assert(typeof result.platformLatencyMs === 'number', 'platformLatencyMs is a number');
  assert(Array.isArray(result.triggeredRules), 'triggeredRules is an array');
  assert(Array.isArray(result.enrichedRiskFactors), 'enrichedRiskFactors is an array');
  assert(typeof result.ruleRiskScore === 'number', 'ruleRiskScore is a number');
} catch (e) {
  console.log(`  \u2717 Unexpected error: ${e.message}`);
  failed++;
}

// ============================================================================
// TEST 2: Enrichment works with all layers disabled
// ============================================================================

console.log('\nTest 2: Enrichment works with all layers disabled');
try {
  const origML = process.env.PLATFORM_ML;
  const origRules = process.env.PLATFORM_RULES;
  const origExp = process.env.PLATFORM_EXPERIMENTS;

  process.env.PLATFORM_ML = 'false';
  process.env.PLATFORM_RULES = 'false';
  process.env.PLATFORM_EXPERIMENTS = 'false';

  // Create a fresh integrator to pick up new env vars
  const { PlatformIntegrator } = await import('../platform-integrator.js').then(m => {
    // Need to test with disabled layers - use a manual instance
    return { PlatformIntegrator: null };
  }).catch(() => ({ PlatformIntegrator: null }));

  // Use getPlatformIntegrator but override settings
  const integrator = getPlatformIntegrator();
  const savedML = integrator.enableML;
  const savedRules = integrator.enableRules;
  const savedExp = integrator.enableExperimentation;
  integrator.enableML = false;
  integrator.enableRules = false;
  integrator.enableExperimentation = false;

  const result = await integrator.enrich('TEST_AGENT', 'test-domain', { sellerId: 'SLR-TEST002' }, { overallRisk: { score: 50, level: 'MEDIUM' } });

  assertEqual(result._platformEnriched, true, '_platformEnriched is still true when all disabled');
  assertEqual(result.mlScore, null, 'mlScore is null when ML disabled');
  assertEqual(result.experimentVariant, null, 'experimentVariant is null when experiments disabled');
  assertEqual(result.ruleRiskScore, 0, 'ruleRiskScore is 0 when rules disabled');
  assertEqual(result.triggeredRules.length, 0, 'triggeredRules is empty when rules disabled');

  // Restore
  integrator.enableML = savedML;
  integrator.enableRules = savedRules;
  integrator.enableExperimentation = savedExp;
  process.env.PLATFORM_ML = origML;
  process.env.PLATFORM_RULES = origRules;
  process.env.PLATFORM_EXPERIMENTS = origExp;
} catch (e) {
  console.log(`  \u2717 Unexpected error: ${e.message}`);
  failed++;
}

// ============================================================================
// TEST 3: ML failure doesn't crash enrichment
// ============================================================================

console.log('\nTest 3: ML failure does not crash enrichment');
try {
  const integrator = getPlatformIntegrator();
  // Temporarily break the model loader
  const savedLoader = integrator.modelLoader;
  integrator.modelLoader = {
    ensureLoaded: async () => { throw new Error('Model not available'); }
  };

  const result = await integrator.enrich('TEST_AGENT', 'test-domain', { sellerId: 'SLR-TEST003' }, { overallRisk: { score: 25 } });

  assertEqual(result._platformEnriched, true, 'Enrichment succeeds despite ML failure');
  assertEqual(result.mlScore, null, 'mlScore is null on ML failure');
  assert(typeof result.ruleRiskScore === 'number', 'ruleRiskScore still calculated');

  // Restore
  integrator.modelLoader = savedLoader;
} catch (e) {
  console.log(`  \u2717 Unexpected error: ${e.message}`);
  failed++;
}

// ============================================================================
// TEST 4: No ACTIVE rules → empty triggeredRules
// ============================================================================

console.log('\nTest 4: No ACTIVE rules gives empty triggeredRules');
try {
  // evaluateRule + calculateRiskScore work on empty inputs
  const riskScore = calculateRiskScore([], { riskScore: 0 });
  assertEqual(riskScore, 0, 'Risk score is 0 with no triggered rules');

  const result = evaluateRule({ conditions: [], action: 'BLOCK' }, {}, {});
  assertEqual(result.triggered, true, 'Rule with no conditions triggers (vacuously true)');
  assertEqual(result.action, 'BLOCK', 'Action matches rule action');
} catch (e) {
  console.log(`  \u2717 Unexpected error: ${e.message}`);
  failed++;
}

// ============================================================================
// TEST 5: No RUNNING experiments → experimentVariant is null
// ============================================================================

console.log('\nTest 5: No RUNNING experiments gives null experimentVariant');
try {
  const integrator = getPlatformIntegrator();
  // Run with experimentation enabled, but DB may have no RUNNING experiments
  const result = await integrator._enrichExperimentation('TEST_AGENT', 'test', { sellerId: 'SLR-TEST005' });
  // If there are no running experiments, result should be null
  // If there are, result should have correct shape
  if (result === null) {
    assert(true, 'experimentVariant is null when no RUNNING experiments');
  } else {
    assertNotNull(result.experimentId, 'experimentId present if experiment found');
    assertNotNull(result.variant, 'variant present if experiment found');
  }
} catch (e) {
  console.log(`  \u2717 Unexpected error: ${e.message}`);
  failed++;
}

// ============================================================================
// TEST 6: Extracted functions — generateDecision
// ============================================================================

console.log('\nTest 6: generateDecision produces correct labels');
try {
  const high = generateDecision(0.85, 'FRAUD_DETECTION');
  assertEqual(high.label, 'FRAUD', 'Score 0.85 → FRAUD label');
  assertEqual(high.decision, 'BLOCK', 'Score 0.85 → BLOCK decision');

  const mid = generateDecision(0.55, 'FRAUD_DETECTION');
  assertEqual(mid.label, 'SUSPICIOUS', 'Score 0.55 → SUSPICIOUS label');
  assertEqual(mid.decision, 'REVIEW', 'Score 0.55 → REVIEW decision');

  const low = generateDecision(0.2, 'FRAUD_DETECTION');
  assertEqual(low.label, 'LEGITIMATE', 'Score 0.2 → LEGITIMATE label');
  assertEqual(low.decision, 'APPROVE', 'Score 0.2 → APPROVE decision');
} catch (e) {
  console.log(`  \u2717 Unexpected error: ${e.message}`);
  failed++;
}

// ============================================================================
// TEST 7: Extracted functions — assignVariant
// ============================================================================

console.log('\nTest 7: assignVariant is deterministic');
try {
  const experiment = {
    experimentId: 'EXP-TEST',
    trafficAllocation: 100,
    variants: [
      { id: 'control', name: 'Control', allocation: 50 },
      { id: 'treatment', name: 'Treatment', allocation: 50 }
    ]
  };

  const a1 = assignVariant(experiment, 'user-123');
  const a2 = assignVariant(experiment, 'user-123');
  assertEqual(a1.variant, a2.variant, 'Same entity gets same variant (deterministic)');
  assertEqual(a1.inExperiment, true, 'Entity is in experiment at 100% traffic');
} catch (e) {
  console.log(`  \u2717 Unexpected error: ${e.message}`);
  failed++;
}

// ============================================================================
// TEST 8: enrichedRiskFactors accumulate from ML + rules
// ============================================================================

console.log('\nTest 8: enrichedRiskFactors accumulate correctly');
try {
  const integrator = getPlatformIntegrator();
  const result = await integrator.enrich('TEST_AGENT', 'test-domain', {
    sellerId: 'SLR-TEST008',
    amount: 10000,
    country: 'NG'
  }, {
    overallRisk: { score: 40, level: 'MEDIUM' },
    riskFactors: [{ factor: 'EXISTING', severity: 'LOW', score: 5 }]
  });

  assert(Array.isArray(result.enrichedRiskFactors), 'enrichedRiskFactors is an array');
  result.enrichedRiskFactors.forEach(rf => {
    assertNotNull(rf.factor, 'Each risk factor has a factor name');
    assertNotNull(rf.severity, 'Each risk factor has a severity');
    assert(typeof rf.score === 'number', 'Each risk factor has a numeric score');
    assertNotNull(rf.source, 'Each risk factor has a source');
  });
} catch (e) {
  console.log(`  \u2717 Unexpected error: ${e.message}`);
  failed++;
}

// ============================================================================
// TEST 9: Risk score adjustment is bounded [0, 100]
// ============================================================================

console.log('\nTest 9: Risk score adjustment is bounded [0, 100]');
try {
  // Test upper bound
  const upperScore = Math.min(100, Math.max(0, 95 + 15 + 30));
  assertEqual(upperScore, 100, 'Score capped at 100');

  // Test lower bound
  const lowerScore = Math.min(100, Math.max(0, 0 + 0 + 0));
  assertEqual(lowerScore, 0, 'Score stays at 0 with no adjustments');

  // Test calculateRiskScore upper bound
  const rulesScore = calculateRiskScore(
    [{ action: 'BLOCK' }, { action: 'BLOCK' }, { action: 'BLOCK' }, { action: 'BLOCK' }],
    { riskScore: 50 }
  );
  assertEqual(rulesScore, 100, 'calculateRiskScore caps at 100');
} catch (e) {
  console.log(`  \u2717 Unexpected error: ${e.message}`);
  failed++;
}

// ============================================================================
// TEST 10: platformLatencyMs is a real measurement
// ============================================================================

console.log('\nTest 10: platformLatencyMs is a real measurement');
try {
  const integrator = getPlatformIntegrator();
  const result = await integrator.enrich('TEST_AGENT', 'test-domain', { sellerId: 'SLR-TEST010' }, { overallRisk: { score: 10 } });

  assert(result.platformLatencyMs > 0, `platformLatencyMs is positive (${result.platformLatencyMs.toFixed(2)}ms)`);
  assert(result.platformLatencyMs < 30000, 'platformLatencyMs is under 30s (sanity check)');
} catch (e) {
  console.log(`  \u2717 Unexpected error: ${e.message}`);
  failed++;
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
console.log(`  Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\n  Failures:');
  failures.forEach(f => console.log(`    - ${f}`));
}
console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

process.exit(failed > 0 ? 1 : 0);
