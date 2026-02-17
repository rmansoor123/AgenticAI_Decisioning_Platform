/**
 * Seller Relationship Graph Builder
 *
 * Builds and maintains a graph of seller relationships by detecting shared
 * attributes (email, phone, IP, bank account, tax ID, device fingerprint,
 * address). Uses the graph engine's property indexes so that edge discovery
 * runs in O(n) per attribute rather than O(n^2).
 */

import { getGraphEngine } from './graph-engine.js';
import { db_ops } from '../shared/common/database.js';

// ---------------------------------------------------------------------------
// Edge type definitions with default weights
// ---------------------------------------------------------------------------

const EDGE_TYPES = {
  SHARED_EMAIL:       { type: 'SHARED_EMAIL',       weight: 0.9  },
  SHARED_PHONE:       { type: 'SHARED_PHONE',       weight: 0.85 },
  SHARED_IP:          { type: 'SHARED_IP',           weight: 0.7  },
  SHARED_BANK:        { type: 'SHARED_BANK',         weight: 0.95 },
  SHARED_TAX_ID:      { type: 'SHARED_TAX_ID',       weight: 0.95 },
  SHARED_DEVICE:      { type: 'SHARED_DEVICE',       weight: 0.8  },
  SIMILAR_ADDRESS:    { type: 'SIMILAR_ADDRESS',      weight: 0.6  },
};

/**
 * Mapping from indexed property names (as stored in the graph engine) to the
 * corresponding edge type key in EDGE_TYPES.
 */
const PROPERTY_TO_EDGE = {
  email:             'SHARED_EMAIL',
  phone:             'SHARED_PHONE',
  ipAddress:         'SHARED_IP',
  accountNumber:     'SHARED_BANK',
  taxId:             'SHARED_TAX_ID',
  deviceFingerprint: 'SHARED_DEVICE',
  address:           'SIMILAR_ADDRESS',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create edges between every pair in `nodeIds` for the given edge type.
 * Returns the number of new edges created.
 */
function createPairwiseEdges(graph, nodeIds, edgeTypeDef) {
  const ids = Array.from(nodeIds);
  let created = 0;

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const source = ids[i];
      const target = ids[j];

      // addEdge deduplicates internally so calling it twice for the same pair
      // is safe, but we still order source/target consistently to avoid
      // creating two directed edges for the same undirected relationship.
      const [a, b] = source < target ? [source, target] : [target, source];
      const existing = graph.getEdge(`E-${a}-${b}-${edgeTypeDef.type}`);
      if (!existing) {
        graph.addEdge(a, b, edgeTypeDef.type, {}, edgeTypeDef.weight);
        created++;
      }
    }
  }

  return created;
}

// ---------------------------------------------------------------------------
// buildFromSellers — full graph construction
// ---------------------------------------------------------------------------

/**
 * Build the entire seller relationship graph from scratch.
 *
 * 1. Fetches all sellers from the database.
 * 2. Adds each seller as a graph node (which also populates the property
 *    indexes inside the graph engine).
 * 3. Iterates through each property index; for every index entry that maps
 *    to 2+ nodes, creates pairwise edges of the appropriate type.
 *
 * @returns {{ nodes: number, edges: number, edgesByType: Record<string, number> }}
 */
export function buildFromSellers() {
  const graph = getGraphEngine();

  // -- Step 1: Load all sellers -------------------------------------------------
  const sellerRows = db_ops.getAll('sellers', 10000, 0);
  const sellers = sellerRows.map(s => s.data);

  // -- Step 2: Add every seller as a node ---------------------------------------
  for (const seller of sellers) {
    if (!seller || !seller.sellerId) {
      continue;
    }

    graph.addNode(seller.sellerId, 'seller', {
      sellerId:          seller.sellerId,
      businessName:      seller.businessName,
      email:             seller.email,
      phone:             seller.phone,
      ipAddress:         seller.ipAddress,
      accountNumber:     seller.accountNumber,
      taxId:             seller.taxId,
      deviceFingerprint: seller.deviceFingerprint,
      address:           seller.address,
      country:           seller.country,
      riskScore:         seller.riskScore,
      riskTier:          seller.riskTier,
      status:            seller.status,
    });
  }

  // -- Step 3: Build edges using property indexes (O(n) per attribute) ----------
  const edgesByType = {};

  for (const [property, edgeTypeKey] of Object.entries(PROPERTY_TO_EDGE)) {
    const edgeTypeDef = EDGE_TYPES[edgeTypeKey];
    const index = graph.propertyIndexes.get(property);

    if (!index) {
      continue;
    }

    let countForType = 0;

    // Each index entry is [normalizedValue, Set<nodeId>]
    for (const [, nodeIds] of index) {
      if (nodeIds.size < 2) {
        continue;
      }

      countForType += createPairwiseEdges(graph, nodeIds, edgeTypeDef);
    }

    if (countForType > 0) {
      edgesByType[edgeTypeDef.type] = countForType;
    }
  }

  return {
    nodes: graph.getNodeCount(),
    edges: graph.getEdgeCount(),
    edgesByType,
  };
}

// ---------------------------------------------------------------------------
// addSeller — incremental update
// ---------------------------------------------------------------------------

/**
 * Incrementally add a single seller to the graph and discover any new edges
 * by checking existing property indexes.
 *
 * This is intended to be called when a new seller is onboarded so the graph
 * stays up-to-date without a full rebuild.
 *
 * @param {object} sellerData - The seller record (same shape as stored in DB).
 * @returns {{ nodeId: string, newEdges: Array<{ type: string, target: string, weight: number }> }}
 */
export function addSeller(sellerData) {
  if (!sellerData || !sellerData.sellerId) {
    throw new Error('sellerData must include a sellerId');
  }

  const graph = getGraphEngine();
  const nodeId = sellerData.sellerId;

  // Add the node (also indexes its properties)
  graph.addNode(nodeId, 'seller', {
    sellerId:          sellerData.sellerId,
    businessName:      sellerData.businessName,
    email:             sellerData.email,
    phone:             sellerData.phone,
    ipAddress:         sellerData.ipAddress,
    accountNumber:     sellerData.accountNumber,
    taxId:             sellerData.taxId,
    deviceFingerprint: sellerData.deviceFingerprint,
    address:           sellerData.address,
    country:           sellerData.country,
    riskScore:         sellerData.riskScore,
    riskTier:          sellerData.riskTier,
    status:            sellerData.status,
  });

  // Discover edges by checking each indexed property for co-occurrences
  const newEdges = [];

  for (const [property, edgeTypeKey] of Object.entries(PROPERTY_TO_EDGE)) {
    const value = sellerData[property];
    if (value === undefined || value === null) {
      continue;
    }

    const edgeTypeDef = EDGE_TYPES[edgeTypeKey];
    const matchingNodes = graph.getNodesByProperty(property, value);

    for (const matchedId of matchingNodes) {
      // Skip self
      if (matchedId === nodeId) {
        continue;
      }

      // Consistent ordering to match createPairwiseEdges and avoid duplicates
      const [a, b] = nodeId < matchedId ? [nodeId, matchedId] : [matchedId, nodeId];
      const existing = graph.getEdge(`E-${a}-${b}-${edgeTypeDef.type}`);
      if (!existing) {
        graph.addEdge(a, b, edgeTypeDef.type, {}, edgeTypeDef.weight);
        newEdges.push({
          type: edgeTypeDef.type,
          target: matchedId,
          weight: edgeTypeDef.weight,
        });
      }
    }
  }

  return { nodeId, newEdges };
}
