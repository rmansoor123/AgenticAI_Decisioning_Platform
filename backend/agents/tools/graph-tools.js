/**
 * Graph-based Agent Tools
 *
 * Provides graph analysis tools for agent reasoning, exposing
 * graph query functions as structured tool handlers.
 */

import {
  shortestPath,
  findClusters,
  pageRank,
  findRings,
  riskPropagation,
  communityDetection,
  multiHopInvestigate,
} from '../../graph/graph-queries.js';

/**
 * Create graph analysis tools for agent use.
 * @returns {Object} Map of tool name to { name, description, handler }
 */
export function createGraphTools() {
  return {
    graph_shortest_path: {
      name: 'graph_shortest_path',
      description: 'Find the shortest weighted path between two nodes in the entity graph',
      handler: async ({ fromId, toId }) => {
        try {
          const result = shortestPath(fromId, toId);
          return { success: true, data: result };
        } catch (e) {
          return { success: false, error: e.message, data: null };
        }
      },
    },

    graph_find_clusters: {
      name: 'graph_find_clusters',
      description: 'Find connected components (clusters) in the entity graph, sorted by average risk',
      handler: async () => {
        try {
          const result = findClusters();
          return { success: true, data: result };
        } catch (e) {
          return { success: false, error: e.message, data: [] };
        }
      },
    },

    graph_page_rank: {
      name: 'graph_page_rank',
      description: 'Compute PageRank scores for all nodes to identify influential entities',
      handler: async ({ iterations = 20, dampingFactor = 0.85 } = {}) => {
        try {
          const result = pageRank(iterations, dampingFactor);
          // Convert Map to plain object for serialization
          const scores = Object.fromEntries(result);
          return { success: true, data: scores };
        } catch (e) {
          return { success: false, error: e.message, data: {} };
        }
      },
    },

    graph_find_rings: {
      name: 'graph_find_rings',
      description: 'Detect cycles (rings) in the entity graph that may indicate fraud rings',
      handler: async ({ maxLength = 6 } = {}) => {
        try {
          const result = findRings(maxLength);
          return { success: true, data: result };
        } catch (e) {
          return { success: false, error: e.message, data: [] };
        }
      },
    },

    graph_risk_propagation: {
      name: 'graph_risk_propagation',
      description: 'Propagate risk scores from a fraud node through the graph with decay',
      handler: async ({ fraudNodeId, decay = 0.5, maxDepth = 4 }) => {
        try {
          const result = riskPropagation(fraudNodeId, decay, maxDepth);
          const scores = Object.fromEntries(result);
          return { success: true, data: scores };
        } catch (e) {
          return { success: false, error: e.message, data: {} };
        }
      },
    },

    graph_community_detection: {
      name: 'graph_community_detection',
      description: 'Detect communities using label propagation to find entity groups',
      handler: async ({ maxIterations = 10 } = {}) => {
        try {
          const result = communityDetection(maxIterations);
          const labels = Object.fromEntries(result);
          return { success: true, data: labels };
        } catch (e) {
          return { success: false, error: e.message, data: {} };
        }
      },
    },

    graph_multi_hop_investigate: {
      name: 'graph_multi_hop_investigate',
      description: 'Traverse up to 3 hops on high-weight edges, collecting risk signals for network-level risk assessment',
      handler: async ({ sellerId, maxHops = 3, minWeight = 0.7 }) => {
        try {
          const result = multiHopInvestigate(sellerId, maxHops, minWeight);
          return { success: true, data: result };
        } catch (e) {
          return { success: false, error: e.message, data: { evidenceChain: [], totalRiskSignals: 0 } };
        }
      },
    },
  };
}
