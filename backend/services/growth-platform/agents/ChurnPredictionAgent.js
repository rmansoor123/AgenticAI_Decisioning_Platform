/**
 * Churn Prediction Agent — ML-powered churn prediction using 12 weighted
 * behavioral signals computed from real DB data.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

let _instance = null;

export class ChurnPredictionAgent {
  constructor() {
    this.stats = { predictions: 0, highRisk: 0, critical: 0 };

    // 12 weighted behavioral signals
    this.signalWeights = {
      transactionRecency:    0.15,   // days since last transaction
      volumeDecline:         0.14,   // % decline in recent vs historical volume
      revenueDecline:        0.12,   // % decline in revenue
      supportTickets:        0.10,   // open/recent case count
      returnRate:            0.09,   // returns / transactions ratio
      engagementDecay:       0.08,   // listing activity decline
      loginFrequency:        0.07,   // profile update frequency proxy
      payoutFrequency:       0.06,   // payout request cadence
      listingStagnation:     0.06,   // no new listings in N days
      disputeRate:           0.05,   // disputes / transactions
      responseLatency:       0.04,   // time to respond to cases
      accountAge:            0.04,   // newer accounts churn more
    };

    this.actionMap = {
      CRITICAL: ['ASSIGN_SUCCESS_MANAGER', 'OFFER_PREMIUM_SUPPORT', 'SCHEDULE_EXECUTIVE_CALL'],
      HIGH:     ['SEND_REACTIVATION_EMAIL', 'OFFER_PROMOTION', 'ASSIGN_SUCCESS_MANAGER'],
      MEDIUM:   ['SEND_ENGAGEMENT_NUDGE', 'OFFER_FEATURE_TUTORIAL', 'SEND_BENCHMARK_REPORT'],
      LOW:      ['SEND_NEWSLETTER', 'FEATURE_HIGHLIGHT'],
    };
  }

  async predict(input) {
    const { sellerId } = input;
    const startTime = Date.now();
    const db_ops = getDbOps();

    // Fetch real data from DB
    const [allSellers, allTx, allCases, allListings] = await Promise.all([
      db_ops.getAll('sellers', 50000, 0),
      db_ops.getAll('transactions', 50000, 0),
      db_ops.getAll('cases', 50000, 0),
      db_ops.getAll('listings', 50000, 0),
    ]);

    const seller = allSellers.find(s => (s.data?.sellerId || s.seller_id) === sellerId);
    if (!seller) {
      return {
        sellerId,
        churnProbability: 0,
        riskLevel: 'UNKNOWN',
        churnDrivers: [],
        recommendedActions: [],
        estimatedChurnDate: null,
        signals: {},
        latencyMs: Date.now() - startTime,
        error: 'Seller not found',
      };
    }

    const sellerData = seller.data || seller;
    const now = Date.now();

    // Filter seller-specific data
    const sellerTx = allTx.map(t => t.data || t).filter(t => t.sellerId === sellerId);
    const sellerCases = allCases.map(c => c.data || c).filter(c => c.sellerId === sellerId);
    const sellerListings = allListings.map(l => l.data || l).filter(l => l.sellerId === sellerId);

    // Compute 12 signals (each normalized 0-1, higher = more churn risk)
    const signals = {};

    // 1. Transaction recency
    const txDates = sellerTx.map(t => new Date(t.createdAt || t.timestamp || 0).getTime()).filter(d => d > 0);
    const lastTxDate = txDates.length > 0 ? Math.max(...txDates) : 0;
    const daysSinceLastTx = lastTxDate > 0 ? (now - lastTxDate) / 86400000 : 90;
    signals.transactionRecency = Math.min(1, daysSinceLastTx / 90);

    // 2. Volume decline (last 30d vs prior 30d)
    const thirtyDaysAgo = now - 30 * 86400000;
    const sixtyDaysAgo = now - 60 * 86400000;
    const recentTx = sellerTx.filter(t => new Date(t.createdAt || t.timestamp || 0).getTime() > thirtyDaysAgo);
    const priorTx = sellerTx.filter(t => {
      const d = new Date(t.createdAt || t.timestamp || 0).getTime();
      return d > sixtyDaysAgo && d <= thirtyDaysAgo;
    });
    const volumeRatio = priorTx.length > 0 ? 1 - (recentTx.length / priorTx.length) : (recentTx.length > 0 ? 0 : 0.8);
    signals.volumeDecline = Math.max(0, Math.min(1, volumeRatio));

    // 3. Revenue decline
    const recentRevenue = recentTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const priorRevenue = priorTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const revRatio = priorRevenue > 0 ? 1 - (recentRevenue / priorRevenue) : (recentRevenue > 0 ? 0 : 0.8);
    signals.revenueDecline = Math.max(0, Math.min(1, revRatio));

    // 4. Support tickets (cases)
    const recentCases = sellerCases.filter(c => new Date(c.createdAt || 0).getTime() > thirtyDaysAgo);
    signals.supportTickets = Math.min(1, recentCases.length / 10);

    // 5. Return rate
    const returnCount = sellerTx.filter(t => (t.status || '').toLowerCase().includes('return')).length;
    signals.returnRate = sellerTx.length > 0 ? Math.min(1, (returnCount / sellerTx.length) * 5) : 0;

    // 6. Engagement decay (listing activity)
    const recentListings = sellerListings.filter(l => new Date(l.createdAt || 0).getTime() > thirtyDaysAgo);
    const priorListings = sellerListings.filter(l => {
      const d = new Date(l.createdAt || 0).getTime();
      return d > sixtyDaysAgo && d <= thirtyDaysAgo;
    });
    const listingRatio = priorListings.length > 0 ? 1 - (recentListings.length / priorListings.length) : (recentListings.length > 0 ? 0 : 0.6);
    signals.engagementDecay = Math.max(0, Math.min(1, listingRatio));

    // 7. Login frequency (proxy from profile update recency)
    const profileUpdatedAt = new Date(sellerData.updatedAt || sellerData.createdAt || 0).getTime();
    const daysSinceUpdate = profileUpdatedAt > 0 ? (now - profileUpdatedAt) / 86400000 : 60;
    signals.loginFrequency = Math.min(1, daysSinceUpdate / 60);

    // 8. Payout frequency
    const payoutCount = sellerTx.filter(t => (t.type || '').toLowerCase().includes('payout')).length;
    signals.payoutFrequency = sellerTx.length > 0 ? Math.max(0, 1 - (payoutCount / Math.max(1, sellerTx.length / 10))) : 0.5;

    // 9. Listing stagnation
    const newestListing = sellerListings.reduce((max, l) => {
      const d = new Date(l.createdAt || 0).getTime();
      return d > max ? d : max;
    }, 0);
    const daysSinceNewListing = newestListing > 0 ? (now - newestListing) / 86400000 : 90;
    signals.listingStagnation = Math.min(1, daysSinceNewListing / 60);

    // 10. Dispute rate
    const disputeCount = sellerCases.filter(c => (c.type || c.checkpoint || '').toLowerCase().includes('disput')).length;
    signals.disputeRate = sellerTx.length > 0 ? Math.min(1, (disputeCount / sellerTx.length) * 10) : 0;

    // 11. Response latency (average time to resolve cases)
    const resolvedCases = sellerCases.filter(c => c.resolvedAt && c.createdAt);
    const avgResolutionDays = resolvedCases.length > 0
      ? resolvedCases.reduce((s, c) => s + (new Date(c.resolvedAt).getTime() - new Date(c.createdAt).getTime()) / 86400000, 0) / resolvedCases.length
      : 7;
    signals.responseLatency = Math.min(1, avgResolutionDays / 14);

    // 12. Account age (newer = higher risk)
    const accountCreated = new Date(sellerData.createdAt || 0).getTime();
    const accountAgeDays = accountCreated > 0 ? (now - accountCreated) / 86400000 : 365;
    signals.accountAge = Math.max(0, 1 - Math.min(1, accountAgeDays / 365));

    // Compute weighted churn probability
    let churnProbability = 0;
    for (const [signal, weight] of Object.entries(this.signalWeights)) {
      churnProbability += (signals[signal] || 0) * weight;
    }
    churnProbability = Math.round(churnProbability * 1000) / 1000;

    // Risk level
    let riskLevel = 'LOW';
    if (churnProbability >= 0.8) riskLevel = 'CRITICAL';
    else if (churnProbability >= 0.6) riskLevel = 'HIGH';
    else if (churnProbability >= 0.35) riskLevel = 'MEDIUM';

    // Top churn drivers (sorted by contribution)
    const contributions = Object.entries(this.signalWeights).map(([signal, weight]) => ({
      signal,
      value: Math.round((signals[signal] || 0) * 100) / 100,
      weight,
      contribution: Math.round((signals[signal] || 0) * weight * 1000) / 1000,
    })).sort((a, b) => b.contribution - a.contribution);

    const churnDrivers = contributions.slice(0, 5).map(c => ({
      signal: c.signal,
      description: this._signalDescription(c.signal),
      severity: c.contribution > 0.1 ? 'HIGH' : c.contribution > 0.05 ? 'MEDIUM' : 'LOW',
      value: c.value,
      contribution: c.contribution,
    }));

    // Recommended actions
    const recommendedActions = (this.actionMap[riskLevel] || []).map(action => ({
      action,
      description: this._actionDescription(action),
      priority: riskLevel,
    }));

    // Estimated churn date
    const daysToChurn = Math.max(7, Math.round((1 - churnProbability) * 90));
    const estimatedChurnDate = new Date(now + daysToChurn * 86400000).toISOString().split('T')[0];

    this.stats.predictions++;
    if (riskLevel === 'HIGH') this.stats.highRisk++;
    if (riskLevel === 'CRITICAL') this.stats.critical++;

    // Persist prediction
    try {
      await db_ops.insert('growth_predictions', 'prediction_id', `PRED-${Date.now().toString(36).toUpperCase()}`, {
        sellerId,
        type: 'CHURN',
        churnProbability,
        riskLevel,
        signals: JSON.stringify(signals),
        drivers: JSON.stringify(churnDrivers),
        actions: JSON.stringify(recommendedActions),
        estimatedChurnDate,
        createdAt: new Date().toISOString(),
      });
    } catch (_e) { /* table may not exist yet — graceful */ }

    return {
      sellerId,
      churnProbability,
      riskLevel,
      churnDrivers,
      recommendedActions,
      estimatedChurnDate,
      signals,
      dataPoints: {
        totalTransactions: sellerTx.length,
        recentTransactions: recentTx.length,
        totalCases: sellerCases.length,
        totalListings: sellerListings.length,
        accountAgeDays: Math.round(accountAgeDays),
      },
      latencyMs: Date.now() - startTime,
    };
  }

  async batchPredict(sellerIds) {
    const results = [];
    for (const sellerId of sellerIds) {
      results.push(await this.predict({ sellerId }));
    }
    return results;
  }

  _signalDescription(signal) {
    const map = {
      transactionRecency: 'Time since last transaction is increasing',
      volumeDecline: 'Transaction volume is declining month-over-month',
      revenueDecline: 'Revenue is declining month-over-month',
      supportTickets: 'Elevated support ticket activity',
      returnRate: 'Return rate is above normal levels',
      engagementDecay: 'Platform engagement is declining',
      loginFrequency: 'Login frequency has dropped',
      payoutFrequency: 'Payout request frequency has changed',
      listingStagnation: 'No new listings created recently',
      disputeRate: 'Dispute rate is above threshold',
      responseLatency: 'Slow response to platform communications',
      accountAge: 'Newer account with less platform investment',
    };
    return map[signal] || signal;
  }

  _actionDescription(action) {
    const map = {
      SEND_REACTIVATION_EMAIL: 'Send personalized reactivation email with recent platform improvements',
      OFFER_PROMOTION: 'Offer time-limited commission discount or fee waiver',
      ASSIGN_SUCCESS_MANAGER: 'Assign dedicated seller success manager for 1:1 support',
      SEND_ENGAGEMENT_NUDGE: 'Send engagement nudge highlighting missed opportunities',
      OFFER_FEATURE_TUTORIAL: 'Offer guided tutorial for underutilized platform features',
      SEND_BENCHMARK_REPORT: 'Send competitive benchmark report showing growth potential',
      SEND_NEWSLETTER: 'Include in targeted newsletter with success stories',
      FEATURE_HIGHLIGHT: 'Highlight new features relevant to seller category',
      OFFER_PREMIUM_SUPPORT: 'Offer complimentary premium support tier',
      SCHEDULE_EXECUTIVE_CALL: 'Schedule call with account executive',
    };
    return map[action] || action;
  }

  getStats() {
    return { ...this.stats };
  }
}

export function getChurnPredictionAgent() {
  if (!_instance) _instance = new ChurnPredictionAgent();
  return _instance;
}
