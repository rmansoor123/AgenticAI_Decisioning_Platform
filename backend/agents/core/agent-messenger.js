/**
 * Agent Messenger - Inter-agent communication system
 * Enables agents to request help from and share information with other agents
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Message types for inter-agent communication
 */
export const MESSAGE_TYPES = {
  HELP_REQUEST: 'help_request',
  HELP_RESPONSE: 'help_response',
  INFORMATION_SHARE: 'information_share',
  TASK_DELEGATION: 'task_delegation',
  TASK_RESULT: 'task_result',
  BROADCAST: 'broadcast',
  ACKNOWLEDGEMENT: 'acknowledgement',
  CONSENSUS_REQUEST: 'consensus_request',
  CONSENSUS_VOTE: 'consensus_vote',
  CONFLICT_ESCALATION: 'conflict_escalation',
  RESULT_REPORT: 'result_report'
};

/**
 * Message priority levels
 */
export const PRIORITY = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  URGENT: 4
};

/**
 * Agent Messenger Class
 */
class AgentMessenger {
  constructor() {
    this.messageQueue = [];
    this.messageHistory = [];
    this.pendingResponses = new Map(); // correlationId -> callback
    this.subscribers = new Map(); // agentId -> callback
    this.maxHistorySize = 500;
    this.responseTimeout = 30000; // 30 seconds
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      helpRequestsSent: 0,
      helpRequestsAnswered: 0
    };
  }

  /**
   * Register an agent to receive messages
   * @param {string} agentId - Agent identifier
   * @param {Function} callback - Message handler callback
   */
  register(agentId, callback) {
    this.subscribers.set(agentId, callback);
    return () => this.unregister(agentId);
  }

  /**
   * Unregister an agent
   */
  unregister(agentId) {
    this.subscribers.delete(agentId);
  }

  /**
   * Send a message to another agent
   * @param {Object} params - Message parameters
   */
  async send(params) {
    const {
      from,
      to,
      type,
      content,
      priority = PRIORITY.NORMAL,
      correlationId = null,
      metadata = {}
    } = params;

    const message = {
      id: `MSG-${uuidv4().slice(0, 12)}`,
      from,
      to,
      type,
      content,
      priority,
      correlationId: correlationId || `CORR-${uuidv4().slice(0, 8)}`,
      metadata,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    // Add to history
    this.addToHistory(message);
    this.stats.messagesSent++;

    // Deliver message
    const delivered = await this.deliverMessage(message);
    message.status = delivered ? 'delivered' : 'failed';

    return message;
  }

  /**
   * Request help from another agent
   * @param {Object} params - Help request parameters
   */
  async requestHelp(params) {
    const {
      from,
      capability,
      task,
      context = {},
      priority = PRIORITY.HIGH,
      timeout = this.responseTimeout
    } = params;

    this.stats.helpRequestsSent++;

    const message = {
      id: `HELP-${uuidv4().slice(0, 12)}`,
      from,
      to: null, // Will be routed by capability
      type: MESSAGE_TYPES.HELP_REQUEST,
      content: {
        capability,
        task,
        context
      },
      priority,
      correlationId: `CORR-${uuidv4().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    this.addToHistory(message);

    // Create promise for response
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingResponses.delete(message.correlationId);
        reject(new Error('Help request timed out'));
      }, timeout);

      this.pendingResponses.set(message.correlationId, {
        resolve: (response) => {
          clearTimeout(timeoutId);
          this.stats.helpRequestsAnswered++;
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        message
      });

      // The orchestrator will pick this up and route it
      this.messageQueue.push(message);
    });
  }

  /**
   * Respond to a help request
   */
  async respondToHelp(params) {
    const {
      correlationId,
      from,
      result,
      success = true,
      error = null
    } = params;

    const response = {
      id: `RESP-${uuidv4().slice(0, 12)}`,
      from,
      type: MESSAGE_TYPES.HELP_RESPONSE,
      content: {
        result,
        success,
        error
      },
      correlationId,
      timestamp: new Date().toISOString()
    };

    this.addToHistory(response);

    // Resolve pending promise if exists
    const pending = this.pendingResponses.get(correlationId);
    if (pending) {
      this.pendingResponses.delete(correlationId);
      if (success) {
        pending.resolve(response);
      } else {
        pending.reject(new Error(error || 'Help request failed'));
      }
    }

    return response;
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcast(params) {
    const { from, content, priority = PRIORITY.NORMAL, metadata = {} } = params;

    const message = {
      id: `BCAST-${uuidv4().slice(0, 12)}`,
      from,
      to: '*',
      type: MESSAGE_TYPES.BROADCAST,
      content,
      priority,
      metadata,
      timestamp: new Date().toISOString()
    };

    this.addToHistory(message);
    this.stats.messagesSent++;

    // Deliver to all subscribers except sender
    const deliveryResults = [];
    for (const [agentId, callback] of this.subscribers) {
      if (agentId !== from) {
        const delivered = await this.safeCallback(callback, message);
        deliveryResults.push({ agentId, delivered });
      }
    }

    return {
      message,
      deliveredTo: deliveryResults.filter(r => r.delivered).length,
      results: deliveryResults
    };
  }

  /**
   * Share information with specific agents
   */
  async shareInformation(params) {
    const { from, to, topic, data, priority = PRIORITY.NORMAL } = params;

    return this.send({
      from,
      to,
      type: MESSAGE_TYPES.INFORMATION_SHARE,
      content: { topic, data },
      priority
    });
  }

  /**
   * Delegate a task to another agent
   */
  async delegateTask(params) {
    const { from, to, task, input, context = {}, priority = PRIORITY.HIGH } = params;

    return this.send({
      from,
      to,
      type: MESSAGE_TYPES.TASK_DELEGATION,
      content: { task, input, context },
      priority
    });
  }

  /**
   * Deliver message to recipient
   */
  async deliverMessage(message) {
    const callback = this.subscribers.get(message.to);
    if (callback) {
      this.stats.messagesReceived++;
      return await this.safeCallback(callback, message);
    }
    return false;
  }

  /**
   * Safely execute callback
   */
  async safeCallback(callback, message) {
    try {
      await callback(message);
      return true;
    } catch (error) {
      console.error('Message callback error:', error.message);
      return false;
    }
  }

  /**
   * Get pending help requests (for orchestrator to route)
   */
  getPendingHelpRequests() {
    return this.messageQueue.filter(m =>
      m.type === MESSAGE_TYPES.HELP_REQUEST && m.status === 'pending'
    );
  }

  /**
   * Mark help request as being processed
   */
  markHelpRequestProcessing(messageId) {
    const message = this.messageQueue.find(m => m.id === messageId);
    if (message) {
      message.status = 'processing';
    }
  }

  /**
   * Add message to history
   */
  addToHistory(message) {
    this.messageHistory.push(message);
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory.shift();
    }
  }

  /**
   * Get message history
   */
  getHistory(options = {}) {
    const { from, to, type, limit = 50, since } = options;

    let history = this.messageHistory;

    if (from) history = history.filter(m => m.from === from);
    if (to) history = history.filter(m => m.to === to || m.to === '*');
    if (type) history = history.filter(m => m.type === type);
    if (since) {
      const sinceTime = new Date(since).getTime();
      history = history.filter(m => new Date(m.timestamp).getTime() > sinceTime);
    }

    return history.slice(-limit);
  }

  /**
   * Get messenger statistics
   */
  getStats() {
    return {
      ...this.stats,
      registeredAgents: this.subscribers.size,
      pendingResponses: this.pendingResponses.size,
      queueSize: this.messageQueue.length,
      historySize: this.messageHistory.length
    };
  }

  /**
   * Clear message queue
   */
  clearQueue() {
    this.messageQueue = [];
  }
}

// Singleton instance
let messengerInstance = null;

export function getAgentMessenger() {
  if (!messengerInstance) {
    messengerInstance = new AgentMessenger();
  }
  return messengerInstance;
}

export default { AgentMessenger, getAgentMessenger, MESSAGE_TYPES, PRIORITY };
