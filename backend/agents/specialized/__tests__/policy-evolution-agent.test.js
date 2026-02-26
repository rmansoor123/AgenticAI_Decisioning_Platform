/**
 * Policy Evolution Agent — Standalone Test Suite
 *
 * Tests the PolicyEvolutionAgent's constructor, tools, scan input building,
 * rule pipeline lifecycle, and singleton pattern.
 *
 * Run: node backend/agents/specialized/__tests__/policy-evolution-agent.test.js
 */

import { PolicyEvolutionAgent, getPolicyEvolutionAgent } from '../policy-evolution-agent.js';
import { db_ops } from '../../../shared/common/database.js';

// ── Test Harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  const match = actual === expected;
  if (match) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    failures.push(`${message} — expected "${expected}", got "${actual}"`);
    console.log(`  FAIL: ${message} — expected "${expected}", got "${actual}"`);
  }
}

function assertIncludes(arr, value, message) {
  const has = Array.isArray(arr) && arr.includes(value);
  if (has) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    failures.push(`${message} — "${value}" not found in [${arr}]`);
    console.log(`  FAIL: ${message} — "${value}" not found in [${arr}]`);
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

// Seed some test data into in-memory db
function seedTestData() {
  // Seed transactions
  db_ops.insert('transactions', 'transaction_id', 'TXN-001', {
    transactionId: 'TXN-001',
    sellerId: 'S-001',
    amount: 7500,
    country: 'NG',
    category: 'ELECTRONICS',
    riskScore: 75,
    decision: 'APPROVED',
    accountAge: 10
  });

  db_ops.insert('transactions', 'transaction_id', 'TXN-002', {
    transactionId: 'TXN-002',
    sellerId: 'S-002',
    amount: 50,
    country: 'US',
    category: 'FASHION',
    riskScore: 15,
    decision: 'BLOCKED',
    accountAge: 365
  });

  db_ops.insert('transactions', 'transaction_id', 'TXN-003', {
    transactionId: 'TXN-003',
    sellerId: 'S-003',
    amount: 6000,
    country: 'NG',
    category: 'ELECTRONICS',
    riskScore: 80,
    decision: 'APPROVED',
    accountAge: 5
  });

  db_ops.insert('transactions', 'transaction_id', 'TXN-004', {
    transactionId: 'TXN-004',
    sellerId: 'S-004',
    amount: 100,
    country: 'US',
    category: 'BOOKS',
    riskScore: 10,
    decision: 'REVIEW',
    accountAge: 500
  });

  db_ops.insert('transactions', 'transaction_id', 'TXN-005', {
    transactionId: 'TXN-005',
    sellerId: 'S-005',
    amount: 300,
    country: 'UK',
    category: 'DIGITAL_GOODS',
    riskScore: 40,
    decision: 'APPROVED',
    accountAge: 90
  });

  // Seed a rule
  db_ops.insert('rules', 'rule_id', 'RULE-TEST-001', {
    ruleId: 'RULE-TEST-001',
    name: 'Test Rule High Amount',
    status: 'ACTIVE',
    checkpoint: 'transaction',
    type: 'threshold',
    conditions: [{ field: 'amount', operator: 'GT', value: 5000 }],
    action: 'REVIEW',
    performance: {
      triggered: 100,
      truePositives: 60,
      falsePositives: 40,
      catchRate: 0.12,
      falsePositiveRate: 0.40
    }
  });

  db_ops.insert('rules', 'rule_id', 'RULE-TEST-002', {
    ruleId: 'RULE-TEST-002',
    name: 'Test Rule Low FP',
    status: 'ACTIVE',
    checkpoint: 'transaction',
    type: 'pattern',
    conditions: [{ field: 'country', operator: 'IN', value: ['NG', 'RO'] }],
    action: 'BLOCK',
    performance: {
      triggered: 50,
      truePositives: 45,
      falsePositives: 5,
      catchRate: 0.08,
      falsePositiveRate: 0.10
    }
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== Policy Evolution Agent — Test Suite ===\n');

  seedTestData();

  // Get instance via singleton
  const agent = getPolicyEvolutionAgent();

  // -------------------------------------------------------------------
  // 1. Constructor properties
  // -------------------------------------------------------------------
  console.log('\n--- Constructor Properties ---');

  assertEqual(agent.agentId, 'POLICY_EVOLUTION', 'agentId is POLICY_EVOLUTION');
  assertEqual(agent.name, 'Policy Evolution Agent', 'name is Policy Evolution Agent');
  assertEqual(agent.role, 'policy_analyst', 'role is policy_analyst');

  // 2. Capabilities
  assert(agent.capabilities.length === 5, 'has 5 capabilities');
  assertIncludes(agent.capabilities, 'rule_creation', 'has rule_creation capability');
  assertIncludes(agent.capabilities, 'gap_detection', 'has gap_detection capability');
  assertIncludes(agent.capabilities, 'friction_reduction', 'has friction_reduction capability');
  assertIncludes(agent.capabilities, 'rule_lifecycle_management', 'has rule_lifecycle_management capability');
  assertIncludes(agent.capabilities, 'simulation_analysis', 'has simulation_analysis capability');

  // 3. Scan interval and acceleration threshold
  assertEqual(agent.scanIntervalMs, 1800000, 'scanIntervalMs is 1800000 (30 min)');
  assertEqual(agent.eventAccelerationThreshold, 5, 'eventAccelerationThreshold is 5');

  // 4. Subscribed topics
  console.log('\n--- Subscribed Topics ---');
  assertEqual(agent.subscribedTopics.length, 4, 'has 4 subscribed topics');
  assertIncludes(agent.subscribedTopics, 'decision:made', 'subscribed to decision:made');
  assertIncludes(agent.subscribedTopics, 'agent:outcome:received', 'subscribed to agent:outcome:received');
  assertIncludes(agent.subscribedTopics, 'case:resolved', 'subscribed to case:resolved');
  assertIncludes(agent.subscribedTopics, 'rule:triggered', 'subscribed to rule:triggered');

  // 5. 10 tools registered
  console.log('\n--- Tool Registration ---');
  assertEqual(agent.tools.size, 10, 'has 10 tools registered');

  const expectedTools = [
    'get_false_negatives',
    'get_false_positives',
    'get_rule_performance',
    'cluster_features',
    'draft_rule',
    'simulate_rule',
    'deploy_shadow',
    'check_shadow_results',
    'promote_rule',
    'deprecate_rule'
  ];
  for (const toolName of expectedTools) {
    assert(agent.tools.has(toolName), `tool "${toolName}" is registered`);
  }

  // 6. rulePipeline starts empty
  console.log('\n--- Internal State ---');
  assert(agent.rulePipeline instanceof Map, 'rulePipeline is a Map');
  assertEqual(agent.rulePipeline.size, 0, 'rulePipeline starts empty');

  // 7. Singleton pattern
  const agent2 = getPolicyEvolutionAgent();
  assert(agent === agent2, 'getPolicyEvolutionAgent returns same instance (singleton)');

  // 8. Component instances
  assert(agent.selfCorrection !== null && agent.selfCorrection !== undefined, 'has selfCorrection instance');
  assert(agent.ruleDrafter !== null && agent.ruleDrafter !== undefined, 'has ruleDrafter instance');
  assert(agent.calibrator !== null && agent.calibrator !== undefined, 'has calibrator instance');
  assert(agent.knowledgeBase !== null && agent.knowledgeBase !== undefined, 'has knowledgeBase instance');

  // -------------------------------------------------------------------
  // 9. _buildScanInput categorization
  // -------------------------------------------------------------------
  console.log('\n--- _buildScanInput ---');

  // Manually push events into eventBuffer
  agent.eventBuffer = [
    { type: 'agent:outcome:received', data: { outcome: 'fraud', decision: 'APPROVED' } },
    { type: 'agent:outcome:received', data: { outcome: 'legitimate', decision: 'BLOCKED' } },
    { type: 'rule:triggered', data: { ruleId: 'RULE-001' } },
    { type: 'decision:made', data: { decision: 'APPROVE', sellerId: 'S-100' } },
    { type: 'agent:outcome:received', data: { outcome: 'chargeback', decision: 'APPROVE' } }
  ];

  const scanInput = agent._buildScanInput();
  assertEqual(scanInput.totalEvents, 5, '_buildScanInput totalEvents is 5');
  assertEqual(scanInput.falseNegatives.length, 2, '_buildScanInput finds 2 false negatives');
  assertEqual(scanInput.falsePositives.length, 1, '_buildScanInput finds 1 false positive');
  assertEqual(scanInput.ruleEvents.length, 1, '_buildScanInput finds 1 rule event');
  assert(scanInput.scanTimestamp !== undefined, '_buildScanInput includes scanTimestamp');

  // Reset buffer
  agent.eventBuffer = [];

  // -------------------------------------------------------------------
  // 10. Tool: get_false_negatives
  // -------------------------------------------------------------------
  console.log('\n--- Tool: get_false_negatives ---');

  const fnResult = await agent.tools.get('get_false_negatives').handler();
  assert(fnResult.success === true, 'get_false_negatives succeeds');
  assert(fnResult.data.length >= 2, 'get_false_negatives finds at least 2 false negatives (TXN-001, TXN-003)');
  assert(fnResult.data[0].decisionId !== undefined, 'false negative has decisionId');
  assert(fnResult.data[0].features !== undefined, 'false negative has features');

  // -------------------------------------------------------------------
  // 11. Tool: get_false_positives
  // -------------------------------------------------------------------
  console.log('\n--- Tool: get_false_positives ---');

  const fpResult = await agent.tools.get('get_false_positives').handler();
  assert(fpResult.success === true, 'get_false_positives succeeds');
  assert(fpResult.data.length >= 1, 'get_false_positives finds at least 1 false positive');

  // -------------------------------------------------------------------
  // 12. Tool: get_rule_performance
  // -------------------------------------------------------------------
  console.log('\n--- Tool: get_rule_performance ---');

  const rpResult = await agent.tools.get('get_rule_performance').handler();
  assert(rpResult.success === true, 'get_rule_performance succeeds');
  assert(rpResult.data.length >= 2, 'get_rule_performance returns at least 2 rules');
  // Should be sorted by FP rate descending: RULE-TEST-001 (0.40) before RULE-TEST-002 (0.10)
  assert(rpResult.data[0].falsePositiveRate >= rpResult.data[1].falsePositiveRate,
    'get_rule_performance sorted by falsePositiveRate descending');

  // -------------------------------------------------------------------
  // 13. Tool: cluster_features
  // -------------------------------------------------------------------
  console.log('\n--- Tool: cluster_features ---');

  const clusterInput = {
    transactions: [
      { features: { amount: 7500, country: 'NG', category: 'ELECTRONICS', accountAge: 10 } },
      { features: { amount: 6000, country: 'NG', category: 'ELECTRONICS', accountAge: 5 } },
      { features: { amount: 300, country: 'UK', category: 'DIGITAL_GOODS', accountAge: 90 } }
    ]
  };
  const clResult = await agent.tools.get('cluster_features').handler(clusterInput);
  assert(clResult.success === true, 'cluster_features succeeds');
  assert(clResult.data.clusters.length > 0, 'cluster_features returns at least one cluster');
  assert(clResult.data.clusters[0].features !== undefined, 'cluster has features array');
  assert(clResult.data.clusters[0].count !== undefined, 'cluster has count');

  // -------------------------------------------------------------------
  // 14. Tool: draft_rule
  // -------------------------------------------------------------------
  console.log('\n--- Tool: draft_rule ---');

  const cluster = {
    features: [
      { field: 'amount', values: [5000], operator: 'GT' },
      { field: 'country', values: ['NG'], operator: 'IN' }
    ],
    checkpoint: 'transaction',
    severity: 'HIGH',
    action: 'BLOCK',
    reason: 'High value transactions from Nigeria'
  };
  const draftResult = await agent.tools.get('draft_rule').handler({ cluster });
  assert(draftResult.success === true, 'draft_rule succeeds');
  assert(draftResult.data.ruleId !== undefined, 'drafted rule has ruleId');
  assertEqual(draftResult.data.status, 'TESTING', 'drafted rule status is TESTING');
  assert(draftResult.data.conditions.length === 2, 'drafted rule has 2 conditions');

  // -------------------------------------------------------------------
  // 15. Tool: simulate_rule
  // -------------------------------------------------------------------
  console.log('\n--- Tool: simulate_rule ---');

  const simResult = await agent.tools.get('simulate_rule').handler({ rule: draftResult.data });
  assert(simResult.success === true, 'simulate_rule succeeds');
  assert(simResult.data.estimatedCatchRate !== undefined, 'simulation has estimatedCatchRate');
  assert(simResult.data.estimatedFPRate !== undefined, 'simulation has estimatedFPRate');
  assert(simResult.data.transactionsEvaluated > 0, 'simulation evaluated transactions');
  assert(simResult.data.wouldTrigger !== undefined, 'simulation has wouldTrigger');
  assert(simResult.data.wouldBlock !== undefined, 'simulation has wouldBlock');

  // -------------------------------------------------------------------
  // 16. Tool: deploy_shadow
  // -------------------------------------------------------------------
  console.log('\n--- Tool: deploy_shadow ---');

  const deployResult = await agent.tools.get('deploy_shadow').handler({ rule: draftResult.data });
  assert(deployResult.success === true, 'deploy_shadow succeeds');
  assertEqual(deployResult.data.status, 'SHADOW', 'deployed rule status is SHADOW');
  assert(deployResult.data.ruleId !== undefined, 'deployed rule has ruleId');
  // Verify it was added to the pipeline
  assert(agent.rulePipeline.has(deployResult.data.ruleId), 'rule added to rulePipeline');
  assertEqual(agent.rulePipeline.get(deployResult.data.ruleId).stage, 'SHADOW', 'pipeline stage is SHADOW');

  // -------------------------------------------------------------------
  // 17. Tool: check_shadow_results
  // -------------------------------------------------------------------
  console.log('\n--- Tool: check_shadow_results ---');

  const shadowRuleId = deployResult.data.ruleId;
  const checkResult = await agent.tools.get('check_shadow_results').handler({ ruleId: shadowRuleId });
  assert(checkResult.success === true, 'check_shadow_results succeeds');
  assert(checkResult.data.hoursInShadow !== undefined, 'check result has hoursInShadow');
  assert(checkResult.data.estimatedCatchRate !== undefined, 'check result has estimatedCatchRate');
  assert(checkResult.data.estimatedFPRate !== undefined, 'check result has estimatedFPRate');
  assert(checkResult.data.readyForPromotion !== undefined, 'check result has readyForPromotion');
  // Just deployed, so should NOT be ready (less than 24 hours)
  assertEqual(checkResult.data.readyForPromotion, false, 'newly deployed rule is not ready for promotion');

  // -------------------------------------------------------------------
  // 18. Tool: promote_rule
  // -------------------------------------------------------------------
  console.log('\n--- Tool: promote_rule ---');

  const promoteResult = await agent.tools.get('promote_rule').handler({ ruleId: shadowRuleId });
  assert(promoteResult.success === true, 'promote_rule succeeds');
  assertEqual(promoteResult.data.status, 'ACTIVE', 'promoted rule status is ACTIVE');
  assert(promoteResult.data.promotedAt !== undefined, 'promoted rule has promotedAt');

  // -------------------------------------------------------------------
  // 19. Tool: deprecate_rule
  // -------------------------------------------------------------------
  console.log('\n--- Tool: deprecate_rule ---');

  const deprecateResult = await agent.tools.get('deprecate_rule').handler({
    ruleId: 'RULE-TEST-001',
    reason: 'Too many false positives'
  });
  assert(deprecateResult.success === true, 'deprecate_rule succeeds');
  assertEqual(deprecateResult.data.status, 'DEPRECATED', 'deprecated rule status is DEPRECATED');
  assertEqual(deprecateResult.data.reason, 'Too many false positives', 'deprecation reason is recorded');

  // ── Summary ─────────────────────────────────────────────────────────────────

  console.log('\n=========================================');
  console.log(`  TOTAL: ${passed + failed} assertions`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  if (failures.length > 0) {
    console.log('\n  Failures:');
    failures.forEach(f => console.log(`    - ${f}`));
  }
  console.log('=========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite failed with error:', err);
  process.exit(1);
});
