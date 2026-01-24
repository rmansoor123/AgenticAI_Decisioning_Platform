import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { generateListing } from '../../../shared/synthetic-data/generators.js';

const router = express.Router();

// Get all listings
router.get('/listings', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status, category } = req.query;

    let listings = db_ops.getAll('listings', parseInt(limit), parseInt(offset));
    listings = listings.map(l => l.data);

    if (sellerId) listings = listings.filter(l => l.sellerId === sellerId);
    if (status) listings = listings.filter(l => l.status === status);
    if (category) listings = listings.filter(l => l.category === category);

    res.json({
      success: true,
      data: listings,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: db_ops.count('listings')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get listing by ID
router.get('/listings/:listingId', (req, res) => {
  try {
    const listing = db_ops.getById('listings', 'listing_id', req.params.listingId);
    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }
    res.json({ success: true, data: listing.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create listing
router.post('/listings', (req, res) => {
  try {
    const listingData = req.body.listingId ? req.body : generateListing(req.body.sellerId);

    // Perform listing risk assessment
    const riskAssessment = performListingRiskAssessment(listingData);
    listingData.riskAssessment = riskAssessment;

    if (riskAssessment.decision === 'REJECT') {
      listingData.status = 'REMOVED';
    } else if (riskAssessment.decision === 'REVIEW') {
      listingData.status = 'PENDING_REVIEW';
    } else {
      listingData.status = 'ACTIVE';
    }

    db_ops.insert('listings', 'listing_id', listingData.listingId, listingData);

    res.status(201).json({
      success: true,
      data: listingData,
      riskAssessment
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update listing
router.put('/listings/:listingId', (req, res) => {
  try {
    const existing = db_ops.getById('listings', 'listing_id', req.params.listingId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    const updated = { ...existing.data, ...req.body, updatedAt: new Date().toISOString() };

    // Re-assess risk on update
    const riskAssessment = performListingRiskAssessment(updated);
    updated.riskAssessment = riskAssessment;

    db_ops.update('listings', 'listing_id', req.params.listingId, updated);

    res.json({ success: true, data: updated, riskAssessment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update listing status
router.patch('/listings/:listingId/status', (req, res) => {
  try {
    const { status, reason } = req.body;
    const existing = db_ops.getById('listings', 'listing_id', req.params.listingId);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    const updated = {
      ...existing.data,
      status,
      statusHistory: [
        ...(existing.data.statusHistory || []),
        { from: existing.data.status, to: status, reason, timestamp: new Date().toISOString() }
      ],
      updatedAt: new Date().toISOString()
    };

    db_ops.update('listings', 'listing_id', req.params.listingId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get listings for a seller
router.get('/sellers/:sellerId/listings', (req, res) => {
  try {
    const { limit = 50, status } = req.query;
    let listings = db_ops.getAll('listings', 1000, 0)
      .map(l => l.data)
      .filter(l => l.sellerId === req.params.sellerId);

    if (status) listings = listings.filter(l => l.status === status);

    res.json({ success: true, data: listings.slice(0, parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk listing analysis
router.post('/analyze/bulk', (req, res) => {
  try {
    const { listingIds } = req.body;

    const results = listingIds.map(id => {
      const listing = db_ops.getById('listings', 'listing_id', id);
      if (!listing) return { listingId: id, error: 'Not found' };

      const assessment = performListingRiskAssessment(listing.data);
      return {
        listingId: id,
        title: listing.data.title,
        riskAssessment: assessment
      };
    });

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get flagged listings
router.get('/flagged', (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const flaggedListings = db_ops.getAll('listings', 1000, 0)
      .map(l => l.data)
      .filter(l => {
        const flags = l.riskFlags || {};
        return Object.values(flags).some(v => v === true);
      })
      .slice(0, parseInt(limit));

    res.json({ success: true, data: flaggedListings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Listing statistics
router.get('/stats', (req, res) => {
  try {
    const allListings = db_ops.getAll('listings', 10000, 0).map(l => l.data);

    const stats = {
      total: allListings.length,
      byStatus: {},
      byCategory: {},
      riskFlags: {
        priceAnomaly: 0,
        prohibitedContent: 0,
        counterfeitRisk: 0,
        duplicateListing: 0
      },
      averagePrice: 0,
      totalViews: 0,
      totalSales: 0
    };

    let totalPrice = 0;

    allListings.forEach(l => {
      stats.byStatus[l.status] = (stats.byStatus[l.status] || 0) + 1;
      stats.byCategory[l.category] = (stats.byCategory[l.category] || 0) + 1;

      if (l.riskFlags) {
        Object.entries(l.riskFlags).forEach(([flag, value]) => {
          if (value && stats.riskFlags.hasOwnProperty(flag)) {
            stats.riskFlags[flag]++;
          }
        });
      }

      totalPrice += l.price || 0;
      stats.totalViews += l.views || 0;
      stats.totalSales += l.sales || 0;
    });

    stats.averagePrice = allListings.length > 0 ? totalPrice / allListings.length : 0;

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function for listing risk assessment
function performListingRiskAssessment(listing) {
  const signals = [];
  let riskScore = 0;

  // Price anomaly detection
  const categoryPrices = {
    'Electronics': { min: 10, max: 3000 },
    'Fashion': { min: 5, max: 500 },
    'Home & Garden': { min: 10, max: 2000 },
    'Jewelry': { min: 20, max: 10000 }
  };

  const priceRange = categoryPrices[listing.category] || { min: 5, max: 1000 };
  if (listing.price < priceRange.min * 0.2 || listing.price > priceRange.max * 2) {
    signals.push({ signal: 'PRICE_ANOMALY', weight: 25 });
    riskScore += 25;
  }

  // Check for prohibited keywords
  const prohibitedKeywords = ['replica', 'counterfeit', 'fake', 'knockoff', 'unauthorized'];
  const titleLower = (listing.title || '').toLowerCase();
  const descLower = (listing.description || '').toLowerCase();

  for (const keyword of prohibitedKeywords) {
    if (titleLower.includes(keyword) || descLower.includes(keyword)) {
      signals.push({ signal: 'PROHIBITED_KEYWORD', keyword, weight: 40 });
      riskScore += 40;
      break;
    }
  }

  // Check risk flags
  if (listing.riskFlags) {
    if (listing.riskFlags.prohibitedContent) {
      signals.push({ signal: 'PROHIBITED_CONTENT_FLAG', weight: 50 });
      riskScore += 50;
    }
    if (listing.riskFlags.counterfeitRisk) {
      signals.push({ signal: 'COUNTERFEIT_RISK_FLAG', weight: 45 });
      riskScore += 45;
    }
    if (listing.riskFlags.duplicateListing) {
      signals.push({ signal: 'DUPLICATE_LISTING', weight: 20 });
      riskScore += 20;
    }
  }

  // No images
  if (!listing.images || listing.images === 0) {
    signals.push({ signal: 'NO_IMAGES', weight: 15 });
    riskScore += 15;
  }

  // Decision
  let decision = 'APPROVE';
  if (riskScore >= 60) {
    decision = 'REJECT';
  } else if (riskScore >= 30) {
    decision = 'REVIEW';
  }

  return {
    riskScore,
    signals,
    decision,
    evaluatedAt: new Date().toISOString()
  };
}

export default router;
