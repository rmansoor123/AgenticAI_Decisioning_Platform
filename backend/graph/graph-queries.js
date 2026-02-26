import { getGraphEngine } from './graph-engine.js';

/**
 * Dijkstra's shortest path algorithm with weighted edges.
 * @param {string} fromId - Source node ID
 * @param {string} toId - Target node ID
 * @returns {{ path: string[], distance: number, edges: string[] } | null}
 */
export function shortestPath(fromId, toId) {
  const engine = getGraphEngine();
  const nodes = engine.getNodes();
  const edges = engine.getEdges();

  if (!nodes.has(fromId) || !nodes.has(toId)) {
    return null;
  }

  if (fromId === toId) {
    return { path: [fromId], distance: 0, edges: [] };
  }

  // Build adjacency list: nodeId -> [{ neighbor, weight, edgeId }]
  const adjacency = new Map();
  for (const [nodeId] of nodes) {
    adjacency.set(nodeId, []);
  }

  for (const [edgeId, edge] of edges) {
    const weight = edge.properties?.weight ?? 1;
    const source = edge.source;
    const target = edge.target;

    if (adjacency.has(source)) {
      adjacency.get(source).push({ neighbor: target, weight, edgeId });
    }
    if (adjacency.has(target)) {
      adjacency.get(target).push({ neighbor: source, weight, edgeId });
    }
  }

  // Dijkstra
  const dist = new Map();
  const prev = new Map();
  const prevEdge = new Map();
  const visited = new Set();

  for (const [nodeId] of nodes) {
    dist.set(nodeId, Infinity);
  }
  dist.set(fromId, 0);

  while (true) {
    // Find unvisited node with smallest distance
    let current = null;
    let currentDist = Infinity;
    for (const [nodeId, d] of dist) {
      if (!visited.has(nodeId) && d < currentDist) {
        current = nodeId;
        currentDist = d;
      }
    }

    if (current === null || current === toId) {
      break;
    }

    visited.add(current);

    const neighbors = adjacency.get(current) || [];
    for (const { neighbor, weight, edgeId } of neighbors) {
      if (visited.has(neighbor)) continue;
      const alt = currentDist + weight;
      if (alt < dist.get(neighbor)) {
        dist.set(neighbor, alt);
        prev.set(neighbor, current);
        prevEdge.set(neighbor, edgeId);
      }
    }
  }

  if (dist.get(toId) === Infinity) {
    return null;
  }

  // Reconstruct path
  const path = [];
  const edgePath = [];
  let current = toId;
  while (current !== undefined) {
    path.unshift(current);
    if (prevEdge.has(current)) {
      edgePath.unshift(prevEdge.get(current));
    }
    current = prev.get(current);
  }

  return {
    path,
    distance: dist.get(toId),
    edges: edgePath,
  };
}

/**
 * Find connected components using BFS.
 * Returns clusters sorted by average risk score descending.
 * @returns {Array<{ clusterId: number, nodes: string[], size: number, avgRisk: number, maxRisk: number, edgeCount: number }>}
 */
export function findClusters() {
  const engine = getGraphEngine();
  const nodes = engine.getNodes();
  const edges = engine.getEdges();

  // Build adjacency list
  const adjacency = new Map();
  for (const [nodeId] of nodes) {
    adjacency.set(nodeId, []);
  }

  // Track edges per node pair for counting
  const edgesByNode = new Map();
  for (const [nodeId] of nodes) {
    edgesByNode.set(nodeId, new Set());
  }

  for (const [edgeId, edge] of edges) {
    const source = edge.source;
    const target = edge.target;

    if (adjacency.has(source)) {
      adjacency.get(source).push(target);
      edgesByNode.get(source).add(edgeId);
    }
    if (adjacency.has(target)) {
      adjacency.get(target).push(source);
      edgesByNode.get(target).add(edgeId);
    }
  }

  const visited = new Set();
  const clusters = [];
  let clusterId = 0;

  for (const [nodeId] of nodes) {
    if (visited.has(nodeId)) continue;

    // BFS to find connected component
    const component = [];
    const queue = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);

      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // Compute cluster statistics
    const componentSet = new Set(component);
    const clusterEdges = new Set();
    for (const [edgeId, edge] of edges) {
      if (componentSet.has(edge.source) && componentSet.has(edge.target)) {
        clusterEdges.add(edgeId);
      }
    }

    let totalRisk = 0;
    let maxRisk = 0;
    for (const nId of component) {
      const node = nodes.get(nId);
      const riskScore = node?.properties?.riskScore ?? 0;
      totalRisk += riskScore;
      if (riskScore > maxRisk) {
        maxRisk = riskScore;
      }
    }

    const avgRisk = component.length > 0 ? totalRisk / component.length : 0;

    clusters.push({
      clusterId,
      nodes: component,
      size: component.length,
      avgRisk,
      maxRisk,
      edgeCount: clusterEdges.size,
    });

    clusterId++;
  }

  // Sort by avgRisk descending
  clusters.sort((a, b) => b.avgRisk - a.avgRisk);

  return clusters;
}

