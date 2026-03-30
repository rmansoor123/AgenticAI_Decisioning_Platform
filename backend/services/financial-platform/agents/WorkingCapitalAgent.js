/**
 * Working Capital Agent — merchant cash advance / revenue-based financing.
 * Advances capital based on seller revenue, repaid via % of daily sales.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

const MCA_POLICY = {
  maxAdvanceMultiple: 1.5, // max advance = 1.5x monthly GMV
  minGmv30d: 5000,
  minAccountAgeDays: 60,
  maxRiskScore: 65,
  factorRates: { // Total repayment = advance * factor rate
    A: 1.10, // Tier A pays back 110%
    B: 1.15, // Tier B pays back 115%
    C: 1.20  // Tier C pays back 120%
  },
  holdbackRates: { // % of daily sales held for repayment
    A: 0.10, // 10% of daily sales
    B: 0.12, // 12%
    C: 0.15  // 15%
  },
  tierThresholds: { A: 30, B: 55 } // risk score thresholds
};

export class WorkingCapitalAgent {
  constructor() {
    this.stats = { evaluated: 0, approved: 0, denied: 0, totalAdvanced: 0 };
  }

  async evaluate(input) {
    const { sellerId, action = 'QUALIFY', gmv30d = 0, riskScore = 50,
            accountAgeDays = 0, requestedAmount, sellerTier = 'New' } = input;
    const startTime = Date.now();

    if (action === 'QUALIFY') {
      return this._qualify(sellerId, gmv30d, riskScore, accountAgeDays, sellerTier, startTime);
    }
    if (action === 'ADVANCE') {
      return this._processAdvance(sellerId, requestedAmount, gmv30d, riskScore, startTime);
    }
    if (action === 'REPAYMENT') {
      return this._processRepayment(input, startTime);
    }

    return { error: `Unknown action: ${action}` };
  }

  _qualify(sellerId, gmv30d, riskScore, accountAgeDays, sellerTier, startTime) {
    const qualifications = [];
    let qualified = true;

    if (gmv30d < MCA_POLICY.minGmv30d) {
      qualified = false;
      qualifications.push({ check: 'MIN_GMV', passed: false, detail: `$${gmv30d} < $${MCA_POLICY.minGmv30d} minimum` });
    } else {
      qualifications.push({ check: 'MIN_GMV', passed: true, detail: `$${gmv30d.toLocaleString()} meets minimum` });
    }

    if (accountAgeDays < MCA_POLICY.minAccountAgeDays) {
      qualified = false;
      qualifications.push({ check: 'ACCOUNT_AGE', passed: false, detail: `${accountAgeDays} days < ${MCA_POLICY.minAccountAgeDays} minimum` });
    } else {
      qualifications.push({ check: 'ACCOUNT_AGE', passed: true, detail: `${accountAgeDays} days — OK` });
    }

    if (riskScore > MCA_POLICY.maxRiskScore) {
      qualified = false;
      qualifications.push({ check: 'RISK_SCORE', passed: false, detail: `Risk ${riskScore} > ${MCA_POLICY.maxRiskScore} max` });
    } else {
      qualifications.push({ check: 'RISK_SCORE', passed: true, detail: `Risk ${riskScore} — OK` });
    }

    const tier = riskScore <= MCA_POLICY.tierThresholds.A ? 'A' : riskScore <= MCA_POLICY.tierThresholds.B ? 'B' : 'C';
    const maxAdvance = Math.round(gmv30d * MCA_POLICY.maxAdvanceMultiple);
    const factorRate = MCA_POLICY.factorRates[tier];
    const holdbackRate = MCA_POLICY.holdbackRates[tier];
    const totalRepayment = Math.round(maxAdvance * factorRate);
    const estimatedRepaymentDays = Math.round(totalRepayment / (gmv30d / 30 * holdbackRate));

    this.stats.evaluated++;

    return {
      sellerId, action: 'QUALIFY', qualified, qualifications,
      offers: qualified ? [{
        maxAdvance, factorRate, totalRepayment,
        holdbackRate, holdbackLabel: `${(holdbackRate * 100).toFixed(0)}% of daily sales`,
        tier, estimatedRepaymentDays,
        costOfCapital: totalRepayment - maxAdvance
      }] : [],
      latencyMs: Date.now() - startTime
    };
  }

  async _processAdvance(sellerId, requestedAmount, gmv30d, riskScore, startTime) {
    const maxAdvance = Math.round(gmv30d * MCA_POLICY.maxAdvanceMultiple);
    if (requestedAmount > maxAdvance) {
      return { sellerId, action: 'ADVANCE', approved: false, reason: `Requested $${requestedAmount} exceeds max $${maxAdvance}` };
    }

    const tier = riskScore <= MCA_POLICY.tierThresholds.A ? 'A' : riskScore <= MCA_POLICY.tierThresholds.B ? 'B' : 'C';
    const factorRate = MCA_POLICY.factorRates[tier];
    const totalRepayment = Math.round(requestedAmount * factorRate);

    this.stats.approved++;
    this.stats.totalAdvanced += requestedAmount;

    const advanceId = `MCA-${Date.now().toString(36).toUpperCase()}`;
    const db_ops = getDbOps();
    try {
      await db_ops.insert('financial_decisions', 'decision_id', advanceId, {
        type: 'WORKING_CAPITAL', sellerId, advanceId, amount: requestedAmount,
        factorRate, totalRepayment, tier, remainingRepayment: totalRepayment,
        status: 'ACTIVE', createdAt: new Date().toISOString()
      });
    } catch (_) {}

    return {
      sellerId, action: 'ADVANCE', approved: true, advanceId,
      amount: requestedAmount, factorRate, totalRepayment, tier,
      holdbackRate: MCA_POLICY.holdbackRates[tier],
      latencyMs: Date.now() - startTime
    };
  }

  async _processRepayment({ advanceId, repaymentAmount }, startTime) {
    return {
      advanceId, action: 'REPAYMENT', amount: repaymentAmount,
      status: 'APPLIED', processedAt: new Date().toISOString(),
      latencyMs: Date.now() - startTime
    };
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getWorkingCapitalAgent() {
  if (!instance) instance = new WorkingCapitalAgent();
  return instance;
}
export default { WorkingCapitalAgent, getWorkingCapitalAgent };
