/**
 * Graph factory — routes to Neo4j or in-memory graph based on GRAPH_BACKEND env var.
 *
 * Usage:
 *   import { getGraphBackend, initializeGraph } from './graph-factory.js';
 *   await initializeGraph();
 *   const graph = getGraphBackend();
 *   const result = await graph.findConnections('seller-123', 2);
 */

import { getGraphEngine } from './graph-engine.js';
import * as graphQueries from './graph-queries.js';

let activeBackend = null; // 'neo4j' | 'memory'
let neo4jQueries = null;

/**
 * Initialize the graph backend.
 * @returns {Promise<string>} The active backend type
 */
export async function initializeGraph() {
  const requested = (process.env.GRAPH_BACKEND || 'memory').toLowerCase();

  if (requested === 'neo4j') {
    try {
      const { initializeNeo4j, isNeo4jAvailable } = await import('./neo4j-client.js');
      const connected = await initializeNeo4j();
      if (connected && isNeo4jAvailable()) {
        neo4jQueries = await import('./neo4j-queries.js');
        activeBackend = 'neo4j';
        console.log('[graph-factory] Using Neo4j backend');
        return activeBackend;
      }
    } catch (err) {
      console.warn(`[graph-factory] Neo4j init failed: ${err.message}`);
    }
    console.warn('[graph-factory] Falling back to in-memory graph');
  }

  activeBackend = 'memory';
  console.log('[graph-factory] Using in-memory graph backend');
  return activeBackend;
}

/**
 * Get a unified graph operations interface.
 * Returns an object with the same methods regardless of backend.
 */
export function getGraphBackend() {
  if (activeBackend === 'neo4j' && neo4jQueries) {
    return {
      addNode: neo4jQueries.addNode,
      addEdge: neo4jQueries.addEdge,
      getNode: neo4jQueries.getNode,
      findConnections: neo4jQueries.findConnections,
      riskPropagation: neo4jQueries.riskPropagation,
      findRings: neo4jQueries.findRings,
      communityDetection: neo4jQueries.communityDetection,
      multiHopInvestigate: neo4jQueries.multiHopInvestigate,
      getStats: neo4jQueries.getStats,

      // Delegate base graph operations to Neo4j
      getNeighbors: (nodeId, depth, edgeTypes) => neo4jQueries.findConnections(nodeId, depth, edgeTypes),
      getNodeCount: async () => (await neo4jQueries.getStats()).nodeCount,
      getEdgeCount: async () => (await neo4jQueries.getStats()).edgeCount,
    };
  }

  // In-memory fallback — wrap synchronous graph-engine methods
  const engine = getGraphEngine();
  return {
    addNode: (id, type, props) => Promise.resolve(engine.addNode(id, type, props)),
    addEdge: (src, tgt, type, props, weight) => Promise.resolve(engine.addEdge(src, tgt, type, props, weight)),
    getNode: (id) => Promise.resolve(engine.getNode(id)),
    findConnections: (nodeId, depth, edgeTypes) => Promise.resolve(engine.getNeighbors(nodeId, depth, edgeTypes)),
    getNeighbors: (nodeId, depth, edgeTypes) => Promise.resolve(engine.getNeighbors(nodeId, depth, edgeTypes)),
    getStats: () => Promise.resolve(engine.getStats()),
    getNodeCount: () => Promise.resolve(engine.getNodeCount()),
    getEdgeCount: () => Promise.resolve(engine.getEdgeCount()),

    // Graph query functions from graph-queries.js (in-memory)
    riskPropagation: (fraudNodeId, decay, maxDepth) =>
      Promise.resolve(graphQueries.riskPropagation(fraudNodeId, decay, maxDepth)),
    findRings: (maxLength) => Promise.resolve(graphQueries.findRings(maxLength)),
    communityDetection: (maxIter) => Promise.resolve(graphQueries.communityDetection(maxIter)),
    multiHopInvestigate: (startId, maxHops, minWeight) =>
      Promise.resolve(graphQueries.multiHopInvestigate(startId, maxHops, minWeight)),
  };
}

/**
 * Get the current graph backend type.
 * @returns {'neo4j' | 'memory' | null}
 */
export function getGraphBackendType() {
  return activeBackend;
}
