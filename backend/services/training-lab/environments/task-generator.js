/**
 * Task Generator — creates evaluation tasks for RL environments.
 * Generates diverse, difficulty-calibrated tasks across domains.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

const TASK_TEMPLATES = {
  fraud_investigation: [
    { template: 'Investigate seller {sellerId} for potential {fraudType}. Account age: {accountAge} days, risk score: {riskScore}.', params: { fraudType: ['synthetic_identity', 'velocity_abuse', 'network_fraud', 'document_fraud', 'money_laundering'] } },
    { template: 'Evaluate transaction {txId} of ${amount} from {country}. Device trust: {deviceTrust}. Previous chargebacks: {chargebacks}.', params: {} },
    { template: 'Review payout request of ${amount} for seller {sellerId}. {holdReason} hold in effect. Seller tier: {tier}.', params: { holdReason: ['fraud_flag', 'velocity_breach', 'new_seller', 'high_risk'] } }
  ],
  credit_underwriting: [
    { template: 'Evaluate credit application for {businessName} ({tier} tier). Revenue: ${gmv30d}/month, risk score: {riskScore}.', params: {} },
    { template: 'Review credit limit adjustment for seller {sellerId}. Current limit: ${currentLimit}. Risk changed from {prevRisk} to {newRisk}.', params: {} }
  ],
  seller_onboarding: [
    { template: 'Process onboarding for {businessName} from {country}. Business category: {category}. Documents submitted: {docCount}.', params: { category: ['ELECTRONICS', 'FASHION', 'GIFT_CARDS', 'SOFTWARE', 'JEWELRY', 'CRYPTO'] } },
    { template: 'Verify identity for {ownerName}. Document type: {docType}. Country: {country}. Business age: {businessAge} years.', params: { docType: ['PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID'] } }
  ],
  payment_processing: [
    { template: 'Authorize payment of ${amount} via {method} from {country}. Risk score: {riskScore}. First transaction: {isFirst}.', params: { method: ['CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'CRYPTO'] } },
    { template: 'Process refund of ${amount} for order {orderId}. Reason: {reason}. Seller dispute: {disputed}.', params: { reason: ['CUSTOMER_REQUEST', 'ITEM_NOT_RECEIVED', 'ITEM_DEFECTIVE', 'UNAUTHORIZED'] } }
  ]
};

const DIFFICULTY_CONFIGS = {
  EASY: { riskRange: [0, 30], amountRange: [10, 500], ambiguity: 0.1 },
  MEDIUM: { riskRange: [20, 70], amountRange: [100, 5000], ambiguity: 0.3 },
  HARD: { riskRange: [40, 95], amountRange: [1000, 100000], ambiguity: 0.6 },
  EXPERT: { riskRange: [50, 100], amountRange: [5000, 500000], ambiguity: 0.8 }
};

const COUNTRIES = ['US', 'UK', 'DE', 'FR', 'JP', 'CA', 'AU', 'NG', 'RO', 'PK', 'BR', 'IN', 'CN'];
const NAMES = ['Acme Corp', 'Global Trade', 'Quick Commerce', 'Prime Sellers', 'Digital Mart', 'Metro Merchants', 'Pacific Traders'];
const TIERS = ['New', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Enterprise'];

class TaskGenerator {
  constructor() {
    this.stats = { generated: 0, byDomain: {}, byDifficulty: {} };
  }

  generate(options = {}) {
    const { domain = 'fraud_investigation', difficulty = 'MEDIUM', count = 1, seed } = options;
    const tasks = [];

    for (let i = 0; i < count; i++) {
      const task = this._generateOne(domain, difficulty, seed ? seed + i : undefined);
      tasks.push(task);
    }

    this.stats.generated += count;
    this.stats.byDomain[domain] = (this.stats.byDomain[domain] || 0) + count;
    this.stats.byDifficulty[difficulty] = (this.stats.byDifficulty[difficulty] || 0) + count;

    return { tasks, domain, difficulty, count };
  }

  _generateOne(domain, difficulty, seed) {
    const diffConfig = DIFFICULTY_CONFIGS[difficulty] || DIFFICULTY_CONFIGS.MEDIUM;
    const templates = TASK_TEMPLATES[domain] || TASK_TEMPLATES.fraud_investigation;
    const template = templates[seed !== undefined ? seed % templates.length : Math.floor(Math.random() * templates.length)];

    const riskScore = Math.round(diffConfig.riskRange[0] + Math.random() * (diffConfig.riskRange[1] - diffConfig.riskRange[0]));
    const amount = Math.round(diffConfig.amountRange[0] + Math.random() * (diffConfig.amountRange[1] - diffConfig.amountRange[0]));

    const params = {
      sellerId: `SLR-TASK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      txId: `TXN-TASK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      orderId: `ORD-TASK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      amount, riskScore,
      country: COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)],
      businessName: NAMES[Math.floor(Math.random() * NAMES.length)],
      ownerName: ['John Smith', 'Maria Santos', 'Wei Zhang', 'Ahmed Khan', 'Elena Vasquez'][Math.floor(Math.random() * 5)],
      tier: TIERS[Math.floor(Math.random() * TIERS.length)],
      accountAge: Math.round(Math.random() * 1000),
      businessAge: Math.round(Math.random() * 15),
      docCount: Math.round(1 + Math.random() * 8),
      deviceTrust: Math.round(Math.random() * 100) / 100,
      chargebacks: Math.floor(Math.random() * 5),
      gmv30d: Math.round(Math.random() * 500000),
      currentLimit: Math.round(Math.random() * 200000),
      prevRisk: Math.round(Math.random() * 50),
      newRisk: riskScore,
      isFirst: Math.random() > 0.7,
      disputed: Math.random() > 0.6
    };

    // Fill template params from predefined lists
    if (template.params) {
      for (const [key, values] of Object.entries(template.params)) {
        params[key] = values[Math.floor(Math.random() * values.length)];
      }
    }

    // Fill template
    let description = template.template;
    for (const [key, value] of Object.entries(params)) {
      description = description.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }

    // Expected outcome based on risk + difficulty ambiguity
    let expectedAction;
    if (riskScore > 70) expectedAction = 'REJECT';
    else if (riskScore > 40) expectedAction = Math.random() < diffConfig.ambiguity ? 'REVIEW' : 'APPROVE';
    else expectedAction = 'APPROVE';

    return {
      taskId: `TASK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
      domain, difficulty, description, params,
      expectedAction, riskScore, ambiguityLevel: diffConfig.ambiguity,
      createdAt: new Date().toISOString()
    };
  }

  getDomains() { return Object.keys(TASK_TEMPLATES); }
  getDifficulties() { return Object.keys(DIFFICULTY_CONFIGS); }
  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getTaskGenerator() {
  if (!instance) instance = new TaskGenerator();
  return instance;
}
export default { TaskGenerator, getTaskGenerator };
