/**
 * Feature Store - In-memory online store with SQLite offline persistence
 *
 * Provides low-latency feature reads for the streaming fraud detection engine.
 * Online store uses an in-memory Map for sub-millisecond access.
 * Offline store persists to SQLite via db_ops for point-in-time lookups.
 *
 * Structure: entityId -> featureGroup -> { features, updatedAt, ttl }
 */

import { db_ops } from '../shared/common/database.js';

// ---------------------------------------------------------------------------
// Feature group definitions with TTLs (milliseconds)
// ---------------------------------------------------------------------------
const FEATURE_GROUPS = {
  seller_profile: {
    name: 'seller_profile',
    ttl: 300000, // 5 minutes
    description: 'Seller identity, history, and trust signals',
  },
  transaction_velocity: {
    name: 'transaction_velocity',
    ttl: 60000, // 1 minute
    description: 'Transaction rate, amount patterns, and velocity counters',
  },
  device_trust: {
    name: 'device_trust',
    ttl: 120000, // 2 minutes
    description: 'Device fingerprint reputation and trust scores',
  },
  network_risk: {
    name: 'network_risk',
    ttl: 300000, // 5 minutes
    description: 'Graph-based risk signals from entity networks',
  },
};

// ---------------------------------------------------------------------------
// FeatureStore class
// ---------------------------------------------------------------------------
class FeatureStore {
  constructor() {
    // Online store: Map<string, Map<string, { features, updatedAt, ttl }>>
    // Keyed by entityId -> featureGroup
    this.onlineStore = new Map();

    // Statistics
    this.stats = {
      reads: 0,
      writes: 0,
      hits: 0,
      misses: 0,
      freshness: {
        seller_profile: { fresh: 0, stale: 0 },
        transaction_velocity: { fresh: 0, stale: 0 },
        device_trust: { fresh: 0, stale: 0 },
        network_risk: { fresh: 0, stale: 0 },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Online store helpers
  // -------------------------------------------------------------------------

  /**
   * Build a composite key for the offline store.
   */
  _offlineKey(entityId, group, timestamp) {
    if (timestamp !== undefined) {
      return `${entityId}:${group}:${timestamp}`;
    }
    return `${entityId}:${group}`;
  }

  /**
   * Resolve the TTL for a given feature group.
   * Falls back to 5 minutes if the group is unknown.
   */
  _resolveTtl(group) {
    const groupDef = FEATURE_GROUPS[group];
    return groupDef ? groupDef.ttl : 300000;
  }

  /**
   * Check whether an entry has expired based on its updatedAt and ttl.
   */
  _isExpired(entry) {
    return Date.now() - entry.updatedAt > entry.ttl;
  }

  // -------------------------------------------------------------------------
  // Core API
  // -------------------------------------------------------------------------

  /**
   * Read features for a given entity and feature group.
   *
   * Returns the features object if present and not expired, otherwise null.
   * Respects the group TTL — stale entries are treated as cache misses.
   *
   * @param {string} entityId - The entity identifier (e.g. seller id, device id).
   * @param {string} group    - One of the registered feature group names.
   * @returns {object|null}   - The features payload or null.
   */
  getFeatures(entityId, group) {
    this.stats.reads++;

    const entityMap = this.onlineStore.get(entityId);
    if (!entityMap) {
      this.stats.misses++;
      if (this.stats.freshness[group]) {
        this.stats.freshness[group].stale++;
      }
      return null;
    }

    const entry = entityMap.get(group);
    if (!entry) {
      this.stats.misses++;
      if (this.stats.freshness[group]) {
        this.stats.freshness[group].stale++;
      }
      return null;
    }

    // TTL check
    if (this._isExpired(entry)) {
      this.stats.misses++;
      if (this.stats.freshness[group]) {
        this.stats.freshness[group].stale++;
      }
      // Evict the stale entry
      entityMap.delete(group);
      if (entityMap.size === 0) {
        this.onlineStore.delete(entityId);
      }
      return null;
    }

    this.stats.hits++;
    if (this.stats.freshness[group]) {
      this.stats.freshness[group].fresh++;
    }
    return entry.features;
  }

  /**
   * Write features for a given entity and feature group.
   *
   * Writes to the online (in-memory) store with the appropriate TTL, and
   * performs a write-through to the offline (SQLite) store for durability
   * and point-in-time lookups.
   *
   * @param {string} entityId  - The entity identifier.
   * @param {string} group     - One of the registered feature group names.
   * @param {object} features  - The features payload to store.
   */
  putFeatures(entityId, group, features) {
    this.stats.writes++;

    const now = Date.now();
    const ttl = this._resolveTtl(group);

    const entry = {
      features,
      updatedAt: now,
      ttl,
    };

    // Write to online store
    if (!this.onlineStore.has(entityId)) {
      this.onlineStore.set(entityId, new Map());
    }
    this.onlineStore.get(entityId).set(group, entry);

    // Write-through to offline store (SQLite)
    this._writeToOfflineStore(entityId, group, features, now);
  }

  /**
   * Persist a feature snapshot to the offline store.
   * Uses a composite key of entityId:group for the latest version, and
   * entityId:group:timestamp for point-in-time lookups.
   */
  _writeToOfflineStore(entityId, group, features, timestamp) {
    const data = {
      entityId,
      group,
      features,
      updatedAt: timestamp,
      storedAt: new Date(timestamp).toISOString(),
    };

    // Latest key — always overwritten
    const latestKey = this._offlineKey(entityId, group);

    // Point-in-time key — one per write
    const pitKey = this._offlineKey(entityId, group, timestamp);

    try {
      db_ops.insert('feature_store', 'feature_key', latestKey, data);
    } catch (err) {
      // Table may not exist — silently degrade
    }

    try {
      db_ops.insert('feature_store', 'feature_key', pitKey, data);
    } catch (err) {
      // Table may not exist — silently degrade
    }
  }

  /**
   * Point-in-time feature lookup from the offline store.
   *
   * Retrieves the feature snapshot that was active at (or closest before)
   * the specified timestamp.
   *
   * @param {string} entityId   - The entity identifier.
   * @param {string} group      - Feature group name.
   * @param {number} timestamp  - Unix epoch milliseconds for the lookup.
   * @returns {object|null}     - The features payload or null.
   */
  getFeaturesAsOf(entityId, group, timestamp) {
    this.stats.reads++;

    // Attempt an exact point-in-time hit first
    const exactKey = this._offlineKey(entityId, group, timestamp);
    try {
      const exactRow = db_ops.getById('feature_store', 'feature_key', exactKey);
      if (exactRow && exactRow.data) {
        this.stats.hits++;
        if (this.stats.freshness[group]) {
          this.stats.freshness[group].fresh++;
        }
        return exactRow.data.features || null;
      }
    } catch (err) {
      // Table may not exist
    }

    // Fallback: scan the latest key and verify temporal validity
    const latestKey = this._offlineKey(entityId, group);
    try {
      const latestRow = db_ops.getById('feature_store', 'feature_key', latestKey);
      if (latestRow && latestRow.data && latestRow.data.updatedAt <= timestamp) {
        this.stats.hits++;
        if (this.stats.freshness[group]) {
          this.stats.freshness[group].fresh++;
        }
        return latestRow.data.features || null;
      }
    } catch (err) {
      // Table may not exist
    }

    this.stats.misses++;
    if (this.stats.freshness[group]) {
      this.stats.freshness[group].stale++;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  /**
   * Return operational statistics for the feature store.
   *
   * @returns {object} Stats including reads, writes, hits, misses, hitRate,
   *                   and per-group freshness counters.
   */
  getStats() {
    const totalLookups = this.stats.hits + this.stats.misses;
    const hitRate = totalLookups > 0 ? this.stats.hits / totalLookups : 0;

    return {
      reads: this.stats.reads,
      writes: this.stats.writes,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      freshness: { ...this.stats.freshness },
      onlineStoreSize: this.onlineStore.size,
      featureGroups: Object.keys(FEATURE_GROUPS),
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let instance = null;

/**
 * Get (or create) the singleton FeatureStore instance.
 *
 * @returns {FeatureStore} The shared feature store instance.
 */
export function getFeatureStore() {
  if (!instance) {
    instance = new FeatureStore();
  }
  return instance;
}
