/**
 * Retention Campaign Agent — 7 campaign templates matched to seller signals.
 * Returns top 3 triggered campaigns with scheduling. Persists to growth_campaigns.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

let _instance = null;

const CAMPAIGN_TEMPLATES = [
  {
    id: 'CAMP_REACTIVATION',
    name: 'Win-Back Reactivation',
    description: 'Multi-touch email sequence for dormant sellers with personalized incentives',
    trigger: ctx => ctx.daysSinceLastTx > 30,
    channel: 'EMAIL',
    duration: '14 days',
    steps: 3,
    expectedLift: '15-25% reactivation rate',
    schedule: { delayDays: 0, frequencyDays: 5 },
    priority: 95,
  },
  {
    id: 'CAMP_FIRST_SALE',
    name: 'First Sale Accelerator',
    description: 'Guided campaign for new sellers who have listings but no sales yet',
    trigger: ctx => ctx.listingCount > 0 && ctx.txCount === 0 && ctx.accountAgeDays < 45,
    channel: 'IN_APP',
    duration: '7 days',
    steps: 5,
    expectedLift: '40% first-sale conversion',
    schedule: { delayDays: 0, frequencyDays: 1 },
    priority: 100,
  },
  {
    id: 'CAMP_TIER_UPGRADE',
    name: 'Tier Upgrade Promotion',
    description: 'Showcase premium features with limited-time upgrade offer',
    trigger: ctx => ctx.txCount > 30 && ctx.tier !== 'premium' && ctx.revenue > 5000,
    channel: 'EMAIL',
    duration: '10 days',
    steps: 3,
    expectedLift: '12% upgrade conversion',
    schedule: { delayDays: 1, frequencyDays: 3 },
    priority: 80,
  },
  {
    id: 'CAMP_DISPUTE_REDUCTION',
    name: 'Quality Improvement Program',
    description: 'Educational campaign for sellers with elevated dispute rates',
    trigger: ctx => ctx.disputeRate > 0.08,
    channel: 'EMAIL',
    duration: '21 days',
    steps: 4,
    expectedLift: '30% dispute reduction',
    schedule: { delayDays: 0, frequencyDays: 5 },
    priority: 88,
  },
  {
    id: 'CAMP_SEASONAL_BOOST',
    name: 'Seasonal Sales Boost',
    description: 'Prepare sellers for upcoming seasonal peaks with inventory and pricing tips',
    trigger: ctx => {
      const month = new Date().getMonth();
      return (month >= 9 || month <= 1) && ctx.listingCount > 5; // Oct-Feb peak
    },
    channel: 'PUSH',
    duration: '30 days',
    steps: 6,
    expectedLift: '20% seasonal revenue increase',
    schedule: { delayDays: 0, frequencyDays: 5 },
    priority: 70,
  },
  {
    id: 'CAMP_REFERRAL',
    name: 'Seller Referral Program',
    description: 'Incentivize successful sellers to refer new sellers to the platform',
    trigger: ctx => ctx.txCount > 100 && ctx.revenue > 10000,
    channel: 'IN_APP',
    duration: '30 days',
    steps: 2,
    expectedLift: '5-10 referrals per seller',
    schedule: { delayDays: 3, frequencyDays: 14 },
    priority: 55,
  },
  {
    id: 'CAMP_FEATURE_ADOPTION',
    name: 'Feature Discovery Journey',
    description: 'Progressive feature introduction based on seller maturity',
    trigger: ctx => ctx.adoptedFeatures < 7 && ctx.accountAgeDays > 14,
    channel: 'IN_APP',
    duration: '21 days',
    steps: 7,
    expectedLift: '35% feature adoption increase',
    schedule: { delayDays: 1, frequencyDays: 3 },
    priority: 65,
  },
];

export class RetentionCampaignAgent {
  constructor() {
    this.stats = { triggered: 0, campaigns: 0 };
    this.activeCampaigns = [];
  }

  async trigger(input) {
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
      return { sellerId, error: 'Seller not found', campaigns: [], latencyMs: Date.now() - startTime };
    }

    const sellerData = seller.data || seller;
    const now = Date.now();
    const sellerTx = allTx.map(t => t.data || t).filter(t => t.sellerId === sellerId);
    const sellerListings = allListings.map(l => l.data || l).filter(l => l.sellerId === sellerId);
    const sellerCases = allCases.map(c => c.data || c).filter(c => c.sellerId === sellerId);

    const lastTxDate = sellerTx.reduce((max, t) => {
      const d = new Date(t.createdAt || t.timestamp || 0).getTime();
      return d > max ? d : max;
    }, 0);
    const totalRevenue = sellerTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

    // Count adopted features (simplified heuristic)
    let adoptedFeatures = 0;
    if (sellerListings.length > 0) adoptedFeatures++;
    if (sellerTx.length > 0) adoptedFeatures++;
    if (sellerData.email && sellerData.businessName) adoptedFeatures++;
    if (sellerTx.length > 20) adoptedFeatures++;
    if (sellerListings.length > 10) adoptedFeatures++;
    if (sellerData.apiKey) adoptedFeatures++;

    const ctx = {
      sellerId,
      tier: (sellerData.tier || '').toLowerCase(),
      txCount: sellerTx.length,
      listingCount: sellerListings.length,
      revenue: totalRevenue,
      daysSinceLastTx: lastTxDate > 0 ? (now - lastTxDate) / 86400000 : 999,
      accountAgeDays: (now - new Date(sellerData.createdAt || 0).getTime()) / 86400000,
      disputeRate: sellerTx.length > 0 ? sellerCases.filter(c => (c.type || c.checkpoint || '').toLowerCase().includes('disput')).length / sellerTx.length : 0,
      adoptedFeatures,
    };

    // Evaluate campaigns
    const triggered = [];
    for (const template of CAMPAIGN_TEMPLATES) {
      try {
        if (template.trigger(ctx)) {
          triggered.push({
            campaignId: `${template.id}-${sellerId}-${Date.now().toString(36)}`,
            templateId: template.id,
            name: template.name,
            description: template.description,
            channel: template.channel,
            duration: template.duration,
            steps: template.steps,
            expectedLift: template.expectedLift,
            priority: template.priority,
            schedule: {
              startDate: new Date(now + template.schedule.delayDays * 86400000).toISOString().split('T')[0],
              nextTouchDate: new Date(now + template.schedule.delayDays * 86400000).toISOString().split('T')[0],
              frequencyDays: template.schedule.frequencyDays,
              endDate: new Date(now + (template.schedule.delayDays + parseInt(template.duration)) * 86400000).toISOString().split('T')[0],
            },
            status: 'SCHEDULED',
          });
        }
      } catch (_e) { /* trigger eval error — skip */ }
    }

    // Sort by priority, take top 3
    triggered.sort((a, b) => b.priority - a.priority);
    const topCampaigns = triggered.slice(0, 3);

    // Persist to growth_campaigns
    for (const campaign of topCampaigns) {
      try {
        await db_ops.insert('growth_campaigns', 'campaign_id', campaign.campaignId, {
          sellerId,
          templateId: campaign.templateId,
          name: campaign.name,
          channel: campaign.channel,
          status: 'SCHEDULED',
          startDate: campaign.schedule.startDate,
          endDate: campaign.schedule.endDate,
          priority: campaign.priority,
          createdAt: new Date().toISOString(),
        });
        this.activeCampaigns.push(campaign);
      } catch (_e) { /* table may not exist — graceful */ }
    }

    this.stats.triggered++;
    this.stats.campaigns += topCampaigns.length;

    return {
      sellerId,
      campaigns: topCampaigns,
      totalEvaluated: CAMPAIGN_TEMPLATES.length,
      totalTriggered: triggered.length,
      sellerContext: {
        transactions: ctx.txCount,
        revenue: Math.round(ctx.revenue),
        daysSinceLastTx: Math.round(ctx.daysSinceLastTx),
        accountAgeDays: Math.round(ctx.accountAgeDays),
      },
      latencyMs: Date.now() - startTime,
    };
  }

  getTemplates() {
    return CAMPAIGN_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      channel: t.channel,
      duration: t.duration,
      steps: t.steps,
      expectedLift: t.expectedLift,
      priority: t.priority,
    }));
  }

  getActiveCampaigns() {
    return this.activeCampaigns.slice(-50); // last 50
  }

  getStats() {
    return { ...this.stats, activeCampaigns: this.activeCampaigns.length };
  }
}

export function getRetentionCampaignAgent() {
  if (!_instance) _instance = new RetentionCampaignAgent();
  return _instance;
}
