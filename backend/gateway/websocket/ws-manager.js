/**
 * WebSocket Manager - Client management with subscriptions
 * Handles client connections, subscriptions, and message routing
 */

import { v4 as uuidv4 } from 'uuid';
import { getEventBus, EVENT_TYPES, WILDCARDS } from './event-bus.js';

/**
 * Client state
 */
class WebSocketClient {
  constructor(ws, req) {
    this.id = `WS-${uuidv4().slice(0, 8).toUpperCase()}`;
    this.ws = ws;
    this.subscriptions = new Set(['system:*']); // Default subscription
    this.connectedAt = new Date().toISOString();
    this.lastActivity = new Date().toISOString();
    this.messageCount = 0;
    this.metadata = {
      ip: req?.socket?.remoteAddress || 'unknown',
      userAgent: req?.headers?.['user-agent'] || 'unknown'
    };
  }

  /**
   * Check if client is subscribed to an event type
   */
  isSubscribed(eventType) {
    // Check direct subscription
    if (this.subscriptions.has(eventType)) return true;

    // Check wildcard subscriptions
    for (const sub of this.subscriptions) {
      if (sub === '*') return true;
      if (sub.endsWith(':*')) {
        const prefix = sub.slice(0, -2);
        if (eventType.startsWith(prefix + ':')) return true;
      }
    }

    return false;
  }

  /**
   * Add subscription
   */
  subscribe(eventTypes) {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    types.forEach(type => this.subscriptions.add(type));
  }

  /**
   * Remove subscription
   */
  unsubscribe(eventTypes) {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    types.forEach(type => this.subscriptions.delete(type));
  }

  /**
   * Send message to client
   */
  send(message) {
    if (this.ws.readyState === 1) { // WebSocket.OPEN
      this.ws.send(JSON.stringify(message));
      this.messageCount++;
      return true;
    }
    return false;
  }

  /**
   * Get client state
   */
  getState() {
    return {
      id: this.id,
      subscriptions: Array.from(this.subscriptions),
      connectedAt: this.connectedAt,
      lastActivity: this.lastActivity,
      messageCount: this.messageCount,
      metadata: this.metadata
    };
  }
}

/**
 * WebSocket Manager Class
 */
class WebSocketManager {
  constructor() {
    this.clients = new Map();
    this.eventBus = getEventBus();
    this.stats = {
      totalConnections: 0,
      totalMessages: 0,
      totalBroadcasts: 0
    };

    // Subscribe to event bus for all events
    this._setupEventBusSubscription();
  }

  /**
   * Setup event bus subscription to forward events to WebSocket clients
   */
  _setupEventBusSubscription() {
    this.eventBus.subscribe('*', (event) => {
      this._routeEventToClients(event);
    });
  }

  /**
   * Route event to subscribed clients
   */
  _routeEventToClients(event) {
    let deliveredCount = 0;

    for (const client of this.clients.values()) {
      if (client.isSubscribed(event.type)) {
        const sent = client.send({
          type: event.type,
          data: event.data,
          eventId: event.id,
          timestamp: event.timestamp
        });
        if (sent) deliveredCount++;
      }
    }

    if (deliveredCount > 0) {
      this.stats.totalBroadcasts++;
    }

    return deliveredCount;
  }

  /**
   * Register a new WebSocket connection
   */
  addClient(ws, req) {
    const client = new WebSocketClient(ws, req);
    this.clients.set(client.id, client);
    this.stats.totalConnections++;

    console.log(`WebSocket client connected: ${client.id}`);

    // Send welcome message
    client.send({
      type: 'connected',
      data: {
        clientId: client.id,
        message: 'Connected to Fraud Detection Platform',
        defaultSubscriptions: Array.from(client.subscriptions),
        availableEventTypes: Object.values(EVENT_TYPES),
        availableWildcards: Object.values(WILDCARDS)
      },
      timestamp: new Date().toISOString()
    });

    return client;
  }

  /**
   * Remove a WebSocket connection
   */
  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      console.log(`WebSocket client disconnected: ${clientId}`);
      return true;
    }
    return false;
  }

  /**
   * Get client by ID
   */
  getClient(clientId) {
    return this.clients.get(clientId);
  }

  /**
   * Get client by WebSocket instance
   */
  getClientByWs(ws) {
    for (const client of this.clients.values()) {
      if (client.ws === ws) {
        return client;
      }
    }
    return null;
  }

  /**
   * Handle subscription request
   */
  handleSubscribe(clientId, eventTypes) {
    const client = this.clients.get(clientId);
    if (!client) return { success: false, error: 'Client not found' };

    client.subscribe(eventTypes);
    client.lastActivity = new Date().toISOString();

    return {
      success: true,
      subscriptions: Array.from(client.subscriptions)
    };
  }

  /**
   * Handle unsubscription request
   */
  handleUnsubscribe(clientId, eventTypes) {
    const client = this.clients.get(clientId);
    if (!client) return { success: false, error: 'Client not found' };

    client.unsubscribe(eventTypes);
    client.lastActivity = new Date().toISOString();

    return {
      success: true,
      subscriptions: Array.from(client.subscriptions)
    };
  }

  /**
   * Broadcast message to all clients (bypasses subscription)
   */
  broadcast(message) {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.send(message)) {
        count++;
      }
    }
    this.stats.totalMessages += count;
    return count;
  }

  /**
   * Broadcast to clients subscribed to a specific event type
   */
  broadcastToSubscribers(eventType, data) {
    const event = this.eventBus.publish(eventType, data);
    return event;
  }

  /**
   * Send direct message to specific client
   */
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client) {
      return client.send(message);
    }
    return false;
  }

  /**
   * Get all connected clients
   */
  getConnectedClients() {
    return Array.from(this.clients.values()).map(c => c.getState());
  }

  /**
   * Get manager statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeConnections: this.clients.size,
      eventBusStats: this.eventBus.getStats()
    };
  }

  /**
   * Get system status for clients
   */
  getSystemStatus() {
    return {
      status: 'healthy',
      activeConnections: this.clients.size,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }
}

// Singleton instance
let managerInstance = null;

export function getWebSocketManager() {
  if (!managerInstance) {
    managerInstance = new WebSocketManager();
  }
  return managerInstance;
}

export { WebSocketClient };
export default { WebSocketManager, WebSocketClient, getWebSocketManager };
