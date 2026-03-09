/**
 * Neo4j Cypher query implementations.
 * Mirrors the in-memory graph operations in graph-engine.js and graph-queries.js.
 *
 * All functions take a Neo4j session or use the singleton driver.
 * Neo4j integers are converted to JS numbers via .toNumber() where needed.
 */

import { getNeo4jDriver } from './neo4j-client.js';

function toNumber(val) {
  if (val && typeof val.toNumber === 'function') return val.toNumber();
  if (typeof val === 'bigint') return Number(val);
  return val;
}

async function runQuery(cypher, params = {}) {
  const driver = getNeo4jDriver();
  if (!driver) throw new Error('Neo4j driver not available');
  const session = driver.session();
  try {
    return await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

/**
 * Add or update a node (MERGE by id).
 */
export async function addNode(id, type, properties = {}) {
  const result = await runQuery(
    `MERGE (n:Entity {id: $id})
     SET n.type = $type, n += $properties, n.updatedAt = datetime()
     RETURN n`,
    { id, type, properties }
  );
  const node = result.records[0]?.get('n');
  return node ? { id: node.properties.id, type: node.properties.type, properties: node.properties } : null;
}

/**
 * Add or update an edge (MERGE by source+target+type).
 */
export async function addEdge(source, target, type, properties = {}, weight = 1.0) {
  const result = await runQuery(
    `MATCH (a:Entity {id: $source}), (b:Entity {id: $target})
     MERGE (a)-[r:CONNECTED_TO {relType: $type}]->(b)
     SET r.weight = $weight, r += $properties, r.updatedAt = datetime()
     RETURN r, a.id AS sourceId, b.id AS targetId`,
    { source, target, type, properties, weight }
  );
  const rec = result.records[0];
  if (!rec) return null;
  const rel = rec.get('r');
  return {
    id: `E-${source}-${target}-${type}`,
    source,
    target,
    type,
    properties: rel.properties,
    weight: toNumber(rel.properties.weight),
  };
}

/**
 * Get a single node by ID.
 */
export async function getNode(id) {
  const result = await runQuery('MATCH (n:Entity {id: $id}) RETURN n', { id });
  const node = result.records[0]?.get('n');
  return node ? { id: node.properties.id, type: node.properties.type, properties: node.properties } : null;
}

/**
 * Find connections from a node up to a given depth.
 * Equivalent to graph-engine.js getNeighbors().
 */
export async function findConnections(nodeId, depth = 1, edgeTypes = null) {
  let cypher;
  const params = { id: nodeId, depth: neo4jInt(depth) };

  if (edgeTypes && edgeTypes.length > 0) {
    cypher = `
      MATCH path = (start:Entity {id: $id})-[r:CONNECTED_TO*1..${depth}]-(connected)
      WHERE ALL(rel IN r WHERE rel.relType IN $edgeTypes)
      RETURN DISTINCT connected, r
    `;
    params.edgeTypes = edgeTypes;
  } else {
    cypher = `
      MATCH path = (start:Entity {id: $id})-[r:CONNECTED_TO*1..${depth}]-(connected)
      RETURN DISTINCT connected, r
    `;
  }

  const result = await runQuery(cypher, params);

  const nodes = [];
  const edges = [];
  const seenNodes = new Set();
  const seenEdges = new Set();

  for (const rec of result.records) {
    const node = rec.get('connected');
    const nodeId = node.properties.id;
    if (!seenNodes.has(nodeId)) {
      seenNodes.add(nodeId);
      nodes.push({ id: nodeId, type: node.properties.type, properties: node.properties });
    }

    const rels = rec.get('r');
    const relList = Array.isArray(rels) ? rels : [rels];
    for (const rel of relList) {
      const edgeId = `${rel.start}-${rel.end}-${rel.properties.relType}`;
      if (!seenEdges.has(edgeId)) {
        seenEdges.add(edgeId);
        edges.push({
          type: rel.properties.relType,
          weight: toNumber(rel.properties.weight),
          properties: rel.properties,
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Risk propagation from a flagged node with decaying risk.
 */
export async function riskPropagation(fraudNodeId, decay = 0.5, maxDepth = 4) {
  const cypher = `
    MATCH path = (fraud:Entity {id: $id})-[r:CONNECTED_TO*1..${maxDepth}]-(target)
    WHERE target.id <> $id
    WITH target, length(path) AS hops,
         reduce(risk = 1.0, rel IN relationships(path) | risk * $decay) AS propagatedRisk
    RETURN target.id AS id, target.type AS type, target.properties AS props,
           min(hops) AS minHops, max(propagatedRisk) AS risk
    ORDER BY risk DESC
  `;

  const result = await runQuery(cypher, { id: fraudNodeId, decay });
  return result.records.map(rec => ({
    id: rec.get('id'),
    type: rec.get('type'),
    hops: toNumber(rec.get('minHops')),
    risk: toNumber(rec.get('risk')),
  }));
}

/**
 * Find fraud rings — cycles of length 3-maxLength.
 */
export async function findRings(maxLength = 6) {
  const cypher = `
    MATCH path = (a:Entity)-[:CONNECTED_TO*3..${maxLength}]->(a)
    WITH nodes(path) AS ringNodes, length(path) AS ringLength
    LIMIT 100
    RETURN [n IN ringNodes | n.id] AS nodeIds, ringLength
  `;

  const result = await runQuery(cypher, {});
  const seen = new Set();

  return result.records
    .map(rec => {
      const nodeIds = rec.get('nodeIds');
      const key = [...nodeIds].sort().join(',');
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        nodes: nodeIds,
        length: toNumber(rec.get('ringLength')),
      };
    })
    .filter(Boolean);
}

/**
 * Community detection — connected components approximation.
 * Uses weakly connected components via simple traversal.
 */
export async function communityDetection() {
  const cypher = `
    MATCH (n:Entity)
    WITH collect(n) AS nodes
    UNWIND nodes AS node
    OPTIONAL MATCH (node)-[:CONNECTED_TO]-(neighbor)
    WITH node, collect(DISTINCT neighbor.id) AS neighbors
    RETURN node.id AS id, node.type AS type, neighbors
  `;

  const result = await runQuery(cypher, {});

  // Build adjacency list and find connected components via BFS
  const adj = new Map();
  for (const rec of result.records) {
    const id = rec.get('id');
    const neighbors = rec.get('neighbors') || [];
    adj.set(id, neighbors);
  }

  const visited = new Set();
  const communities = [];
  let communityId = 0;

  for (const nodeId of adj.keys()) {
    if (visited.has(nodeId)) continue;

    const component = [];
    const queue = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);
      for (const neighbor of (adj.get(current) || [])) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    communities.push({ communityId: communityId++, nodes: component, size: component.length });
  }

  return communities.sort((a, b) => b.size - a.size);
}

/**
 * Multi-hop investigation from a start node.
 * Collects risk signals along the path.
 */
export async function multiHopInvestigate(startId, maxHops = 3, minWeight = 0.7) {
  const cypher = `
    MATCH path = (start:Entity {id: $id})-[r:CONNECTED_TO*1..${maxHops}]-(target)
    WHERE ALL(rel IN r WHERE rel.weight >= $minWeight)
    WITH target, relationships(path) AS rels, length(path) AS hop
    RETURN DISTINCT target.id AS id, target.type AS type, target AS node, hop,
           [rel IN rels | rel.relType] AS relTypes
    ORDER BY hop
  `;

  const result = await runQuery(cypher, { id: startId, minWeight });
  const evidenceChain = [];
  let totalRiskSignals = 0;

  for (const rec of result.records) {
    const node = rec.get('node');
    const props = node.properties;
    const riskSignals = [];

    if (props.riskScore && toNumber(props.riskScore) > 0.7) riskSignals.push('high-risk-score');
    if (props.fraudHistory) riskSignals.push('fraud-history');
    if (props.watchlist) riskSignals.push('watchlist-match');
    if (props.status === 'rejected') riskSignals.push('rejected-entity');

    totalRiskSignals += riskSignals.length;

    evidenceChain.push({
      entity: rec.get('id'),
      hop: toNumber(rec.get('hop')),
      relationship: (rec.get('relTypes') || []).join(' -> '),
      riskSignals,
      properties: props,
    });
  }

  return { evidenceChain, totalRiskSignals };
}

/**
 * Get graph statistics.
 */
export async function getStats() {
  const nodeResult = await runQuery('MATCH (n:Entity) RETURN count(n) AS cnt');
  const edgeResult = await runQuery('MATCH ()-[r:CONNECTED_TO]->() RETURN count(r) AS cnt');

  return {
    nodeCount: toNumber(nodeResult.records[0]?.get('cnt')) || 0,
    edgeCount: toNumber(edgeResult.records[0]?.get('cnt')) || 0,
    backend: 'neo4j',
  };
}

function neo4jInt(value) {
  // neo4j-driver expects its own integer type for parameters used in path lengths
  // but template literals work fine for path length constraints
  return value;
}
