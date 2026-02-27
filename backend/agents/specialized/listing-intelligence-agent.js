/**
 * Listing Intelligence Agent
 *
 * A specialized autonomous agent that monitors marketplace listings for
 * anomalous pricing, content duplication, and suspicious seller velocity.
 * It correlates listing activity with seller profiles to detect catalog-based
 * fraud patterns such as price manipulation, listing floods, and copycat scams.
 *
 * Capabilities:
 * - Listing history retrieval and seller activity tracking
 * - Category-level pricing analysis (median, mean, min, max)
 * - Seller listing velocity detection across time windows
 * - Content similarity detection via word-overlap scoring
 * - Seller category distribution profiling
 *
 * Extends AutonomousAgent with a 15-minute scan interval and 5 registered tools.
 */

import { AutonomousAgent } from '../core/autonomous-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getConfidenceCalibrator } from '../core/confidence-calibrator.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';

// Try to import graph queries for network peer lookup
let graphNeighbors = null;
try {
  const graphEngine = await import('../../graph/graph-engine.js');
  graphNeighbors = (sellerId, depth) => {
    const engine = graphEngine.getGraphEngine();
    return engine.getNeighbors(sellerId, depth);
  };
} catch (e) {
  // Graph engine not available, that's okay
}

export class ListingIntelligenceAgent extends AutonomousAgent {
  constructor() {
    super({
      agentId: 'LISTING_INTELLIGENCE',
      name: 'Listing Intelligence Monitor',
      role: 'listing_analyst',
      capabilities: [
        'listing_monitoring',
        'pricing_analysis',
        'content_similarity'
      ],
      scanIntervalMs: 900000, // 15 minutes
      eventAccelerationThreshold: 5,
      subscribedTopics: ['risk:event:created', 'listing:created']
    });

    // Initialize self-correction and calibrator
    this.selfCorrection = createSelfCorrection(this.agentId);
    this.calibrator = getConfidenceCalibrator();
    this.knowledgeBase = getKnowledgeBase();

    // Internal detection log, capped at 200
    this.detections = [];

    // Register the 5 tools
    this._registerTools();
  }

  // ============================================================================
  // TOOL REGISTRATION
  // ============================================================================

