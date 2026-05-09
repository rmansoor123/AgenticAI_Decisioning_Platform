/**
 * Personalization Engine — next-best-action engine matching seller profile
 * against personalization rules. Returns prioritized actions.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

let _instance = null;

// Personalization rules: condition + action definitions
const PERSONALIZATION_RULES = [
  // UPSELL rules
  {
    id: 'UPSELL_PREMIUM_TIER',
    type: 'UPSELL',
    condition: ctx => ctx.txCount > 50 && ctx.tier !== 'premium',
    priority: 90,
    title: 'Upgrade to Premium Tier',
    description: 'Based on your transaction volume, Premium tier would save you 15% on fees',
    channel: 'IN_APP',
  },
  {
    id: 'UPSELL_API_ACCESS',
    type: 'UPSELL',
    condition: ctx => ctx.listingCount > 20 && !ctx.hasAPI,
    priority: 80,
    title: 'Enable API Integration',
    description: 'Automate your listings and inventory management with our API',
    channel: 'EMAIL',
  },
  {
    id: 'UPSELL_MULTI_CHANNEL',
    type: 'UPSELL',
    condition: ctx => ctx.revenue > 10000 && !ctx.hasMultiChannel,
    priority: 75,
    title: 'Expand to Multi-Channel',
    description: 'Your revenue qualifies you for multi-channel selling — reach 3x more buyers',
    channel: 'IN_APP',
  },
  // RETENTION rules
  {
    id: 'RETENTION_ENGAGEMENT_DROP',
    type: 'RETENTION',
    condition: ctx => ctx.daysSinceLastTx > 14,
    priority: 95,
    title: 'We Miss You!',
    description: 'Your store has been quiet — here are tips to re-engage your buyers',
    channel: 'EMAIL',
  },
  {
    id: 'RETENTION_DISPUTE_HIGH',
    type: 'RETENTION',
    condition: ctx => ctx.disputeRate > 0.1,
    priority: 85,
    title: 'Reduce Disputes, Boost Trust',
    description: 'Your dispute rate is elevated — here are proven strategies to reduce it',
    channel: 'IN_APP',
  },
  {
    id: 'RETENTION_REVENUE_DECLINE',
    type: 'RETENTION',
    condition: ctx => ctx.revenueTrend < -0.2,
    priority: 88,
    title: 'Revenue Recovery Plan',
    description: 'We noticed a dip in your revenue — let us help you get back on track',
    channel: 'EMAIL',
  },
  // ONBOARDING rules
  {
    id: 'ONBOARD_FIRST_LISTING',
    type: 'ONBOARDING',
    condition: ctx => ctx.listingCount === 0 && ctx.accountAgeDays < 30,
    priority: 100,
    title: 'Create Your First Listing',
    description: 'Get started by listing your first product — it takes less than 5 minutes',
    channel: 'IN_APP',
  },
  {
    id: 'ONBOARD_COMPLETE_PROFILE',
    type: 'ONBOARDING',
    condition: ctx => !ctx.profileComplete && ctx.accountAgeDays < 14,
    priority: 98,
    title: 'Complete Your Profile',
    description: 'Sellers with complete profiles get 40% more buyer views',
    channel: 'IN_APP',
  },
  {
    id: 'ONBOARD_FIRST_SALE',
    type: 'ONBOARDING',
    condition: ctx => ctx.listingCount > 0 && ctx.txCount === 0 && ctx.accountAgeDays < 60,
    priority: 92,
    title: 'Get Your First Sale',
    description: 'Your listings are live — here are tips to make your first sale',
    channel: 'PUSH',
  },
  // FEATURE adoption rules
  {
    id: 'FEATURE_ANALYTICS',
    type: 'FEATURE',
    condition: ctx => ctx.txCount > 10 && !ctx.usedAnalytics,
    priority: 70,
    title: 'Discover Your Analytics Dashboard',
    description: 'Track your performance metrics and find opportunities for growth',
    channel: 'IN_APP',
  },
  {
    id: 'FEATURE_PROMOTIONS',
    type: 'FEATURE',
    condition: ctx => ctx.listingCount > 5 && !ctx.usedPromotions,
    priority: 65,
    title: 'Create Your First Promotion',
    description: 'Promotions increase sales velocity by an average of 25%',
    channel: 'IN_APP',
  },
  {
    id: 'FEATURE_SHIPPING_RULES',
    type: 'FEATURE',
    condition: ctx => ctx.txCount > 5 && !ctx.hasShippingRules,
    priority: 60,
    title: 'Set Up Shipping Rules',
    description: 'Custom shipping rules improve buyer experience and reduce support tickets',
    channel: 'EMAIL',
  },
  // GROWTH rules
  {
    id: 'GROWTH_CROSS_SELL',
    type: 'GROWTH',
    condition: ctx => ctx.categoryCount === 1 && ctx.listingCount > 10,
    priority: 72,
    title: 'Expand to New Categories',
    description: 'Sellers in multiple categories earn 60% more on average',
    channel: 'EMAIL',
  },
  {
    id: 'GROWTH_INTERNATIONAL',
    type: 'GROWTH',
    condition: ctx => ctx.revenue > 5000 && !ctx.sellsInternational,
    priority: 68,
    title: 'Go International',
    description: 'Your products could reach buyers in 40+ countries',
    channel: 'IN_APP',
  },
  // RECOGNITION rules
  {
    id: 'RECOGNITION_TOP_SELLER',
    type: 'RECOGNITION',
    condition: ctx => ctx.txCount > 200,
    priority: 50,
    title: 'Top Seller Badge Earned!',
    description: 'Congratulations! Your high volume qualifies you for Top Seller status',
    channel: 'PUSH',
  },
  {
    id: 'RECOGNITION_MILESTONE',
    type: 'RECOGNITION',
    condition: ctx => ctx.revenue > 50000,
    priority: 45,
    title: 'Revenue Milestone Reached!',
    description: 'You have surpassed $50K in lifetime revenue on our platform',
    channel: 'IN_APP',
  },
];

export class PersonalizationEngine {
  constructor() {
    this.stats = { evaluations: 0, actionsServed: 0 };
  }

  async personalize(input) {
    const { sellerId } = input;
    const startTime = Date.now();
    const db_ops = getDbOps();

    const [allSellers, allTx, allListings, allCases] = await Promise.all([
      db_ops.getAll('sellers', 50000, 0),
      db_ops.getAll('transactions', 50000, 0),
      db_ops.getAll('listings', 50000, 0),
      db_ops.getAll('cases', 50000, 0),
    ]);

    const seller = allSellers.find(s => (s.data?.sellerId || s.seller_id) === sellerId);
    if (!seller) {
      return { sellerId, error: 'Seller not found', profile: null, actions: [], latencyMs: Date.now() - startTime };
    }

    const sellerData = seller.data || seller;
    const now = Date.now();
    const sellerTx = allTx.map(t => t.data || t).filter(t => t.sellerId === sellerId);
    const sellerListings = allListings.map(l => l.data || l).filter(l => l.sellerId === sellerId);
    const sellerCases = allCases.map(c => c.data || c).filter(c => c.sellerId === sellerId);

    // Build context for rule evaluation
    const thirtyDaysAgo = now - 30 * 86400000;
    const recentTx = sellerTx.filter(t => new Date(t.createdAt || t.timestamp || 0).getTime() > thirtyDaysAgo);
    const priorTx = sellerTx.filter(t => {
      const d = new Date(t.createdAt || t.timestamp || 0).getTime();
      return d > (now - 60 * 86400000) && d <= thirtyDaysAgo;
    });
    const recentRevenue = recentTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const priorRevenue = priorTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const totalRevenue = sellerTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const lastTxDate = sellerTx.reduce((max, t) => {
      const d = new Date(t.createdAt || t.timestamp || 0).getTime();
      return d > max ? d : max;
    }, 0);

    const categories = new Set(sellerListings.map(l => l.category).filter(Boolean));

    const ctx = {
      sellerId,
      tier: (sellerData.tier || sellerData.accountTier || '').toLowerCase(),
      tags: sellerData.tags || [],
      cluster: sellerData.cluster || sellerData.segment || 'GENERAL',
      txCount: sellerTx.length,
      listingCount: sellerListings.length,
      revenue: totalRevenue,
      revenueTrend: priorRevenue > 0 ? (recentRevenue - priorRevenue) / priorRevenue : 0,
      daysSinceLastTx: lastTxDate > 0 ? (now - lastTxDate) / 86400000 : 999,
      accountAgeDays: (now - new Date(sellerData.createdAt || 0).getTime()) / 86400000,
      profileComplete: !!(sellerData.email && sellerData.businessName && sellerData.country),
      hasAPI: !!(sellerData.apiKey || sellerData.apiAccess),
      hasMultiChannel: !!(sellerData.channels && (Array.isArray(sellerData.channels) ? sellerData.channels.length > 1 : true)),
      usedAnalytics: sellerTx.length > 20,
      usedPromotions: sellerListings.some(l => parseFloat(l.price || 0) < parseFloat(l.originalPrice || l.price || 0)),
      hasShippingRules: sellerListings.some(l => l.shippingPolicy || l.freeShipping),
      disputeRate: sellerTx.length > 0 ? sellerCases.filter(c => (c.type || c.checkpoint || '').toLowerCase().includes('disput')).length / sellerTx.length : 0,
      categoryCount: categories.size,
      sellsInternational: (sellerData.internationalShipping || sellerData.countries?.length > 1),
    };

    // Evaluate rules
    const matchedActions = [];
    for (const rule of PERSONALIZATION_RULES) {
      try {
        if (rule.condition(ctx)) {
          matchedActions.push({
            ruleId: rule.id,
            type: rule.type,
            title: rule.title,
            description: rule.description,
            priority: rule.priority,
            channel: rule.channel,
          });
        }
      } catch (_e) { /* rule eval error — skip */ }
    }

    // Sort by priority descending
    matchedActions.sort((a, b) => b.priority - a.priority);

    // Build seller profile summary
    const profile = {
      sellerId,
      tier: ctx.tier || 'standard',
      cluster: ctx.cluster,
      totalTransactions: ctx.txCount,
      totalRevenue: Math.round(totalRevenue),
      listingCount: ctx.listingCount,
      accountAgeDays: Math.round(ctx.accountAgeDays),
      profileComplete: ctx.profileComplete,
      engagementLevel: ctx.daysSinceLastTx < 7 ? 'ACTIVE' : ctx.daysSinceLastTx < 30 ? 'MODERATE' : 'INACTIVE',
    };

    this.stats.evaluations++;
    this.stats.actionsServed += matchedActions.length;

    return {
      sellerId,
      profile,
      actions: matchedActions,
      totalRulesEvaluated: PERSONALIZATION_RULES.length,
      matchedCount: matchedActions.length,
      latencyMs: Date.now() - startTime,
    };
  }

  async batchPersonalize(sellerIds) {
    const results = [];
    for (const sellerId of sellerIds) {
      results.push(await this.personalize({ sellerId }));
    }
    return results;
  }

  getStats() {
    return { ...this.stats };
  }
}

export function getPersonalizationEngine() {
  if (!_instance) _instance = new PersonalizationEngine();
  return _instance;
}
