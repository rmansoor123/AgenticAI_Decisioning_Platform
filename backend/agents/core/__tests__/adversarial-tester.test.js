/**
 * Unit test: Adversarial Tester — scenario generation and vulnerability analysis.
 * Run with: node backend/agents/core/__tests__/adversarial-tester.test.js
 */

import { getAdversarialTester } from '../adversarial-tester.js';

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

  const tester = getAdversarialTester();

  // ── Test 1: Singleton pattern ──
  console.log('\nTest 1: Singleton pattern');
  const tester2 = getAdversarialTester();
  assert(tester === tester2, 'getAdversarialTester() returns same instance');

  // ── Test 2: generateScenarios returns correct count ──
  console.log('\nTest 2: generateScenarios returns correct default count');
  const scenarios = tester.generateScenarios('onboarding');
  assert(Array.isArray(scenarios), 'Returns an array');
  assert(scenarios.length === 10, `Default count is 10 (got ${scenarios.length})`);

  // ── Test 3: generateScenarios with custom count ──
  console.log('\nTest 3: generateScenarios with custom count');
  const scenarios5 = tester.generateScenarios('onboarding', 5);
  assert(scenarios5.length === 5, `Custom count 5 (got ${scenarios5.length})`);

  // ── Test 4: Scenario object structure ──
  console.log('\nTest 4: Scenario object structure');
  const s = scenarios[0];
  assert(typeof s.scenarioId === 'string', `scenarioId is a string (got ${typeof s.scenarioId})`);
  assert(s.scenarioId.startsWith('ADVTEST-'), `scenarioId starts with ADVTEST- (got ${s.scenarioId})`);
  assert(typeof s.type === 'string', `type is a string`);
  assert(typeof s.description === 'string', `description is a string`);
  assert(s.agentType === 'onboarding', `agentType matches (got ${s.agentType})`);
  assert(typeof s.input === 'object' && s.input !== null, `input is an object`);
  assert(typeof s.expectedOutcome === 'string', `expectedOutcome is a string`);
  assert(typeof s.createdAt === 'string', `createdAt is a string`);

  // ── Test 5: Scenario types are valid ──
  console.log('\nTest 5: Scenario types are valid');
  const validTypes = ['synthetic-identity', 'contradictory-signals', 'boundary-case', 'evasion-pattern'];
  scenarios.forEach((sc, i) => {
    assert(validTypes.includes(sc.type), `Scenario ${i} has valid type: ${sc.type}`);
  });

  // ── Test 6: Expected outcomes match scenario types ──
  console.log('\nTest 6: Expected outcomes match scenario types');
  const typeOutcomeMap = {
    'synthetic-identity': 'REJECT',
    'contradictory-signals': 'REVIEW',
    'boundary-case': 'REVIEW',
    'evasion-pattern': 'REJECT'
  };
  scenarios.forEach((sc, i) => {
    assert(sc.expectedOutcome === typeOutcomeMap[sc.type],
      `Scenario ${i} (${sc.type}) expected ${typeOutcomeMap[sc.type]} (got ${sc.expectedOutcome})`);
  });

  // ── Test 7: Scenario input has seller-like properties ──
  console.log('\nTest 7: Scenario input has seller-like properties');
  const inp = scenarios[0].input;
  assert(typeof inp.sellerId === 'string', `input has sellerId`);
  assert(typeof inp.businessName === 'string', `input has businessName`);
  assert(typeof inp.email === 'string', `input has email`);
  assert(typeof inp.country === 'string', `input has country`);

  // ── Test 8: analyzeResults computes correct stats ──
  console.log('\nTest 8: analyzeResults computes correct stats for all-correct results');
  const mockCorrectResults = [
    {
      scenario: { scenarioId: 'ADVTEST-1', type: 'synthetic-identity', expectedOutcome: 'REJECT' },
      agentDecision: 'REJECT',
      success: true,
      error: null
    },
    {
      scenario: { scenarioId: 'ADVTEST-2', type: 'contradictory-signals', expectedOutcome: 'REVIEW' },
      agentDecision: 'REVIEW',
      success: true,
      error: null
    },
    {
      scenario: { scenarioId: 'ADVTEST-3', type: 'boundary-case', expectedOutcome: 'REVIEW' },
      agentDecision: 'REVIEW',
      success: true,
      error: null
    },
    {
      scenario: { scenarioId: 'ADVTEST-4', type: 'evasion-pattern', expectedOutcome: 'REJECT' },
      agentDecision: 'REJECT',
      success: true,
      error: null
    }
  ];
  const report = tester.analyzeResults(mockCorrectResults);
  assert(report.total === 4, `total is 4 (got ${report.total})`);
  assert(report.correct === 4, `correct is 4 (got ${report.correct})`);
  assert(report.falseNegatives === 0, `falseNegatives is 0 (got ${report.falseNegatives})`);
  assert(report.falsePositives === 0, `falsePositives is 0 (got ${report.falsePositives})`);
  assert(report.inconsistencies === 0, `inconsistencies is 0 (got ${report.inconsistencies})`);
  assert(report.errors === 0, `errors is 0 (got ${report.errors})`);
  assert(report.accuracy === 1.0, `accuracy is 1.0 (got ${report.accuracy})`);

  // ── Test 9: analyzeResults detects false negatives ──
  console.log('\nTest 9: analyzeResults detects false negatives');
  const mockFalseNegResults = [
    {
      scenario: { scenarioId: 'ADVTEST-FN1', type: 'synthetic-identity', expectedOutcome: 'REJECT' },
      agentDecision: 'APPROVE',
      success: true,
      error: null
    },
    {
      scenario: { scenarioId: 'ADVTEST-FN2', type: 'evasion-pattern', expectedOutcome: 'REJECT' },
      agentDecision: 'APPROVE',
      success: true,
      error: null
    }
  ];
  const fnReport = tester.analyzeResults(mockFalseNegResults);
  assert(fnReport.total === 2, `total is 2 (got ${fnReport.total})`);
  assert(fnReport.correct === 0, `correct is 0 (got ${fnReport.correct})`);
  assert(fnReport.falseNegatives === 2, `falseNegatives is 2 (got ${fnReport.falseNegatives})`);
  assert(fnReport.accuracy === 0, `accuracy is 0 (got ${fnReport.accuracy})`);

  // ── Test 10: analyzeResults detects false positives ──
  console.log('\nTest 10: analyzeResults detects false positives');
  const mockFalsePositiveResults = [
    {
      scenario: { scenarioId: 'ADVTEST-FP1', type: 'contradictory-signals', expectedOutcome: 'REVIEW' },
      agentDecision: 'REJECT',
      success: true,
      error: null
    },
    {
      scenario: { scenarioId: 'ADVTEST-FP2', type: 'boundary-case', expectedOutcome: 'REVIEW' },
      agentDecision: 'REJECT',
      success: true,
      error: null
    }
  ];
  const fpReport = tester.analyzeResults(mockFalsePositiveResults);
  assert(fpReport.total === 2, `total is 2 (got ${fpReport.total})`);
  assert(fpReport.correct === 0, `correct is 0 (got ${fpReport.correct})`);
  assert(fpReport.falsePositives === 2, `falsePositives is 2 (got ${fpReport.falsePositives})`);

  // ── Test 11: analyzeResults handles errors ──
  console.log('\nTest 11: analyzeResults handles errors');
  const mockErrorResults = [
    {
      scenario: { scenarioId: 'ADVTEST-E1', type: 'synthetic-identity', expectedOutcome: 'REJECT' },
      agentDecision: null,
      success: false,
      error: 'Agent threw an exception'
    },
    {
      scenario: { scenarioId: 'ADVTEST-E2', type: 'evasion-pattern', expectedOutcome: 'REJECT' },
      agentDecision: 'REJECT',
      success: true,
      error: null
    }
  ];
  const errReport = tester.analyzeResults(mockErrorResults);
  assert(errReport.total === 2, `total is 2 (got ${errReport.total})`);
  assert(errReport.errors === 1, `errors is 1 (got ${errReport.errors})`);
  assert(errReport.correct === 1, `correct is 1 (got ${errReport.correct})`);

  // ── Test 12: analyzeResults groups by type ──
  console.log('\nTest 12: analyzeResults groups results by type');
  const mixedResults = [
    {
      scenario: { scenarioId: 'ADVTEST-M1', type: 'synthetic-identity', expectedOutcome: 'REJECT' },
      agentDecision: 'REJECT',
      success: true,
      error: null
    },
    {
      scenario: { scenarioId: 'ADVTEST-M2', type: 'synthetic-identity', expectedOutcome: 'REJECT' },
      agentDecision: 'APPROVE',
      success: true,
      error: null
    },
    {
      scenario: { scenarioId: 'ADVTEST-M3', type: 'contradictory-signals', expectedOutcome: 'REVIEW' },
      agentDecision: 'REVIEW',
      success: true,
      error: null
    }
  ];
  const mixedReport = tester.analyzeResults(mixedResults);
  assert(typeof mixedReport.byType === 'object', 'byType is an object');
  assert(mixedReport.byType['synthetic-identity'] !== undefined, 'byType has synthetic-identity');
  assert(mixedReport.byType['synthetic-identity'].total === 2,
    `synthetic-identity total is 2 (got ${mixedReport.byType['synthetic-identity'].total})`);
  assert(mixedReport.byType['synthetic-identity'].correct === 1,
    `synthetic-identity correct is 1 (got ${mixedReport.byType['synthetic-identity'].correct})`);
  assert(mixedReport.byType['contradictory-signals'].total === 1,
    `contradictory-signals total is 1 (got ${mixedReport.byType['contradictory-signals'].total})`);

  // ── Test 13: analyzeResults returns vulnerabilities array ──
  console.log('\nTest 13: analyzeResults returns vulnerabilities');
  assert(Array.isArray(mixedReport.vulnerabilities), 'vulnerabilities is an array');
  // synthetic-identity has 50% accuracy which should flag as vulnerable
  const siVuln = mixedReport.vulnerabilities.find(v => v.type === 'synthetic-identity');
  assert(siVuln !== undefined, 'synthetic-identity flagged as vulnerable');

  // ── Test 14: analyzeResults returns details array ──
  console.log('\nTest 14: analyzeResults returns details');
  assert(Array.isArray(mixedReport.details), 'details is an array');
  assert(mixedReport.details.length === mixedResults.length,
    `details length matches results (got ${mixedReport.details.length})`);

  // ── Test 15: runBatch returns results array ──
  console.log('\nTest 15: runBatch returns results array');
  const mockAgent = {
    async reason(input) {
      return {
        result: {
          recommendation: { action: 'REJECT' },
          success: true
        }
      };
    }
  };
  const batchScenarios = tester.generateScenarios('onboarding', 3);
  tester.runBatch(mockAgent, batchScenarios).then(results => {
    assert(Array.isArray(results), 'runBatch returns an array');
    assert(results.length === 3, `runBatch returns 3 results (got ${results.length})`);
    results.forEach((r, i) => {
      assert(r.scenario !== undefined, `Result ${i} has scenario`);
      assert(typeof r.agentDecision === 'string', `Result ${i} has agentDecision`);
      assert(typeof r.success === 'boolean', `Result ${i} has success boolean`);
    });

    // ── Test 16: runBatch handles agent errors gracefully ──
    console.log('\nTest 16: runBatch handles agent errors gracefully');
    const failingAgent = {
      async reason() {
        throw new Error('Agent crashed');
      }
    };
    return tester.runBatch(failingAgent, tester.generateScenarios('onboarding', 2));
  }).then(errorResults => {
    assert(errorResults.length === 2, `Got 2 results even with errors (got ${errorResults.length})`);
    errorResults.forEach((r, i) => {
      assert(r.success === false, `Result ${i} has success=false`);
      assert(typeof r.error === 'string', `Result ${i} has error message`);
    });

    // ── Summary ──
    console.log(`\n${'='.repeat(40)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }).catch(err => {
    console.error('Async test failure:', err);
    process.exit(1);
  });
}

runTests();
