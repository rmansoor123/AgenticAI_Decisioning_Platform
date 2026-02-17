/**
 * In-memory Graph Database Engine
 *
 * Provides node/edge storage, bidirectional adjacency lists,
 * property indexes for fast lookups, and BFS traversal.
 */

const INDEXED_PROPERTIES = [
  'email',
  'phone',
  'ipAddress',
  'accountNumber',
  'taxId',
  'deviceFingerprint',
  'address',
];

function normalizeValue(value) {
  if (typeof value !== 'string') {
    return String(value).toLowerCase().trim();
  }
  return value.toLowerCase().trim();
}

class GraphEngine {
  constructor() {
    // Core storage
    this.nodes = new Map();   // Map<nodeId, { id, type, properties }>
    this.edges = new Map();   // Map<edgeId, { id, source, target, type, properties, weight }>

    // Bidirectional adjacency lists
    this.outEdges = new Map(); // Map<nodeId, Set<edgeId>>
    this.inEdges = new Map();  // Map<nodeId, Set<edgeId>>

    // Property indexes — Map<normalizedValue, Set<nodeId>>
    this.propertyIndexes = new Map();
    for (const prop of INDEXED_PROPERTIES) {
      this.propertyIndexes.set(prop, new Map());
    }
  }

  // ---------------------------------------------------------------------------
  // Property indexing
  // ---------------------------------------------------------------------------

  /**
   * Index a node across all applicable property indexes.
   */
  indexNode(node) {
    for (const prop of INDEXED_PROPERTIES) {
      const value = node.properties?.[prop];
      if (value === undefined || value === null) {
        continue;
      }

      const values = Array.isArray(value) ? value : [value];
      const index = this.propertyIndexes.get(prop);

      for (const v of values) {
        const normalized = normalizeValue(v);
        if (!index.has(normalized)) {
          index.set(normalized, new Set());
        }
        index.get(normalized).add(node.id);
      }
    }
  }

  /**
   * Remove a node from all property indexes (used before re-indexing on update).
   */
  deindexNode(node) {
    for (const prop of INDEXED_PROPERTIES) {
      const value = node.properties?.[prop];
      if (value === undefined || value === null) {
        continue;
      }

      const values = Array.isArray(value) ? value : [value];
      const index = this.propertyIndexes.get(prop);

      for (const v of values) {
        const normalized = normalizeValue(v);
        const nodeSet = index.get(normalized);
        if (nodeSet) {
          nodeSet.delete(node.id);
          if (nodeSet.size === 0) {
            index.delete(normalized);
          }
        }
      }
    }
  }

  /**
   * Look up node IDs that match a given property value.
   * Returns a Set<nodeId> (empty set if no matches).
   */
  getNodesByProperty(property, value) {
    const index = this.propertyIndexes.get(property);
    if (!index) {
      return new Set();
    }
    const normalized = normalizeValue(value);
    return index.get(normalized) || new Set();
  }

  // ---------------------------------------------------------------------------
  // Node operations
  // ---------------------------------------------------------------------------

  /**
   * Add a node or update its properties if it already exists.
   * Returns the node object.
   */
  addNode(id, type, properties = {}) {
    const existing = this.nodes.get(id);

    if (existing) {
      // Update: deindex old values, merge properties, reindex
      this.deindexNode(existing);
      existing.type = type;
      existing.properties = { ...existing.properties, ...properties };
      this.indexNode(existing);
      return existing;
    }

    const node = { id, type, properties };
    this.nodes.set(id, node);

    // Ensure adjacency list entries exist
    if (!this.outEdges.has(id)) {
      this.outEdges.set(id, new Set());
    }
    if (!this.inEdges.has(id)) {
      this.inEdges.set(id, new Set());
    }

    this.indexNode(node);
    return node;
  }

  /**
   * Get a node by ID, or null if it does not exist.
   */
  getNode(id) {
    return this.nodes.get(id) || null;
  }

