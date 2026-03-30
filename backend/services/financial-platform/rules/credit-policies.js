/**
 * Financial Policy Rules — credit underwriting, payout holds, credit tiering.
 * These are the rule definitions that agents use for decision-making.
 */

export const CREDIT_UNDERWRITING_RULES = [
  { id: 'CUR-001', name: 'New Seller Credit Cap', condition: 'accountAgeDays < 30', action: 'MAX_CREDIT_5000', priority: 1 },
  { id: 'CUR-002', name: 'High Risk Denial', condition: 'riskScore > 80', action: 'DENY_CREDIT', priority: 1 },
  { id: 'CUR-003', name: 'Fraud Rate Denial', condition: 'fraudIncidentRate > 0.05', action: 'DENY_CREDIT', priority: 1 },
  { id: 'CUR-004', name: 'Enterprise Tier Premium', condition: 'sellerTier === Enterprise && riskScore < 30', action: 'CREDIT_500K_TIER_A', priority: 2 },
  { id: 'CUR-005', name: 'Platinum Tier Standard', condition: 'sellerTier === Platinum && riskScore < 50', action: 'CREDIT_250K_TIER_A', priority: 2 },
  { id: 'CUR-006', name: 'Gold Tier Standard', condition: 'sellerTier === Gold && riskScore < 60', action: 'CREDIT_100K_TIER_B', priority: 3 },
  { id: 'CUR-007', name: 'Silver Tier Limited', condition: 'sellerTier === Silver', action: 'CREDIT_50K_TIER_B', priority: 3 },
  { id: 'CUR-008', name: 'Bronze Tier Starter', condition: 'sellerTier === Bronze', action: 'CREDIT_25K_TIER_C', priority: 4 },
  { id: 'CUR-009', name: 'High GMV Bonus', condition: 'gmv30d > 100000', action: 'CREDIT_MULTIPLIER_1.5', priority: 5 },
  { id: 'CUR-010', name: 'Low GMV Cap', condition: 'gmv30d < 1000', action: 'CREDIT_MULTIPLIER_0.5', priority: 5 }
];

export const PAYOUT_HOLD_RULES = [
  { id: 'PHR-001', name: 'Fraud Flag Hold', condition: 'fraudHoldStatus === true', action: 'HOLD_30_DAYS', priority: 1 },
  { id: 'PHR-002', name: 'New Seller Hold', condition: 'accountAgeDays < 14', action: 'HOLD_7_DAYS', priority: 2 },
  { id: 'PHR-003', name: 'High Risk Hold', condition: 'riskScore >= 70', action: 'HOLD_14_DAYS', priority: 2 },
  { id: 'PHR-004', name: 'Velocity Breach', condition: 'payoutVelocity7d > weeklyLimit', action: 'HOLD_3_DAYS', priority: 3 },
  { id: 'PHR-005', name: 'First Payout Review', condition: 'isFirstPayout && amount > 5000', action: 'HOLD_5_DAYS', priority: 3 },
  { id: 'PHR-006', name: 'Large Payout Review', condition: 'amount > 50000', action: 'MANUAL_REVIEW', priority: 4 },
  { id: 'PHR-007', name: 'Auto Release Qualified', condition: 'amount <= 50000 && tier >= Silver && riskScore <= 40', action: 'INSTANT_RELEASE', priority: 5 }
];

export const CREDIT_TIER_RULES = [
  { id: 'CTR-001', name: 'Tier A — Prime', condition: 'riskScore <= 25', tier: 'A', rate: 0.049, label: 'Prime (4.9% APR)' },
  { id: 'CTR-002', name: 'Tier B — Standard', condition: 'riskScore <= 50', tier: 'B', rate: 0.089, label: 'Standard (8.9% APR)' },
  { id: 'CTR-003', name: 'Tier C — Elevated', condition: 'riskScore <= 75', tier: 'C', rate: 0.149, label: 'Elevated (14.9% APR)' },
  { id: 'CTR-004', name: 'Tier D — High Risk', condition: 'riskScore > 75', tier: 'D', rate: 0.199, label: 'High Risk (19.9% APR)' }
];

export function getAllRules() {
  return {
    underwriting: CREDIT_UNDERWRITING_RULES,
    payoutHold: PAYOUT_HOLD_RULES,
    creditTier: CREDIT_TIER_RULES,
    totalRules: CREDIT_UNDERWRITING_RULES.length + PAYOUT_HOLD_RULES.length + CREDIT_TIER_RULES.length
  };
}

export default { CREDIT_UNDERWRITING_RULES, PAYOUT_HOLD_RULES, CREDIT_TIER_RULES, getAllRules };
