/**
 * Savings Agent — manages seller savings accounts with interest.
 * APY tiers based on seller tier. Auto-sweep from wallet.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

const SAVINGS_TIERS = {
  Enterprise: { apy: 0.045, label: '4.50% APY', minBalance: 10000 },
  Platinum:   { apy: 0.040, label: '4.00% APY', minBalance: 5000 },
  Gold:       { apy: 0.035, label: '3.50% APY', minBalance: 2000 },
  Silver:     { apy: 0.030, label: '3.00% APY', minBalance: 1000 },
  Bronze:     { apy: 0.025, label: '2.50% APY', minBalance: 500 },
  New:        { apy: 0.020, label: '2.00% APY', minBalance: 100 }
};

export class SavingsAgent {
  constructor() {
    this.stats = { accounts: 0, deposits: 0, withdrawals: 0, interestPaid: 0 };
  }

  async evaluate(input) {
    const { sellerId, action = 'STATUS', amount = 0, sellerTier = 'New' } = input;
    const startTime = Date.now();
    const db_ops = getDbOps();

    // Get or create savings account
    let account = null;
    try {
      const record = await db_ops.getById('seller_savings', 'seller_id', sellerId);
      account = record?.data || null;
    } catch (_) {}

    const tierConfig = SAVINGS_TIERS[sellerTier] || SAVINGS_TIERS.New;

    if (!account) {
      account = {
        sellerId, balance: 0, interestEarned: 0, apy: tierConfig.apy,
        tier: sellerTier, createdAt: new Date().toISOString(),
        lastInterestDate: new Date().toISOString()
      };
      try { await db_ops.insert('seller_savings', 'seller_id', sellerId, account); } catch (_) {}
      this.stats.accounts++;
    }

    let result;

    switch (action) {
      case 'STATUS':
        // Calculate accrued interest since last payment
        const daysSinceInterest = (Date.now() - new Date(account.lastInterestDate).getTime()) / 86400000;
        const accruedInterest = Math.round(account.balance * (tierConfig.apy / 365) * daysSinceInterest * 100) / 100;
        result = {
          sellerId, balance: account.balance, apy: tierConfig.apy, apyLabel: tierConfig.label,
          tier: sellerTier, interestEarned: account.interestEarned,
          accruedInterest, projectedAnnualInterest: Math.round(account.balance * tierConfig.apy * 100) / 100,
          minBalance: tierConfig.minBalance
        };
        break;

      case 'DEPOSIT':
        account.balance += amount;
        account.apy = tierConfig.apy;
        account.tier = sellerTier;
        this.stats.deposits++;
        try { await db_ops.update('seller_savings', sellerId, account); } catch (_) {}
        result = { sellerId, action: 'DEPOSIT', amount, newBalance: account.balance, apy: tierConfig.apy };
        break;

      case 'WITHDRAW':
        if (amount > account.balance) {
          result = { sellerId, action: 'WITHDRAW', approved: false, reason: `Insufficient savings: $${account.balance.toFixed(2)}` };
          break;
        }
        account.balance -= amount;
        this.stats.withdrawals++;
        try { await db_ops.update('seller_savings', sellerId, account); } catch (_) {}
        result = { sellerId, action: 'WITHDRAW', approved: true, amount, newBalance: account.balance };
        break;

      case 'PAY_INTEREST':
        const days = (Date.now() - new Date(account.lastInterestDate).getTime()) / 86400000;
        const interest = Math.round(account.balance * (tierConfig.apy / 365) * days * 100) / 100;
        account.balance += interest;
        account.interestEarned += interest;
        account.lastInterestDate = new Date().toISOString();
        this.stats.interestPaid += interest;
        try { await db_ops.update('seller_savings', sellerId, account); } catch (_) {}
        result = { sellerId, action: 'PAY_INTEREST', interestAmount: interest, daysAccrued: Math.round(days), newBalance: account.balance, totalInterestEarned: account.interestEarned };
        break;

      default:
        result = { error: `Unknown action: ${action}` };
    }

    result.latencyMs = Date.now() - startTime;
    return result;
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getSavingsAgent() {
  if (!instance) instance = new SavingsAgent();
  return instance;
}
export default { SavingsAgent, getSavingsAgent };
