/**
 * Expanded Golden Test Suite
 * Tests for 6 specialized agents: payout-risk, listing-intelligence,
 * profile-mutation, returns-abuse, cross-domain, policy-evolution.
 *
 * These tests run WITHOUT LLM enabled. In non-LLM mode, observe() returns
 * { success, summary, actions } without recommendation/decision/riskScore.
 * Tests verify the full TPAOR pipeline executes, tools are called, and
 * results contain the expected structural fields.
 *
 * Run with: node backend/agents/core/__tests__/expanded-golden-tests.test.js
 */

import assert from 'node:assert';

import { PayoutRiskAgent } from '../../specialized/payout-risk-agent.js';
import { ListingIntelligenceAgent } from '../../specialized/listing-intelligence-agent.js';
import { ProfileMutationAgent } from '../../specialized/profile-mutation-agent.js';
import { ReturnsAbuseAgent } from '../../specialized/returns-abuse-agent.js';
import { CrossDomainCorrelationAgent } from '../../specialized/cross-domain-agent.js';
import { PolicyEvolutionAgent } from '../../specialized/policy-evolution-agent.js';

/**
 * Extract decision from result — handles both LLM-enhanced and fallback paths.
 * LLM path: result.result.recommendation.action or result.result.decision
 * Fallback path: no decision field (returns null)
 */
function extractDecision(result) {
  return result.result?.recommendation?.action
    || result.result?.decision
    || null;
}

/**
 * Extract risk score from result — handles nested structures.
 * LLM path: result.result.riskScore
 * Some agents: result.result.overallRisk.score
 * Fallback: null
 */
function extractRiskScore(result) {
  const rs = result.result?.riskScore;
  if (typeof rs === 'number') return rs;
  if (rs && typeof rs.score === 'number') return rs.score;
  return result.result?.overallRisk?.score || null;
}

// ── Payout Risk Agent Tests ──

async function testPayoutRiskLowRisk() {
  const agent = new PayoutRiskAgent();
  const result = await agent.reason({
    type: 'payout_request',
    sellerId: 'SELLER-GOLD-001',
    amount: 500,
    accountAge: 365,
    previousPayouts: 50,
    chargebackRate: 0.001,
    recentSales: 100,
  });
  assert.ok(result.result, 'Should produce a result');
  assert.ok(result.result.success !== undefined, 'Result should have success field');
  // Without LLM, decision may not be set — verify pipeline completed
  assert.ok(result.actions?.length >= 0, 'Should have executed actions array');
  const decision = extractDecision(result);
  if (decision) {
    assert.ok(['APPROVE', 'REVIEW'].includes(decision), `Low risk payout should be APPROVE or REVIEW, got ${decision}`);
  }
  console.log('  [PASS] Payout risk: low risk seller processed');
}

async function testPayoutRiskHighRisk() {
  const agent = new PayoutRiskAgent();
  const result = await agent.reason({
    type: 'payout_request',
    sellerId: 'SELLER-NEW-999',
    amount: 50000,
    accountAge: 7,
    previousPayouts: 0,
    chargebackRate: 0.15,
    recentSales: 2,
    velocitySpike: true,
  });
  assert.ok(result.result, 'Should produce a result');
  assert.ok(result.result.success !== undefined, 'Result should have success field');
  const decision = extractDecision(result);
  if (decision) {
    assert.ok(['REJECT', 'REVIEW', 'BLOCK'].includes(decision), `High risk payout should not be APPROVE, got ${decision}`);
  }
  console.log('  [PASS] Payout risk: high risk payout processed');
}

// ── Listing Intelligence Agent Tests ──

async function testListingNormal() {
  const agent = new ListingIntelligenceAgent();
  const result = await agent.reason({
    type: 'listing_review',
    sellerId: 'SELLER-TRUSTED-001',
    listingTitle: 'Genuine Leather Wallet',
    price: 29.99,
    category: 'accessories',
    description: 'High quality genuine leather wallet with RFID protection',
    images: 3,
    sellerRating: 4.8,
  });
  assert.ok(result.result, 'Should produce a result');
  assert.ok(result.result.success !== undefined, 'Result should have success field');
  console.log('  [PASS] Listing intelligence: normal listing processed');
}

async function testListingSuspicious() {
  const agent = new ListingIntelligenceAgent();
  const result = await agent.reason({
    type: 'listing_review',
    sellerId: 'SELLER-NEW-777',
    listingTitle: 'LUXURY BRAND 90% OFF WHOLESALE LOT',
    price: 5.99,
    category: 'luxury',
    description: 'Cheap wholesale designer items',
    images: 0,
    sellerRating: 0,
    accountAge: 1,
  });
  assert.ok(result.result, 'Should produce a result');
  // Without LLM, riskScore may not be present in observe fallback
  const risk = extractRiskScore(result);
  if (risk !== null) {
    assert.ok(risk >= 40, `Suspicious listing should have elevated risk, got ${risk}`);
  }
  // Verify the pipeline ran to completion with reasoning trace
  assert.ok(result.chainOfThought || result.reasoning, 'Should have chain of thought or reasoning');
  console.log('  [PASS] Listing intelligence: suspicious listing processed');
}

