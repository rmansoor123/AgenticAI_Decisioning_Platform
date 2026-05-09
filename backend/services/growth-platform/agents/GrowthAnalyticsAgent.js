/**
 * Growth Analytics Agent — 3 actions: OVERVIEW, COHORT, ENGAGEMENT_SCORES.
 * Computes platform-wide growth metrics from real DB data.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

let _instance = null;

export class GrowthAnalyticsAgent {
  constructor() {
    this.stats = { queries: 0 };
  }

  async execute(action) {
    this.stats.queries++;
    switch (action) {
      case 'OVERVIEW':           return this._overview();
      case 'COHORT':             return this._cohortAnalysis();
      case 'ENGAGEMENT_SCORES':  return this._engagementScores();
      default: return { error: `Unknown action: ${action}. Use OVERVIEW, COHORT, or ENGAGEMENT_SCORES.` };
    }
  }

  async _overview() {
    const startTime = Date.now();
    const db_ops = getDbOps();

    const [allSellers, allTx, allCases] = await Promise.all([
      db_ops.getAll('sellers', 50000, 0),
      db_ops.getAll('transactions', 50000, 0),
      db_ops.getAll('cases', 50000, 0),
    ]);

    const sellers = allSellers.map(s => s.data || s);
    const transactions = allTx.map(t => t.data || t);
    const now = Date.now();
    const oneDayAgo = now - 86400000;
    const thirtyDaysAgo = now - 30 * 86400000;
    const sixtyDaysAgo = now - 60 * 86400000;

    // DAU: sellers with transactions in last 24h
    const dailyActiveSellers = new Set(
      transactions.filter(t => new Date(t.createdAt || t.timestamp || 0).getTime() > oneDayAgo)
        .map(t => t.sellerId)
    ).size;

    // MAU: sellers with transactions in last 30d
    const monthlyActiveSellers = new Set(
      transactions.filter(t => new Date(t.createdAt || t.timestamp || 0).getTime() > thirtyDaysAgo)
        .map(t => t.sellerId)
    ).size;

    // Stickiness: DAU/MAU
    const stickiness = monthlyActiveSellers > 0 ? Math.round((dailyActiveSellers / monthlyActiveSellers) * 100) / 100 : 0;

    // GMV (last 30d)
    const recentTx = transactions.filter(t => new Date(t.createdAt || t.timestamp || 0).getTime() > thirtyDaysAgo);
    const priorTx = transactions.filter(t => {
      const d = new Date(t.createdAt || t.timestamp || 0).getTime();
      return d > sixtyDaysAgo && d <= thirtyDaysAgo;
    });
    const gmv30d = recentTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const gmvPrior30d = priorTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

    // LTV (average revenue per seller)
    const totalRevenue = transactions.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const avgLTV = sellers.length > 0 ? Math.round(totalRevenue / sellers.length) : 0;

    // Churn rate (sellers with no activity in last 30d / total)
    const activeSellers30d = new Set(recentTx.map(t => t.sellerId));
    const totalSellers = sellers.length;
    const inactiveSellers = totalSellers - activeSellers30d.size;
    const churnRate = totalSellers > 0 ? Math.round((inactiveSellers / totalSellers) * 100) / 100 : 0;

    // Growth rate (new sellers in last 30d / total)
    const newSellers30d = sellers.filter(s => new Date(s.createdAt || 0).getTime() > thirtyDaysAgo).length;
    const growthRate = totalSellers > 0 ? Math.round((newSellers30d / totalSellers) * 100) / 100 : 0;

    // NPS proxy (based on case resolution)
    const cases = allCases.map(c => c.data || c);
    const resolvedCases = cases.filter(c => (c.status || '').toUpperCase() === 'RESOLVED');
    const nps = cases.length > 0 ? Math.round(((resolvedCases.length / cases.length) * 200 - 100)) : 50;

    // GMV metrics
    const avgOrderValue = recentTx.length > 0 ? Math.round(gmv30d / recentTx.length) : 0;
    const gmvGrowth = gmvPrior30d > 0 ? Math.round(((gmv30d - gmvPrior30d) / gmvPrior30d) * 100) : 0;

    return {
      action: 'OVERVIEW',
      metrics: {
        dau: dailyActiveSellers,
        mau: monthlyActiveSellers,
        stickiness,
        gmv30d: Math.round(gmv30d),
        gmvPrior30d: Math.round(gmvPrior30d),
        gmvGrowth: `${gmvGrowth}%`,
        avgOrderValue,
        avgLTV,
        churnRate,
        growthRate,
        nps: Math.max(-100, Math.min(100, nps)),
        totalSellers,
        activeSellers: activeSellers30d.size,
        newSellers30d,
        totalTransactions: transactions.length,
        recentTransactions: recentTx.length,
      },
      latencyMs: Date.now() - startTime,
    };
  }

  async _cohortAnalysis() {
    const startTime = Date.now();
    const db_ops = getDbOps();

    const [allSellers, allTx] = await Promise.all([
      db_ops.getAll('sellers', 50000, 0),
      db_ops.getAll('transactions', 50000, 0),
    ]);

    const sellers = allSellers.map(s => s.data || s);
    const transactions = allTx.map(t => t.data || t);

    // Group sellers by signup month
    const cohorts = {};
    for (const seller of sellers) {
      const created = new Date(seller.createdAt || 0);
      if (created.getTime() === 0) continue;
      const cohortKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;
      if (!cohorts[cohortKey]) cohorts[cohortKey] = [];
      cohorts[cohortKey].push(seller.sellerId);
    }

    // For each cohort, compute retention at months 1-6
    const now = new Date();
    const cohortData = [];
    for (const [cohortMonth, sellerIds] of Object.entries(cohorts)) {
      const cohortDate = new Date(cohortMonth + '-01');
      const retention = {};
      retention.month0 = sellerIds.length;

      for (let m = 1; m <= 6; m++) {
        const monthStart = new Date(cohortDate);
        monthStart.setMonth(monthStart.getMonth() + m);
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);

        if (monthStart > now) break;

        const activeSellers = new Set(
          transactions.filter(t => {
            const d = new Date(t.createdAt || t.timestamp || 0);
            return sellerIds.includes(t.sellerId) && d >= monthStart && d < monthEnd;
          }).map(t => t.sellerId)
        );

        retention[`month${m}`] = {
          count: activeSellers.size,
          rate: Math.round((activeSellers.size / sellerIds.length) * 100),
        };
      }

      cohortData.push({
        cohort: cohortMonth,
        size: sellerIds.length,
        retention,
      });
    }

    // Sort newest first
    cohortData.sort((a, b) => b.cohort.localeCompare(a.cohort));

    return {
      action: 'COHORT',
      cohorts: cohortData.slice(0, 12), // last 12 months
      totalCohorts: cohortData.length,
      latencyMs: Date.now() - startTime,
    };
  }

  async _engagementScores() {
    const startTime = Date.now();
    const db_ops = getDbOps();

    const [allSellers, allTx, allListings] = await Promise.all([
      db_ops.getAll('sellers', 50000, 0),
      db_ops.getAll('transactions', 50000, 0),
      db_ops.getAll('listings', 50000, 0),
    ]);

    const sellers = allSellers.map(s => s.data || s);
    const transactions = allTx.map(t => t.data || t);
    const listings = allListings.map(l => l.data || l);
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;

    const scores = [];
    for (const seller of sellers.slice(0, 200)) { // cap at 200 for performance
      const sid = seller.sellerId;
      const sellerTx = transactions.filter(t => t.sellerId === sid);
      const sellerListings = listings.filter(l => l.sellerId === sid);

      const recentTx = sellerTx.filter(t => new Date(t.createdAt || t.timestamp || 0).getTime() > thirtyDaysAgo);
      const recentListings = sellerListings.filter(l => new Date(l.createdAt || 0).getTime() > thirtyDaysAgo);

      // Engagement score: weighted combination
      const txScore = Math.min(40, recentTx.length * 2);            // max 40
      const listingScore = Math.min(25, recentListings.length * 5); // max 25
      const recencyScore = (() => {
        const lastTx = sellerTx.reduce((max, t) => {
          const d = new Date(t.createdAt || t.timestamp || 0).getTime();
          return d > max ? d : max;
        }, 0);
        const daysSince = lastTx > 0 ? (now - lastTx) / 86400000 : 90;
        return Math.max(0, Math.min(20, Math.round(20 * (1 - daysSince / 30))));
      })();
      const profileScore = (seller.email ? 5 : 0) + (seller.businessName ? 5 : 0) + (seller.country ? 5 : 0);

      const totalScore = Math.min(100, txScore + listingScore + recencyScore + profileScore);

      scores.push({
        sellerId: sid,
        engagementScore: totalScore,
        breakdown: { transactions: txScore, listings: listingScore, recency: recencyScore, profile: profileScore },
        level: totalScore >= 80 ? 'HIGHLY_ENGAGED' : totalScore >= 50 ? 'MODERATELY_ENGAGED' : totalScore >= 20 ? 'LOW_ENGAGEMENT' : 'AT_RISK',
      });
    }

    // Distribution
    const distribution = {
      highlyEngaged: scores.filter(s => s.level === 'HIGHLY_ENGAGED').length,
      moderatelyEngaged: scores.filter(s => s.level === 'MODERATELY_ENGAGED').length,
      lowEngagement: scores.filter(s => s.level === 'LOW_ENGAGEMENT').length,
      atRisk: scores.filter(s => s.level === 'AT_RISK').length,
    };

    const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, e) => s + e.engagementScore, 0) / scores.length) : 0;

    return {
      action: 'ENGAGEMENT_SCORES',
      sellers: scores.sort((a, b) => b.engagementScore - a.engagementScore).slice(0, 50),
      distribution,
      averageScore: avgScore,
      totalEvaluated: scores.length,
      latencyMs: Date.now() - startTime,
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

export function getGrowthAnalyticsAgent() {
  if (!_instance) _instance = new GrowthAnalyticsAgent();
  return _instance;
}