  _registerTools() {
    // 1. get_listing_history
    this.registerTool(
      'get_listing_history',
      'Retrieve listing history for a seller, sorted by creation date descending',
      async (params) => {
        const { sellerId } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        try {
          const allListings = db_ops.getAll('listings', 1000, 0);
          const sellerListings = allListings
            .map(l => l.data || l)
            .filter(l => (l.sellerId || l.seller_id) === sellerId)
            .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at));

          return {
            success: true,
            data: {
              listings: sellerListings,
              total: sellerListings.length,
              sellerId
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 2. get_category_pricing
    this.registerTool(
      'get_category_pricing',
      'Compute pricing statistics (median, mean, min, max) per category across all listings',
      async (params) => {
        try {
          const allListings = db_ops.getAll('listings', 1000, 0);
          const listings = allListings.map(l => l.data || l);

          // Group by category
          const categoryMap = {};
          for (const listing of listings) {
            const category = listing.category || 'uncategorized';
            if (!categoryMap[category]) {
              categoryMap[category] = [];
            }
            const price = parseFloat(listing.price || listing.amount || 0);
            if (!isNaN(price) && price > 0) {
              categoryMap[category].push(price);
            }
          }

          const categories = Object.entries(categoryMap).map(([category, prices]) => {
            const sorted = [...prices].sort((a, b) => a - b);
            const count = sorted.length;
            const mid = Math.floor(count / 2);
            const median = count === 0
              ? 0
              : count % 2 === 0
                ? (sorted[mid - 1] + sorted[mid]) / 2
                : sorted[mid];
            const mean = count > 0
              ? prices.reduce((sum, p) => sum + p, 0) / count
              : 0;
            const min = count > 0 ? sorted[0] : 0;
            const max = count > 0 ? sorted[count - 1] : 0;

            return { category, count, median, mean, min, max };
          });

          return {
            success: true,
            data: {
              categories,
              totalListings: listings.length
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 3. check_listing_velocity
    this.registerTool(
      'check_listing_velocity',
      'Check how many listings a seller created within 1h, 24h, and 7d time windows',
      async (params) => {
        const { sellerId } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        try {
          const allListings = db_ops.getAll('listings', 1000, 0);
          const sellerListings = allListings
            .map(l => l.data || l)
            .filter(l => (l.sellerId || l.seller_id) === sellerId);

          const now = Date.now();
          const oneHour = 60 * 60 * 1000;
          const oneDay = 24 * oneHour;
          const sevenDays = 7 * oneDay;

          let count1h = 0;
          let count24h = 0;
          let count7d = 0;

          for (const listing of sellerListings) {
            const created = new Date(listing.createdAt || listing.created_at).getTime();
            const elapsed = now - created;
            if (elapsed <= oneHour) count1h++;
            if (elapsed <= oneDay) count24h++;
            if (elapsed <= sevenDays) count7d++;
          }

          return {
            success: true,
            data: {
              sellerId,
              windows: {
                '1h': count1h,
                '24h': count24h,
                '7d': count7d
              },
              totalListings: sellerListings.length
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 4. find_similar_listings
    this.registerTool(
      'find_similar_listings',
      'Find listings with similar titles and descriptions using word-overlap similarity',
      async (params) => {
        const { listingId, title } = params;
        if (!listingId && !title) {
          return { success: false, error: 'listingId or title is required' };
        }

        try {
          const allListings = db_ops.getAll('listings', 1000, 0);
          const listings = allListings.map(l => l.data || l);

          // Find target listing
          let targetListing = null;
          if (listingId) {
            targetListing = listings.find(l =>
              (l.listingId || l.listing_id) === listingId
            );
          }
          if (!targetListing && title) {
            targetListing = { title, description: '' };
          }
          if (!targetListing) {
            return { success: false, error: `Listing ${listingId} not found` };
          }

          // Tokenize helper
          const tokenize = (text) => {
            if (!text) return new Set();
            return new Set(
              text.toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .split(/\s+/)
                .filter(w => w.length > 2)
            );
          };

          const targetTokens = tokenize(
            `${targetListing.title || ''} ${targetListing.description || ''}`
          );

          if (targetTokens.size === 0) {
            return {
              success: true,
              data: {
                targetListing: { listingId: listingId || null, title: targetListing.title },
                similarListings: [],
                threshold: 0.5
              }
            };
          }

          // Compute similarity for each other listing
          const scored = [];
          for (const listing of listings) {
            const lid = listing.listingId || listing.listing_id;
            if (lid === listingId) continue;

            const tokens = tokenize(
              `${listing.title || ''} ${listing.description || ''}`
            );
            if (tokens.size === 0) continue;

            // Jaccard-like overlap: |intersection| / |union|
            let intersection = 0;
            for (const t of targetTokens) {
              if (tokens.has(t)) intersection++;
            }
            const union = new Set([...targetTokens, ...tokens]).size;
            const similarity = union > 0 ? intersection / union : 0;

            if (similarity >= 0.1) {
              scored.push({
                listingId: lid,
                sellerId: listing.sellerId || listing.seller_id,
                similarity: Math.round(similarity * 1000) / 1000,
                title: listing.title
              });
            }
          }

          // Sort descending by similarity, take top 5
          scored.sort((a, b) => b.similarity - a.similarity);
          const top5 = scored.slice(0, 5);

          return {
            success: true,
            data: {
              targetListing: { listingId: listingId || null, title: targetListing.title },
              similarListings: top5,
              threshold: 0.5
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 5. get_seller_category_profile
    this.registerTool(
      'get_seller_category_profile',
      'Compute category distribution for a seller to detect sudden category shifts',
      async (params) => {
        const { sellerId } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        try {
          const allListings = db_ops.getAll('listings', 1000, 0);
          const sellerListings = allListings
            .map(l => l.data || l)
            .filter(l => (l.sellerId || l.seller_id) === sellerId);

          const totalListings = sellerListings.length;

          // Group by category
          const categoryMap = {};
          for (const listing of sellerListings) {
            const category = listing.category || 'uncategorized';
            categoryMap[category] = (categoryMap[category] || 0) + 1;
          }

          const categories = Object.entries(categoryMap)
            .map(([category, count]) => ({
              category,
              count,
              percentage: totalListings > 0
                ? Math.round((count / totalListings) * 10000) / 100
                : 0
            }))
            .sort((a, b) => b.count - a.count);

          const primaryCategory = categories.length > 0
            ? categories[0].category
            : null;

          return {
            success: true,
            data: {
              sellerId,
              categories,
              totalListings,
              primaryCategory
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );
  }

  // ============================================================================
  // AUTONOMOUS AGENT OVERRIDES
  // ============================================================================

  /**
   * Transform the event buffer into input for the reason() loop.
   * Filters for listing-domain events and groups by sellerId.
   */
  _buildScanInput() {
    // Filter for listing-domain events
    const listingEvents = this.eventBuffer.filter(event => {
      const domain = event.data?.domain || event.domain || '';
      const eventType = event.data?.eventType || event.eventType || '';
      return (
        domain.toLowerCase().includes('listing') ||
        eventType.toLowerCase().includes('listing')
      );
    });

    // Group by sellerId
    const sellerMap = {};
    for (const event of listingEvents) {
      const sellerId = event.data?.sellerId || event.sellerId || 'unknown';
      if (!sellerMap[sellerId]) sellerMap[sellerId] = [];
      sellerMap[sellerId].push(event);
    }

    return {
      sellers: Object.entries(sellerMap).map(([sellerId, events]) => ({
        sellerId, events, eventCount: events.length
      })),
      totalEvents: listingEvents.length,
      scanTimestamp: new Date().toISOString()
    };
  }

  /**
   * Post-processing hook after a successful scan cycle.
   * Stores detections, emits events, broadcasts alerts, and writes to KB.
   * Caps detection log at 200 entries.
   */
  async _postCycle(result) {
    if (!Array.isArray(this.detections)) this.detections = [];

    const detections = result?.actions || result?.findings
      || result?.result?.actions || result?.result?.findings
      || result?.detections || [];

    if (!Array.isArray(detections) || detections.length === 0) {
      return { detectionsEmitted: 0, timestamp: new Date().toISOString() };
    }

    let detectionsEmitted = 0;

    for (const detection of detections) {
      this.detections.push({ ...detection, detectedAt: new Date().toISOString() });
      detectionsEmitted++;

      // Emit event
      try {
        this.emitEvent('listing-intelligence:detection', {
          agentId: this.agentId,
          sellerId: detection.sellerId,
          type: detection.type || 'listing_anomaly',
          severity: detection.severity || 'MEDIUM'
        });
      } catch (e) { /* non-fatal */ }

      // Broadcast via messenger
      try {
        if (this.messenger && typeof this.messenger.broadcast === 'function') {
          this.messenger.broadcast({
            from: this.agentId,
            content: { type: 'listing_intelligence_detection', sellerId: detection.sellerId, details: detection },
            priority: detection.severity === 'CRITICAL' ? 3 : 2
          });
        }
      } catch (e) { /* non-fatal */ }

      // Knowledge base write
      try {
        if (this.knowledgeBase && typeof this.knowledgeBase.addKnowledge === 'function') {
          this.knowledgeBase.addKnowledge('risk-events', [{
            _id: `LI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            text: `Listing intelligence detection for seller ${detection.sellerId || 'unknown'}. Type: ${detection.type || 'unknown'}.`,
            category: 'listing-intelligence',
            sellerId: detection.sellerId,
            domain: 'listing',
            riskScore: detection.riskScore || 50,
            source: this.agentId
          }]);
        }
      } catch (e) { /* non-fatal */ }
    }

    if (this.detections.length > 200) {
      this.detections = this.detections.slice(-200);
    }

    return { detectionsEmitted, timestamp: new Date().toISOString() };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance = null;

/**
 * Get the singleton ListingIntelligenceAgent instance.
 * @returns {ListingIntelligenceAgent}
 */
export function getListingIntelligenceAgent() {
  if (!instance) {
    instance = new ListingIntelligenceAgent();
  }
  return instance;
}

export default ListingIntelligenceAgent;
