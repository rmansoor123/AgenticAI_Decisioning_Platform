/**
 * Seller Onboarding Agent — unit tests with deterministic fixtures.
 */
import { describe, it, expect, beforeAll } from 'vitest';

const FIXTURES = {
  legitimateSeller: {
    sellerId: 'SLR-TEST-LEGIT',
    sellerData: {
      businessName: 'Test Legitimate Corp',
      businessCategory: 'SOFTWARE',
      country: 'US',
      email: 'admin@testlegit.com',
      phone: '+15551234567',
      businessType: 'LLC',
      incorporationDate: '2018-01-01',
      annualRevenue: 2000000,
      employeeCount: 30,
      website: 'https://testlegit.com',
      kycVerified: true,
      _preQualified: true,
      bankVerified: true
    }
  },
  suspiciousSeller: {
    sellerId: 'SLR-TEST-SUSPICIOUS',
    sellerData: {
      businessName: 'Suspect Trading Ltd',
      businessCategory: 'GIFT_CARDS',
      country: 'NG',
      email: 'temp@tempmail.com',
      phone: '+2341234567',
      businessType: 'Sole Proprietor',
      incorporationDate: '2026-03-01',
      annualRevenue: 0,
      employeeCount: 0,
      website: ''
    }
  }
};

describe('Seller Onboarding Agent', () => {
  let agent;

  beforeAll(async () => {
    const mod = await import('../../agents/specialized/seller-onboarding-agent.js');
    agent = mod.getSellerOnboardingAgent ? mod.getSellerOnboardingAgent() : mod.default;
  });

  it('should be importable', () => {
    expect(agent).toBeDefined();
  });

  it('should have agentId SELLER_ONBOARDING', () => {
    expect(agent.agentId).toBe('SELLER_ONBOARDING');
  });

  it('should return structured decision for legitimate seller', async () => {
    const result = await agent.reason(FIXTURES.legitimateSeller);

    expect(result).toBeDefined();
    expect(result.result).toBeDefined();
    expect(result.result.recommendation).toBeDefined();
    expect(['APPROVE', 'REVIEW', 'REJECT', 'HOLD']).toContain(result.result.recommendation.action);
    expect(result.result.riskFactors).toBeDefined();
    expect(result.chainOfThought).toBeDefined();
  });

  it('should include evidence in the result', async () => {
    const result = await agent.reason(FIXTURES.legitimateSeller);
    expect(result.result.evidence).toBeDefined();
    expect(Array.isArray(result.result.evidence)).toBe(true);
  });

  it('should complete within timeout', async () => {
    const start = Date.now();
    await agent.reason(FIXTURES.legitimateSeller);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(30000); // 30s max
  });
});
