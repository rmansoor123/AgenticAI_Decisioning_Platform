/**
 * Payout Release Agent — fraud-aware payout gating.
 * Integrates with existing fraud agents and risk profiles.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

const PAYOUT_POLICY = {
  // Velocity limits by tier
  velocityLimits: {
    Enterprise: { daily: 1000000, weekly: 5000000 },
    Platinum: { daily: 500000, weekly: 2000000 },
    Gold: { daily: 200000, weekly: 800000 },
    Silver: { daily: 100000, weekly: 400000 },
    Bronze: { daily: 50000, weekly: 150000 },
    New: { daily: 10000, weekly: 30000 }
  },
  // Hold conditions
  holdConditions: {
    newSeller: { maxAgeDays: 14, holdDays: 7 },
    highRisk: { minRiskScore: 70, holdDays: 14 },
    velocityBreach: { holdDays: 3 },
    fraudFlag: { holdDays: 30 },
    firstPayout: { holdDays: 5 }
  },
  // Auto-release thresholds
  autoRelease: {
    maxAmount: 50000,
    minTier: 'Silver',
    maxRiskScore: 40
  }
};

const TIER_RANK = { New: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4, Enterprise: 5 };

export class PayoutReleaseAgent {
  constructor() {
    this.stats = { evaluated: 0, released: 0, held: 0 };
  }

  async evaluate(input) {
    const { sellerId, payoutAmount = 0, sellerTier = 'New', riskScore = 50,
            fraudHoldStatus = false, accountAgeDays = 0, payoutVelocity7d = 0,
            isFirstPayout = false, payoutId } = input;
    const startTime = Date.now();

    let releaseApproved = true;
    let holdReason = null;
    let estimatedReleaseDays = 0;
    const checks = [];

    // 1. Fraud hold check
    if (fraudHoldStatus) {
      releaseApproved = false;
      holdReason = 'FRAUD_HOLD';
      estimatedReleaseDays = PAYOUT_POLICY.holdConditions.fraudFlag.holdDays;
      checks.push({ check: 'FRAUD_HOLD', passed: false, detail: `Active fraud hold — ${estimatedReleaseDays} day hold` });
    }

    // 2. New seller hold
    if (accountAgeDays < PAYOUT_POLICY.holdConditions.newSeller.maxAgeDays) {
      releaseApproved = false;
      holdReason = holdReason || 'NEW_SELLER_HOLD';
      estimatedReleaseDays = Math.max(estimatedReleaseDays, PAYOUT_POLICY.holdConditions.newSeller.holdDays);
      checks.push({ check: 'NEW_SELLER', passed: false, detail: `Account ${accountAgeDays} days old < ${PAYOUT_POLICY.holdConditions.newSeller.maxAgeDays} minimum` });
    } else {
      checks.push({ check: 'NEW_SELLER', passed: true, detail: `Account ${accountAgeDays} days old — OK` });
    }

    // 3. Risk score check
    if (riskScore >= PAYOUT_POLICY.holdConditions.highRisk.minRiskScore) {
      releaseApproved = false;
      holdReason = holdReason || 'HIGH_RISK_HOLD';
      estimatedReleaseDays = Math.max(estimatedReleaseDays, PAYOUT_POLICY.holdConditions.highRisk.holdDays);
      checks.push({ check: 'RISK_SCORE', passed: false, detail: `Risk ${riskScore} ≥ ${PAYOUT_POLICY.holdConditions.highRisk.minRiskScore} threshold` });
    } else {
      checks.push({ check: 'RISK_SCORE', passed: true, detail: `Risk ${riskScore} — OK` });
    }

    // 4. Velocity check
    const velocityLimit = PAYOUT_POLICY.velocityLimits[sellerTier] || PAYOUT_POLICY.velocityLimits.New;
    if (payoutVelocity7d + payoutAmount > velocityLimit.weekly) {
      releaseApproved = false;
      holdReason = holdReason || 'VELOCITY_BREACH';
      estimatedReleaseDays = Math.max(estimatedReleaseDays, PAYOUT_POLICY.holdConditions.velocityBreach.holdDays);
      checks.push({ check: 'VELOCITY', passed: false, detail: `$${(payoutVelocity7d + payoutAmount).toLocaleString()} exceeds $${velocityLimit.weekly.toLocaleString()} weekly limit for ${sellerTier}` });
    } else {
      checks.push({ check: 'VELOCITY', passed: true, detail: `$${payoutVelocity7d.toLocaleString()} + $${payoutAmount.toLocaleString()} within $${velocityLimit.weekly.toLocaleString()} limit` });
    }

    // 5. First payout check
    if (isFirstPayout) {
      if (payoutAmount > 5000) {
        releaseApproved = false;
        holdReason = holdReason || 'FIRST_PAYOUT_REVIEW';
        estimatedReleaseDays = Math.max(estimatedReleaseDays, PAYOUT_POLICY.holdConditions.firstPayout.holdDays);
      }
      checks.push({ check: 'FIRST_PAYOUT', passed: payoutAmount <= 5000, detail: `First payout $${payoutAmount.toLocaleString()} — ${payoutAmount <= 5000 ? 'auto-approved' : 'manual review required'}` });
    }

    // 6. Auto-release check
    if (releaseApproved && payoutAmount <= PAYOUT_POLICY.autoRelease.maxAmount
        && TIER_RANK[sellerTier] >= TIER_RANK[PAYOUT_POLICY.autoRelease.minTier]
        && riskScore <= PAYOUT_POLICY.autoRelease.maxRiskScore) {
      checks.push({ check: 'AUTO_RELEASE', passed: true, detail: 'Qualifies for instant auto-release' });
    }

    this.stats.evaluated++;
    if (releaseApproved) this.stats.released++; else this.stats.held++;

    const estimatedReleaseDate = releaseApproved ? new Date().toISOString()
      : new Date(Date.now() + estimatedReleaseDays * 86400000).toISOString();

    // Persist
    const db_ops = getDbOps();
    try {
      await db_ops.insert('financial_decisions', 'decision_id', `PR-${Date.now().toString(36).toUpperCase()}`, {
        type: 'PAYOUT_RELEASE', sellerId, payoutId,
        payoutAmount, releaseApproved, holdReason,
        estimatedReleaseDate, checks, sellerTier, riskScore,
        createdAt: new Date().toISOString()
      });
    } catch (_) {}

    return {
      sellerId, payoutId, payoutAmount, releaseApproved,
      holdReason, estimatedReleaseDate, estimatedReleaseDays,
      checks, latencyMs: Date.now() - startTime
    };
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getPayoutReleaseAgent() {
  if (!instance) instance = new PayoutReleaseAgent();
  return instance;
}
export default { PayoutReleaseAgent, getPayoutReleaseAgent };
