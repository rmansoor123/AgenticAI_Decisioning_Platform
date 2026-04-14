/**
 * Data Connector Registry — register, manage, and query external data sources.
 *
 * Agents call the unified query API. They never touch raw connectors directly.
 * The registry handles: source registration, health monitoring, sync scheduling,
 * data normalization, caching, and lineage tracking.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

const CONNECTOR_TYPES = ['rest-api', 'webhook', 'database', 'kafka', 'file', 'graphql', 'mock'];

class ConnectorRegistry {
  constructor() {
    this.sources = new Map(); // sourceId → { config, connector, status, lastSync, records }
    this.syncIntervals = new Map();
    this.stats = { totalSources: 0, totalRecords: 0, totalSyncs: 0, errors: 0 };
  }

  /**
   * Register a new data source.
   */
  async register(sourceConfig) {
    const { sourceId, name, type, description, config, transform, schema, pollIntervalMs = 300000 } = sourceConfig;

    if (!sourceId || !type) throw new Error('sourceId and type are required');
    if (!CONNECTOR_TYPES.includes(type)) throw new Error(`Invalid type: ${type}. Must be one of: ${CONNECTOR_TYPES.join(', ')}`);

    const source = {
      sourceId, name: name || sourceId, type, description: description || '',
      config: config || {}, transform: transform || (data => data),
      schema: schema || {}, status: 'REGISTERED',
      registeredAt: new Date().toISOString(),
      lastSyncAt: null, lastError: null,
      recordCount: 0, syncCount: 0
    };

    this.sources.set(sourceId, source);
    this.stats.totalSources++;

    // Persist to DB
    const db_ops = getDbOps();
    try {
      await db_ops.insert('data_sources', 'source_id', sourceId, {
        sourceId, name: source.name, type, description: source.description,
        config: JSON.stringify(config || {}), schema: JSON.stringify(schema || {}),
        status: 'REGISTERED', registeredAt: source.registeredAt
      });
    } catch (_) {}

    // Start polling if configured
    if (pollIntervalMs > 0 && type !== 'webhook') {
      this._startPolling(sourceId, pollIntervalMs);
    }

    return { sourceId, status: 'REGISTERED', type };
  }

  /**
   * Deregister a data source.
   */
  deregister(sourceId) {
    if (this.syncIntervals.has(sourceId)) {
      clearInterval(this.syncIntervals.get(sourceId));
      this.syncIntervals.delete(sourceId);
    }
    this.sources.delete(sourceId);
  }

  /**
   * Get source status.
   */
  getSourceStatus(sourceId) {
    const source = this.sources.get(sourceId);
    if (!source) return null;
    return {
      sourceId, name: source.name, type: source.type,
      status: source.status, lastSyncAt: source.lastSyncAt,
      lastError: source.lastError, recordCount: source.recordCount,
      syncCount: source.syncCount
    };
  }

  /**
   * List all registered sources.
   */
  listSources() {
    return Array.from(this.sources.values()).map(s => ({
      sourceId: s.sourceId, name: s.name, type: s.type,
      description: s.description, status: s.status,
      lastSyncAt: s.lastSyncAt, recordCount: s.recordCount
    }));
  }

  /**
   * Trigger manual sync for a source.
   */
  async syncSource(sourceId) {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Source ${sourceId} not found`);

    source.status = 'SYNCING';
    const startTime = Date.now();

    try {
      const connector = this._getConnector(source.type);
      const rawData = await connector.fetch(source.config);

      // Apply transform
      const normalizedData = Array.isArray(rawData)
        ? rawData.map(source.transform)
        : [source.transform(rawData)];

      // Cache in DB
      const db_ops = getDbOps();
      for (const record of normalizedData) {
        const recordId = `${sourceId}:${record.entityId || record.id || Date.now()}`;
        try {
          await db_ops.insert('connector_data', 'record_id', recordId, {
            recordId, sourceId, data: record,
            ingestedAt: new Date().toISOString()
          });
        } catch (_) {}
      }

      source.status = 'HEALTHY';
      source.lastSyncAt = new Date().toISOString();
      source.lastError = null;
      source.recordCount += normalizedData.length;
      source.syncCount++;
      this.stats.totalRecords += normalizedData.length;
      this.stats.totalSyncs++;

      return {
        sourceId, status: 'SUCCESS',
        recordsIngested: normalizedData.length,
        latencyMs: Date.now() - startTime
      };
    } catch (err) {
      source.status = 'ERROR';
      source.lastError = err.message;
      this.stats.errors++;
      return { sourceId, status: 'ERROR', error: err.message };
    }
  }

  /**
   * Unified query — agents call this to get data from any/all sources.
   */
  async query({ entity, entityId, fields, sources, freshness = '5m' }) {
    const freshnessMs = this._parseFreshness(freshness);
    const results = {};
    const lineage = [];

    const targetSources = sources
      ? Array.from(this.sources.values()).filter(s => sources.includes(s.sourceId))
      : Array.from(this.sources.values());

    const db_ops = getDbOps();

    for (const source of targetSources) {
      try {
        // Check cache first
        const allRecords = (await db_ops.getAll('connector_data', 10000, 0)).map(r => r.data);
        const sourceRecords = allRecords
          .filter(r => r.sourceId === source.sourceId)
          .filter(r => {
            if (entityId && r.data?.entityId) return r.data.entityId === entityId;
            if (entityId && r.data?.sellerId) return r.data.sellerId === entityId;
            return true;
          })
          .filter(r => {
            const age = Date.now() - new Date(r.ingestedAt).getTime();
            return age < freshnessMs;
          });

        if (sourceRecords.length > 0) {
          results[source.sourceId] = sourceRecords.map(r => r.data);
          lineage.push({
            source: source.sourceId, type: source.type,
            records: sourceRecords.length, fromCache: true,
            freshness: sourceRecords[0]?.ingestedAt
          });
        }
      } catch (_) {}
    }

    return {
      entity, entityId, results, lineage,
      sourcesQueried: targetSources.length,
      totalRecords: Object.values(results).reduce((s, r) => s + r.length, 0),
      queriedAt: new Date().toISOString()
    };
  }

  _getConnector(type) {
    // Return appropriate connector based on type
    return {
      fetch: async (config) => {
        if (type === 'rest-api' && config.url) {
          try {
            const headers = config.headers || {};
            if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
            const res = await fetch(config.url, { headers, signal: AbortSignal.timeout(10000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return config.dataPath ? data[config.dataPath] : data;
          } catch (err) {
            throw new Error(`REST API fetch failed: ${err.message}`);
          }
        }
        if (type === 'mock') {
          return config.mockData || [];
        }
        // For other types, return empty (would be implemented with real connectors)
        return [];
      }
    };
  }

  _startPolling(sourceId, intervalMs) {
    const timer = setInterval(() => {
      this.syncSource(sourceId).catch(err => {
        console.warn(`[connector-registry] Poll failed for ${sourceId}: ${err.message}`);
      });
    }, intervalMs);
    if (timer.unref) timer.unref();
    this.syncIntervals.set(sourceId, timer);
  }

  _parseFreshness(freshness) {
    const match = freshness.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 300000; // default 5min
    const [, num, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return parseInt(num) * (multipliers[unit] || 60000);
  }

  getStats() {
    return {
      ...this.stats,
      activeSources: this.sources.size,
      healthySources: Array.from(this.sources.values()).filter(s => s.status === 'HEALTHY').length,
      errorSources: Array.from(this.sources.values()).filter(s => s.status === 'ERROR').length
    };
  }
}

let instance = null;
export function getConnectorRegistry() {
  if (!instance) instance = new ConnectorRegistry();
  return instance;
}
export default { ConnectorRegistry, getConnectorRegistry };
