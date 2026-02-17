import { Router } from 'express';
import { getGraphEngine } from '../../graph/graph-engine.js';
import {
  shortestPath,
  findClusters,
  findRings,
  riskPropagation,
} from '../../graph/graph-queries.js';

const router = Router();

/**
 * GET /stats
 * Returns high-level graph statistics: node count, edge count,
 * total cluster count, and the number of high-risk clusters.
 */
router.get('/stats', (req, res) => {
  try {
    const engine = getGraphEngine();
    const stats = engine.getStats();
    const clusters = findClusters();

    const HIGH_RISK_THRESHOLD = 0.7;
    const highRiskClusters = clusters.filter(
      (c) => c.avgRisk >= HIGH_RISK_THRESHOLD
    );

    res.json({
      success: true,
      data: {
        nodeCount: stats.nodeCount,
        edgeCount: stats.edgeCount,
        clusterCount: clusters.length,
        highRiskClusterCount: highRiskClusters.length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /seller/:sellerId/network
 * Returns the ego network for a given seller: the seller node itself,
 * its neighbor nodes up to the requested depth, and all connecting edges.
 * Query params:
 *   - depth (number, default 2)
 */
router.get('/seller/:sellerId/network', (req, res) => {
  try {
    const { sellerId } = req.params;
    const depth = parseInt(req.query.depth, 10) || 2;

    const engine = getGraphEngine();
    const sellerNode = engine.getNode(sellerId);

    if (!sellerNode) {
      return res
        .status(404)
        .json({ success: false, error: `Seller ${sellerId} not found` });
    }

    const { nodes, edges } = engine.getNeighbors(sellerId, depth);

    res.json({
      success: true,
      data: {
        seller: sellerNode,
        nodes,
        edges,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /seller/:sellerId/risk-propagation
 * Computes BFS-based risk propagation outward from the given seller.
 * Query params:
 *   - decay  (number, default 0.5) — decay factor per hop
 *   - maxDepth (number, default 4) — maximum BFS depth
 */
router.get('/seller/:sellerId/risk-propagation', (req, res) => {
  try {
    const { sellerId } = req.params;
    const decay = parseFloat(req.query.decay) || 0.5;
    const maxDepth = parseInt(req.query.maxDepth, 10) || 4;

    const engine = getGraphEngine();
    const sellerNode = engine.getNode(sellerId);

    if (!sellerNode) {
      return res
        .status(404)
        .json({ success: false, error: `Seller ${sellerId} not found` });
    }

    const propagatedRisk = riskPropagation(sellerId, decay, maxDepth);

    // Convert the Map to an array of { nodeId, risk } objects
    const affectedNodes = [];
    for (const [nodeId, risk] of propagatedRisk) {
      const node = engine.getNode(nodeId);
      affectedNodes.push({
        nodeId,
        propagatedRisk: risk,
        originalRisk: node?.properties?.riskScore ?? 0,
        type: node?.type ?? null,
      });
    }

    // Sort by propagated risk descending
    affectedNodes.sort((a, b) => b.propagatedRisk - a.propagatedRisk);

    res.json({
      success: true,
      data: {
        sourceNode: sellerId,
        decay,
        maxDepth,
        affectedNodes,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /clusters
 * Returns all connected-component clusters sorted by average risk descending.
 * Each cluster includes node count, average risk, max risk, edge count,
 * and the list of member node IDs.
 */
router.get('/clusters', (req, res) => {
  try {
    const engine = getGraphEngine();
    const clusters = findClusters();

    const data = clusters.map((cluster) => ({
      clusterId: cluster.clusterId,
      size: cluster.size,
      avgRisk: cluster.avgRisk,
      maxRisk: cluster.maxRisk,
      edgeCount: cluster.edgeCount,
      members: cluster.nodes.map((nodeId) => {
        const node = engine.getNode(nodeId);
        return {
          nodeId,
          type: node?.type ?? null,
          riskScore: node?.properties?.riskScore ?? 0,
        };
      }),
    }));

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /rings
 * Detects fraud rings (cycles) in the graph using DFS.
 * Query params:
 *   - maxLength (number, default 6) — maximum cycle length
 */
router.get('/rings', (req, res) => {
  try {
    const maxLength = parseInt(req.query.maxLength, 10) || 6;
    const engine = getGraphEngine();
    const rings = findRings(maxLength);

    const data = rings.map((ring) => ({
      length: ring.length,
      avgRisk: ring.avgRisk,
      nodes: ring.nodes.map((nodeId) => {
        const node = engine.getNode(nodeId);
        return {
          nodeId,
          type: node?.type ?? null,
          riskScore: node?.properties?.riskScore ?? 0,
        };
      }),
    }));

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /path/:from/:to
 * Computes the shortest path between two nodes using Dijkstra's algorithm.
 * Returns the ordered path of node IDs, the edges traversed, and total distance.
 */
router.get('/path/:from/:to', (req, res) => {
  try {
    const { from, to } = req.params;
    const result = shortestPath(from, to);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: `No path found between ${from} and ${to}`,
      });
    }

    const engine = getGraphEngine();
    const pathNodes = result.path.map((nodeId) => {
      const node = engine.getNode(nodeId);
      return {
        nodeId,
        type: node?.type ?? null,
        riskScore: node?.properties?.riskScore ?? 0,
      };
    });

    res.json({
      success: true,
      data: {
        path: pathNodes,
        edges: result.edges,
        distance: result.distance,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
