/**
 * Underwriting Agent — evaluates seller credit worthiness.
 * Inputs: sellerId, riskScore, gmv30d, fraudIncidentRate, accountAgeDays, sellerTier
 * Outputs: creditApproved, creditLimit, interestRateTier (A/B/C), reasoning, factors
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

// Credit policy rules (replaces GoRules YAML)
const CREDIT_POLICY = {
  // Tier → base credit limit
  tierLimits: {
    Enterprise: 500000, Platinum: 250000, Gold: 100000,
    Silver: 50000, Bronze: 25000, New: 5000
  },
  // Risk score adjustments
  riskMultipliers: {
    low: 1.2,      // riskScore < 30
    medium: 1.0,   // 30-60
    high: 0.5,     // 60-80
    critical: 0     // > 80 — no credit
  },
  // GMV-based adjustments
  gmvMultipliers: [
    { min: 100000, multiplier: 1.5 },
    { min: 50000, multiplier: 1.2 },
    { min: 10000, multiplier: 1.0 },
    { min: 0, multiplier: 0.8 }
  ],
  // Interest rate tiers
  interestTiers: {
    A: { maxRisk: 25, rate: 0.049, label: 'Prime (4.9%)' },
    B: { maxRisk: 50, rate: 0.089, label: 'Standard (8.9%)' },
    C: { maxRisk: 75, rate: 0.149, label: 'Elevated (14.9%)' }
  },
  // Minimum requirements
  minimums: {
    accountAgeDays: 30,
    gmv30d: 1000,
    maxFraudRate: 0.05
  }
};

export class UnderwritingAgent {
  constructor() {
    this.stats = { evaluated: 0, approved: 0, denied: 0 };
  }

  async evaluate(input) {
    const { sellerId, riskScore = 50, gmv30d = 0, fraudIncidentRate = 0, accountAgeDays = 0, sellerTier = 'New' } = input;
    const startTime = Date.now();
    const factors = [];
    let creditApproved = true;
    let reasoning = '';

    // 1. Minimum requirements check
    if (accountAgeDays < CREDIT_POLICY.minimums.accountAgeDays) {
      creditApproved = false;
      factors.push({ factor: 'ACCOUNT_TOO_NEW', detail: `${accountAgeDays} days < ${CREDIT_POLICY.minimums.accountAgeDays} minimum`, impact: 'BLOCKING' });
    }
    if (fraudIncidentRate > CREDIT_POLICY.minimums.maxFraudRate) {
      creditApproved = false;
      factors.push({ factor: 'HIGH_FRAUD_RATE', detail: `${(fraudIncidentRate*100).toFixed(1)}% > ${(CREDIT_POLICY.minimums.maxFraudRate*100)}% max`, impact: 'BLOCKING' });
    }
    if (riskScore > 80) {
      creditApproved = false;
      factors.push({ factor: 'CRITICAL_RISK', detail: `Risk score ${riskScore} > 80 threshold`, impact: 'BLOCKING' });
    }

    // 2. Calculate credit limit
    const baseLimit = CREDIT_POLICY.tierLimits[sellerTier] || 5000;
    factors.push({ factor: 'TIER_BASE', detail: `${sellerTier} tier → $${baseLimit.toLocaleString()} base`, impact: 'BASE' });

    const riskLevel = riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : riskScore < 80 ? 'high' : 'critical';
    const riskMult = CREDIT_POLICY.riskMultipliers[riskLevel];
    factors.push({ factor: 'RISK_ADJUSTMENT', detail: `${riskLevel} risk (${riskScore}) → ${riskMult}x`, impact: riskMult >= 1 ? 'POSITIVE' : 'NEGATIVE' });

    const gmvMult = CREDIT_POLICY.gmvMultipliers.find(g => gmv30d >= g.min)?.multiplier || 0.8;
    factors.push({ factor: 'GMV_ADJUSTMENT', detail: `$${gmv30d.toLocaleString()} GMV → ${gmvMult}x`, impact: gmvMult >= 1 ? 'POSITIVE' : 'NEGATIVE' });

    const creditLimit = creditApproved ? Math.round(baseLimit * riskMult * gmvMult) : 0;

    // 3. Determine interest rate tier
    let interestRateTier = 'C';
    let interestRate = CREDIT_POLICY.interestTiers.C.rate;
    for (const [tier, config] of Object.entries(CREDIT_POLICY.interestTiers)) {
      if (riskScore <= config.maxRisk) {
        interestRateTier = tier;
        interestRate = config.rate;
        break;
      }
    }
    factors.push({ factor: 'INTEREST_TIER', detail: `Tier ${interestRateTier}: ${CREDIT_POLICY.interestTiers[interestRateTier].label}`, impact: 'INFO' });

    // 4. Generate reasoning
    if (creditApproved) {
      reasoning = `Approved $${creditLimit.toLocaleString()} credit line at Tier ${interestRateTier} (${(interestRate*100).toFixed(1)}% APR). ${sellerTier} seller with ${riskLevel} risk and $${gmv30d.toLocaleString()} monthly GMV.`;
    } else {
      const blockingFactors = factors.filter(f => f.impact === 'BLOCKING').map(f => f.detail).join('; ');
      reasoning = `Credit denied: ${blockingFactors}`;
    }

    this.stats.evaluated++;
    if (creditApproved) this.stats.approved++; else this.stats.denied++;

    // Persist decision
    const db_ops = getDbOps();
    const decisionId = `UW-${Date.now().toString(36).toUpperCase()}`;
    try {
      await db_ops.insert('financial_decisions', 'decision_id', decisionId, {
        decisionId, type: 'UNDERWRITING', sellerId,
        creditApproved, creditLimit, interestRateTier, interestRate,
        riskScore, gmv30d, sellerTier, factors, reasoning,
        latencyMs: Date.now() - startTime,
        createdAt: new Date().toISOString()
      });
    } catch (_) { /* best-effort */ }

    return {
      decisionId, sellerId, creditApproved, creditLimit,
      interestRateTier, interestRate, reasoning, factors,
      latencyMs: Date.now() - startTime
    };
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getUnderwritingAgent() {
  if (!instance) instance = new UnderwritingAgent();
  return instance;
}
export default { UnderwritingAgent, getUnderwritingAgent };
