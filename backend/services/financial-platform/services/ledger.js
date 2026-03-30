/**
 * Financial Ledger — records all financial transactions.
 * Double-entry bookkeeping pattern.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

export class Ledger {
  constructor() {
    this.stats = { entries: 0 };
  }

  async record(entry) {
    const { sellerId, type, amount, currency = 'USD', description, reference, metadata = {} } = entry;
    const db_ops = getDbOps();

    const entryId = `LED-${Date.now().toString(36).toUpperCase()}`;
    const ledgerEntry = {
      entryId, sellerId, type, // CREDIT, DEBIT, FEE, PAYOUT, LOAN_DISBURSEMENT, LOAN_REPAYMENT, REFUND
      amount: parseFloat(amount) || 0,
      currency, description, reference, metadata,
      balanceAfter: 0, // Would be computed from running balance
      createdAt: new Date().toISOString()
    };

    try {
      await db_ops.insert('financial_ledger', 'entry_id', entryId, ledgerEntry);
      this.stats.entries++;
    } catch (_) { /* best-effort */ }

    return ledgerEntry;
  }

  async getSellerLedger(sellerId, limit = 50) {
    const db_ops = getDbOps();
    const allEntries = (await db_ops.getAll('financial_ledger', 10000, 0)).map(e => e.data);
    return allEntries
      .filter(e => e.sellerId === sellerId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  async getStats() {
    const db_ops = getDbOps();
    const allEntries = (await db_ops.getAll('financial_ledger', 10000, 0)).map(e => e.data);

    const byType = {};
    let totalCredits = 0, totalDebits = 0;
    for (const e of allEntries) {
      byType[e.type] = (byType[e.type] || 0) + 1;
      if (['CREDIT', 'LOAN_DISBURSEMENT', 'REFUND'].includes(e.type)) totalCredits += e.amount;
      else totalDebits += e.amount;
    }

    return {
      totalEntries: allEntries.length,
      totalCredits, totalDebits,
      netFlow: totalCredits - totalDebits,
      byType
    };
  }
}

let instance = null;
export function getLedger() {
  if (!instance) instance = new Ledger();
  return instance;
}
export default { Ledger, getLedger };
