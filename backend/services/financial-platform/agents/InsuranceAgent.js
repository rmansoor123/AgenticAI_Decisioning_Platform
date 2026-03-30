/**
 * Insurance Agent — seller protection products.
 * Covers: chargeback protection, shipping insurance, inventory insurance.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

const INSURANCE_PRODUCTS = {
  CHARGEBACK_PROTECTION: {
    name: 'Chargeback Protection',
    description: 'Covers fraudulent chargebacks up to policy limit',
    premiumRate: 0.004, // 0.4% of transaction volume
    coverageLimits: { New: 5000, Bronze: 10000, Silver: 25000, Gold: 50000, Platinum: 100000, Enterprise: 500000 },
    deductible: 100
  },
  SHIPPING_INSURANCE: {
    name: 'Shipping Insurance',
    description: 'Covers lost, damaged, or stolen shipments',
    premiumRate: 0.008, // 0.8% of shipped value
    coverageLimits: { New: 2000, Bronze: 5000, Silver: 10000, Gold: 25000, Platinum: 50000, Enterprise: 200000 },
    deductible: 50
  },
  INVENTORY_PROTECTION: {
    name: 'Inventory Protection',
    description: 'Covers warehouse damage, theft, and natural disasters',
    premiumRate: 0.012, // 1.2% of inventory value annually
    coverageLimits: { New: 10000, Bronze: 25000, Silver: 50000, Gold: 100000, Platinum: 250000, Enterprise: 1000000 },
    deductible: 500
  }
};

export class InsuranceAgent {
  constructor() {
    this.stats = { quotes: 0, policies: 0, claims: 0, claimsPaid: 0 };
  }

  async evaluate(input) {
    const { sellerId, action = 'QUOTE', product = 'CHARGEBACK_PROTECTION',
            sellerTier = 'New', coverageAmount = 0, claimAmount = 0, claimReason } = input;
    const startTime = Date.now();

    if (action === 'QUOTE') {
      this.stats.quotes++;
      const prod = INSURANCE_PRODUCTS[product];
      if (!prod) return { error: `Unknown product: ${product}` };

      const maxCoverage = prod.coverageLimits[sellerTier] || prod.coverageLimits.New;
      const effectiveCoverage = Math.min(coverageAmount || maxCoverage, maxCoverage);
      const annualPremium = Math.round(effectiveCoverage * prod.premiumRate * 100) / 100;
      const monthlyPremium = Math.round(annualPremium / 12 * 100) / 100;

      return {
        sellerId, action: 'QUOTE', product, productName: prod.name,
        description: prod.description, coverageLimit: maxCoverage,
        requestedCoverage: effectiveCoverage,
        annualPremium, monthlyPremium, deductible: prod.deductible,
        premiumRate: `${(prod.premiumRate * 100).toFixed(1)}%`,
        latencyMs: Date.now() - startTime
      };
    }

    if (action === 'ENROLL') {
      this.stats.policies++;
      const policyId = `POL-${Date.now().toString(36).toUpperCase()}`;
      const db_ops = getDbOps();
      try {
        await db_ops.insert('financial_decisions', 'decision_id', policyId, {
          type: 'INSURANCE_POLICY', sellerId, policyId, product, sellerTier,
          status: 'ACTIVE', createdAt: new Date().toISOString()
        });
      } catch (_) {}
      return { sellerId, action: 'ENROLL', policyId, product, status: 'ACTIVE', latencyMs: Date.now() - startTime };
    }

    if (action === 'CLAIM') {
      this.stats.claims++;
      const prod = INSURANCE_PRODUCTS[product];
      const maxCoverage = prod?.coverageLimits[sellerTier] || 5000;
      const approved = claimAmount <= maxCoverage;
      const payout = approved ? Math.max(0, claimAmount - (prod?.deductible || 0)) : 0;
      if (approved) this.stats.claimsPaid += payout;

      return {
        sellerId, action: 'CLAIM', product, claimAmount,
        approved, payout, deductible: prod?.deductible || 0,
        reason: claimReason, claimId: `CLM-${Date.now().toString(36).toUpperCase()}`,
        latencyMs: Date.now() - startTime
      };
    }

    return { error: `Unknown action: ${action}` };
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getInsuranceAgent() {
  if (!instance) instance = new InsuranceAgent();
  return instance;
}
export default { InsuranceAgent, getInsuranceAgent };
