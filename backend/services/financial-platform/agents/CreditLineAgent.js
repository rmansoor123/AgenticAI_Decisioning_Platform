/**
 * Credit Line Agent — dynamically adjusts credit limits.
 * Inputs: sellerId, currentCreditLimit, newRiskScore, repaymentHistory
 * Outputs: adjustedCreditLimit, adjustmentReason, adjustmentType (INCREASE/DECREASE/HOLD)
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

const ADJUSTMENT_RULES = {
  // Risk score improvement → increase
  riskImprovement: { threshold: -10, maxIncreasePct: 0.25 },
  // Risk score worsening → decrease
  riskDegradation: { threshold: 10, maxDecreasePct: 0.50 },
  // Perfect repayment bonus
  perfectRepayment: { minPayments: 3, bonusPct: 0.15 },
  // Late payment penalty
  latePayment: { penaltyPct: 0.20 },
  // Minimum credit floor
  minimumCredit: 1000,
  // Maximum single adjustment
  maxAdjustmentPct: 0.50
};

export class CreditLineAgent {
  constructor() {
    this.stats = { adjustments: 0, increases: 0, decreases: 0, holds: 0 };
  }

  async evaluate(input) {
    const { sellerId, currentCreditLimit = 0, newRiskScore = 50, previousRiskScore = 50, repaymentHistory = [] } = input;
    const startTime = Date.now();

    let adjustedLimit = currentCreditLimit;
    let adjustmentType = 'HOLD';
    const reasons = [];

    // 1. Risk score change
    const riskDelta = newRiskScore - previousRiskScore;
    if (riskDelta < ADJUSTMENT_RULES.riskImprovement.threshold) {
      const increasePct = Math.min(Math.abs(riskDelta) / 100 * 2, ADJUSTMENT_RULES.riskImprovement.maxIncreasePct);
      adjustedLimit = Math.round(currentCreditLimit * (1 + increasePct));
      adjustmentType = 'INCREASE';
      reasons.push(`Risk improved ${Math.abs(riskDelta)} points → +${(increasePct*100).toFixed(0)}% credit`);
    } else if (riskDelta > ADJUSTMENT_RULES.riskDegradation.threshold) {
      const decreasePct = Math.min(riskDelta / 100 * 2, ADJUSTMENT_RULES.riskDegradation.maxDecreasePct);
      adjustedLimit = Math.round(currentCreditLimit * (1 - decreasePct));
      adjustmentType = 'DECREASE';
      reasons.push(`Risk worsened ${riskDelta} points → -${(decreasePct*100).toFixed(0)}% credit`);
    }

    // 2. Repayment history bonus/penalty
    const onTimePayments = repaymentHistory.filter(p => p.status === 'ON_TIME').length;
    const latePayments = repaymentHistory.filter(p => p.status === 'LATE').length;

    if (onTimePayments >= ADJUSTMENT_RULES.perfectRepayment.minPayments && latePayments === 0) {
      adjustedLimit = Math.round(adjustedLimit * (1 + ADJUSTMENT_RULES.perfectRepayment.bonusPct));
      if (adjustmentType === 'HOLD') adjustmentType = 'INCREASE';
      reasons.push(`${onTimePayments} perfect repayments → +${(ADJUSTMENT_RULES.perfectRepayment.bonusPct*100)}% bonus`);
    }
    if (latePayments > 0) {
      adjustedLimit = Math.round(adjustedLimit * (1 - ADJUSTMENT_RULES.latePayment.penaltyPct * latePayments));
      adjustmentType = 'DECREASE';
      reasons.push(`${latePayments} late payment(s) → -${(ADJUSTMENT_RULES.latePayment.penaltyPct*100*latePayments)}% penalty`);
    }

    // 3. Apply floor
    adjustedLimit = Math.max(adjustedLimit, ADJUSTMENT_RULES.minimumCredit);

    // 4. Cap single adjustment
    const maxChange = currentCreditLimit * ADJUSTMENT_RULES.maxAdjustmentPct;
    if (Math.abs(adjustedLimit - currentCreditLimit) > maxChange) {
      adjustedLimit = adjustmentType === 'INCREASE'
        ? currentCreditLimit + maxChange
        : currentCreditLimit - maxChange;
      reasons.push(`Adjustment capped at ${(ADJUSTMENT_RULES.maxAdjustmentPct*100)}% max change`);
    }

    adjustedLimit = Math.round(adjustedLimit);
    if (adjustedLimit === currentCreditLimit) adjustmentType = 'HOLD';

    this.stats.adjustments++;
    if (adjustmentType === 'INCREASE') this.stats.increases++;
    else if (adjustmentType === 'DECREASE') this.stats.decreases++;
    else this.stats.holds++;

    // Persist
    const db_ops = getDbOps();
    try {
      await db_ops.insert('financial_decisions', 'decision_id', `CL-${Date.now().toString(36).toUpperCase()}`, {
        type: 'CREDIT_ADJUSTMENT', sellerId,
        previousLimit: currentCreditLimit, adjustedLimit,
        adjustmentType, riskDelta, reasons,
        createdAt: new Date().toISOString()
      });
    } catch (_) {}

    return {
      sellerId, previousLimit: currentCreditLimit, adjustedCreditLimit: adjustedLimit,
      adjustmentType, adjustmentAmount: adjustedLimit - currentCreditLimit,
      reasons, riskDelta, latencyMs: Date.now() - startTime
    };
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getCreditLineAgent() {
  if (!instance) instance = new CreditLineAgent();
  return instance;
}
export default { CreditLineAgent, getCreditLineAgent };
