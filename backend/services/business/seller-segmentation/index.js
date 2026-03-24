import express from 'express';
import { getDbOps } from '../../../shared/common/database-factory.js';

const router = express.Router();

// --- Default Configuration ---

const DEFAULT_CONFIG = {
  weights: {
    gmv: 0.25,
    orderVolume: 0.20,
    accountAge: 0.10,
    riskScore: 0.20,
    compliance: 0.15,
    satisfaction: 0.10
  },
  tiers: {
    New: { max: 20 },
    Bronze: { min: 21, max: 40 },
    Silver: { min: 41, max: 60 },
    Gold: { min: 61, max: 80 },
    Platinum: { min: 81, max: 95 },
    Enterprise: { min: 96, max: 100 }
  },
  newSellerAgeDays: 30
};

let activeConfig = { ...DEFAULT_CONFIG };

async function loadConfig() {
  try {
    const db_ops = getDbOps();
    const stored = await db_ops.getById('segment_config', 'config_id', 'active');
    if (stored?.data) {
      activeConfig = { ...DEFAULT_CONFIG, ...stored.data };
    }
  } catch (_) { /* use defaults */ }
}

// Load config on startup (fire-and-forget)
loadConfig();

// --- Tier Benefits ---

const TIER_BENEFITS = {
  New: {
    payoutFrequency: 'Weekly',
    listingLimit: 50,
    supportTier: 'Community',
    feeDiscount: '0%',
    features: ['Basic dashboard', 'Standard listing tools']
  },
  Bronze: {
    payoutFrequency: 'Weekly',
    listingLimit: 200,
    supportTier: 'Email',
    feeDiscount: '0%',
    features: ['Basic dashboard', 'Standard listing tools', 'Basic analytics']
  },
  Silver: {
    payoutFrequency: 'Bi-weekly',
    listingLimit: 1000,
    supportTier: 'Email (priority)',
    feeDiscount: '5%',
    features: ['Advanced dashboard', 'Bulk listing tools', 'Sales analytics', 'Promotion tools']
  },
  Gold: {
    payoutFrequency: 'Bi-weekly',
    listingLimit: 5000,
    supportTier: 'Phone + Email',
    feeDiscount: '10%',
    features: ['Advanced dashboard', 'Bulk listing tools', 'Sales analytics', 'Promotion tools', 'Advertising credits', 'Early access to features']
  },
  Platinum: {
    payoutFrequency: 'Daily',
    listingLimit: 25000,
    supportTier: 'Dedicated account manager',
    feeDiscount: '15%',
    features: ['Premium dashboard', 'API access', 'Custom analytics', 'Priority placement', 'Advertising credits', 'Brand registry', 'Global selling tools']
  },
  Enterprise: {
    payoutFrequency: 'Daily (instant available)',
    listingLimit: 'Unlimited',
    supportTier: 'Dedicated team',
    feeDiscount: '20%+',
    features: ['White-label tools', 'Custom API limits', 'Dedicated infrastructure', 'Custom terms', 'Executive support', 'Priority everything']
  }
};

// --- In-Memory Cache with 60s TTL ---

const sellerSegmentCache = new Map();
const CACHE_TTL = 60000;

function getCachedSegment(sellerId) {
  const entry = sellerSegmentCache.get(sellerId);
  if (entry && (Date.now() - entry.ts) < CACHE_TTL) return entry.data;
  if (entry) sellerSegmentCache.delete(sellerId);
  return null;
}

function setCachedSegment(sellerId, data) {
  sellerSegmentCache.set(sellerId, { data, ts: Date.now() });
}

// --- Redis Cache Helpers ---

