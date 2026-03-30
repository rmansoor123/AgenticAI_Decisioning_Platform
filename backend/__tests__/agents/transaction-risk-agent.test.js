/**
 * Transaction Risk Agent — unit tests with deterministic fixtures.
 */
import { describe, it, expect, beforeAll } from 'vitest';

// Test fixtures — deterministic, no Math.random()
const FIXTURES = {
  lowRiskTransaction: {
    sellerId: 'SLR-TEST-001',
    transactionId: 'TXN-TEST-001',
    amount: 50,
    currency: 'USD',
    buyerCountry: 'US',
    sellerCountry: 'US',
    deviceFingerprint: 'FP-TRUSTED-001',
    ipAddress: '8.8.8.8',
    paymentMethod: 'CARD',
    cardBrand: 'Visa',
    isFirstTransaction: false,
    accountAgeDays: 365,
    previousTransactions: 100
  },
  highRiskTransaction: {
    sellerId: 'SLR-TEST-002',
    transactionId: 'TXN-TEST-002',
    amount: 9999,
    currency: 'USD',
    buyerCountry: 'NG',
    sellerCountry: 'US',
    deviceFingerprint: 'FP-UNKNOWN-999',
    ipAddress: '41.190.2.1',
    paymentMethod: 'CARD',
    cardBrand: 'Unknown',
    isFirstTransaction: true,
    accountAgeDays: 2,
    previousTransactions: 0
  },
  velocityAbuseTransaction: {
    sellerId: 'SLR-TEST-003',
    transactionId: 'TXN-TEST-003',
    amount: 100,
    currency: 'USD',
    buyerCountry: 'US',
    sellerCountry: 'US',
    deviceFingerprint: 'FP-TRUSTED-002',
    ipAddress: '8.8.4.4',
    paymentMethod: 'CARD',
    cardBrand: 'Mastercard',
    isFirstTransaction: false,
    accountAgeDays: 30,
    previousTransactions: 500, // abnormally high
    transactionsLast24h: 200
  }
};

describe('Transaction Risk Agent', () => {
  let agent;

  beforeAll(async () => {
    // Dynamic import to respect test setup env vars
    const mod = await import('../../agents/specialized/transaction-risk-agent.js');
    agent = mod.getTransactionRiskAgent ? mod.getTransactionRiskAgent() : mod.default;
  });

  it('should be importable', () => {
    expect(agent).toBeDefined();
  });

  it('should have a reason method', () => {
    expect(typeof agent.reason).toBe('function');
  });

  it('should return a decision object with required fields', async () => {
    const result = await agent.reason({
      transactionId: FIXTURES.lowRiskTransaction.transactionId,
      transactionData: FIXTURES.lowRiskTransaction
    });

    expect(result).toBeDefined();
    expect(result.result).toBeDefined();
    expect(result.result.recommendation).toBeDefined();
    expect(result.result.recommendation.action).toBeDefined();
    expect(['APPROVE', 'CHALLENGE', 'BLOCK', 'REVIEW', 'HOLD']).toContain(result.result.recommendation.action);
  });

  it('should have latency tracking', async () => {
    const result = await agent.reason({
      transactionId: FIXTURES.lowRiskTransaction.transactionId,
      transactionData: FIXTURES.lowRiskTransaction
    });

    expect(result.latencyMs).toBeDefined();
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThan(0);
  });
});
