/**
 * Letta-backed memory store — same interface as memory-store.js and memory-store-mem0.js.
 *
 * Short-term + Episodic -> SQLite fallback (same as Mem0 approach).
 * Long-term + Shared -> Letta archival via HTTP to eval service.
 * All Letta calls have 10s timeout, fallback to SQLite on error.
 */

import { getMemoryStore } from './memory-store.js';

const EVAL_SERVICE_URL = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
const TIMEOUT_MS = 10000;

let _instance = null;

class MemoryStoreLetta {
  constructor() {
    this.sqliteFallback = getMemoryStore();
    this.stats = { lettaWrites: 0, lettaReads: 0, lettaErrors: 0 };
  }

  // --- Short-term: always delegate to SQLite ---

  saveShortTerm(agentId, sessionId, entry) {
    return this.sqliteFallback.saveShortTerm(agentId, sessionId, entry);
  }

  getShortTerm(agentId, sessionId) {
    return this.sqliteFallback.getShortTerm(agentId, sessionId);
  }

  // --- Long-term: Letta archival via eval service ---

  async saveLongTerm(agentId, type, content, importance = 0.5) {
    try {
      const resp = await fetch(`${EVAL_SERVICE_URL}/memory/letta/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          content: typeof content === 'string' ? content : JSON.stringify(content),
          metadata: { type, importance, source: 'long_term' },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (resp.ok) {
        this.stats.lettaWrites++;
        return `LTM-${agentId.slice(0, 8)}-${Date.now().toString(36)}`;
      }
      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      this.stats.lettaErrors++;
      console.warn(`[MemoryStoreLetta] saveLongTerm fallback to SQLite: ${err.message}`);
      return this.sqliteFallback.saveLongTerm(agentId, type, content, importance);
    }
  }

  async queryLongTerm(agentId, query, limit = 5) {
    try {
      const resp = await fetch(`${EVAL_SERVICE_URL}/memory/letta/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          query: typeof query === 'string' ? query : JSON.stringify(query),
          limit,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (resp.ok) {
        const data = await resp.json();
        this.stats.lettaReads++;
        const results = data.results || [];
        return results.map(r => ({
          content: r.text || r.content || JSON.stringify(r),
          score: r.score || 1.0,
          metadata: r.metadata || {},
        }));
      }
      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      this.stats.lettaErrors++;
      console.warn(`[MemoryStoreLetta] queryLongTerm fallback to SQLite: ${err.message}`);
      return this.sqliteFallback.queryLongTerm(agentId, query, limit);
    }
  }

  getLongTermByType(agentId, type) {
    return this.sqliteFallback.getLongTermByType(agentId, type);
  }

  // --- Shared: Letta archival using shared-{topic} agent_id ---

  async saveShared(sourceAgentId, topic, content, importance = 0.5) {
    try {
      const sharedAgentId = `shared-${topic}`;
      const resp = await fetch(`${EVAL_SERVICE_URL}/memory/letta/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: sharedAgentId,
          content: typeof content === 'string' ? content : JSON.stringify(content),
          metadata: { type: 'shared', importance, source: sourceAgentId, topic },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (resp.ok) {
        this.stats.lettaWrites++;
        return `SHR-${topic.slice(0, 8)}-${Date.now().toString(36)}`;
      }
      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      this.stats.lettaErrors++;
      console.warn(`[MemoryStoreLetta] saveShared fallback to SQLite: ${err.message}`);
      return this.sqliteFallback.saveShared(sourceAgentId, topic, content, importance);
    }
  }

  async queryShared(query, topic = null, limit = 5) {
    try {
      const sharedAgentId = topic ? `shared-${topic}` : 'shared-general';
      const resp = await fetch(`${EVAL_SERVICE_URL}/memory/letta/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: sharedAgentId,
          query: typeof query === 'string' ? query : JSON.stringify(query),
          limit,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (resp.ok) {
        const data = await resp.json();
        this.stats.lettaReads++;
        return (data.results || []).map(r => ({
          content: r.text || r.content || JSON.stringify(r),
          score: r.score || 1.0,
          metadata: r.metadata || {},
        }));
      }
      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      this.stats.lettaErrors++;
      console.warn(`[MemoryStoreLetta] queryShared fallback to SQLite: ${err.message}`);
      return this.sqliteFallback.queryShared(query, topic, limit);
    }
  }

  // --- Episodic: always delegate to SQLite ---

  saveEpisode(agentId, episode) {
    return this.sqliteFallback.saveEpisode(agentId, episode);
  }

  queryEpisodes(agentId, filters, limit) {
    return this.sqliteFallback.queryEpisodes(agentId, filters, limit);
  }

  getEpisode(episodeId) {
    return this.sqliteFallback.getEpisode(episodeId);
  }

  // --- Consolidation / Cleanup: delegate to SQLite ---

  consolidate(agentId, sessionId) {
    return this.sqliteFallback.consolidate(agentId, sessionId);
  }

  consolidatePatterns(agentId, patterns) {
    return this.sqliteFallback.consolidatePatterns(agentId, patterns);
  }

  cleanup() {
    return this.sqliteFallback.cleanup();
  }

  pruneLongTerm(agentId, maxEntries) {
    return this.sqliteFallback.pruneLongTerm(agentId, maxEntries);
  }

  getStats() {
    const sqliteStats = this.sqliteFallback.getStats();
    return { ...sqliteStats, ...this.stats, backend: 'letta' };
  }
}

export function getMemoryStoreLetta() {
  if (!_instance) {
    _instance = new MemoryStoreLetta();
  }
  return _instance;
}

export { MemoryStoreLetta };