async function getRedisSegment(sellerId) {
  try {
    const { getRedisClient, isRedisAvailable } = await import('../../../shared/common/redis-client.js');
    const redis = getRedisClient();
    if (redis && isRedisAvailable()) {
      const raw = await redis.get(`segment:${sellerId}`);
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {}
  return null;
}

async function setRedisSegment(sellerId, data) {
  try {
    const { getRedisClient, isRedisAvailable } = await import('../../../shared/common/redis-client.js');
    const redis = getRedisClient();
    if (redis && isRedisAvailable()) {
      await redis.set(`segment:${sellerId}`, JSON.stringify(data), 'EX', 60);
    }
  } catch (_) {}
}

// --- Clustering ---

const CLUSTERS = [
  { name: 'Rising Stars', description: 'New sellers with strong early performance',
    match: s => s.dimensions.accountAge < 40 && s.compositeScore > 50 },
  { name: 'Steady Performers', description: 'Established sellers with consistent activity',
    match: s => s.dimensions.accountAge > 50 && s.compositeScore >= 40 && s.compositeScore <= 70 },
  { name: 'Power Sellers', description: 'High-volume, high-GMV sellers driving the marketplace',
    match: s => s.dimensions.gmv > 60 && s.dimensions.orderVolume > 60 },
  { name: 'Premium Niche', description: 'Low-volume but high-value, specialized sellers',
    match: s => s.dimensions.gmv > 40 && s.dimensions.orderVolume < 30 },
  { name: 'At Risk', description: 'Previously active sellers showing declining engagement',
    match: s => s.dimensions.riskScore < 50 || s.dimensions.compliance < 50 },
  { name: 'Dormant', description: 'Inactive accounts with minimal recent activity',
    match: s => s.transactionCount === 0 && s.dimensions.accountAge > 30 },
  { name: 'Growth Potential', description: 'Active sellers not yet reaching their potential',
    match: s => s.compositeScore >= 30 && s.compositeScore < 50 && s.transactionCount > 0 },
  { name: 'Market Leaders', description: 'Top-tier sellers setting marketplace standards',
    match: s => s.compositeScore > 80 }
];

function clusterSellers(segmentedSellers) {
  return segmentedSellers.map(seller => {
    const cluster = CLUSTERS.find(c => c.match(seller));
    return {
      ...seller,
      cluster: cluster ? { name: cluster.name, description: cluster.description } :
        { name: 'Standard', description: 'Active marketplace participant' }
    };
  });
}

// --- Fix #1: Conflict Resolution ---

function resolveConflicts(tier, tags, cluster) {
  // Base risk from tier
  let effectiveRiskLevel = 'STANDARD';
  if (['Silver', 'Gold'].includes(tier)) effectiveRiskLevel = 'TRUSTED';
  if (['Platinum', 'Enterprise'].includes(tier)) effectiveRiskLevel = 'PREMIUM';

  const riskOverrides = [];
  const actions = [];

  // Escalation: risk tags override tier trust
  if (tags.includes('High-Return Risk')) {
    if (effectiveRiskLevel !== 'STANDARD') {
      riskOverrides.push({ signal: 'High-Return Risk', from: effectiveRiskLevel, to: 'ELEVATED' });
    }
    effectiveRiskLevel = 'ELEVATED';
    actions.push({ action: 'RESTRICT_PAYOUTS', reason: 'High return rate despite tier status', priority: 'HIGH' });
    actions.push({ action: 'INCREASE_REVIEW_FREQUENCY', reason: 'Monitor for abuse pattern', priority: 'MEDIUM' });
  }

  // Cluster-based escalation
  if (cluster?.name === 'At Risk') {
    if (effectiveRiskLevel === 'TRUSTED' || effectiveRiskLevel === 'PREMIUM') {
      riskOverrides.push({ signal: 'At Risk cluster', from: effectiveRiskLevel, to: 'WATCH' });
    }
    if (effectiveRiskLevel !== 'ELEVATED') effectiveRiskLevel = 'WATCH';
    actions.push({ action: 'ASSIGN_ACCOUNT_MANAGER', reason: 'Declining performance needs intervention', priority: 'HIGH' });
  }

  if (cluster?.name === 'Dormant') {
    actions.push({ action: 'SEND_REENGAGEMENT', reason: 'Inactive seller - send re-engagement campaign', priority: 'LOW' });
    actions.push({ action: 'REDUCE_LISTING_LIMIT', reason: 'Inactive account consuming resources', priority: 'LOW' });
  }

  // Positive actions from good signals
  if (tags.includes('High-Growth') && effectiveRiskLevel !== 'ELEVATED') {
    actions.push({ action: 'OFFER_TIER_UPGRADE', reason: 'Fast-growing seller ready for next tier', priority: 'MEDIUM' });
  }
  if (cluster?.name === 'Power Sellers') {
    actions.push({ action: 'INVITE_TO_PREMIUM_PROGRAM', reason: 'Top performer qualifies for premium perks', priority: 'MEDIUM' });
  }
  if (cluster?.name === 'Rising Stars') {
    actions.push({ action: 'FAST_TRACK_VERIFICATION', reason: 'New seller showing strong signals', priority: 'MEDIUM' });
  }
  if (cluster?.name === 'Market Leaders') {
    actions.push({ action: 'FEATURE_IN_MARKETPLACE', reason: 'Top-tier seller worthy of marketplace feature', priority: 'MEDIUM' });
    actions.push({ action: 'INVITE_ADVISORY_BOARD', reason: 'Market leader qualifies for advisory board', priority: 'LOW' });
  }

  return { effectiveRiskLevel, riskOverrides, actions };
}

// --- Fix #3: ML Integration ---

async function getMLRiskScore(seller) {
  try {
    // Check feature store for ML-scored features
    const { getFeatureStoreBackend } = await import('../../../streaming/feature-store-factory.js');
    const featureStore = await getFeatureStoreBackend();
    const mlFeatures = featureStore.getFeatures(seller.sellerId, 'seller_onboarding');

    if (mlFeatures && mlFeatures.ml_score != null) {
      return { score: mlFeatures.ml_score, source: 'feature-store' };
    }

    // Fallback: run inference if model is loaded
    try {
      const { getModelLoader } = await import('../../ml-platform/models/model-loader.js');
      const loader = getModelLoader();
      const model = await loader.ensureLoaded('onboarding-risk-v1');
      const { extractOnboardingFeatures } = await import('../../ml-platform/inference/onboarding-endpoints.js');
      const features = extractOnboardingFeatures(seller);
      if (features?.vector) {
        const result = await model.predict(features.vector);
        return { score: result.score, source: 'live-inference' };
      }
    } catch (_) {}

    return null;
  } catch (_) {
    return null;
  }
}

// --- Fix #4: Trend Analysis ---

async function analyzeTrends(sellerId, currentSegment) {
  const db_ops = getDbOps();
  try {
    const history = (await db_ops.getAll('segment_history', 1000, 0))
      .map(h => h.data)
      .filter(h => h.sellerId === sellerId)
      .sort((a, b) => new Date(b.computedAt) - new Date(a.computedAt))
      .slice(0, 10);

    if (history.length < 2) return { trend: 'INSUFFICIENT_DATA', alerts: [] };

    const alerts = [];
    const prev = history[0]; // most recent historical

    // Tier drop detection
    const tierRank = { New: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4, Enterprise: 5 };
    if (tierRank[currentSegment.tier] < tierRank[prev.tier]) {
      alerts.push({ type: 'TIER_DROP', message: `Dropped from ${prev.tier} to ${currentSegment.tier}`, severity: 'HIGH' });
    }

    // Score decay detection
    const scoreDelta = currentSegment.compositeScore - prev.compositeScore;
    if (scoreDelta < -10) {
      alerts.push({ type: 'SCORE_DECAY', message: `Score dropped ${Math.abs(scoreDelta)} points (${prev.compositeScore} → ${currentSegment.compositeScore})`, severity: scoreDelta < -20 ? 'CRITICAL' : 'HIGH' });
    }

    // Score improvement
    if (scoreDelta > 10) {
      alerts.push({ type: 'SCORE_IMPROVEMENT', message: `Score improved ${scoreDelta} points`, severity: 'INFO' });
    }

    // Determine trend direction
    let trend = 'STABLE';
    if (scoreDelta > 5) trend = 'IMPROVING';
    if (scoreDelta < -5) trend = 'DECLINING';

    // Calculate velocity (score change per day)
    const daysBetween = (Date.now() - new Date(prev.computedAt).getTime()) / (1000 * 60 * 60 * 24);
    const velocity = daysBetween > 0 ? scoreDelta / daysBetween : 0;

    return {
      trend,
      alerts,
      velocity: Math.round(velocity * 100) / 100,
      previousScore: prev.compositeScore,
      previousTier: prev.tier,
      snapshotCount: history.length,
      oldestSnapshot: history[history.length - 1]?.computedAt
    };
  } catch (_) {
    return { trend: 'UNAVAILABLE', alerts: [] };
  }
}

// --- Fix #2: Real-Time Updates via Kafka Streaming ---

async function initRealtimeSegmentation() {
  try {
    const { getStreamingBackend } = await import('../../../streaming/streaming-factory.js');
    const engine = await getStreamingBackend();

    // Listen to transaction events
    const txGroup = engine.createConsumerGroup('segmentation-tx-listener', 'transactions.decided');
    txGroup.addConsumer('seg-tx-consumer');

    // Listen to risk events
    const riskGroup = engine.createConsumerGroup('segmentation-risk-listener', 'risk.events');
    riskGroup.addConsumer('seg-risk-consumer');

    // Poll every 10 seconds for new events
    setInterval(async () => {
      try {
        const txMessages = txGroup.poll('seg-tx-consumer', 20);
        const riskMessages = riskGroup.poll('seg-risk-consumer', 20);

        const affectedSellerIds = new Set();
        for (const msg of [...txMessages, ...riskMessages]) {
          const sellerId = msg.value?.sellerId;
          if (sellerId) affectedSellerIds.add(sellerId);
        }

        if (affectedSellerIds.size > 0) {
          // Invalidate in-memory cache for affected sellers
          for (const sid of affectedSellerIds) {
            sellerSegmentCache.delete(sid);
          }
          // Invalidate Redis cache if available
          try {
            const { getRedisClient, isRedisAvailable } = await import('../../../shared/common/redis-client.js');
            const redis = getRedisClient();
            if (redis && isRedisAvailable()) {
              for (const sid of affectedSellerIds) {
                await redis.del(`segment:${sid}`);
              }
            }
          } catch (_) {}
        }
      } catch (_) {}
    }, 10000);

    console.log('[seller-segmentation] Real-time event listeners started');
  } catch (err) {
    console.warn('[seller-segmentation] Real-time listeners failed (non-critical):', err.message);
  }
}

// Fire-and-forget at module load
initRealtimeSegmentation();

// --- Core Computation ---

function computeSegmentation(sellers, transactions, returns, cases) {
  const txBySeller = {};
  for (const tx of transactions) {
    const sid = tx.sellerId;
    if (!sid) continue;
    if (!txBySeller[sid]) txBySeller[sid] = [];
    txBySeller[sid].push(tx);
  }

  const returnsBySeller = {};
  for (const r of returns) {
    const sid = r.sellerId;
    if (!sid) continue;
    if (!returnsBySeller[sid]) returnsBySeller[sid] = [];
    returnsBySeller[sid].push(r);
  }

  const casesBySeller = {};
  for (const c of cases) {
    const sid = c.sellerId;
    if (!sid) continue;
    if (!casesBySeller[sid]) casesBySeller[sid] = [];
    casesBySeller[sid].push(c);
  }

  const segmented = sellers.map(seller => {
    const sid = seller.sellerId;
    return computeSellerSegmentation(
      seller,
      txBySeller[sid] || [],
      returnsBySeller[sid] || [],
      casesBySeller[sid] || []
    );
  });

  return clusterSellers(segmented);
}

function computeSellerSegmentation(seller, sellerTx, sellerReturns, sellerCases) {
  const { weights } = activeConfig;

  // 1. GMV (25%) - sum of transaction amounts, cap at $1M
  const totalGmv = sellerTx.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
  const gmvScore = Math.min((totalGmv / 1000000) * 100, 100);

  // 2. Order Volume (20%) - count of transactions, cap at 1000
  const transactionCount = sellerTx.length;
  const orderVolumeScore = Math.min((transactionCount / 1000) * 100, 100);

  // 3. Account Age (10%) - days since createdAt, cap at 365
  const createdAt = seller.createdAt ? new Date(seller.createdAt) : new Date();
  const ageDays = Math.max(0, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  const accountAgeScore = Math.min((ageDays / 365) * 100, 100);

  // 4. Risk Score (20%) - invert seller's riskScore (100 - riskScore), default 70
  const invertedRisk = seller.riskScore != null ? (100 - seller.riskScore) : 70;
  const riskScoreDim = invertedRisk;

  // 5. Compliance (15%) - based on status
  const complianceMap = { ACTIVE: 100, UNDER_REVIEW: 70, SUSPENDED: 30, BLOCKED: 0 };
  const complianceScore = complianceMap[seller.status] ?? 70;

  // 6. Customer Satisfaction (10%) - computed from returns and disputes
  const returnRate = transactionCount > 0 ? sellerReturns.length / transactionCount : 0;
  const disputeCount = sellerCases.length;
  const satisfactionScore = Math.max(0, Math.min(100,
    100 - (returnRate * 200) - (disputeCount * 15)
  ));

  // Composite score (weighted sum using configurable weights)
  const compositeScore = Math.round(
    gmvScore * weights.gmv +
    orderVolumeScore * weights.orderVolume +
    accountAgeScore * weights.accountAge +
    riskScoreDim * weights.riskScore +
    complianceScore * weights.compliance +
    satisfactionScore * weights.satisfaction
  );

  // Tier assignment
  let tier;
  if (compositeScore <= activeConfig.tiers.New.max || ageDays < activeConfig.newSellerAgeDays) {
    tier = 'New';
  } else if (compositeScore <= activeConfig.tiers.Bronze.max) {
    tier = 'Bronze';
  } else if (compositeScore <= activeConfig.tiers.Silver.max) {
    tier = 'Silver';
  } else if (compositeScore <= activeConfig.tiers.Gold.max) {
    tier = 'Gold';
  } else if (compositeScore <= activeConfig.tiers.Platinum.max) {
    tier = 'Platinum';
  } else {
    tier = 'Enterprise';
  }

  // Behavioral tags
  const tags = [];

  // High-Growth: >5 transactions and recent ones show increasing amounts
  if (transactionCount > 5) {
    const sorted = [...sellerTx].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const recent = sorted.slice(-5);
    if (recent.length >= 3) {
      let increasing = true;
      for (let i = 1; i < recent.length; i++) {
        if ((parseFloat(recent[i].amount) || 0) <= (parseFloat(recent[i - 1].amount) || 0)) {
          increasing = false;
          break;
        }
      }
      if (increasing) tags.push('High-Growth');
    }
  }

  // International: seller country is not US
  if (seller.country && seller.country !== 'US') {
    tags.push('International');
  }

  // Multi-Category: seller has transactions with different businessCategory variations
  const categories = new Set(sellerTx.map(tx => tx.businessCategory || tx.category).filter(Boolean));
  if (categories.size > 1) {
    tags.push('Multi-Category');
  }

  // Premium Seller: avg transaction > $500
  if (transactionCount > 0) {
    const avgAmount = totalGmv / transactionCount;
    if (avgAmount > 500) {
      tags.push('Premium Seller');
    }
    // Price Competitor: avg transaction < $100
    if (avgAmount < 100) {
      tags.push('Price Competitor');
    }
  }

  // Seasonal: >50% of transactions fall in the same 2 months
  if (transactionCount >= 4) {
    const monthCounts = {};
    for (const tx of sellerTx) {
      if (tx.createdAt) {
        const month = new Date(tx.createdAt).getMonth();
        monthCounts[month] = (monthCounts[month] || 0) + 1;
      }
    }
    const sortedMonths = Object.values(monthCounts).sort((a, b) => b - a);
    if (sortedMonths.length >= 2) {
      const topTwoMonths = sortedMonths[0] + sortedMonths[1];
      if (topTwoMonths / transactionCount > 0.5) {
        tags.push('Seasonal');
      }
    }
  }

  // Established Veteran: account age > 180 days AND > 50 transactions
  if (ageDays > 180 && transactionCount > 50) {
    tags.push('Established Veteran');
  }

  // Consistent Performer: ACTIVE status and age > 60 days with no SUSPENDED periods
  if (seller.status === 'ACTIVE' && ageDays > 60) {
    tags.push('Consistent Performer');
  }

  // High-Return Risk: riskScore > 60
  if ((seller.riskScore || 0) > 60) {
    tags.push('High-Return Risk');
  }

  // Brand Registered: has businessRegistrationNumber
  if (seller.businessRegistrationNumber) {
    tags.push('Brand Registered');
  }

  const dimensions = {
    gmv: Math.round(gmvScore),
    orderVolume: Math.round(orderVolumeScore),
    accountAge: Math.round(accountAgeScore),
    riskScore: Math.round(riskScoreDim),
    compliance: complianceScore,
    satisfaction: Math.round(satisfactionScore)
  };

  // Store segment snapshot (fire-and-forget)
  storeSegmentSnapshot(seller.sellerId, tier, compositeScore, dimensions, tags);

  return {
    sellerId: seller.sellerId,
    businessName: seller.businessName || 'Unknown',
    country: seller.country || 'US',
    status: seller.status || 'UNKNOWN',
    tier,
    compositeScore,
    dimensions,
    tags,
    transactionCount,
    totalGmv: Math.round(totalGmv * 100) / 100,
    benefits: TIER_BENEFITS[tier],
    // Placeholders for enrichment pass
    _invertedRisk: invertedRisk
  };
}

// --- Enrichment: apply conflict resolution, ML, and trends to all sellers ---

async function enrichSellers(clusteredSellers) {
  const enriched = await Promise.all(clusteredSellers.map(async (seller) => {
    // Fix #1: Conflict resolution
    const { effectiveRiskLevel, riskOverrides, actions } = resolveConflicts(seller.tier, seller.tags, seller.cluster);

    // Fix #3: ML score integration
    let mlScore = null;
    let mlSource = null;
    let finalRiskDim = seller.dimensions.riskScore;
    const mlResult = await getMLRiskScore(seller);
    if (mlResult) {
      mlScore = mlResult.score;
      mlSource = mlResult.source;
      // Blend: 50% inverted risk + 50% ML-based
      finalRiskDim = Math.round((seller._invertedRisk * 0.5) + ((1 - mlScore) * 100 * 0.5));
    }

    // Fix #4: Trend analysis
    const trends = await analyzeTrends(seller.sellerId, seller);

    // Cache the result
    const result = {
      sellerId: seller.sellerId,
      businessName: seller.businessName,
      country: seller.country,
      status: seller.status,
      tier: seller.tier,
      compositeScore: seller.compositeScore,
      dimensions: {
        ...seller.dimensions,
        riskScore: finalRiskDim
      },
      tags: seller.tags,
      cluster: seller.cluster,
      effectiveRiskLevel,
      riskOverrides,
      actions,
      trends,
      mlScore,
      mlSource,
      benefits: seller.benefits,
      transactionCount: seller.transactionCount,
      totalGmv: seller.totalGmv
    };

    setCachedSegment(seller.sellerId, result);
    setRedisSegment(seller.sellerId, result); // fire-and-forget

    return result;
  }));

  return enriched;
}

async function storeSegmentSnapshot(sellerId, tier, compositeScore, dimensions, tags) {
  try {
    const db_ops = getDbOps();
    const snapshotId = `SEG-${Date.now().toString(36).toUpperCase()}`;
    await db_ops.insert('segment_history', 'snapshot_id', snapshotId, {
      snapshotId,
      sellerId,
      tier,
      compositeScore,
      dimensions,
      tags,
      computedAt: new Date().toISOString()
    });
  } catch (_) { /* best-effort -- table may not exist */ }
}

async function fetchAllSegmentation() {
  const db_ops = getDbOps();
  const [sellersRaw, transactionsRaw, returnsRaw, casesRaw] = await Promise.all([
    db_ops.getAll('sellers', 10000, 0),
    db_ops.getAll('transactions', 50000, 0),
    db_ops.getAll('returns', 50000, 0),
    db_ops.getAll('cases', 10000, 0)
  ]);
  const sellers = sellersRaw.map(s => s.data);
  const transactions = transactionsRaw.map(t => t.data);
  const returns = returnsRaw.map(r => r.data);
  const cases = casesRaw.map(c => c.data);
  const clustered = computeSegmentation(sellers, transactions, returns, cases);
  return enrichSellers(clustered);
}

// --- Endpoints ---

// GET / - all sellers with segmentation
router.get('/', async (req, res) => {
  try {
    const data = await fetchAllSegmentation();
    res.json({ success: true, data });
  } catch (error) {
    console.error('[Seller Segmentation] Error fetching segmentation:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /config - current segmentation config (Fix #6)
router.get('/config', async (req, res) => {
  try {
    res.json({ success: true, config: activeConfig });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /config - update segmentation config (Fix #6)
router.put('/config', async (req, res) => {
  try {
    const updates = req.body;

    // Validate weights sum to 1.0 if provided
    if (updates.weights) {
      const sum = Object.values(updates.weights).reduce((a, b) => a + b, 0);
      const roundedSum = Math.round(sum * 100) / 100;
      if (roundedSum !== 1.0) {
        return res.status(400).json({
          success: false,
          error: `Weights must sum to 1.0, got ${roundedSum}`,
          currentSum: roundedSum
        });
      }
    }

    // Merge with current config
    const newConfig = { ...activeConfig };
    if (updates.weights) newConfig.weights = { ...activeConfig.weights, ...updates.weights };
    if (updates.tiers) newConfig.tiers = { ...activeConfig.tiers, ...updates.tiers };
    if (updates.newSellerAgeDays != null) newConfig.newSellerAgeDays = updates.newSellerAgeDays;

    // Persist to DB
    try {
      const db_ops = getDbOps();
      await db_ops.insert('segment_config', 'config_id', 'active', {
        config_id: 'active',
        ...newConfig,
        updatedAt: new Date().toISOString()
      });
    } catch (_) {
      // If insert fails (already exists), try update
      try {
        const db_ops = getDbOps();
        await db_ops.update('segment_config', 'active', {
          ...newConfig,
          updatedAt: new Date().toISOString()
        });
      } catch (_) { /* best-effort */ }
    }

    activeConfig = newConfig;

    // Invalidate all caches
    sellerSegmentCache.clear();

    res.json({ success: true, config: activeConfig });
  } catch (error) {
    console.error('[Seller Segmentation] Error updating config:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /benefits - tier benefits for all tiers
router.get('/benefits', async (req, res) => {
  try {
    res.json({ success: true, benefits: TIER_BENEFITS });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /clusters - cluster distribution
router.get('/clusters', async (req, res) => {
  try {
    const data = await fetchAllSegmentation();
    const clusterCounts = {};
    for (const s of data) {
      const name = s.cluster?.name || 'Standard';
      if (!clusterCounts[name]) {
        clusterCounts[name] = { count: 0, description: s.cluster?.description || '' };
      }
      clusterCounts[name].count++;
    }
    const total = data.length || 1;
    const clusters = Object.entries(clusterCounts).map(([name, info]) => ({
      name,
      description: info.description,
      count: info.count,
      percentage: Math.round((info.count / total) * 10000) / 100
    }));
    res.json({ success: true, clusters });
  } catch (error) {
    console.error('[Seller Segmentation] Error fetching clusters:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /alerts - all sellers with active trend alerts (Fix #4)
router.get('/alerts', async (req, res) => {
  try {
    const data = await fetchAllSegmentation();
    const sellersWithAlerts = data
      .filter(s => s.trends?.alerts?.length > 0)
      .map(s => ({
        sellerId: s.sellerId,
        businessName: s.businessName,
        tier: s.tier,
        compositeScore: s.compositeScore,
        effectiveRiskLevel: s.effectiveRiskLevel,
        trend: s.trends.trend,
        velocity: s.trends.velocity,
        alerts: s.trends.alerts
      }))
      .sort((a, b) => {
        const severityRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, INFO: 3 };
        const aMax = Math.min(...a.alerts.map(al => severityRank[al.severity] ?? 99));
        const bMax = Math.min(...b.alerts.map(al => severityRank[al.severity] ?? 99));
        return aMax - bMax;
      });

    const summary = {
      critical: sellersWithAlerts.filter(s => s.alerts.some(a => a.severity === 'CRITICAL')).length,
      high: sellersWithAlerts.filter(s => s.alerts.some(a => a.severity === 'HIGH')).length,
      medium: sellersWithAlerts.filter(s => s.alerts.some(a => a.severity === 'MEDIUM')).length,
      info: sellersWithAlerts.filter(s => s.alerts.some(a => a.severity === 'INFO')).length,
      total: sellersWithAlerts.length
    };

    res.json({ success: true, summary, data: sellersWithAlerts });
  } catch (error) {
    console.error('[Seller Segmentation] Error fetching alerts:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /actions - all pending actions grouped by priority (Fix #5)
router.get('/actions', async (req, res) => {
  try {
    const data = await fetchAllSegmentation();
    const actionGroups = { HIGH: [], MEDIUM: [], LOW: [] };

    for (const seller of data) {
      for (const act of (seller.actions || [])) {
        const group = actionGroups[act.priority] || actionGroups['MEDIUM'];
        group.push({
          sellerId: seller.sellerId,
          businessName: seller.businessName,
          tier: seller.tier,
          effectiveRiskLevel: seller.effectiveRiskLevel,
          action: act.action,
          reason: act.reason,
          priority: act.priority
        });
      }
    }

    const summary = {
      HIGH: actionGroups.HIGH.length,
      MEDIUM: actionGroups.MEDIUM.length,
      LOW: actionGroups.LOW.length,
      total: actionGroups.HIGH.length + actionGroups.MEDIUM.length + actionGroups.LOW.length
    };

    res.json({ success: true, summary, actions: actionGroups });
  } catch (error) {
    console.error('[Seller Segmentation] Error fetching actions:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /sellers/:sellerId - single seller segmentation
router.get('/sellers/:sellerId', async (req, res) => {
  try {
    const sellerId = req.params.sellerId;

    // Check caches
    const cached = getCachedSegment(sellerId);
    if (cached) return res.json({ success: true, data: cached });
    const redisCached = await getRedisSegment(sellerId);
    if (redisCached) {
      setCachedSegment(sellerId, redisCached);
      return res.json({ success: true, data: redisCached });
    }

    const db_ops = getDbOps();
    const sellerRecord = await db_ops.getById('sellers', 'seller_id', sellerId);
    if (!sellerRecord) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }
    const seller = sellerRecord.data || sellerRecord;
    const [transactionsRaw, returnsRaw, casesRaw] = await Promise.all([
      db_ops.getAll('transactions', 50000, 0),
      db_ops.getAll('returns', 50000, 0),
      db_ops.getAll('cases', 10000, 0)
    ]);
    const sellerTx = transactionsRaw.map(t => t.data).filter(tx => tx.sellerId === sellerId);
    const sellerReturns = returnsRaw.map(r => r.data).filter(r => r.sellerId === sellerId);
    const sellerCases = casesRaw.map(c => c.data).filter(c => c.sellerId === sellerId);
    const result = computeSellerSegmentation(seller, sellerTx, sellerReturns, sellerCases);
    const [clustered] = clusterSellers([result]);
    const [enriched] = await enrichSellers([clustered]);
    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[Seller Segmentation] Error fetching seller:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /sellers/:sellerId/history - segment history for a seller
router.get('/sellers/:sellerId/history', async (req, res) => {
  try {
    const db_ops = getDbOps();
    const allSnapshots = await db_ops.getAll('segment_history', 10000, 0);
    const sellerSnapshots = allSnapshots
      .map(s => s.data)
      .filter(s => s.sellerId === req.params.sellerId)
      .sort((a, b) => new Date(b.computedAt) - new Date(a.computedAt))
      .slice(0, 50);
    res.json({ success: true, data: sellerSnapshots });
  } catch (error) {
    console.error('[Seller Segmentation] Error fetching seller history:', error.message);
    res.status(500).json({ success: false, data: [] });
  }
});

// GET /tiers - tier distribution
router.get('/tiers', async (req, res) => {
  try {
    const data = await fetchAllSegmentation();
    const tierCounts = {};
    for (const s of data) {
      tierCounts[s.tier] = (tierCounts[s.tier] || 0) + 1;
    }
    const total = data.length || 1;
    const tiers = {};
    for (const tier of ['New', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Enterprise']) {
      const count = tierCounts[tier] || 0;
      tiers[tier] = { count, percentage: Math.round((count / total) * 10000) / 100 };
    }
    res.json({ success: true, tiers });
  } catch (error) {
    console.error('[Seller Segmentation] Error fetching tiers:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /tags - tag distribution
router.get('/tags', async (req, res) => {
  try {
    const data = await fetchAllSegmentation();
    const tagCounts = {};
    for (const s of data) {
      for (const tag of s.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    res.json({ success: true, tags: tagCounts });
  } catch (error) {
    console.error('[Seller Segmentation] Error fetching tags:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /recalculate - force fresh computation
router.post('/recalculate', async (req, res) => {
  try {
    // Clear all caches
    sellerSegmentCache.clear();
    const data = await fetchAllSegmentation();
    res.json({ success: true, data, recalculatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[Seller Segmentation] Error recalculating:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
