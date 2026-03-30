/**
 * Seller Wallet Agent — manages seller digital wallet/balance.
 * Supports: deposits, withdrawals, transfers, holds, balance inquiries.
 * Like Shopify Balance / Square Checking.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

export class SellerWalletAgent {
  constructor() {
    this.stats = { operations: 0, deposits: 0, withdrawals: 0, transfers: 0 };
  }

  async evaluate(input) {
    const { sellerId, action = 'BALANCE', amount = 0, currency = 'USD',
            toSellerId, description, reference } = input;
    const startTime = Date.now();
    const db_ops = getDbOps();

    // Get or create wallet
    let wallet = null;
    try {
      const record = await db_ops.getById('seller_wallets', 'seller_id', sellerId);
      wallet = record?.data || null;
    } catch (_) {}

    if (!wallet) {
      wallet = {
        sellerId, balance: 0, availableBalance: 0, holdBalance: 0,
        currency, totalDeposits: 0, totalWithdrawals: 0,
        createdAt: new Date().toISOString(), transactions: []
      };
      try { await db_ops.insert('seller_wallets', 'seller_id', sellerId, wallet); } catch (_) {}
    }

    this.stats.operations++;
    let result;

    switch (action) {
      case 'BALANCE':
        result = { sellerId, balance: wallet.balance, availableBalance: wallet.availableBalance, holdBalance: wallet.holdBalance, currency: wallet.currency };
        break;

      case 'DEPOSIT':
        wallet.balance += amount;
        wallet.availableBalance += amount;
        wallet.totalDeposits += amount;
        this.stats.deposits++;
        try { await db_ops.update('seller_wallets', sellerId, wallet); } catch (_) {}
        result = { sellerId, action: 'DEPOSIT', amount, newBalance: wallet.balance, description, reference, transactionId: `WTX-${Date.now().toString(36).toUpperCase()}` };
        break;

      case 'WITHDRAW':
        if (amount > wallet.availableBalance) {
          result = { sellerId, action: 'WITHDRAW', approved: false, reason: `Insufficient funds: $${wallet.availableBalance.toFixed(2)} available, $${amount.toFixed(2)} requested` };
          break;
        }
        wallet.balance -= amount;
        wallet.availableBalance -= amount;
        wallet.totalWithdrawals += amount;
        this.stats.withdrawals++;
        try { await db_ops.update('seller_wallets', sellerId, wallet); } catch (_) {}
        result = { sellerId, action: 'WITHDRAW', approved: true, amount, newBalance: wallet.balance, transactionId: `WTX-${Date.now().toString(36).toUpperCase()}` };
        break;

      case 'HOLD':
        if (amount > wallet.availableBalance) {
          result = { sellerId, action: 'HOLD', approved: false, reason: 'Insufficient available balance' };
          break;
        }
        wallet.availableBalance -= amount;
        wallet.holdBalance += amount;
        try { await db_ops.update('seller_wallets', sellerId, wallet); } catch (_) {}
        result = { sellerId, action: 'HOLD', amount, holdBalance: wallet.holdBalance, availableBalance: wallet.availableBalance, reason: description };
        break;

      case 'RELEASE_HOLD':
        const releaseAmount = Math.min(amount, wallet.holdBalance);
        wallet.holdBalance -= releaseAmount;
        wallet.availableBalance += releaseAmount;
        try { await db_ops.update('seller_wallets', sellerId, wallet); } catch (_) {}
        result = { sellerId, action: 'RELEASE_HOLD', amount: releaseAmount, holdBalance: wallet.holdBalance, availableBalance: wallet.availableBalance };
        break;

      case 'TRANSFER':
        if (amount > wallet.availableBalance) {
          result = { sellerId, action: 'TRANSFER', approved: false, reason: 'Insufficient funds' };
          break;
        }
        wallet.balance -= amount;
        wallet.availableBalance -= amount;
        this.stats.transfers++;
        try { await db_ops.update('seller_wallets', sellerId, wallet); } catch (_) {}
        result = { sellerId, action: 'TRANSFER', amount, toSellerId, newBalance: wallet.balance, transferId: `TRF-${Date.now().toString(36).toUpperCase()}` };
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
export function getSellerWalletAgent() {
  if (!instance) instance = new SellerWalletAgent();
  return instance;
}
export default { SellerWalletAgent, getSellerWalletAgent };