/**
 * Iterative PageRank computation.
 * @param {number} iterations - Number of iterations (default 20)
 * @param {number} dampingFactor - Damping factor (default 0.85)
 * @returns {Map<string, number>} Map of nodeId to PageRank score, sorted by score descending
 */
export function pageRank(iterations = 20, dampingFactor = 0.85) {
  const engine = getGraphEngine();
  const nodes = engine.getNodes();
  const edges = engine.getEdges();

  const nodeIds = Array.from(nodes.keys());
  const n = nodeIds.length;

  if (n === 0) {
    return new Map();
  }

  // Build adjacency: outgoing links for each node
  const outLinks = new Map();
  const inLinks = new Map();
  for (const nodeId of nodeIds) {
    outLinks.set(nodeId, []);
    inLinks.set(nodeId, []);
  }

  for (const [, edge] of edges) {
    const source = edge.source;
    const target = edge.target;
    if (outLinks.has(source) && inLinks.has(target)) {
      outLinks.get(source).push(target);
      inLinks.get(target).push(source);
    }
    // For undirected graphs, add reverse direction too
    if (outLinks.has(target) && inLinks.has(source)) {
      outLinks.get(target).push(source);
      inLinks.get(source).push(target);
    }
  }

  // Initialize scores
  const initialScore = 1 / n;
  let scores = new Map();
  for (const nodeId of nodeIds) {
    scores.set(nodeId, initialScore);
  }

  // Iterative computation
  for (let i = 0; i < iterations; i++) {
    const newScores = new Map();

    for (const nodeId of nodeIds) {
      let incomingSum = 0;
      const incoming = inLinks.get(nodeId) || [];

      for (const inNode of incoming) {
        const outDegree = outLinks.get(inNode)?.length || 1;
        incomingSum += scores.get(inNode) / outDegree;
      }

      const score = (1 - dampingFactor) / n + dampingFactor * incomingSum;
      newScores.set(nodeId, score);
    }

    scores = newScores;
  }

  // Sort by score descending
  const sorted = new Map(
    [...scores.entries()].sort((a, b) => b[1] - a[1])
  );

  return sorted;
}

/**
 * DFS-based cycle detection to find rings in the graph.
 * @param {number} maxLength - Maximum cycle length to detect (default 6)
 * @returns {Array<{ nodes: string[], length: number, avgRisk: number }>}
 */
export function findRings(maxLength = 6) {
  const engine = getGraphEngine();
  const nodes = engine.getNodes();
  const edges = engine.getEdges();
  const MAX_RINGS = 100;

  // Build adjacency list
  const adjacency = new Map();
  for (const [nodeId] of nodes) {
    adjacency.set(nodeId, []);
  }

  for (const [, edge] of edges) {
    const source = edge.source;
    const target = edge.target;
    if (adjacency.has(source)) {
      adjacency.get(source).push(target);
    }
    if (adjacency.has(target)) {
      adjacency.get(target).push(source);
    }
  }

  const rings = [];
  const nodeIds = Array.from(nodes.keys());
  const foundCycles = new Set();

  /**
   * Normalize a cycle for deduplication by rotating so the smallest
   * node ID is first, then choosing the lexicographically smaller direction.
   */
  function normalizeCycle(cycle) {
    const len = cycle.length;
    if (len === 0) return '';

    // Find the index of the smallest element
    let minIdx = 0;
    for (let i = 1; i < len; i++) {
      if (cycle[i] < cycle[minIdx]) {
        minIdx = i;
      }
    }

    // Rotate so smallest is first
    const rotated = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];

    // Compare forward vs reverse direction to pick canonical form
    const reversed = [rotated[0], ...rotated.slice(1).reverse()];

    const forwardKey = rotated.join('->');
    const reverseKey = reversed.join('->');

    return forwardKey < reverseKey ? forwardKey : reverseKey;
  }

  // DFS from each node to find cycles
  for (const startNode of nodeIds) {
    if (rings.length >= MAX_RINGS) break;

    const path = [startNode];
    const pathSet = new Set([startNode]);

    function dfs(current, depth) {
      if (rings.length >= MAX_RINGS) return;
      if (depth > maxLength) return;

      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (rings.length >= MAX_RINGS) return;

        if (neighbor === startNode && depth >= 3) {
          // Found a cycle
          const cycle = [...path];
          const key = normalizeCycle(cycle);

          if (!foundCycles.has(key)) {
            foundCycles.add(key);

            let totalRisk = 0;
            for (const nId of cycle) {
              const node = nodes.get(nId);
              totalRisk += node?.properties?.riskScore ?? 0;
            }

            rings.push({
              nodes: cycle,
              length: cycle.length,
              avgRisk: cycle.length > 0 ? totalRisk / cycle.length : 0,
            });
          }
        } else if (!pathSet.has(neighbor) && depth < maxLength) {
          path.push(neighbor);
          pathSet.add(neighbor);
          dfs(neighbor, depth + 1);
          path.pop();
          pathSet.delete(neighbor);
        }
      }
    }

    dfs(startNode, 1);
  }

  return rings;
}