  // ---------------------------------------------------------------------------
  // Edge operations
  // ---------------------------------------------------------------------------

  /**
   * Add an edge between two nodes.
   * Edge ID is generated as `E-{source}-{target}-{type}`.
   * If an edge with the same ID already exists it is skipped (deduplication).
   * Returns the edge object.
   */
  addEdge(source, target, type, properties = {}, weight = 1.0) {
    const edgeId = `E-${source}-${target}-${type}`;

    // Deduplication: skip if edge already present
    if (this.edges.has(edgeId)) {
      return this.edges.get(edgeId);
    }

    const edge = { id: edgeId, source, target, type, properties, weight };
    this.edges.set(edgeId, edge);

    // Update adjacency lists (create entries if nodes haven't been added yet)
    if (!this.outEdges.has(source)) {
      this.outEdges.set(source, new Set());
    }
    if (!this.inEdges.has(target)) {
      this.inEdges.set(target, new Set());
    }

    this.outEdges.get(source).add(edgeId);
    this.inEdges.get(target).add(edgeId);

    return edge;
  }

  /**
   * Get an edge by ID, or null if it does not exist.
   */
  getEdge(id) {
    return this.edges.get(id) || null;
  }

  // ---------------------------------------------------------------------------
  // Traversal
  // ---------------------------------------------------------------------------

  /**
   * BFS traversal from a starting node up to a given depth.
   * Optionally filters edges by type (array of allowed edge types).
   *
   * Returns { nodes: [...], edges: [...] }
   */
  getNeighbors(nodeId, depth = 1, edgeTypes = null) {
    const visitedNodes = new Set();
    const visitedEdges = new Set();
    const resultNodes = [];
    const resultEdges = [];

    const startNode = this.nodes.get(nodeId);
    if (!startNode) {
      return { nodes: [], edges: [] };
    }

    // BFS queue entries: [currentNodeId, currentDepth]
    const queue = [[nodeId, 0]];
    visitedNodes.add(nodeId);
    resultNodes.push(startNode);

    while (queue.length > 0) {
      const [currentId, currentDepth] = queue.shift();

      if (currentDepth >= depth) {
        continue;
      }

      // Collect edge IDs from both outgoing and incoming adjacency lists
      const outgoing = this.outEdges.get(currentId) || new Set();
      const incoming = this.inEdges.get(currentId) || new Set();

      const allEdgeIds = new Set([...outgoing, ...incoming]);

      for (const edgeId of allEdgeIds) {
        if (visitedEdges.has(edgeId)) {
          continue;
        }

        const edge = this.edges.get(edgeId);
        if (!edge) {
          continue;
        }

        // Filter by edge types if specified
        if (edgeTypes && !edgeTypes.includes(edge.type)) {
          continue;
        }

        visitedEdges.add(edgeId);
        resultEdges.push(edge);

        // Determine the neighbor (the node on the other end of the edge)
        const neighborId = edge.source === currentId ? edge.target : edge.source;

        if (!visitedNodes.has(neighborId)) {
          visitedNodes.add(neighborId);
          const neighborNode = this.nodes.get(neighborId);
          if (neighborNode) {
            resultNodes.push(neighborNode);
            queue.push([neighborId, currentDepth + 1]);
          }
        }
      }
    }

    return { nodes: resultNodes, edges: resultEdges };
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  getNodes() {
    return this.nodes;
  }

  getEdges() {
    return this.edges;
  }

  getNodeCount() {
    return this.nodes.size;
  }

  getEdgeCount() {
    return this.edges.size;
  }

  getStats() {
    const indexSizes = {};
    for (const [prop, index] of this.propertyIndexes) {
      indexSizes[prop] = index.size;
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      indexSizes,
    };
  }
}

// -----------------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------------

let instance = null;

export function getGraphEngine() {
  if (!instance) {
    instance = new GraphEngine();
  }
  return instance;
}
