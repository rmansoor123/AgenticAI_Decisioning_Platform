import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { generateListing } from '../../../shared/synthetic-data/generators.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getListingIntelligenceAgent } from '../../../agents/specialized/listing-intelligence-agent.js';

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

// Create listing — wired to ListingIntelligenceAgent
router.post('/listings', async (req, res) => {
  try {
    const listingData = req.body.listingId ? req.body : generateListing(req.body.sellerId);

    // Run ListingIntelligenceAgent
    let decision = 'FLAG';
    let riskScore = 50;
    let reasoning = 'Default flag — agent evaluation pending';
    let agentId = 'LISTING_INTELLIGENCE';

    try {
      const agent = getListingIntelligenceAgent();
      const agentResult = await agent.reason({
        type: 'listing_review',
        listingId: listingData.listingId,
        sellerId: listingData.sellerId,
        title: listingData.title,
        description: listingData.description,
        price: listingData.price,
        category: listingData.category,
        images: listingData.images,
        riskFlags: listingData.riskFlags,
        submittedAt: new Date().toISOString()
      }, {
        entityId: listingData.listingId,
        evaluationType: 'listing_review'
      });

      const rec = agentResult.result?.recommendation || agentResult.result?.decision;
      decision = rec?.action || 'FLAG';
      riskScore = agentResult.result?.overallRisk?.score ?? 50;
      reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
      agentId = agentResult.result?.agentId || 'LISTING_INTELLIGENCE';
    } catch (agentError) {
      console.error(`[ListingService] Agent error for ${listingData.listingId}:`, agentError.message);
      decision = 'FLAG';
      riskScore = 50;
      reasoning = `Agent error — defaulting to FLAG: ${agentError.message}`;
    }

    // Map decision to listing status
    if (decision === 'REJECT') listingData.status = 'REMOVED';
    else if (decision === 'FLAG') listingData.status = 'PENDING_REVIEW';
    else listingData.status = 'ACTIVE'; // APPROVE

    listingData.riskAssessment = {
      riskScore, decision, reasoning, agentId,
      evaluatedAt: new Date().toISOString()
    };

    db_ops.insert('listings', 'listing_id', listingData.listingId, listingData);

    // Emit risk event
    emitRiskEvent({
      sellerId: listingData.sellerId,
      domain: 'listing',
      eventType: decision === 'APPROVE' ? 'LISTING_APPROVED' : decision === 'REJECT' ? 'LISTING_REJECTED' : 'LISTING_FLAGGED',
      riskScore: decision === 'APPROVE' ? -5 : riskScore,
      metadata: { listingId: listingData.listingId, decision }
    });

    // Create case on FLAG or REJECT
    if (decision === 'FLAG' || decision === 'REJECT') {
      const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
      db_ops.insert('cases', 'case_id', caseId, {
        caseId,
        checkpoint: 'LISTING_REVIEW',
        priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
        status: 'OPEN',
        sellerId: listingData.sellerId,
        entityId: listingData.listingId,
        entityType: 'LISTING',
        decision,
        riskScore,
        reasoning,
        agentId,
        createdAt: new Date().toISOString()
      });
    }

    console.log(`[ListingService] ${listingData.listingId} → ${decision} (risk: ${riskScore})`);

    res.status(201).json({
      success: true,
      data: listingData,
      riskAssessment: listingData.riskAssessment
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
    db_ops.update('listings', 'listing_id', req.params.listingId, updated);

    res.json({ success: true, data: updated });
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
      return {
        listingId: id,
        title: listing.data.title,
        riskAssessment: listing.data.riskAssessment || { decision: 'UNKNOWN' }
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

export default router;
