/**
 * Payment Processing Agent — manages full payment lifecycle.
 * Auth → Capture → Settlement → (Refund/Chargeback)
 * Integrates with fraud risk scoring for payment decisions.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

const PAYMENT_RULES = {
  autoApproveMax: 10000,
  reviewThreshold: 50000,
  blockThreshold: 100000,
  highRiskCountries: ['NG', 'RU', 'RO', 'PK', 'BD'],
  velocityLimit: { hourly: 10, daily: 50 },
  processingFees: {
    CARD: 0.029, BANK_TRANSFER: 0.01, DIGITAL_WALLET: 0.025, CRYPTO: 0.015
  },
  settlementDays: { CARD: 2, BANK_TRANSFER: 3, DIGITAL_WALLET: 1, CRYPTO: 0 }
};

export class PaymentProcessingAgent {
  constructor() {
    this.stats = { processed: 0, authorized: 0, captured: 0, declined: 0, refunded: 0, chargedback: 0 };
  }

  async evaluate(input) {
    const { sellerId, buyerId, amount, currency = 'USD', method = 'CARD',
            country = 'US', riskScore = 0, action = 'AUTHORIZE' } = input;
    const startTime = Date.now();

    if (action === 'AUTHORIZE') return this._authorize(input, startTime);
    if (action === 'CAPTURE') return this._capture(input, startTime);
    if (action === 'REFUND') return this._refund(input, startTime);
    if (action === 'CHARGEBACK') return this._chargeback(input, startTime);

    return { error: `Unknown action: ${action}` };
  }

  async _authorize({ sellerId, buyerId, amount, currency, method, country, riskScore }, startTime) {
    const checks = [];
    let approved = true;
    let declineReason = null;

    // Amount check
    if (amount > PAYMENT_RULES.blockThreshold) {
      approved = false;
      declineReason = 'AMOUNT_EXCEEDS_LIMIT';
      checks.push({ check: 'AMOUNT_LIMIT', passed: false, detail: `$${amount} exceeds $${PAYMENT_RULES.blockThreshold} block threshold` });
    } else if (amount > PAYMENT_RULES.reviewThreshold) {
      checks.push({ check: 'AMOUNT_REVIEW', passed: true, detail: `$${amount} flagged for manual review` });
    } else {
      checks.push({ check: 'AMOUNT', passed: true, detail: `$${amount} within auto-approve range` });
    }

    // Country risk
    if (PAYMENT_RULES.highRiskCountries.includes(country)) {
      if (amount > 5000) {
        approved = false;
        declineReason = declineReason || 'HIGH_RISK_COUNTRY';
      }
      checks.push({ check: 'COUNTRY_RISK', passed: amount <= 5000, detail: `${country} is high-risk — ${amount > 5000 ? 'blocked' : 'allowed under $5K'}` });
    }

    // Risk score check
    if (riskScore > 75) {
      approved = false;
      declineReason = declineReason || 'HIGH_RISK_SCORE';
      checks.push({ check: 'RISK_SCORE', passed: false, detail: `Risk ${riskScore} > 75 threshold` });
    }

    // Processing fee
    const feeRate = PAYMENT_RULES.processingFees[method] || 0.029;
    const processingFee = Math.round(amount * feeRate * 100) / 100;
    const netAmount = Math.round((amount - processingFee) * 100) / 100;
    const settlementDays = PAYMENT_RULES.settlementDays[method] || 2;

    this.stats.processed++;
    if (approved) this.stats.authorized++; else this.stats.declined++;

    const paymentId = `PMT-${Date.now().toString(36).toUpperCase()}`;
    const db_ops = getDbOps();
    try {
      await db_ops.insert('financial_decisions', 'decision_id', paymentId, {
        type: 'PAYMENT_PROCESSING', action: 'AUTHORIZE',
        paymentId, sellerId, buyerId, amount, currency, method, country,
        approved, declineReason, processingFee, netAmount, checks,
        createdAt: new Date().toISOString()
      });
    } catch (_) {}

    return {
      paymentId, action: 'AUTHORIZE', approved, declineReason,
      amount, currency, method, processingFee, netAmount,
      settlementDays, estimatedSettlement: new Date(Date.now() + settlementDays * 86400000).toISOString(),
      checks, latencyMs: Date.now() - startTime
    };
  }

  async _capture({ paymentId, amount }, startTime) {
    this.stats.captured++;
    return { paymentId, action: 'CAPTURE', status: 'CAPTURED', amount, capturedAt: new Date().toISOString(), latencyMs: Date.now() - startTime };
  }

  async _refund({ paymentId, amount, reason }, startTime) {
    this.stats.refunded++;
    const refundId = `RFD-${Date.now().toString(36).toUpperCase()}`;
    return { paymentId, refundId, action: 'REFUND', amount, reason, status: 'REFUNDED', processedAt: new Date().toISOString(), latencyMs: Date.now() - startTime };
  }

  async _chargeback({ paymentId, amount, reason }, startTime) {
    this.stats.chargedback++;
    return { paymentId, action: 'CHARGEBACK', amount, reason, status: 'CHARGEDBACK', processedAt: new Date().toISOString(), latencyMs: Date.now() - startTime };
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getPaymentProcessingAgent() {
  if (!instance) instance = new PaymentProcessingAgent();
  return instance;
}
export default { PaymentProcessingAgent, getPaymentProcessingAgent };
