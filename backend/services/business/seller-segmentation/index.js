import express from 'express';
import { getDbOps } from '../../../shared/common/database-factory.js';

const router = express.Router();

// --- Configuration ---

const SEGMENT_CONFIG = {
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

// --- Helpers ---

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
  const { weights } = SEGMENT_CONFIG;

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
  const riskScoreDim = seller.riskScore != null ? (100 - seller.riskScore) : 70;

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
  if (compositeScore <= SEGMENT_CONFIG.tiers.New.max || ageDays < SEGMENT_CONFIG.newSellerAgeDays) {
    tier = 'New';
  } else if (compositeScore <= SEGMENT_CONFIG.tiers.Bronze.max) {
    tier = 'Bronze';
  } else if (compositeScore <= SEGMENT_CONFIG.tiers.Silver.max) {
    tier = 'Silver';
  } else if (compositeScore <= SEGMENT_CONFIG.tiers.Gold.max) {
    tier = 'Gold';
  } else if (compositeScore <= SEGMENT_CONFIG.tiers.Platinum.max) {
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
    benefits: TIER_BENEFITS[tier]
  };
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
  return computeSegmentation(sellers, transactions, returns, cases);
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

// GET /config - current segmentation config
router.get('/config', async (req, res) => {
  try {
    res.json({ success: true, config: SEGMENT_CONFIG });
  } catch (error) {
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

// GET /sellers/:sellerId - single seller segmentation
router.get('/sellers/:sellerId', async (req, res) => {
  try {
    const db_ops = getDbOps();
    const sellerRecord = await db_ops.getById('sellers', 'seller_id', req.params.sellerId);
    if (!sellerRecord) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }
    const seller = sellerRecord.data || sellerRecord;
    const [transactionsRaw, returnsRaw, casesRaw] = await Promise.all([
      db_ops.getAll('transactions', 50000, 0),
      db_ops.getAll('returns', 50000, 0),
      db_ops.getAll('cases', 10000, 0)
    ]);
    const sellerTx = transactionsRaw.map(t => t.data).filter(tx => tx.sellerId === req.params.sellerId);
    const sellerReturns = returnsRaw.map(r => r.data).filter(r => r.sellerId === req.params.sellerId);
    const sellerCases = casesRaw.map(c => c.data).filter(c => c.sellerId === req.params.sellerId);
    const result = computeSellerSegmentation(seller, sellerTx, sellerReturns, sellerCases);
    // Apply clustering to single seller
    const [clustered] = clusterSellers([result]);
    res.json({ success: true, data: clustered });
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
    const data = await fetchAllSegmentation();
    res.json({ success: true, data, recalculatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[Seller Segmentation] Error recalculating:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
