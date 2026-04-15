/**
 * Double-Entry Financial Ledger
 *
 * Every money movement creates TWO entries that must balance:
 *   DEBIT (money leaves an account) + CREDIT (money enters an account)
 *
 * Account Types:
 *   SELLER_WALLET     — seller's available balance
 *   SELLER_ESCROW     — funds held pending fulfillment
 *   SELLER_RESERVE    — fraud/chargeback reserve (% of volume)
 *   PLATFORM_REVENUE  — platform fees and commissions
 *   PLATFORM_ESCROW   — funds in transit between parties
 *   SETTLEMENT        — bank settlement account
 *   SUSPENSE          — unmatched or disputed funds
 *
 * Core Principles:
 *   1. Immutable — entries never modified, only corrected with reversals
 *   2. Balanced — sum of all debits MUST equal sum of all credits
 *   3. Real-time balances — computed from entries, never stored separately
 *   4. Full audit trail — every entry has timestamp, reference, and metadata
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

const ACCOUNT_TYPES = [
  'SELLER_WALLET', 'SELLER_ESCROW', 'SELLER_RESERVE',
  'PLATFORM_REVENUE', 'PLATFORM_ESCROW', 'SETTLEMENT', 'SUSPENSE'
];

const TRANSACTION_TYPES = {
  PAYMENT_CAPTURE:     { debit: 'PLATFORM_ESCROW',   credit: 'SELLER_ESCROW',    description: 'Payment captured into escrow' },
  ESCROW_RELEASE:      { debit: 'SELLER_ESCROW',     credit: 'SELLER_WALLET',    description: 'Escrow released to seller wallet' },
  PLATFORM_FEE:        { debit: 'SELLER_WALLET',     credit: 'PLATFORM_REVENUE', description: 'Platform fee charged' },
  PAYOUT:              { debit: 'SELLER_WALLET',      credit: 'SETTLEMENT',       description: 'Payout to seller bank account' },
  REFUND:              { debit: 'SELLER_ESCROW',      credit: 'PLATFORM_ESCROW',  description: 'Refund to buyer' },
  CHARGEBACK:          { debit: 'SELLER_RESERVE',     credit: 'SETTLEMENT',       description: 'Chargeback deducted from reserve' },
  RESERVE_HOLD:        { debit: 'SELLER_WALLET',      credit: 'SELLER_RESERVE',   description: 'Funds moved to fraud reserve' },
  RESERVE_RELEASE:     { debit: 'SELLER_RESERVE',     credit: 'SELLER_WALLET',    description: 'Reserve funds released back' },
  LOAN_DISBURSEMENT:   { debit: 'SETTLEMENT',         credit: 'SELLER_WALLET',    description: 'Loan funds disbursed' },
  LOAN_REPAYMENT:      { debit: 'SELLER_WALLET',      credit: 'SETTLEMENT',       description: 'Loan repayment collected' },
  INTEREST_PAYMENT:    { debit: 'PLATFORM_REVENUE',   credit: 'SELLER_WALLET',    description: 'Savings interest paid' },
  FX_CONVERSION:       { debit: 'SELLER_WALLET',      credit: 'SELLER_WALLET',    description: 'Currency conversion' },
  ADJUSTMENT:          { debit: 'SUSPENSE',           credit: 'SELLER_WALLET',    description: 'Manual adjustment' },
  REVERSAL:            { debit: null,                  credit: null,               description: 'Reversal of previous entry' }
};

class FinancialLedger {
  constructor() {
    this.stats = {
      totalEntries: 0, totalDebits: 0, totalCredits: 0,
      byType: {}, reconciliationErrors: 0
    };
  }

  /**
   * Record a double-entry transaction.
   * Creates exactly 2 entries: one DEBIT and one CREDIT.
   */
  async record({ type, sellerId, amount, currency = 'USD', reference, metadata = {}, description }) {
    if (!type || !TRANSACTION_TYPES[type]) throw new Error(`Invalid transaction type: ${type}`);
    if (!amount || amount <= 0) throw new Error('Amount must be positive');

    const txType = TRANSACTION_TYPES[type];
    const entryId = `LED-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const timestamp = new Date().toISOString();
    const db_ops = getDbOps();

    // Debit entry
    const debitEntry = {
      entryId: `${entryId}-D`,
      ledgerEntryGroup: entryId,
      sellerId: sellerId || 'PLATFORM',
      accountType: txType.debit || metadata.debitAccount || 'SUSPENSE',
      entryType: 'DEBIT',
      amount,
      currency,
      transactionType: type,
      description: description || txType.description,
      reference,
      metadata,
      createdAt: timestamp,
      immutable: true
    };

    // Credit entry
    const creditEntry = {
      entryId: `${entryId}-C`,
      ledgerEntryGroup: entryId,
      sellerId: sellerId || 'PLATFORM',
      accountType: txType.credit || metadata.creditAccount || 'SUSPENSE',
      entryType: 'CREDIT',
      amount,
      currency,
      transactionType: type,
      description: description || txType.description,
      reference,
      metadata,
      createdAt: timestamp,
      immutable: true
    };

    // Persist both entries
    try {
      await db_ops.insert('financial_ledger', 'entry_id', debitEntry.entryId, debitEntry);
      await db_ops.insert('financial_ledger', 'entry_id', creditEntry.entryId, creditEntry);
    } catch (err) {
      // If one succeeded but the other failed, log reconciliation error
      this.stats.reconciliationErrors++;
      throw new Error(`Ledger imbalance — partial write: ${err.message}`);
    }

    this.stats.totalEntries += 2;
    this.stats.totalDebits += amount;
    this.stats.totalCredits += amount;
    this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;

    return {
      entryId,
      type,
      debit: { account: debitEntry.accountType, amount, entryId: debitEntry.entryId },
      credit: { account: creditEntry.accountType, amount, entryId: creditEntry.entryId },
      balanced: true,
      timestamp
    };
  }

  /**
   * Reverse a previous ledger entry (creates opposite entries).
   */
  async reverse(originalEntryId, reason) {
    const db_ops = getDbOps();
    const allEntries = (await db_ops.getAll('financial_ledger', 50000, 0)).map(e => e.data);
    const original = allEntries.filter(e => e.ledgerEntryGroup === originalEntryId);

    if (original.length !== 2) throw new Error(`Cannot find balanced pair for ${originalEntryId}`);

    const debit = original.find(e => e.entryType === 'DEBIT');
    const credit = original.find(e => e.entryType === 'CREDIT');

    // Reverse: swap debit and credit accounts
    return this.record({
      type: 'REVERSAL',
      sellerId: debit.sellerId,
      amount: debit.amount,
      currency: debit.currency,
      reference: originalEntryId,
      metadata: {
        reversalReason: reason,
        originalEntryId,
        debitAccount: credit.accountType, // swap
        creditAccount: debit.accountType  // swap
      },
      description: `Reversal: ${reason} (original: ${originalEntryId})`
    });
  }

  /**
   * Compute real-time balance for an account.
   * Balance = sum(credits) - sum(debits) for that account.
   */
  async getBalance(sellerId, accountType = 'SELLER_WALLET', currency = 'USD') {
    const db_ops = getDbOps();
    const allEntries = (await db_ops.getAll('financial_ledger', 50000, 0)).map(e => e.data);

    const sellerEntries = allEntries.filter(e =>
      e.sellerId === sellerId && e.accountType === accountType && e.currency === currency
    );

    let balance = 0;
    for (const entry of sellerEntries) {
      if (entry.entryType === 'CREDIT') balance += entry.amount;
      if (entry.entryType === 'DEBIT') balance -= entry.amount;
    }

    return {
      sellerId, accountType, currency,
      balance: Math.round(balance * 100) / 100,
      entryCount: sellerEntries.length,
      lastEntry: sellerEntries.length > 0
        ? sellerEntries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt
        : null
    };
  }

  /**
   * Get all balances for a seller across all account types.
   */
  async getSellerBalances(sellerId, currency = 'USD') {
    const balances = {};
    for (const accountType of ACCOUNT_TYPES) {
      const bal = await this.getBalance(sellerId, accountType, currency);
      if (bal.balance !== 0 || bal.entryCount > 0) {
        balances[accountType] = bal;
      }
    }
    return { sellerId, currency, accounts: balances, computedAt: new Date().toISOString() };
  }

  /**
   * Get ledger entries for a seller (with pagination).
   */
  async getSellerLedger(sellerId, limit = 50) {
    const db_ops = getDbOps();
    const allEntries = (await db_ops.getAll('financial_ledger', 50000, 0)).map(e => e.data);
    return allEntries
      .filter(e => e.sellerId === sellerId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  /**
   * Holds — place a hold on funds (moves from wallet to escrow/reserve).
   */
  async placeHold(sellerId, amount, reason, holdType = 'RESERVE_HOLD') {
    return this.record({
      type: holdType,
      sellerId, amount,
      reference: `HOLD-${Date.now().toString(36).toUpperCase()}`,
      metadata: { reason, holdType },
      description: `Hold: ${reason}`
    });
  }

  /**
   * Release a hold (moves from escrow/reserve back to wallet).
   */
  async releaseHold(sellerId, amount, reason, releaseType = 'RESERVE_RELEASE') {
    return this.record({
      type: releaseType,
      sellerId, amount,
      reference: `REL-${Date.now().toString(36).toUpperCase()}`,
      metadata: { reason },
      description: `Hold released: ${reason}`
    });
  }

  /**
   * Daily reconciliation — verify all debits equal all credits.
   */
  async reconcile() {
    const db_ops = getDbOps();
    const allEntries = (await db_ops.getAll('financial_ledger', 100000, 0)).map(e => e.data);

    let totalDebits = 0, totalCredits = 0;
    const byAccount = {};
    const orphanedEntries = [];

    // Group by entry group
    const groups = {};
    for (const entry of allEntries) {
      const group = entry.ledgerEntryGroup;
      if (!groups[group]) groups[group] = [];
      groups[group].push(entry);

      if (entry.entryType === 'DEBIT') totalDebits += entry.amount;
      if (entry.entryType === 'CREDIT') totalCredits += entry.amount;

      if (!byAccount[entry.accountType]) byAccount[entry.accountType] = { debits: 0, credits: 0 };
      if (entry.entryType === 'DEBIT') byAccount[entry.accountType].debits += entry.amount;
      if (entry.entryType === 'CREDIT') byAccount[entry.accountType].credits += entry.amount;
    }

    // Check each group has exactly 2 balanced entries
    for (const [groupId, entries] of Object.entries(groups)) {
      if (entries.length !== 2) {
        orphanedEntries.push({ groupId, entries: entries.length });
      }
    }

    const balanced = Math.abs(totalDebits - totalCredits) < 0.01;

    return {
      balanced,
      totalDebits: Math.round(totalDebits * 100) / 100,
      totalCredits: Math.round(totalCredits * 100) / 100,
      difference: Math.round((totalDebits - totalCredits) * 100) / 100,
      totalEntries: allEntries.length,
      totalGroups: Object.keys(groups).length,
      orphanedEntries,
      accountBalances: Object.fromEntries(
        Object.entries(byAccount).map(([acc, bal]) => [acc, {
          debits: Math.round(bal.debits * 100) / 100,
          credits: Math.round(bal.credits * 100) / 100,
          net: Math.round((bal.credits - bal.debits) * 100) / 100
        }])
      ),
      reconciledAt: new Date().toISOString()
    };
  }

  /**
   * Get transaction types reference.
   */
  getTransactionTypes() {
    return Object.entries(TRANSACTION_TYPES).map(([type, config]) => ({
      type, debitAccount: config.debit, creditAccount: config.credit, description: config.description
    }));
  }

  /**
   * Get account types reference.
   */
  getAccountTypes() {
    return ACCOUNT_TYPES.map(type => ({
      type,
      description: {
        SELLER_WALLET: 'Available balance the seller can withdraw',
        SELLER_ESCROW: 'Funds held pending order fulfillment',
        SELLER_RESERVE: 'Fraud/chargeback reserve (held by platform)',
        PLATFORM_REVENUE: 'Fees and commissions earned by platform',
        PLATFORM_ESCROW: 'Funds in transit between buyer and seller',
        SETTLEMENT: 'Bank settlement account for external transfers',
        SUSPENSE: 'Unmatched or disputed funds pending resolution'
      }[type] || type
    }));
  }

  getStats() {
    return { ...this.stats };
  }
}

let instance = null;
export function getLedger() {
  if (!instance) instance = new FinancialLedger();
  return instance;
}
export default { FinancialLedger, getLedger };