/**
 * BFS-based risk propagation from a fraud node with decaying risk.
 * @param {string} fraudNodeId - The starting fraud node ID
 * @param {number} decay - Decay factor applied at each hop (default 0.5)
 * @param {number} maxDepth - Maximum BFS depth (default 4)
 * @returns {Map<string, number>} Map of nodeId to propagated risk score
 */
export function riskPropagation(fraudNodeId, decay = 0.5, maxDepth = 4) {
  const engine = getGraphEngine();
  const nodes = engine.getNodes();
  const edges = engine.getEdges();

  if (!nodes.has(fraudNodeId)) {
    return new Map();
  }

  // Build adjacency list
  const adjacency = new Map();
  for (const [nodeId] of nodes) {
    adjacency.set(nodeId, []);
  }

  for (const [, edge] of edges) {
    const source = edge.source;
    const target = edge.target;
    if (adjacency.has(source)) {
      adjacency.get(source).push(target);
    }
    if (adjacency.has(target)) {
      adjacency.get(target).push(source);
    }
  }

  // Get the initial risk score of the fraud node
  const fraudNode = nodes.get(fraudNodeId);
  const initialRisk = fraudNode?.properties?.riskScore ?? 1;

  const propagatedRisk = new Map();
  propagatedRisk.set(fraudNodeId, initialRisk);

  // BFS with depth tracking
  const visited = new Set([fraudNodeId]);
  let currentLevel = [fraudNodeId];
  let depth = 0;

  while (currentLevel.length > 0 && depth < maxDepth) {
    depth++;
    const nextLevel = [];
    const decayedFactor = Math.pow(decay, depth);

    for (const current of currentLevel) {
      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          nextLevel.push(neighbor);

          const risk = initialRisk * decayedFactor;
          // If already has a propagated risk, take the maximum
          const existing = propagatedRisk.get(neighbor) ?? 0;
          propagatedRisk.set(neighbor, Math.max(existing, risk));
        }
      }
    }

    currentLevel = nextLevel;
  }

  return propagatedRisk;
}

/**
 * Community detection using Label Propagation Algorithm.
 * Each node starts with its own label, then iteratively adopts
 * the most frequent label among its neighbors.
 * @param {number} maxIterations - Maximum iterations (default 10)
 * @returns {Map<string, string>} Map of nodeId to community label
 */
export function communityDetection(maxIterations = 10) {
  const engine = getGraphEngine();
  const nodes = engine.getNodes();
  const edges = engine.getEdges();

  // Build adjacency list
  const adjacency = new Map();
  for (const [nodeId] of nodes) {
    adjacency.set(nodeId, []);
  }

  for (const [, edge] of edges) {
    const source = edge.source;
    const target = edge.target;
    if (adjacency.has(source)) {
      adjacency.get(source).push(target);
    }
    if (adjacency.has(target)) {
      adjacency.get(target).push(source);
    }
  }

  // Initialize: each node gets its own ID as its label
  const labels = new Map();
  for (const [nodeId] of nodes) {
    labels.set(nodeId, nodeId);
  }

  const nodeIds = Array.from(nodes.keys());

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let changed = false;

    // Shuffle node order for randomness to avoid oscillation
    const shuffled = [...nodeIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    for (const nodeId of shuffled) {
      const neighbors = adjacency.get(nodeId) || [];
      if (neighbors.length === 0) continue;

      // Count label frequencies among neighbors
      const labelCounts = new Map();
      for (const neighbor of neighbors) {
        const neighborLabel = labels.get(neighbor);
        labelCounts.set(neighborLabel, (labelCounts.get(neighborLabel) || 0) + 1);
      }

      // Find the label with the highest frequency
      let maxCount = 0;
      let bestLabel = labels.get(nodeId);
      for (const [label, count] of labelCounts) {
        if (count > maxCount) {
          maxCount = count;
          bestLabel = label;
        } else if (count === maxCount && label < bestLabel) {
          // Tie-break: choose the lexicographically smaller label for determinism
          bestLabel = label;
        }
      }

      if (bestLabel !== labels.get(nodeId)) {
        labels.set(nodeId, bestLabel);
        changed = true;
      }
    }

    // Converged early
    if (!changed) break;
  }

  return labels;
}

