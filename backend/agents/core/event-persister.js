/**
 * Event Persister - Persists agent pipeline events to database
 * Subscribes to agent:* events and writes them to the agent_events table
 * so full decision flows can be retrieved by correlationId after restart.
 */

import { db_ops } from '../../shared/common/database.js';

class EventPersister {
  constructor() {
    this.started = false;
    this.unsubscribe = null;
    this.stats = { persisted: 0, errors: 0 };
  }

  /**
   * Subscribe to agent:* events and persist each one to DB
   */
  start(eventBus) {
    if (this.started) return;

    this.unsubscribe = eventBus.subscribe('agent:*', (event) => {
      this._persist(event);
    });

    this.started = true;
    console.log('[EventPersister] Subscribed to agent:* events for DB persistence');
  }

  /**
   * Fire-and-forget persist of a single event
   */
  _persist(event) {
    try {
      const correlationId = event.data?.correlationId || null;
      const eventType = event.type || null;

      const payload = {
        ...event.data,
        type: eventType,
        correlationId,
        metadata: event.metadata,
        timestamp: event.timestamp
      };

      db_ops.insert('agent_events', 'event_id', event.id, payload);

      // Update promoted indexed columns for direct querying
      if (correlationId || eventType) {
        db_ops.run(
          `UPDATE agent_events SET correlation_id = ?, event_type = ? WHERE event_id = ?`,
          [correlationId, eventType, event.id]
        );
      }

      this.stats.persisted++;
    } catch (error) {
      this.stats.errors++;
      console.error('[EventPersister] Failed to persist event:', error.message);
    }
  }

  /**
   * Retrieve all events for a given correlationId, chronologically.
   * Uses in-memory filtering since the db_ops.query in-memory fallback
   * ignores WHERE clauses when better-sqlite3 is not installed.
   */
  getByCorrelationId(correlationId, limit = 500) {
    const all = db_ops.getAll('agent_events', 10000, 0);
    const filtered = all
      .filter(row => {
        const cid = row.data?.correlationId;
        return cid === correlationId;
      })
      .slice(0, limit);
    // getAll returns DESC by created_at; reverse for chronological
    return filtered.reverse();
  }

  /**
   * Get persister stats
   */
  getStats() {
    return { ...this.stats, started: this.started };
  }
}

let instance = null;

export function getEventPersister() {
  if (!instance) {
    instance = new EventPersister();
  }
  return instance;
}

export default { EventPersister, getEventPersister };
