/**
 * WebSocket Module - Enhanced Real-time Streaming
 * Exports all WebSocket-related components
 */

export { getEventBus, EVENT_TYPES, WILDCARDS } from './event-bus.js';
export { getWebSocketManager, WebSocketClient } from './ws-manager.js';
export { getTransactionPipeline, PIPELINE_STAGES } from './transaction-pipeline.js';
export { handleMessage, registerCommand } from './message-handlers.js';

export default {
  getEventBus,
  getWebSocketManager,
  getTransactionPipeline,
  handleMessage,
  registerCommand,
  EVENT_TYPES,
  WILDCARDS,
  PIPELINE_STAGES
};