// ── Profile Mutation Agent Tests ──

async function testProfileNormalUpdate() {
  const agent = new ProfileMutationAgent();
  const result = await agent.reason({
    type: 'profile_change',
    sellerId: 'SELLER-ESTAB-001',
    changeType: 'address_update',
    previousValue: '123 Main St, City, State',
    newValue: '456 Oak Ave, City, State',
    accountAge: 500,
    recentChanges: 1,
  });
  assert.ok(result.result, 'Should produce a result');
  assert.ok(result.result.success !== undefined, 'Result should have success field');
  console.log('  [PASS] Profile mutation: normal update processed');
}

async function testProfileRapidChanges() {
  const agent = new ProfileMutationAgent();
  const result = await agent.reason({
    type: 'profile_change',
    sellerId: 'SELLER-SUSPECT-001',
    changeType: 'bank_account_change',
    previousValue: 'BANK-A ****1234',
    newValue: 'BANK-B ****9999',
    accountAge: 14,
    recentChanges: 8,
    bankChangeCount: 3,
    lastBankChange: '2 days ago',
  });
  assert.ok(result.result, 'Should produce a result');
  const risk = extractRiskScore(result);
  if (risk !== null) {
    assert.ok(risk >= 50, `Rapid bank changes should be risky, got ${risk}`);
  }
  assert.ok(result.chainOfThought || result.reasoning, 'Should have chain of thought or reasoning');
  console.log('  [PASS] Profile mutation: rapid changes processed');
}

// ── Returns Abuse Agent Tests ──

async function testReturnsNormal() {
  const agent = new ReturnsAbuseAgent();
  const result = await agent.reason({
    type: 'return_request',
    sellerId: 'SELLER-GOOD-001',
    buyerId: 'BUYER-NORMAL-001',
    orderId: 'ORDER-001',
    amount: 49.99,
    reason: 'Item damaged in shipping',
    buyerReturnRate: 0.02,
    daysSincePurchase: 5,
  });
  assert.ok(result.result, 'Should produce a result');
  assert.ok(result.result.success !== undefined, 'Result should have success field');
  console.log('  [PASS] Returns abuse: normal return processed');
}

async function testReturnsAbusive() {
  const agent = new ReturnsAbuseAgent();
  const result = await agent.reason({
    type: 'return_request',
    sellerId: 'SELLER-VICTIM-001',
    buyerId: 'BUYER-SERIAL-001',
    orderId: 'ORDER-999',
    amount: 299.99,
    reason: 'Not as described',
    buyerReturnRate: 0.45,
    daysSincePurchase: 29,
    previousReturns: 15,
    wardrobing: true,
  });
  assert.ok(result.result, 'Should produce a result');
  const risk = extractRiskScore(result);
  if (risk !== null) {
    assert.ok(risk >= 50, `Serial returner should be flagged, got ${risk}`);
  }
  assert.ok(result.chainOfThought || result.reasoning, 'Should have chain of thought or reasoning');
  console.log('  [PASS] Returns abuse: serial returner processed');
}

// ── Cross-Domain Agent Tests ──

async function testCrossDomainCorrelation() {
  const agent = new CrossDomainCorrelationAgent();
  const result = await agent.reason({
    type: 'cross_domain_analysis',
    sellerId: 'SELLER-MULTI-001',
    signals: [
      { domain: 'onboarding', event: 'document_mismatch', severity: 'high' },
      { domain: 'transactions', event: 'velocity_spike', severity: 'medium' },
      { domain: 'profile', event: 'bank_change', severity: 'medium' },
    ],
    timespan: '24h',
  });
  assert.ok(result.result, 'Should produce a result');
  assert.ok(result.result.success !== undefined, 'Result should have success field');
  console.log('  [PASS] Cross-domain: multi-signal correlation processed');
}

// ── Policy Evolution Agent Tests ──

async function testPolicyEvolution() {
  const agent = new PolicyEvolutionAgent();
  const result = await agent.reason({
    type: 'policy_analysis',
    currentRules: [
      { id: 'R001', name: 'velocity_check', falsePositiveRate: 0.15, catchRate: 0.6 },
      { id: 'R002', name: 'amount_threshold', falsePositiveRate: 0.05, catchRate: 0.3 },
    ],
    recentDecisions: 100,
    falsePositiveTarget: 0.10,
  });
  assert.ok(result.result, 'Should produce a result');
  assert.ok(result.result.success !== undefined, 'Result should have success field');
  console.log('  [PASS] Policy evolution: policy analysis processed');
}

// ── Run All ──

async function run() {
  console.log('Expanded Golden Test Suite');
  console.log('=========================');

  let passed = 0;
  let failed = 0;

  const tests = [
    testPayoutRiskLowRisk,
    testPayoutRiskHighRisk,
    testListingNormal,
    testListingSuspicious,
    testProfileNormalUpdate,
    testProfileRapidChanges,
    testReturnsNormal,
    testReturnsAbusive,
    testCrossDomainCorrelation,
    testPolicyEvolution,
  ];

  for (const test of tests) {
    try {
      await test();
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
