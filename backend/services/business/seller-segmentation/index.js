import express from 'express';
import { getDbOps } from '../../../shared/common/database-factory.js';

const router = express.Router();

// --- Helpers ---

function computeSegmentation(sellers, transactions) {
  const txBySeller = {};
  for (const tx of transactions) {
    const sid = tx.sellerId;
    if (!sid) continue;
    if (!txBySeller[sid]) txBySeller[sid] = [];
    txBySeller[sid].push(tx);
  }

  return sellers.map(seller => computeSellerSegmentation(seller, txBySeller[seller.sellerId] || []));
}

function computeSellerSegmentation(seller, sellerTx) {
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

  // 6. Customer Satisfaction (10%) - default 80
  const satisfactionScore = 80;

  // Composite score (weighted sum)
  const compositeScore = Math.round(
    gmvScore * 0.25 +
    orderVolumeScore * 0.20 +
    accountAgeScore * 0.10 +
    riskScoreDim * 0.20 +
    complianceScore * 0.15 +
    satisfactionScore * 0.10
  );

  // Tier assignment
  let tier;
  if (compositeScore <= 20 || ageDays < 30) {
    tier = 'New';
  } else if (compositeScore <= 40) {
    tier = 'Bronze';
  } else if (compositeScore <= 60) {
    tier = 'Silver';
  } else if (compositeScore <= 80) {
    tier = 'Gold';
  } else if (compositeScore <= 95) {
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

  // Fast Shipper: ACTIVE status and age > 90 days
  if (seller.status === 'ACTIVE' && ageDays > 90) {
    tags.push('Fast Shipper');
  }

  // High-Return Risk: riskScore > 60
  if ((seller.riskScore || 0) > 60) {
    tags.push('High-Return Risk');
  }

  // Brand Registered: has businessRegistrationNumber
  if (seller.businessRegistrationNumber) {
    tags.push('Brand Registered');
  }

  // Seasonal: deterministic 10% based on seller ID hash
  if (seller.sellerId && hashPercent(seller.sellerId, 'seasonal') < 10) {
    tags.push('Seasonal');
  }

  // API Power User: deterministic 15% based on seller ID hash
  if (seller.sellerId && hashPercent(seller.sellerId, 'api') < 15) {
    tags.push('API Power User');
  }

  return {
    sellerId: seller.sellerId,
    businessName: seller.businessName || 'Unknown',
    country: seller.country || 'US',
    status: seller.status || 'UNKNOWN',
    tier,
    compositeScore,
    dimensions: {
      gmv: Math.round(gmvScore),
      orderVolume: Math.round(orderVolumeScore),
      accountAge: Math.round(accountAgeScore),
      riskScore: Math.round(riskScoreDim),
      compliance: complianceScore,
      satisfaction: satisfactionScore
    },
    tags,
    transactionCount,
    totalGmv: Math.round(totalGmv * 100) / 100
  };
}

/**
 * Deterministic pseudo-random percentage from a string + salt.
 * Returns 0-99 so we can check < threshold.
 */
function hashPercent(str, salt) {
  let hash = 0;
  const input = str + salt;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

async function fetchAllSegmentation() {
  const db_ops = getDbOps();
  const sellers = (await db_ops.getAll('sellers', 10000, 0)).map(s => s.data);
  const transactions = (await db_ops.getAll('transactions', 50000, 0)).map(t => t.data);
  return computeSegmentation(sellers, transactions);
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

// GET /sellers/:sellerId - single seller segmentation
router.get('/sellers/:sellerId', async (req, res) => {
  try {
    const db_ops = getDbOps();
    const sellerRecord = await db_ops.getById('sellers', 'seller_id', req.params.sellerId);
    if (!sellerRecord) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }
    const seller = sellerRecord.data || sellerRecord;
    const transactions = (await db_ops.getAll('transactions', 50000, 0)).map(t => t.data);
    const sellerTx = transactions.filter(tx => tx.sellerId === req.params.sellerId);
    const data = computeSellerSegmentation(seller, sellerTx);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[Seller Segmentation] Error fetching seller:', error.message);
    res.status(500).json({ success: false, error: error.message });
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
