/**
 * Zep-backed temporal memory — uses Zep's temporal knowledge graph
 * for entity tracking across time.
 *
 * Maps entities to Zep sessions, facts to Zep messages.
 * Zep auto-extracts entities and builds temporal knowledge graph.
 *
 * Usage:
 *   import { getTemporalMemoryZep } from './temporal-memory-zep.js';
 *   const tm = getTemporalMemoryZep();
 *   await tm.saveTemporalFact('SELLER-123', 'seller', { text: '...', confidence: 0.9 });
 */

const ZEP_API_URL = process.env.ZEP_API_URL || 'http://localhost:8200';
const ZEP_API_KEY = process.env.ZEP_API_KEY || '';
const TIMEOUT_MS = 10000;

let _instance = null;

class TemporalMemoryZep {
  constructor() {
    this.stats = { zepWrites: 0, zepReads: 0, zepErrors: 0 };
    this._sessionCache = new Set();
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (ZEP_API_KEY) h['Authorization'] = `Bearer ${ZEP_API_KEY}`;
    return h;
  }

  /**
   * Ensure a Zep session exists for an entity.
   */
  async _ensureSession(entityId) {
    if (this._sessionCache.has(entityId)) return;

    try {
      // Try to get existing session
      const resp = await fetch(`${ZEP_API_URL}/api/v2/sessions/${entityId}`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (resp.ok) {
        this._sessionCache.add(entityId);
        return;
      }

      // Create new session
      const createResp = await fetch(`${ZEP_API_URL}/api/v2/sessions`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          session_id: entityId,
          metadata: { source: 'fraud-detection', created: new Date().toISOString() },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (createResp.ok || createResp.status === 409) {
        this._sessionCache.add(entityId);
      }
    } catch (err) {
      console.warn(`[TemporalMemoryZep] _ensureSession failed: ${err.message}`);
    }
  }

  /**
   * Save a temporal fact for an entity.
   * Maps to a Zep message in the entity's session — Zep auto-extracts entities.
   */
  async saveTemporalFact(entityId, entityType, fact, metadata = {}) {
    try {
      await this._ensureSession(entityId);

      const factText = typeof fact === 'string' ? fact : (fact.text || JSON.stringify(fact));

      const resp = await fetch(`${ZEP_API_URL}/api/v2/sessions/${entityId}/messages`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          messages: [{
            role: 'system',
            role_type: 'system',
            content: `[${entityType}] ${factText}`,
            metadata: { ...metadata, entityType, confidence: fact.confidence || 1.0 },
          }],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (resp.ok) {
        this.stats.zepWrites++;
        return `TF-ZEP-${entityId.slice(0, 8)}-${Date.now().toString(36)}`;
      }
      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      this.stats.zepErrors++;
      console.warn(`[temporal-zep] saveTemporalFact failed for ${entityId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Query temporal history for an entity.
   * Uses Zep's memory search which includes entity graph context.
   */
  async queryTemporalHistory(entityId, query = null, limit = 10) {
    try {
      if (query) {
        // Search session memory
        const resp = await fetch(`${ZEP_API_URL}/api/v2/sessions/${entityId}/search`, {
          method: 'POST',
          headers: this._headers(),
          body: JSON.stringify({ text: query, limit }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (resp.ok) {
          const data = await resp.json();
          this.stats.zepReads++;
          return (data.results || []).map(r => ({
            fact: { text: r.message?.content || r.content || '' },
            score: r.score || r.dist || 1.0,
            timestamp: r.message?.created_at || r.created_at || new Date().toISOString(),
            metadata: r.message?.metadata || r.metadata || {},
          }));
        }
      }

      // Fallback: get recent messages
      const resp = await fetch(`${ZEP_API_URL}/api/v2/sessions/${entityId}/messages?limit=${limit}`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (resp.ok) {
        const data = await resp.json();
        this.stats.zepReads++;
        const messages = data.messages || data || [];
        return messages.map(m => ({
          fact: { text: m.content || '' },
          timestamp: m.created_at || new Date().toISOString(),
          metadata: m.metadata || {},
        }));
      }

      // 404 = session doesn't exist yet — return empty, don't crash
      if (resp.status === 404) {
        return [];
      }
      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      this.stats.zepErrors++;
      console.warn(`[temporal-zep] queryTemporalHistory failed for ${entityId}: ${err.message}`);
      return [];
    }
  }

  /**
   * Get the full timeline for an entity.
   */
  async getEntityTimeline(entityId, options = {}) {
    try {
      const resp = await fetch(`${ZEP_API_URL}/api/v2/sessions/${entityId}/messages?limit=100`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (resp.ok) {
        const data = await resp.json();
        this.stats.zepReads++;
        let messages = data.messages || data || [];

        if (options.startDate) {
          messages = messages.filter(m => new Date(m.created_at) >= new Date(options.startDate));
        }
        if (options.endDate) {
          messages = messages.filter(m => new Date(m.created_at) <= new Date(options.endDate));
        }

        return messages.map(m => ({
          fact: { text: m.content || '' },
          entityType: m.metadata?.entityType || 'unknown',
          timestamp: m.created_at || new Date().toISOString(),
          metadata: m.metadata || {},
        }));
      }

      if (resp.status === 404) {
        return [];
      }
      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      this.stats.zepErrors++;
      console.warn(`[temporal-zep] getEntityTimeline failed for ${entityId}: ${err.message}`);
      return [];
    }
  }

  /**
   * Get entity summary from Zep's session memory.
   */
  async getEntitySummary(entityId) {
    try {
      const resp = await fetch(`${ZEP_API_URL}/api/v2/sessions/${entityId}/memory`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (resp.ok) {
        const data = await resp.json();
        this.stats.zepReads++;
        return {
          entityId,
          exists: true,
          summary: data.summary?.content || null,
          factCount: data.messages?.length || 0,
          entities: data.relevant_facts || [],
        };
      }

      if (resp.status === 404) {
        return { entityId, exists: false, factCount: 0 };
      }

      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      this.stats.zepErrors++;
      console.warn(`[temporal-zep] getEntitySummary failed for ${entityId}: ${err.message}`);
      return { entityId, exists: false, factCount: 0 };
    }
  }

  /**
   * Health check.
   */
  async health() {
    try {
      const resp = await fetch(`${ZEP_API_URL}/healthz`, {
        signal: AbortSignal.timeout(5000),
      });
      return {
        status: resp.ok ? 'ok' : 'error',
        backend: 'zep',
        httpStatus: resp.status,
      };
    } catch (err) {
      return { status: 'error', backend: 'zep', reason: err.message };
    }
  }

  getStats() {
    return { ...this.stats, backend: 'zep' };
  }
}

export function getTemporalMemoryZep() {
  if (!_instance) {
    _instance = new TemporalMemoryZep();
  }
  return _instance;
}

export { TemporalMemoryZep };