/**
 * Multi-hop BFS investigation from a starting node.
 * Traverses edges with weight >= minWeight, collecting risk signals at each hop.
 *
 * Risk signals detected on each node:
 * - 'high-risk-score' if riskScore > 50
 * - 'fraud-history' if fraudHistory is truthy
 * - 'watchlist-match' if watchlistMatch is truthy
 * - 'rejected-entity' if status === 'REJECTED'
 *
 * The start node (hop 0) is excluded from the evidence chain.
 *
 * @param {string} startId - Starting node ID for investigation
 * @param {number} maxHops - Maximum BFS depth (default 3)
 * @param {number} minWeight - Minimum edge weight to traverse (default 0.7)
 * @returns {{ evidenceChain: Array<{ entity: string, hop: number, relationship: string, riskSignals: string[], properties: object }>, totalRiskSignals: number }}
 */
export function multiHopInvestigate(startId, maxHops = 3, minWeight = 0.7) {
  const engine = getGraphEngine();
  const nodes = engine.getNodes();
  const edges = engine.getEdges();

  if (!nodes.has(startId)) {
    return { evidenceChain: [], totalRiskSignals: 0 };
  }

  // Build adjacency list: nodeId -> [{ neighbor, weight, edgeType }]
  // Only include edges with properties.weight >= minWeight
  const adjacency = new Map();
  for (const [nodeId] of nodes) {
    adjacency.set(nodeId, []);
  }

  for (const [, edge] of edges) {
    const weight = edge.properties?.weight ?? 0;
    if (weight < minWeight) continue;

    const source = edge.source;
    const target = edge.target;

    if (adjacency.has(source)) {
      adjacency.get(source).push({ neighbor: target, weight, edgeType: edge.type });
    }
    if (adjacency.has(target)) {
      adjacency.get(target).push({ neighbor: source, weight, edgeType: edge.type });
    }
  }

  // Collect risk signals from a node's properties
  function collectRiskSignals(node) {
    const signals = [];
    const props = node?.properties || {};

    if (props.riskScore > 50) {
      signals.push('high-risk-score');
    }
    if (props.fraudHistory) {
      signals.push('fraud-history');
    }
    if (props.watchlistMatch) {
      signals.push('watchlist-match');
    }
    if (props.status === 'REJECTED') {
      signals.push('rejected-entity');
    }

    return signals;
  }

  // BFS traversal
  const evidenceChain = [];
  let totalRiskSignals = 0;
  const visited = new Set([startId]);

  // Queue entries: [nodeId, hop, edgeType]
  // Seed with hop 0 for the start node (which we skip in output)
  let currentLevel = [{ nodeId: startId, hop: 0, edgeType: '' }];

  while (currentLevel.length > 0) {
    const nextLevel = [];

    for (const { nodeId: currentId, hop: currentHop } of currentLevel) {
      if (currentHop >= maxHops) continue;

      const neighbors = adjacency.get(currentId) || [];
      for (const { neighbor, edgeType } of neighbors) {
        if (visited.has(neighbor)) continue;

        visited.add(neighbor);
        const neighborNode = nodes.get(neighbor);
        if (!neighborNode) continue;

        const hop = currentHop + 1;
        const riskSignals = collectRiskSignals(neighborNode);

        evidenceChain.push({
          entity: neighbor,
          hop,
          relationship: edgeType,
          riskSignals,
          properties: { ...neighborNode.properties },
        });

        totalRiskSignals += riskSignals.length;
        nextLevel.push({ nodeId: neighbor, hop, edgeType });
      }
    }

    currentLevel = nextLevel;
  }

  return { evidenceChain, totalRiskSignals };
}
