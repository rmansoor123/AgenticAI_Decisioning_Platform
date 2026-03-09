/**
 * Neo4j client — singleton driver with index creation on init.
 *
 * Usage:
 *   import { getNeo4jDriver, initializeNeo4j, isNeo4jAvailable } from './neo4j-client.js';
 *   await initializeNeo4j();
 *   const driver = getNeo4jDriver();
 */

import neo4j from 'neo4j-driver';

let driver = null;
let available = false;

/**
 * Get or create the singleton Neo4j driver.
 */
export function getNeo4jDriver() {
  if (driver) return driver;

  const url = process.env.NEO4J_URL || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'fraud_detection';

  try {
    driver = neo4j.driver(url, neo4j.auth.basic(user, password), {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 10000,
    });
  } catch (err) {
    console.warn(`[neo4j-client] Failed to create driver: ${err.message}`);
    driver = null;
  }

  return driver;
}

/**
 * Initialize Neo4j: verify connectivity and create indexes.
 * @returns {Promise<boolean>} true if Neo4j is available
 */
export async function initializeNeo4j() {
  const d = getNeo4jDriver();
  if (!d) return false;

  const session = d.session();
  try {
    // Verify connectivity
    await session.run('RETURN 1');

    // Create indexes on Entity nodes
    const indexes = [
      'CREATE INDEX entity_id IF NOT EXISTS FOR (n:Entity) ON (n.id)',
      'CREATE INDEX entity_type IF NOT EXISTS FOR (n:Entity) ON (n.type)',
      'CREATE INDEX entity_email IF NOT EXISTS FOR (n:Entity) ON (n.email)',
      'CREATE INDEX entity_phone IF NOT EXISTS FOR (n:Entity) ON (n.phone)',
      'CREATE INDEX entity_ip IF NOT EXISTS FOR (n:Entity) ON (n.ipAddress)',
      'CREATE INDEX entity_device IF NOT EXISTS FOR (n:Entity) ON (n.deviceFingerprint)',
    ];

    for (const idx of indexes) {
      try {
        await session.run(idx);
      } catch {
        // Index may already exist, that's fine
      }
    }

    available = true;
    console.log('[neo4j-client] Connected and indexes created');
    return true;
  } catch (err) {
    console.warn(`[neo4j-client] Init failed: ${err.message}`);
    available = false;
    return false;
  } finally {
    await session.close();
  }
}

/**
 * Check if Neo4j is currently available.
 */
export function isNeo4jAvailable() {
  return available;
}

/**
 * Gracefully close the Neo4j driver.
 */
export async function closeNeo4j() {
  if (driver) {
    await driver.close();
    driver = null;
    available = false;
  }
}
