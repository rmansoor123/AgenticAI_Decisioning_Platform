/**
 * Graph Tools for Agent Reasoning
 *
 * Provides graph-based tools that agents can use to explore network
 * relationships, propagate risk scores, detect fraud rings, and
 * identify communities around seller entities.
 */

import { getGraphEngine } from '../../graph/graph-engine.js';
import { findRings, riskPropagation, communityDetection } from '../../graph/graph-queries.js';

/**
 * Helper: Traverse the graph engine to find neighbors of a seller
 * up to `depth` hops away.
 *
 * @param {string} sellerId - Starting node ID
 * @param {number} depth - Maximum traversal depth
 * @returns {{ nodes: Array, edges: Array }}
 */
function getNeighbors(sellerId, depth = 2) {
  const engine = getGraphEngine();
  return engine.getNeighbors(sellerId, depth);
}

/**
 * Create the set of graph-based tools for agent registration.
 *
 * @returns {Object<string, { name: string, description: string, handler: function }>}
 */
export function createGraphTools() {
  return {
    graph_find_connections: {
      name: 'graph_find_connections',
      description: 'Find entities connected to a seller through shared attributes (email, phone, IP, etc.) up to N hops in the graph.',
      handler: async ({ sellerId, depth = 2 }) => {
        try {
          const { nodes, edges } = getNeighbors(sellerId, depth);
          return {
            success: true,
            data: {
              sellerId,
              depth,
              connectedNodes: nodes.map(n => ({
                id: n.id,
                type: n.type,
                properties: n.properties,
              })),
              edges: edges.map(e => ({
                id: e.id,
                source: e.source,
                target: e.target,
                type: e.type,
                weight: e.weight ?? e.properties?.weight ?? 1,
              })),
              totalNodes: nodes.length,
              totalEdges: edges.length,
            },
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
    },

    graph_risk_propagation: {
      name: 'graph_risk_propagation',
      description: 'Calculate propagated risk from fraud-flagged neighbors. Uses BFS with decaying risk scores to quantify exposure.',
      handler: async ({ sellerId, depth = 2 }) => {
        try {
          const propagated = riskPropagation(sellerId, 0.5, depth);
          // Convert Map to plain object for serialization
          const riskEntries = [];
          for (const [nodeId, risk] of propagated) {
            riskEntries.push({ nodeId, propagatedRisk: risk });
          }
          return {
            success: true,
            data: {
              sellerId,
              depth,
              propagatedRisks: riskEntries,
              totalAffected: riskEntries.length,
              maxPropagatedRisk: riskEntries.length > 0
                ? Math.max(...riskEntries.map(e => e.propagatedRisk))
                : 0,
            },
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
    },

    graph_find_rings: {
      name: 'graph_find_rings',
      description: 'Detect cycles (fraud rings) involving the subject seller. Returns rings up to the specified maximum length.',
      handler: async ({ sellerId, maxLength = 5 }) => {
        try {
          const allRings = findRings(maxLength);
          // Filter to only rings that include the seller
          const sellerRings = allRings.filter(ring =>
            ring.nodes.includes(sellerId)
          );
          return {
            success: true,
            data: {
              sellerId,
              maxLength,
              rings: sellerRings,
              ringCount: sellerRings.length,
              totalRingsInGraph: allRings.length,
            },
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
    },

    graph_community: {
      name: 'graph_community',
      description: 'Identify the community (cluster) the seller belongs to and aggregate risk metrics for that community.',
      handler: async ({ sellerId }) => {
        try {
          const labels = communityDetection();
          const sellerLabel = labels.get(sellerId);

          // Find all nodes in the same community
          const communityMembers = [];
          const engine = getGraphEngine();
          const nodes = engine.getNodes();

          let totalRisk = 0;
          let maxRisk = 0;
          let memberCount = 0;

          for (const [nodeId, label] of labels) {
            if (label === sellerLabel) {
              const node = nodes.get(nodeId);
              const riskScore = node?.properties?.riskScore ?? 0;
              communityMembers.push({
                id: nodeId,
                type: node?.type,
                riskScore,
              });
              totalRisk += riskScore;
              if (riskScore > maxRisk) maxRisk = riskScore;
              memberCount++;
            }
          }

          const avgRisk = memberCount > 0 ? totalRisk / memberCount : 0;

          return {
            success: true,
            data: {
              sellerId,
              communityLabel: sellerLabel ?? null,
              members: communityMembers,
              memberCount,
              avgRisk,
              maxRisk,
              totalCommunities: new Set(labels.values()).size,
            },
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
    },
  };
}
