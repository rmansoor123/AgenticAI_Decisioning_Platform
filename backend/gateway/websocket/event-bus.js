/**
 * Event Bus - Central event routing and distribution
 * Handles pub/sub for all real-time events in the platform
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Event Types
 */
export const EVENT_TYPES = {
  // Transaction events
  TRANSACTION_RECEIVED: 'transaction:received',
  TRANSACTION_SCORED: 'transaction:scored',
  TRANSACTION_DECIDED: 'transaction:decided',

  // Alert events
  ALERT_CREATED: 'alert:created',
  ALERT_ASSIGNED: 'alert:assigned',
  ALERT_RESOLVED: 'alert:resolved',

  // Agent events
  AGENT_ACTION_START: 'agent:action:start',
  AGENT_ACTION_COMPLETE: 'agent:action:complete',
  AGENT_THOUGHT: 'agent:thought',
  AGENT_INVESTIGATION_START: 'agent:investigation:start',
  AGENT_INVESTIGATION_COMPLETE: 'agent:investigation:complete',

  // Decision events
  DECISION_MADE: 'decision:made',
  RULE_TRIGGERED: 'rule:triggered',

  // System events
  SYSTEM_METRICS: 'system:metrics',
  SYSTEM_HEALTH: 'system:health',
  MODEL_PREDICTION: 'model:prediction',

  // Pipeline events
  PIPELINE_STAGE: 'pipeline:stage'
};

/**
 * Event wildcards for subscription matching
 */
export const WILDCARDS = {
  ALL: '*',
  TRANSACTION: 'transaction:*',
  ALERT: 'alert:*',
  AGENT: 'agent:*',
  DECISION: 'decision:*',
  SYSTEM: 'system:*',
  PIPELINE: 'pipeline:*'
};

/**
 * Event Bus Class
 */
class EventBus {
  constructor() {
    this.subscribers = new Map(); // Map<eventType, Set<callback>>
    this.eventHistory = [];
    this.maxHistorySize = 1000;
    this.stats = {
      eventsPublished: 0,
      eventsDelivered: 0,
      subscriberCount: 0
    };
  }

  /**
   * Subscribe to an event type
   * @param {string} eventType - Event type or wildcard pattern
   * @param {Function} callback - Callback function
   * @returns {Function} - Unsubscribe function
   */
  subscribe(eventType, callback) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }

    this.subscribers.get(eventType).add(callback);
    this.stats.subscriberCount++;

    // Return unsubscribe function
    return () => {
      this.unsubscribe(eventType, callback);
    };
  }

  /**
   * Unsubscribe from an event type
   */
  unsubscribe(eventType, callback) {
    const subs = this.subscribers.get(eventType);
    if (subs) {
      subs.delete(callback);
      this.stats.subscriberCount--;
      if (subs.size === 0) {
        this.subscribers.delete(eventType);
      }
    }
  }

  /**
   * Publish an event
   * @param {string} eventType - Event type
   * @param {Object} data - Event payload
   * @param {Object} metadata - Additional metadata
   */
  publish(eventType, data, metadata = {}) {
    const event = {
      id: `EVT-${uuidv4().slice(0, 12)}`,
      type: eventType,
      data,
      metadata: {
        ...metadata,
        publishedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };

    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    this.stats.eventsPublished++;

    // Deliver to matching subscribers
    this._deliverEvent(event);

    return event;
  }

  /**
   * Deliver event to matching subscribers
   */
  _deliverEvent(event) {
    const deliveredTo = new Set();

    // Check exact match
    if (this.subscribers.has(event.type)) {
      this.subscribers.get(event.type).forEach(callback => {
        this._safeCallback(callback, event);
        deliveredTo.add(callback);
      });
    }

    // Check wildcard matches
    const eventCategory = event.type.split(':')[0];

    // Category wildcard (e.g., 'transaction:*')
    const categoryWildcard = `${eventCategory}:*`;
    if (this.subscribers.has(categoryWildcard)) {
      this.subscribers.get(categoryWildcard).forEach(callback => {
        if (!deliveredTo.has(callback)) {
          this._safeCallback(callback, event);
          deliveredTo.add(callback);
        }
      });
    }

    // Global wildcard
    if (this.subscribers.has('*')) {
      this.subscribers.get('*').forEach(callback => {
        if (!deliveredTo.has(callback)) {
          this._safeCallback(callback, event);
          deliveredTo.add(callback);
        }
      });
    }

    this.stats.eventsDelivered += deliveredTo.size;
  }

  /**
   * Safely execute callback
   */
  _safeCallback(callback, event) {
    try {
      callback(event);
    } catch (error) {
      console.error('Event callback error:', error.message);
    }
  }

  /**
   * Check if an event type matches a pattern
   */
  matches(eventType, pattern) {
    if (pattern === '*') return true;
    if (pattern === eventType) return true;
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix + ':');
    }
    return false;
  }

  /**
   * Get recent events
   * @param {Object} options - Filter options
   */
  getRecentEvents(options = {}) {
    const { type, limit = 50, since } = options;

    let events = this.eventHistory;

    if (type) {
      events = events.filter(e => this.matches(e.type, type));
    }

    if (since) {
      const sinceTime = new Date(since).getTime();
      events = events.filter(e => new Date(e.timestamp).getTime() > sinceTime);
    }

    return events.slice(-limit);
  }

  /**
   * Get event bus statistics
   */
  getStats() {
    return {
      ...this.stats,
      historySize: this.eventHistory.length,
      subscriptionTypes: Array.from(this.subscribers.keys())
    };
  }

  /**
   * Clear event history
   */
  clearHistory() {
    this.eventHistory = [];
  }
}

// Singleton instance
let eventBusInstance = null;

export function getEventBus() {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus();
  }
  return eventBusInstance;
}

export default { EventBus, getEventBus, EVENT_TYPES, WILDCARDS };
