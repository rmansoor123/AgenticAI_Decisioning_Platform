/**
 * Product Adoption Agent — tracks 14 platform features across 4 categories.
 * Determines adoption from seller data heuristics.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

let _instance = null;

const FEATURES = [
  // CORE (must-haves)
  { id: 'LISTINGS',        name: 'Product Listings',       category: 'CORE',     impact: 9,  detectFn: 'hasListings' },
  { id: 'PAYMENTS',        name: 'Payment Processing',     category: 'CORE',     impact: 9,  detectFn: 'hasPayments' },
  { id: 'PAYOUTS',         name: 'Payout Setup',           category: 'CORE',     impact: 8,  detectFn: 'hasPayouts' },
  { id: 'PROFILE',         name: 'Complete Profile',       category: 'CORE',     impact: 7,  detectFn: 'hasCompleteProfile' },
  // GROWTH (scale-up)
  { id: 'ANALYTICS',       name: 'Analytics Dashboard',    category: 'GROWTH',   impact: 8,  detectFn: 'usesAnalytics' },
  { id: 'PROMOTIONS',      name: 'Promotions & Deals',     category: 'GROWTH',   impact: 7,  detectFn: 'usesPromotions' },
  { id: 'BULK_LISTING',    name: 'Bulk Listing Upload',    category: 'GROWTH',   impact: 6,  detectFn: 'usesBulkListing' },
  { id: 'SHIPPING_RULES',  name: 'Shipping Rules',         category: 'GROWTH',   impact: 6,  detectFn: 'hasShippingRules' },
  // ADVANCED (optimization)
  { id: 'API_ACCESS',      name: 'API Integration',        category: 'ADVANCED', impact: 8,  detectFn: 'usesAPI' },
  { id: 'MULTI_CHANNEL',   name: 'Multi-Channel Sync',     category: 'ADVANCED', impact: 7,  detectFn: 'usesMultiChannel' },
  { id: 'ADV_REPORTING',   name: 'Advanced Reporting',     category: 'ADVANCED', impact: 6,  detectFn: 'usesAdvReporting' },
  // PREMIUM (enterprise)
  { id: 'DEDICATED_MGR',   name: 'Dedicated Manager',      category: 'PREMIUM',  impact: 5,  detectFn: 'hasDedicatedMgr' },
  { id: 'CUSTOM_BRANDING', name: 'Custom Storefront',      category: 'PREMIUM',  impact: 5,  detectFn: 'hasCustomBranding' },
  { id: 'PRIORITY_SUPPORT',name: 'Priority Support',       category: 'PREMIUM',  impact: 4,  detectFn: 'hasPrioritySupport' },
];

export class ProductAdoptionAgent {
  constructor() {
    this.stats = { evaluations: 0 };
  }

  async evaluate(input) {
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
      return { sellerId, error: 'Seller not found', adoptionScore: 0, maturityLevel: 'UNKNOWN', features: [], recommendations: [], latencyMs: Date.now() - startTime };
    }

    const sellerData = seller.data || seller;
    const sellerTx = allTx.map(t => t.data || t).filter(t => t.sellerId === sellerId);
    const sellerListings = allListings.map(l => l.data || l).filter(l => l.sellerId === sellerId);
    const sellerCases = allCases.map(c => c.data || c).filter(c => c.sellerId === sellerId);

    const context = { sellerData, sellerTx, sellerListings, sellerCases };

    // Evaluate each feature
    const features = FEATURES.map(f => {
      const adopted = this._detect(f.detectFn, context);
      return {
        id: f.id,
        name: f.name,
        category: f.category,
        impact: f.impact,
        adopted,
      };
    });

    // Adoption score: weighted by impact
    const totalImpact = features.reduce((s, f) => s + f.impact, 0);
    const adoptedImpact = features.filter(f => f.adopted).reduce((s, f) => s + f.impact, 0);
    const adoptionScore = Math.round((adoptedImpact / totalImpact) * 100);

    // Maturity level
    let maturityLevel = 'BEGINNER';
    if (adoptionScore >= 80) maturityLevel = 'EXPERT';
    else if (adoptionScore >= 60) maturityLevel = 'ADVANCED';
    else if (adoptionScore >= 35) maturityLevel = 'INTERMEDIATE';

    // Top 5 unadopted features by impact
    const unadopted = features
      .filter(f => !f.adopted)
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 5);

    const recommendations = unadopted.map(f => ({
      featureId: f.id,
      featureName: f.name,
      category: f.category,
      impact: f.impact,
      reason: this._recommendationReason(f.id, context),
      estimatedLift: `${Math.round(f.impact * 1.5)}% potential improvement`,
    }));

    // Category breakdown
    const categories = {};
    for (const cat of ['CORE', 'GROWTH', 'ADVANCED', 'PREMIUM']) {
      const catFeatures = features.filter(f => f.category === cat);
      categories[cat] = {
        total: catFeatures.length,
        adopted: catFeatures.filter(f => f.adopted).length,
        percentage: Math.round((catFeatures.filter(f => f.adopted).length / catFeatures.length) * 100),
      };
    }

    this.stats.evaluations++;

    return {
      sellerId,
      adoptionScore,
      maturityLevel,
      features,
      categories,
      recommendations,
      dataPoints: {
        transactions: sellerTx.length,
        listings: sellerListings.length,
        cases: sellerCases.length,
      },
      latencyMs: Date.now() - startTime,
    };
  }

  _detect(fnName, ctx) {
    const { sellerData, sellerTx, sellerListings, sellerCases } = ctx;
    switch (fnName) {
      case 'hasListings':         return sellerListings.length > 0;
      case 'hasPayments':         return sellerTx.length > 0;
      case 'hasPayouts':          return sellerTx.some(t => (t.type || '').toLowerCase().includes('payout'));
      case 'hasCompleteProfile':  return !!(sellerData.email && sellerData.businessName && sellerData.country);
      case 'usesAnalytics':       return sellerTx.length > 20;  // proxy: high-volume sellers likely use analytics
      case 'usesPromotions':      return sellerListings.some(l => parseFloat(l.price || 0) < parseFloat(l.originalPrice || l.price || 0));
      case 'usesBulkListing': {
        // Detect bulk upload: many listings created within short window
        const dates = sellerListings.map(l => new Date(l.createdAt || 0).getTime()).sort();
        if (dates.length < 5) return false;
        for (let i = 0; i < dates.length - 4; i++) {
          if ((dates[i + 4] - dates[i]) < 3600000) return true; // 5 listings within 1 hour
        }
        return false;
      }
      case 'hasShippingRules':    return sellerListings.some(l => l.shippingPolicy || l.freeShipping);
      case 'usesAPI':             return !!(sellerData.apiKey || sellerData.apiAccess);
      case 'usesMultiChannel':    return !!(sellerData.channels && (Array.isArray(sellerData.channels) ? sellerData.channels.length > 1 : true));
      case 'usesAdvReporting':    return sellerTx.length > 100; // proxy: high volume = likely uses reporting
      case 'hasDedicatedMgr':     return !!(sellerData.accountManager || sellerData.dedicatedManager);
      case 'hasCustomBranding':   return !!(sellerData.storefront || sellerData.customBranding);
      case 'hasPrioritySupport':  return (sellerData.tier || sellerData.supportTier || '').toLowerCase().includes('premium');
      default: return false;
    }
  }

  _recommendationReason(featureId, ctx) {
    const { sellerTx, sellerListings } = ctx;
    const reasons = {
      LISTINGS:         'Start listing products to reach buyers and generate revenue',
      PAYMENTS:         'Set up payment processing to start accepting orders',
      PAYOUTS:          'Configure payout schedule to receive your earnings',
      PROFILE:          'Complete your profile to build buyer trust and improve visibility',
      ANALYTICS:        `With ${sellerTx.length} transactions, analytics would help identify growth opportunities`,
      PROMOTIONS:       `Create promotions on your ${sellerListings.length} listings to boost sales velocity`,
      BULK_LISTING:     'Bulk upload would save time — you could list products 10x faster',
      SHIPPING_RULES:   'Custom shipping rules improve buyer experience and conversion rates',
      API_ACCESS:       'API integration enables automation and multi-platform sync',
      MULTI_CHANNEL:    'Selling on multiple channels typically increases revenue 30-50%',
      ADV_REPORTING:    'Advanced reporting reveals trends in your sales data for better decisions',
      DEDICATED_MGR:    'A dedicated manager provides strategic guidance for scaling your business',
      CUSTOM_BRANDING:  'Custom storefronts increase brand recognition and buyer loyalty',
      PRIORITY_SUPPORT: 'Priority support reduces resolution time for business-critical issues',
    };
    return reasons[featureId] || 'Adopting this feature could improve your platform experience';
  }

  getStats() {
    return { ...this.stats };
  }
}

export function getProductAdoptionAgent() {
  if (!_instance) _instance = new ProductAdoptionAgent();
  return _instance;
}
