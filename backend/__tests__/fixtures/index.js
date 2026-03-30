/**
 * Deterministic test fixtures — replaces Math.random() in tests.
 */

export const SELLERS = {
  lowRisk: {
    sellerId: 'SLR-FIXTURE-LOW', businessName: 'Safe Commerce LLC',
    country: 'US', status: 'ACTIVE', riskScore: 15, riskTier: 'LOW',
    businessCategory: 'SOFTWARE', email: 'safe@safecommerce.com',
    createdAt: new Date(Date.now() - 365 * 86400000).toISOString()
  },
  mediumRisk: {
    sellerId: 'SLR-FIXTURE-MED', businessName: 'Global Trade Co',
    country: 'DE', status: 'ACTIVE', riskScore: 45, riskTier: 'MEDIUM',
    businessCategory: 'ELECTRONICS', email: 'info@globaltrade.de',
    createdAt: new Date(Date.now() - 180 * 86400000).toISOString()
  },
  highRisk: {
    sellerId: 'SLR-FIXTURE-HIGH', businessName: 'Quick Cash Traders',
    country: 'NG', status: 'UNDER_REVIEW', riskScore: 78, riskTier: 'HIGH',
    businessCategory: 'GIFT_CARDS', email: 'temp@quickcash.ng',
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString()
  }
};

export const TRANSACTIONS = {
  normal: {
    transactionId: 'TXN-FIXTURE-001', sellerId: 'SLR-FIXTURE-LOW',
    amount: 150, currency: 'USD', status: 'COMPLETED',
    createdAt: new Date().toISOString()
  },
  suspicious: {
    transactionId: 'TXN-FIXTURE-002', sellerId: 'SLR-FIXTURE-HIGH',
    amount: 9500, currency: 'USD', status: 'PENDING',
    createdAt: new Date().toISOString()
  },
  bulk: Array.from({ length: 50 }, (_, i) => ({
    transactionId: `TXN-FIXTURE-BULK-${i}`,
    sellerId: 'SLR-FIXTURE-LOW',
    amount: 100 + i * 10,
    currency: 'USD',
    status: 'COMPLETED',
    createdAt: new Date(Date.now() - i * 86400000).toISOString()
  }))
};

export const PAYMENTS = {
  cardPayment: {
    amount: 250, currency: 'USD', method: 'CARD',
    cardBrand: 'Visa', last4: '4242', country: 'US'
  },
  bankTransfer: {
    amount: 5000, currency: 'USD', method: 'BANK_TRANSFER',
    routingNumber: '021000021', country: 'US'
  }
};

export default { SELLERS, TRANSACTIONS, PAYMENTS };
