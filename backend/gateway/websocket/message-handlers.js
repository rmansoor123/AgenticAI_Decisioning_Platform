/**
 * WebSocket Message Handlers
 * Handle client commands and messages
 */

import { getWebSocketManager } from './ws-manager.js';
import { getEventBus, EVENT_TYPES, WILDCARDS } from './event-bus.js';
import { getTransactionPipeline } from './transaction-pipeline.js';
import { orchestrator } from '../../agents/core/agent-orchestrator.js';
import FraudInvestigationAgent from '../../agents/specialized/fraud-investigation-agent.js';

// Command handlers registry
const commandHandlers = new Map();

/**
 * Register a command handler
 */
export function registerCommand(command, handler) {
  commandHandlers.set(command, handler);
}

/**
 * Handle incoming WebSocket message
 */
export async function handleMessage(ws, message, clientId) {
  const wsManager = getWebSocketManager();
  const client = wsManager.getClient(clientId);

  if (!client) {
    return { error: 'Client not found' };
  }

  let parsedMessage;
  try {
    parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
  } catch (error) {
    return sendError(client, 'Invalid JSON message');
  }

  const { type, ...payload } = parsedMessage;

  // Update client activity
  client.lastActivity = new Date().toISOString();

  // Route to appropriate handler
  const handler = commandHandlers.get(type);
  if (handler) {
    try {
      const result = await handler(client, payload);
      return result;
    } catch (error) {
      return sendError(client, error.message);
    }
  }

  return sendError(client, `Unknown command: ${type}`);
}

/**
 * Send error response to client
 */
function sendError(client, message) {
  client.send({
    type: 'error',
    error: message,
    timestamp: new Date().toISOString()
  });
  return { error: message };
}

/**
 * Send success response to client
 */
function sendSuccess(client, type, data) {
  client.send({
    type,
    data,
    timestamp: new Date().toISOString()
  });
  return { success: true, data };
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

/**
 * Subscribe to event types
 */
registerCommand('subscribe', (client, payload) => {
  const { eventTypes } = payload;

  if (!eventTypes || !Array.isArray(eventTypes)) {
    return sendError(client, 'eventTypes array is required');
  }

  // Validate event types
  const validTypes = new Set([
    ...Object.values(EVENT_TYPES),
    ...Object.values(WILDCARDS)
  ]);

  const invalidTypes = eventTypes.filter(t => !validTypes.has(t));
  if (invalidTypes.length > 0) {
    console.warn(`Client ${client.id} subscribed to unknown types:`, invalidTypes);
  }

  client.subscribe(eventTypes);

  return sendSuccess(client, 'subscribed', {
    subscriptions: Array.from(client.subscriptions),
    added: eventTypes
  });
});

/**
 * Unsubscribe from event types
 */
registerCommand('unsubscribe', (client, payload) => {
  const { eventTypes } = payload;

  if (!eventTypes || !Array.isArray(eventTypes)) {
    return sendError(client, 'eventTypes array is required');
  }

  client.unsubscribe(eventTypes);

  return sendSuccess(client, 'unsubscribed', {
    subscriptions: Array.from(client.subscriptions),
    removed: eventTypes
  });
});

/**
 * Get current subscriptions
 */
registerCommand('get_subscriptions', (client) => {
  return sendSuccess(client, 'subscriptions', {
    subscriptions: Array.from(client.subscriptions)
  });
});

/**
 * Get system status
 */
registerCommand('get_status', (client) => {
  const wsManager = getWebSocketManager();
  const pipeline = getTransactionPipeline();
  const eventBus = getEventBus();

  return sendSuccess(client, 'status', {
    system: {
      status: 'healthy',
      uptime: process.uptime()
    },
    websocket: wsManager.getStats(),
    pipeline: pipeline.getStats(),
    eventBus: eventBus.getStats()
  });
});

/**
 * Get recent events
 */
registerCommand('get_events', (client, payload) => {
  const { type, limit = 50, since } = payload;
  const eventBus = getEventBus();

  const events = eventBus.getRecentEvents({ type, limit, since });

  return sendSuccess(client, 'events', {
    events,
    count: events.length
  });
});

/**
 * Request fraud investigation
 */
registerCommand('request_investigation', async (client, payload) => {
  const { transactionId, alertType } = payload;

  if (!transactionId) {
    return sendError(client, 'transactionId is required');
  }

  const eventBus = getEventBus();

  // Emit investigation start event
  eventBus.publish(EVENT_TYPES.AGENT_INVESTIGATION_START, {
    transactionId,
    alertType,
    requestedBy: client.id,
    requestedAt: new Date().toISOString()
  });

  // Get or create fraud investigation agent
  let fraudAgent = orchestrator.getAgent('FRAUD_INVESTIGATOR');
  if (!fraudAgent) {
    fraudAgent = new FraudInvestigationAgent();
    orchestrator.registerAgent(fraudAgent);
  }

  // Run investigation
  try {
    const result = await fraudAgent.investigate(transactionId, alertType);

    // Emit completion event
    eventBus.publish(EVENT_TYPES.AGENT_INVESTIGATION_COMPLETE, {
      transactionId,
      investigationId: result.result?.investigationId,
      recommendation: result.result?.recommendation,
      riskScore: result.result?.overallRisk?.score,
      completedAt: new Date().toISOString()
    });

    return sendSuccess(client, 'investigation_complete', {
      transactionId,
      investigation: result.result
    });
  } catch (error) {
    return sendError(client, `Investigation failed: ${error.message}`);
  }
});

/**
 * Trigger manual transaction
 */
registerCommand('trigger_transaction', async (client, payload) => {
  const { transaction } = payload;
  const pipeline = getTransactionPipeline();

  const result = await pipeline.processTransaction(transaction || null);

  return sendSuccess(client, 'transaction_processed', result);
});

/**
 * Control pipeline
 */
registerCommand('pipeline_control', (client, payload) => {
  const { action } = payload;
  const pipeline = getTransactionPipeline();

  switch (action) {
    case 'start':
      pipeline.start();
      return sendSuccess(client, 'pipeline_status', { status: 'started' });

    case 'stop':
      pipeline.stop();
      return sendSuccess(client, 'pipeline_status', { status: 'stopped' });

    case 'status':
      return sendSuccess(client, 'pipeline_status', pipeline.getStats());

    default:
      return sendError(client, `Unknown pipeline action: ${action}`);
  }
});

/**
 * Get available event types
 */
registerCommand('get_event_types', (client) => {
  return sendSuccess(client, 'event_types', {
    eventTypes: EVENT_TYPES,
    wildcards: WILDCARDS
  });
});

/**
 * Ping/pong for keepalive
 */
registerCommand('ping', (client) => {
  return sendSuccess(client, 'pong', {
    clientId: client.id,
    serverTime: new Date().toISOString()
  });
});

/**
 * Get connected clients (admin)
 */
registerCommand('get_clients', (client) => {
  const wsManager = getWebSocketManager();

  return sendSuccess(client, 'clients', {
    clients: wsManager.getConnectedClients()
  });
});

export default {
  handleMessage,
  registerCommand
};
