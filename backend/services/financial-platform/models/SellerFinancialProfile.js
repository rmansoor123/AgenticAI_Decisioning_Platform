/**
 * Seller Financial Profile — extends seller with credit, loan, and payout data.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

export class SellerFinancialProfile {
  static async getProfile(sellerId) {
    const db_ops = getDbOps();

    // Get base seller
    const sellerRecord = await db_ops.getById('sellers', 'seller_id', sellerId);
    const seller = sellerRecord?.data || sellerRecord || {};

    // Get financial decisions for this seller
    const allDecisions = (await db_ops.getAll('financial_decisions', 10000, 0)).map(d => d.data);
    const sellerDecisions = allDecisions.filter(d => d.sellerId === sellerId);

    // Latest underwriting
    const underwriting = sellerDecisions
      .filter(d => d.type === 'UNDERWRITING')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;

    // Latest credit adjustment
    const creditAdjustment = sellerDecisions
      .filter(d => d.type === 'CREDIT_ADJUSTMENT')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;

    // Payout history
    const payoutDecisions = sellerDecisions.filter(d => d.type === 'PAYOUT_RELEASE');
    const payoutsReleased = payoutDecisions.filter(d => d.releaseApproved).length;
    const payoutsHeld = payoutDecisions.filter(d => !d.releaseApproved).length;

    // Loan status
    const loanDecisions = sellerDecisions.filter(d => d.type === 'LOAN_SERVICING');
    const activeLoan = loanDecisions.length > 0 ? loanDecisions[loanDecisions.length - 1] : null;

    // Transaction summary
    const allTx = (await db_ops.getAll('transactions', 50000, 0)).map(t => t.data);
    const sellerTx = allTx.filter(t => t.sellerId === sellerId);
    const gmv30d = sellerTx
      .filter(t => new Date(t.createdAt || 0) > new Date(Date.now() - 30 * 86400000))
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const gmvTotal = sellerTx.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    return {
      sellerId,
      businessName: seller.businessName || 'Unknown',
      status: seller.status || 'UNKNOWN',
      country: seller.country || 'US',
      riskScore: seller.riskScore || 0,
      accountAgeDays: seller.createdAt ? Math.floor((Date.now() - new Date(seller.createdAt).getTime()) / 86400000) : 0,

      // Financial
      creditApproved: underwriting?.creditApproved || false,
      creditLimit: creditAdjustment?.adjustedLimit || underwriting?.creditLimit || 0,
      interestRateTier: underwriting?.interestRateTier || null,
      interestRate: underwriting?.interestRate || null,

      // GMV
      gmv30d: Math.round(gmv30d * 100) / 100,
      gmvTotal: Math.round(gmvTotal * 100) / 100,
      transactionCount: sellerTx.length,

      // Payouts
      payoutsReleased,
      payoutsHeld,
      payoutApprovalRate: (payoutsReleased + payoutsHeld) > 0
        ? Math.round(payoutsReleased / (payoutsReleased + payoutsHeld) * 100) : 100,

      // Loan
      activeLoan: activeLoan ? {
        loanStatus: activeLoan.loanStatus,
        outstandingBalance: activeLoan.newBalance || activeLoan.outstandingBalance,
        defaultRiskScore: activeLoan.defaultRiskScore,
        daysPastDue: activeLoan.daysPastDue
      } : null,

      // Decisions
      totalFinancialDecisions: sellerDecisions.length,
      lastDecisionAt: sellerDecisions.length > 0
        ? sellerDecisions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt
        : null
    };
  }

  static async getAllProfiles() {
    const db_ops = getDbOps();
    const sellers = (await db_ops.getAll('sellers', 10000, 0)).map(s => s.data);
    // Return basic info for list view — full profile is expensive
    return sellers.map(s => ({
      sellerId: s.sellerId,
      businessName: s.businessName || 'Unknown',
      status: s.status || 'UNKNOWN',
      country: s.country || 'US',
      riskScore: s.riskScore || 0
    }));
  }
}

export default { SellerFinancialProfile };
