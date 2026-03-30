/**
 * Payment Processor — simulates payment gateway interactions.
 * Supports: capture, refund, void, settle.
 */

export class PaymentProcessor {
  constructor() {
    this.stats = { processed: 0, captured: 0, refunded: 0, failed: 0 };
  }

  async capture(paymentDetails) {
    const { amount, currency = 'USD', method, sellerId } = paymentDetails;
    const startTime = Date.now();

    // Simulate gateway latency
    await new Promise(r => setTimeout(r, Math.random() * 50 + 10));

    // 95% success rate
    const success = Math.random() > 0.05;

    this.stats.processed++;
    if (success) this.stats.captured++; else this.stats.failed++;

    return {
      success,
      transactionId: `GW-${Date.now().toString(36).toUpperCase()}`,
      amount, currency, method, sellerId,
      gateway: 'mock-stripe',
      gatewayResponse: success ? 'APPROVED' : 'DECLINED',
      declineReason: success ? null : 'INSUFFICIENT_FUNDS',
      processingFee: Math.round(amount * 0.029 * 100) / 100, // 2.9% processing fee
      netAmount: Math.round(amount * 0.971 * 100) / 100,
      latencyMs: Date.now() - startTime,
      processedAt: new Date().toISOString()
    };
  }

  async refund(transactionId, amount, reason = 'CUSTOMER_REQUEST') {
    await new Promise(r => setTimeout(r, Math.random() * 30 + 10));

    this.stats.refunded++;

    return {
      success: true,
      refundId: `RF-${Date.now().toString(36).toUpperCase()}`,
      originalTransactionId: transactionId,
      amount, reason,
      gateway: 'mock-stripe',
      processedAt: new Date().toISOString()
    };
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getPaymentProcessor() {
  if (!instance) instance = new PaymentProcessor();
  return instance;
}
export default { PaymentProcessor, getPaymentProcessor };
