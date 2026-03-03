/**
 * Citation Enforcement Tests
 * Tests validateCitations() rules and downgrade behavior.
 *
 * Run with: node backend/agents/core/__tests__/citation-enforcement.test.js
 */

import assert from 'node:assert';
import { getCitationTracker } from '../citation-tracker.js';

const tracker = getCitationTracker();

// ── Test: REJECT with enough citations passes ──

function testSufficientCitations() {
  const citations = [
    { claim: 'High velocity', toolName: 'check_velocity', confidence: 0.9 },
    { claim: 'IP flagged', toolName: 'check_ip', confidence: 0.8 },
    { claim: 'Document mismatch', toolName: 'verify_identity', confidence: 0.9 },
  ];
  const result = tracker.validateCitations(citations, 'REJECT', 3);
  assert.strictEqual(result.valid, true, 'Should be valid with 3+ citations');
  assert.strictEqual(result.shouldDowngrade, false, 'Should not downgrade');
  assert.strictEqual(result.issues.length, 0, 'Should have no issues');
  console.log('  [PASS] Sufficient citations for REJECT');
}

// ── Test: REJECT with too few citations triggers downgrade ──

function testInsufficientCitations() {
  const citations = [
    { claim: 'Suspicious IP', toolName: 'check_ip', confidence: 0.8 },
  ];
  const result = tracker.validateCitations(citations, 'REJECT', 1);
  assert.strictEqual(result.valid, false, 'Should be invalid');
  assert.strictEqual(result.shouldDowngrade, true, 'Should recommend downgrade');
  assert.ok(result.issues.some(i => i.rule === 'min_citations'), 'Should flag min_citations rule');
  console.log('  [PASS] Insufficient citations triggers downgrade');
}

// ── Test: BLOCK with no citations triggers downgrade ──

function testNoCitationsBlock() {
  const result = tracker.validateCitations([], 'BLOCK', 2);
  assert.strictEqual(result.shouldDowngrade, true, 'BLOCK with no citations should downgrade');
  console.log('  [PASS] No citations on BLOCK triggers downgrade');
}

// ── Test: APPROVE doesn't require citations ──

function testApproveNoCitations() {
  const result = tracker.validateCitations([], 'APPROVE', 2);
  assert.strictEqual(result.valid, true, 'APPROVE without citations is fine');
  assert.strictEqual(result.shouldDowngrade, false, 'APPROVE should not downgrade');
  console.log('  [PASS] APPROVE without citations is valid');
}

// ── Test: Orphaned citations detected ──

function testOrphanedCitations() {
  const citations = [
    { claim: 'Valid finding', toolName: 'check_ip', confidence: 0.9 },
    { claim: 'Ghost citation', toolName: 'nonexistent_tool', confidence: 0.2 },
    { claim: 'Another orphan', toolName: 'missing_tool', confidence: 0.1 },
  ];
  const result = tracker.validateCitations(citations, 'REVIEW', 1);
  assert.ok(result.issues.some(i => i.rule === 'orphaned_citations'), 'Should detect orphaned citations');
  assert.strictEqual(
    result.issues.find(i => i.rule === 'orphaned_citations').count,
    2,
    'Should count 2 orphaned citations'
  );
  console.log('  [PASS] Orphaned citations detected');
}

// ── Test: Single-source dependency warning ──

function testSingleSource() {
  const citations = [
    { claim: 'Finding 1', toolName: 'check_ip', confidence: 0.9 },
    { claim: 'Finding 2', toolName: 'check_ip', confidence: 0.8 },
    { claim: 'Finding 3', toolName: 'check_ip', confidence: 0.7 },
  ];
  const result = tracker.validateCitations(citations, 'REJECT', 3);
  assert.ok(result.issues.some(i => i.rule === 'single_source'), 'Should warn about single source');
  console.log('  [PASS] Single-source dependency warning');
}

// ── Test: null/undefined citations handled ──

function testNullCitations() {
  const result1 = tracker.validateCitations(null, 'REJECT', 2);
  assert.strictEqual(result1.shouldDowngrade, true, 'Null citations for REJECT should downgrade');

  const result2 = tracker.validateCitations(undefined, 'APPROVE', 2);
  assert.strictEqual(result2.shouldDowngrade, false, 'Null citations for APPROVE is fine');
  console.log('  [PASS] Null/undefined citations handled');
}

// ── Run All ──

async function run() {
  console.log('Citation Enforcement Tests');
  console.log('=========================');

  let passed = 0;
  let failed = 0;

  const tests = [
    testSufficientCitations,
    testInsufficientCitations,
    testNoCitationsBlock,
    testApproveNoCitations,
    testOrphanedCitations,
    testSingleSource,
    testNullCitations,
  ];

  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  [FAIL] ${test.name}: ${err.message}`);
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${tests.length}`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
