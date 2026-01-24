/**
 * Base Agent Class - Foundation for all Agentic AI components
 *
 * Agents are autonomous entities that can:
 * - Reason about problems
 * - Plan multi-step actions
 * - Use tools to accomplish goals
 * - Maintain memory across interactions
 * - Collaborate with other agents
 */

import { v4 as uuidv4 } from 'uuid';

export class BaseAgent {
  constructor(config) {
    this.agentId = config.agentId || `AGENT-${uuidv4().slice(0, 8).toUpperCase()}`;
    this.name = config.name;
    this.role = config.role;
    this.capabilities = config.capabilities || [];
    this.tools = new Map();
    this.memory = {
      shortTerm: [],      // Recent context (last N interactions)
      longTerm: new Map(), // Persistent knowledge
      working: {}          // Current task state
    };
    this.status = 'IDLE';
    this.currentTask = null;
    this.thoughtLog = [];
    this.maxMemorySize = config.maxMemorySize || 100;
  }

  // Register a tool the agent can use
  registerTool(name, description, handler) {
    this.tools.set(name, { name, description, handler });
  }

  // Core reasoning loop - "Think, Act, Observe"
  async reason(input, context = {}) {
    const thought = {
      timestamp: new Date().toISOString(),
      input,
      context,
      reasoning: [],
      actions: [],
      result: null
    };

    try {
      // Step 1: THINK - Analyze the situation
      thought.reasoning.push(await this.think(input, context));

      // Step 2: PLAN - Determine actions needed
      const plan = await this.plan(thought.reasoning[0], context);
      thought.reasoning.push({ plan });

      // Step 3: ACT - Execute the plan
      for (const action of plan.actions) {
        const actionResult = await this.act(action);
        thought.actions.push({ action, result: actionResult });
      }

      // Step 4: OBSERVE - Evaluate results
      thought.result = await this.observe(thought.actions, context);

      // Step 5: LEARN - Update memory
      this.updateMemory(thought);

    } catch (error) {
      thought.error = error.message;
      thought.result = { success: false, error: error.message };
    }

    this.thoughtLog.push(thought);
    return thought;
  }

  // Analyze input and context
  async think(input, context) {
    return {
      understanding: `Analyzing: ${JSON.stringify(input).slice(0, 200)}`,
      relevantMemory: this.retrieveRelevantMemory(input),
      availableTools: Array.from(this.tools.keys())
    };
  }

  // Create action plan
  async plan(analysis, context) {
    return {
      goal: 'Process input and generate response',
      actions: [{ type: 'analyze', params: {} }],
      fallback: null
    };
  }

  // Execute an action
  async act(action) {
    if (this.tools.has(action.type)) {
      const tool = this.tools.get(action.type);
      return await tool.handler(action.params);
    }
    return { executed: false, reason: 'Unknown action type' };
  }

  // Evaluate results
  async observe(actions, context) {
    return {
      success: actions.every(a => a.result?.success !== false),
      summary: `Completed ${actions.length} actions`,
      actions
    };
  }

  // Memory management
  updateMemory(thought) {
    // Add to short-term memory
    this.memory.shortTerm.push({
      timestamp: thought.timestamp,
      summary: thought.result?.summary || 'Action completed',
      key_facts: this.extractKeyFacts(thought)
    });

    // Trim short-term memory if needed
    if (this.memory.shortTerm.length > this.maxMemorySize) {
      const removed = this.memory.shortTerm.shift();
      // Optionally consolidate into long-term memory
      this.consolidateToLongTerm(removed);
    }
  }

  retrieveRelevantMemory(input) {
    // Simple keyword matching for now
    const inputStr = JSON.stringify(input).toLowerCase();
    return this.memory.shortTerm
      .filter(m => JSON.stringify(m).toLowerCase().includes(inputStr.slice(0, 50)))
      .slice(-5);
  }

  extractKeyFacts(thought) {
    return {
      input_type: typeof thought.input,
      actions_taken: thought.actions.length,
      success: thought.result?.success
    };
  }

  consolidateToLongTerm(memory) {
    // Store important patterns in long-term memory
    const key = `memory_${Date.now()}`;
    this.memory.longTerm.set(key, memory);
  }

  // Agent state
  getState() {
    return {
      agentId: this.agentId,
      name: this.name,
      role: this.role,
      status: this.status,
      capabilities: this.capabilities,
      tools: Array.from(this.tools.keys()),
      memorySize: {
        shortTerm: this.memory.shortTerm.length,
        longTerm: this.memory.longTerm.size
      },
      currentTask: this.currentTask,
      thoughtLogSize: this.thoughtLog.length
    };
  }

  // Collaboration interface
  async receiveMessage(fromAgent, message) {
    return await this.reason({
      type: 'agent_message',
      from: fromAgent,
      message
    });
  }

  async sendMessage(toAgent, message) {
    return {
      from: this.agentId,
      to: toAgent.agentId,
      message,
      timestamp: new Date().toISOString()
    };
  }
}

export default BaseAgent;
