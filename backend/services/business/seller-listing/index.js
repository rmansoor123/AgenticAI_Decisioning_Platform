import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { generateListing } from '../../../shared/synthetic-data/generators.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getListingIntelligenceAgent } from '../../../agents/specialized/listing-intelligence-agent.js';

const router = express.Router();

// Get all listings
router.get('/listings', async (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status, category } = req.query;

    let listings = await db_ops.getAll('listings', parseInt(limit), parseInt(offset));
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
        total: await db_ops.count('listings')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get listing by ID
router.get('/listings/:listingId', async (req, res) => {
  try {
    const listing = await db_ops.getById('listings', 'listing_id', req.params.listingId);
    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }
    res.json({ success: true, data: listing.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create listing — async fire-and-forget with real-time TPAOR streaming
router.post('/listings', async (req, res) => {
  try {
    const listingData = req.body.listingId ? req.body : generateListing(req.body.sellerId);
    const listingId = listingData.listingId || `LST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    listingData.listingId = listingId;
    const correlationId = `LST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Store listing immediately with EVALUATING status
    listingData.status = 'EVALUATING';
    listingData.riskAssessment = null;
    listingData.createdAt = new Date().toISOString();
    await db_ops.insert('listings', 'listing_id', listingId, listingData);

    // Return HTTP 202 immediately
    res.status(202).json({
      success: true,
      correlationId,
      listingId,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    // Fire-and-forget: run ListingIntelligenceAgent asynchronously
    console.log(`[ListingService] Evaluating listing: ${listingId} (correlation: ${correlationId})`);

    const agent = getListingIntelligenceAgent();
    agent.reason({
      type: 'listing_review',
      listingId,
      sellerId: listingData.sellerId,
      title: listingData.title,
      description: listingData.description,
      price: listingData.price,
      category: listingData.category,
      images: listingData.images,
      riskFlags: listingData.riskFlags,
      submittedAt: new Date().toISOString()
    }, {
      entityId: listingId,
      evaluationType: 'listing_review',
      _correlationId: correlationId
    })
      .then(async agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'FLAG';
        const riskScore = agentResult.result?.overallRisk?.score ?? 50;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'LISTING_INTELLIGENCE';

        // Map decision to status
        let listingStatus;
        if (decision === 'REJECT') listingStatus = 'REMOVED';
        else if (decision === 'FLAG') listingStatus = 'PENDING_REVIEW';
        else listingStatus = 'ACTIVE';

        // Update listing with final decision
        await db_ops.update('listings', 'listing_id', listingId, {
          ...listingData,
          status: listingStatus,
          riskAssessment: { riskScore, decision, reasoning, agentId, evaluatedAt: new Date().toISOString() }
        });

        // Emit risk event
        emitRiskEvent({
          sellerId: listingData.sellerId, domain: 'listing',
          eventType: decision === 'APPROVE' ? 'LISTING_APPROVED' : decision === 'REJECT' ? 'LISTING_REJECTED' : 'LISTING_FLAGGED',
          riskScore: decision === 'APPROVE' ? -5 : riskScore,
          metadata: { listingId, decision }
        });

        // Create case on FLAG or REJECT
        if (decision === 'FLAG' || decision === 'REJECT') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          await db_ops.insert('cases', 'case_id', caseId, {
            caseId, checkpoint: 'LISTING_REVIEW',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN', sellerId: listingData.sellerId, entityId: listingId, entityType: 'LISTING',
            decision, riskScore, reasoning, agentId, createdAt: new Date().toISOString()
          });
        }

        // Emit completion event with correlationId
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:complete', {
              correlationId, sellerId: listingData.sellerId, entityId: listingId,
              decision, riskScore, reasoning, timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}

        console.log(`[ListingService] Completed: ${listingId} → ${decision} (risk: ${riskScore})`);
      })
      .catch(async error => {
        console.error(`[ListingService] Agent error for ${listingId}:`, error.message);
        await db_ops.update('listings', 'listing_id', listingId, {
          ...listingData,
          status: 'PENDING_REVIEW',
          riskAssessment: { riskScore: 50, decision: 'FLAG', reasoning: `Agent error: ${error.message}`, agentId: 'LISTING_INTELLIGENCE', evaluatedAt: new Date().toISOString() }
        });
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:error', {
              correlationId, sellerId: listingData.sellerId, entityId: listingId,
              error: error.message, timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}
      });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update listing
router.put('/listings/:listingId', async (req, res) => {
  try {
    const existing = await db_ops.getById('listings', 'listing_id', req.params.listingId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    const updated = { ...existing.data, ...req.body, updatedAt: new Date().toISOString() };
    await db_ops.update('listings', 'listing_id', req.params.listingId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update listing status
router.patch('/listings/:listingId/status', async (req, res) => {
  try {
    const { status, reason } = req.body;
    const existing = await db_ops.getById('listings', 'listing_id', req.params.listingId);

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

    await db_ops.update('listings', 'listing_id', req.params.listingId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get listings for a seller
router.get('/sellers/:sellerId/listings', async (req, res) => {
  try {
    const { limit = 50, status } = req.query;
    let listings = (await db_ops.getAll('listings', 1000, 0)).map(l => l.data)
      .filter(l => l.sellerId === req.params.sellerId);

    if (status) listings = listings.filter(l => l.status === status);

    res.json({ success: true, data: listings.slice(0, parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk listing analysis
router.post('/analyze/bulk', async (req, res) => {
  try {
    const { listingIds } = req.body;

    const results = listingIds.map(async id => {
      const listing = await db_ops.getById('listings', 'listing_id', id);
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
router.get('/flagged', async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const flaggedListings = (await db_ops.getAll('listings', 1000, 0)).map(l => l.data)
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
router.get('/stats', async (req, res) => {
  try {
    const allListings = (await db_ops.getAll('listings', 10000, 0)).map(l => l.data);

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
