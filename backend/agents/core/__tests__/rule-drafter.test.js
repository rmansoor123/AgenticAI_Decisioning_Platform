/**
 * Unit test: verifies rule drafting from feature clusters.
 * Run with: node backend/agents/core/__tests__/rule-drafter.test.js
 */

import { getRuleDrafter, RuleDrafter } from '../rule-drafter.js';

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  // ── Test 1: Singleton pattern ──
  console.log('\nTest 1: Singleton pattern');
  const drafter1 = getRuleDrafter();
  const drafter2 = getRuleDrafter();
  assert(drafter1 === drafter2, 'getRuleDrafter() returns same instance');

  // ── Test 2: draftRuleFromCluster with valid cluster returns rule with all required fields ──
  console.log('\nTest 2: draftRuleFromCluster with valid cluster');
  const validCluster = {
    features: [
      { field: 'amount', values: [3000, 5000, 7000, 4200], operator: 'GT' },
      { field: 'seller.accountAge', values: [5, 12, 8, 3], operator: 'LT' },
      { field: 'geoLocation.country', values: ['CN', 'CN', 'NG', 'CN'], operator: 'IN' }
    ],
    checkpoint: 'transaction',
    severity: 'HIGH',
    action: 'REVIEW',
    reason: 'High-value cross-border transactions from new accounts'
  };

  const rule = drafter1.draftRuleFromCluster(validCluster);
  assert(rule !== null, 'Rule is not null');
  assert(typeof rule.ruleId === 'string', 'ruleId is a string');
  assert(typeof rule.name === 'string', 'name is a string');
  assert(typeof rule.description === 'string', 'description is a string');
  assert(rule.checkpoint === 'transaction', 'checkpoint matches');
  assert(typeof rule.type === 'string', 'type is a string');
  assert(rule.severity === 'HIGH', 'severity matches');
  assert(rule.status === 'TESTING', 'status is TESTING');
  assert(rule.priority === 50, 'priority is 50');
  assert(rule.action === 'REVIEW', 'action matches');
  assert(Array.isArray(rule.conditions), 'conditions is an array');
  assert(Array.isArray(rule.tags), 'tags is an array');
  assert(rule.tags.includes('auto-generated'), 'tags includes auto-generated');
  assert(rule.tags.includes('policy-evolution'), 'tags includes policy-evolution');
  assert(rule.createdBy === 'POLICY_EVOLUTION', 'createdBy is POLICY_EVOLUTION');
  assert(typeof rule.createdAt === 'string', 'createdAt is a string');
  assert(typeof rule.performance === 'object', 'performance is an object');
  assert(rule.performance.triggered === 0, 'performance.triggered is 0');
  assert(rule.performance.truePositives === 0, 'performance.truePositives is 0');
  assert(rule.performance.falsePositives === 0, 'performance.falsePositives is 0');
  assert(rule.performance.catchRate === 0, 'performance.catchRate is 0');
  assert(rule.performance.falsePositiveRate === 0, 'performance.falsePositiveRate is 0');

  // ── Test 3: Rule has correct ruleId format ──
  console.log('\nTest 3: Rule has correct ruleId format');
  assert(rule.ruleId.startsWith('RULE-PE-'), `ruleId starts with RULE-PE- (got ${rule.ruleId})`);
  const parts = rule.ruleId.split('-');
  assert(parts.length >= 4, `ruleId has at least 4 parts separated by dashes (got ${parts.length})`);

  // ── Test 4: Rule has status=TESTING and createdBy=POLICY_EVOLUTION ──
  console.log('\nTest 4: Rule has status=TESTING and createdBy=POLICY_EVOLUTION');
  assert(rule.status === 'TESTING', 'status is TESTING');
  assert(rule.createdBy === 'POLICY_EVOLUTION', 'createdBy is POLICY_EVOLUTION');

  // ── Test 5: GT operator uses minimum of values as threshold ──
  console.log('\nTest 5: GT operator uses minimum of values');
  const gtCondition = rule.conditions.find(c => c.field === 'amount');
  assert(gtCondition !== undefined, 'amount condition exists');
  assert(gtCondition.operator === 'GT', 'amount operator is GT');
  assert(gtCondition.value === 3000, `GT value is minimum: 3000 (got ${gtCondition.value})`);

  // ── Test 6: LT operator uses maximum of values as threshold ──
  console.log('\nTest 6: LT operator uses maximum of values');
  const ltCondition = rule.conditions.find(c => c.field === 'seller.accountAge');
  assert(ltCondition !== undefined, 'seller.accountAge condition exists');
  assert(ltCondition.operator === 'LT', 'seller.accountAge operator is LT');
  assert(ltCondition.value === 12, `LT value is maximum: 12 (got ${ltCondition.value})`);

  // ── Test 7: IN operator uses unique values as array ──
  console.log('\nTest 7: IN operator uses unique values');
  const inCondition = rule.conditions.find(c => c.field === 'geoLocation.country');
  assert(inCondition !== undefined, 'geoLocation.country condition exists');
  assert(inCondition.operator === 'IN', 'geoLocation.country operator is IN');
  assert(Array.isArray(inCondition.value), 'IN value is an array');
  assert(inCondition.value.length === 2, `IN value has 2 unique entries (got ${inCondition.value.length})`);
  assert(inCondition.value.includes('CN'), 'IN value includes CN');
  assert(inCondition.value.includes('NG'), 'IN value includes NG');

  // ── Test 8: EQ operator uses mode (most common value) ──
  console.log('\nTest 8: EQ operator uses mode');
  const eqCluster = {
    features: [
      { field: 'paymentMethod', values: ['card', 'card', 'wire', 'card', 'crypto'], operator: 'EQ' }
    ],
    checkpoint: 'transaction',
    severity: 'MEDIUM',
    action: 'FLAG',
    reason: 'Common payment method pattern'
  };
  const eqRule = drafter1.draftRuleFromCluster(eqCluster);
  assert(eqRule !== null, 'EQ rule is not null');
  const eqCondition = eqRule.conditions.find(c => c.field === 'paymentMethod');
  assert(eqCondition !== undefined, 'paymentMethod condition exists');
  assert(eqCondition.operator === 'EQ', 'paymentMethod operator is EQ');
  assert(eqCondition.value === 'card', `EQ value is mode: card (got ${eqCondition.value})`);

  // ── Test 9: Multiple conditions generated from multiple features ──
  console.log('\nTest 9: Multiple conditions from multiple features');
  assert(rule.conditions.length === 3, `3 conditions from 3 features (got ${rule.conditions.length})`);
  const fields = rule.conditions.map(c => c.field);
  assert(fields.includes('amount'), 'conditions include amount');
  assert(fields.includes('seller.accountAge'), 'conditions include seller.accountAge');
  assert(fields.includes('geoLocation.country'), 'conditions include geoLocation.country');

  // ── Test 10: Empty features returns null ──
  console.log('\nTest 10: Empty features returns null');
  const emptyResult = drafter1.draftRuleFromCluster({
    features: [],
    checkpoint: 'transaction',
    severity: 'LOW',
    action: 'FLAG',
    reason: 'empty'
  });
  assert(emptyResult === null, 'Empty features returns null');

  // ── Test 11: Missing checkpoint returns null ──
  console.log('\nTest 11: Missing checkpoint returns null');
  const noCheckpoint = drafter1.draftRuleFromCluster({
    features: [{ field: 'amount', values: [100], operator: 'GT' }],
    severity: 'LOW',
    action: 'FLAG',
    reason: 'no checkpoint'
  });
  assert(noCheckpoint === null, 'Missing checkpoint returns null');

  // ── Test 12: Single feature produces valid rule with 1 condition ──
  console.log('\nTest 12: Single feature produces valid rule');
  const singleCluster = {
    features: [
      { field: 'riskScore', values: [80, 90, 85], operator: 'GTE' }
    ],
    checkpoint: 'onboarding',
    severity: 'CRITICAL',
    action: 'BLOCK',
    reason: 'Very high risk scores'
  };
  const singleRule = drafter1.draftRuleFromCluster(singleCluster);
  assert(singleRule !== null, 'Single feature produces a rule');
  assert(singleRule.conditions.length === 1, `1 condition (got ${singleRule.conditions.length})`);
  assert(singleRule.conditions[0].field === 'riskScore', 'Condition field is riskScore');
  assert(singleRule.conditions[0].operator === 'GTE', 'Condition operator is GTE');
  assert(singleRule.conditions[0].value === 80, `GTE value is minimum: 80 (got ${singleRule.conditions[0].value})`);

  // ── Test 13: draftModification clones rule with adjusted conditions ──
  console.log('\nTest 13: draftModification clones rule with adjusted conditions');
  const modification = {
    relaxThresholds: [{ field: 'amount', newValue: 2500 }],
    addExceptions: [{ field: 'seller.isVerified', operator: 'EQ', value: false }]
  };
  const modified = drafter1.draftModification(rule, modification);
  assert(modified !== null, 'Modified rule is not null');

  // Check threshold was relaxed
  const modAmountCond = modified.conditions.find(c => c.field === 'amount');
  assert(modAmountCond !== undefined, 'amount condition exists in modified rule');
  assert(modAmountCond.value === 2500, `amount threshold relaxed to 2500 (got ${modAmountCond.value})`);

  // Check exception was added
  const exceptionCond = modified.conditions.find(c => c.field === 'seller.isVerified');
  assert(exceptionCond !== undefined, 'exception condition added');
  assert(exceptionCond.operator === 'EQ', 'exception operator is EQ');
  assert(exceptionCond.value === false, 'exception value is false');

  // Check total conditions: 3 original + 1 exception = 4
  assert(modified.conditions.length === 4, `4 conditions total (got ${modified.conditions.length})`);

  // ── Test 14: draftModification sets clonedFrom to original ruleId ──
  console.log('\nTest 14: draftModification sets clonedFrom');
  assert(modified.clonedFrom === rule.ruleId, `clonedFrom is ${rule.ruleId} (got ${modified.clonedFrom})`);

  // ── Test 15: draftModification sets status to TESTING ──
  console.log('\nTest 15: draftModification sets status to TESTING');
  assert(modified.status === 'TESTING', `status is TESTING (got ${modified.status})`);
  assert(modified.ruleId !== rule.ruleId, 'Modified rule has a new ruleId');
  assert(modified.ruleId.startsWith('RULE-PE-'), 'Modified ruleId starts with RULE-PE-');

  // ── Test 16: getStats returns correct counts ──
  console.log('\nTest 16: getStats returns correct counts');
  const stats = drafter1.getStats();
  // We drafted: validCluster (3 conditions), eqCluster (1 condition),
  //             singleCluster (1 condition), modification (4 conditions)
  assert(stats.rulesProposed === 4, `rulesProposed is 4 (got ${stats.rulesProposed})`);
  assert(stats.rulesWithSingleCondition === 2, `rulesWithSingleCondition is 2 (got ${stats.rulesWithSingleCondition})`);
  assert(stats.rulesWithMultipleConditions === 2, `rulesWithMultipleConditions is 2 (got ${stats.rulesWithMultipleConditions})`);

  // Verify original rule conditions were not mutated by modification
  const origAmountCond = rule.conditions.find(c => c.field === 'amount');
  assert(origAmountCond.value === 3000, `Original rule amount not mutated (got ${origAmountCond.value})`);

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
