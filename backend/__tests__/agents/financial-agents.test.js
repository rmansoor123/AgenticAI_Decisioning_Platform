/**
 * Financial Platform Agents — unit tests.
 */
import { describe, it, expect } from 'vitest';
import { getUnderwritingAgent } from '../../services/financial-platform/agents/UnderwritingAgent.js';
import { getCreditLineAgent } from '../../services/financial-platform/agents/CreditLineAgent.js';
import { getPayoutReleaseAgent } from '../../services/financial-platform/agents/PayoutReleaseAgent.js';
import { getPaymentProcessingAgent } from '../../services/financial-platform/agents/PaymentProcessingAgent.js';

describe('UnderwritingAgent', () => {
  const agent = getUnderwritingAgent();

  it('should approve credit for low-risk Gold seller', async () => {
    const result = await agent.evaluate({
      sellerId: 'SLR-TEST-001', riskScore: 25, gmv30d: 50000,
      fraudIncidentRate: 0.01, accountAgeDays: 365, sellerTier: 'Gold'
    });
    expect(result.creditApproved).toBe(true);
    expect(result.creditLimit).toBeGreaterThan(0);
    expect(result.interestRateTier).toBe('A');
  });

  it('should deny credit for high-risk new seller', async () => {
    const result = await agent.evaluate({
      sellerId: 'SLR-TEST-002', riskScore: 85, gmv30d: 500,
      fraudIncidentRate: 0.10, accountAgeDays: 5, sellerTier: 'New'
    });
    expect(result.creditApproved).toBe(false);
    expect(result.creditLimit).toBe(0);
  });

  it('should return reasoning', async () => {
    const result = await agent.evaluate({
      sellerId: 'SLR-TEST-003', riskScore: 40, gmv30d: 20000,
      accountAgeDays: 100, sellerTier: 'Silver'
    });
    expect(result.reasoning).toBeDefined();
    expect(result.factors.length).toBeGreaterThan(0);
  });
});

describe('PayoutReleaseAgent', () => {
  const agent = getPayoutReleaseAgent();

  it('should release payout for trusted seller', async () => {
    const result = await agent.evaluate({
      sellerId: 'SLR-TEST-001', payoutAmount: 5000, sellerTier: 'Gold',
      riskScore: 20, fraudHoldStatus: false, accountAgeDays: 365
    });
    expect(result.releaseApproved).toBe(true);
  });

  it('should hold payout with fraud flag', async () => {
    const result = await agent.evaluate({
      sellerId: 'SLR-TEST-002', payoutAmount: 5000, sellerTier: 'Gold',
      riskScore: 20, fraudHoldStatus: true, accountAgeDays: 365
    });
    expect(result.releaseApproved).toBe(false);
    expect(result.holdReason).toBe('FRAUD_HOLD');
  });

  it('should hold payout for new seller', async () => {
    const result = await agent.evaluate({
      sellerId: 'SLR-TEST-003', payoutAmount: 1000, sellerTier: 'New',
      riskScore: 30, accountAgeDays: 7
    });
    expect(result.releaseApproved).toBe(false);
  });
});

describe('PaymentProcessingAgent', () => {
  const agent = getPaymentProcessingAgent();

  it('should authorize normal payment', async () => {
    const result = await agent.evaluate({
      sellerId: 'SLR-TEST-001', amount: 500, method: 'CARD',
      country: 'US', riskScore: 20, action: 'AUTHORIZE'
    });
    expect(result.approved).toBe(true);
    expect(result.processingFee).toBeGreaterThan(0);
    expect(result.netAmount).toBeLessThan(500);
  });

  it('should block excessive amount', async () => {
    const result = await agent.evaluate({
      sellerId: 'SLR-TEST-001', amount: 200000, method: 'CARD',
      country: 'US', riskScore: 20, action: 'AUTHORIZE'
    });
    expect(result.approved).toBe(false);
  });
});
