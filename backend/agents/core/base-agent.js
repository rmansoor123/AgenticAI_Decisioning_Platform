/**
 * Base Agent Class - Foundation for all Agentic AI components
 *
 * Agents are autonomous entities that can:
 * - Reason about problems
 * - Plan multi-step actions
 * - Use tools to accomplish goals
 * - Maintain memory across interactions
 * - Collaborate with other agents
 * - Learn from successful investigations
 * - Emit events during execution
 */

import { v4 as uuidv4 } from 'uuid';
import { getAgentMessenger, MESSAGE_TYPES, PRIORITY } from './agent-messenger.js';
import { getPatternMemory, PATTERN_TYPES, CONFIDENCE_LEVELS } from './pattern-memory.js';
import { createChainOfThought, STEP_TYPES, CONFIDENCE } from './chain-of-thought.js';
import { getMemoryStore } from './memory-store.js';
import { getContextEngine } from './context-engine.js';
import { getMetricsCollector } from './metrics-collector.js';
import { getTraceCollector } from './trace-collector.js';
import { getDecisionLogger } from './decision-logger.js';
import { getLLMClient } from './llm-client.js';
import {
  buildThinkPrompt,
  buildPlanPrompt,
  buildObservePrompt,
  parseLLMJson,
  formatToolCatalog
} from './prompt-templates.js';

// Import event bus (only if running in context with WebSocket)
let eventBus = null;
try {
  const module = await import('../../gateway/websocket/event-bus.js');
  eventBus = module.getEventBus();
} catch (e) {
  // Event bus not available, that's okay
}

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

    // Inter-agent communication
    this.messenger = getAgentMessenger();
    this.patternMemory = getPatternMemory();
    this.memoryStore = getMemoryStore();
    this.sessionId = `SESSION-${Date.now().toString(36)}`;
    this.contextEngine = getContextEngine();
    this.metricsCollector = getMetricsCollector();
    this.traceCollector = getTraceCollector();
    this.decisionLogger = getDecisionLogger();
    this.llmClient = getLLMClient();

    // Register with messenger
    this.messenger.register(this.agentId, (message) => this.handleMessage(message));

    // Chain of thought for current reasoning
    this.currentChain = null;
  }

  // Register a tool the agent can use
  registerTool(name, description, handler) {
    this.tools.set(name, { name, description, handler });
  }

  // Core reasoning loop - "Think, Act, Observe"
  async reason(input, context = {}) {
    // Create chain of thought for this reasoning session
    this.currentChain = createChainOfThought({
      agentId: this.agentId,
      agentName: this.name,
      input,
      context
    });

    const thought = {
      timestamp: new Date().toISOString(),
      input,
      context,
      reasoning: [],
      actions: [],
      result: null,
      chainOfThought: null
    };

    // Start trace for this reasoning session
    const traceId = `TRACE-${this.agentId}-${Date.now().toString(36)}`;
    this.traceCollector.startTrace(traceId, this.agentId, input);
    thought.traceId = traceId;
    const reasonStartTime = Date.now();

    try {
      // Emit agent start event
      this.emitEvent('agent:action:start', {
        agentId: this.agentId,
        agentName: this.name,
        input: this.sanitizeInput(input)
      });

      // Assemble context from all sources
      const assembledContext = await this.contextEngine.assembleContext(this.agentId, input, {
        sessionId: this.sessionId,
        systemPrompt: `You are ${this.name}, a ${this.role} agent.`,
        domain: input?.domain || context?.domain || null,
        sellerId: input?.sellerId || context?.sellerId || null,
        agentRole: this.role
      });
      context._assembledContext = assembledContext;

      // Step 1: Check pattern memory (BEFORE think)
      const patternMatches = this.checkPatterns(input);
      if (patternMatches.matches.length > 0) {
        this.currentChain.recordEvidence(
          `Found ${patternMatches.matches.length} similar patterns in memory`,
          [],
          [],
          0.8
        );
        thought.patternMatches = patternMatches;
      }
      context._patternMatches = patternMatches;

      // Step 2: THINK - Analyze the situation
      this.currentChain.observe('Received input for analysis', input);
      thought.reasoning.push(await this.think(input, context));

      // Step 3: PLAN - Determine actions needed
      const plan = await this.plan(thought.reasoning[0], context);
      this.currentChain.analyze(`Created plan with ${plan.actions.length} actions`);
      thought.reasoning.push({ plan });

      // Step 4: ACT - Execute the plan
      for (const action of plan.actions) {
        // Emit action start
        this.emitEvent('agent:action:start', {
          agentId: this.agentId,
          action: action.type,
          params: this.sanitizeInput(action.params)
        });

        this.traceCollector.startSpan(traceId, `action:${action.type}`, action.params);
        const actionResult = await this.act(action);
        thought.actions.push({ action, result: actionResult });

        // Emit action complete
        this.emitEvent('agent:action:complete', {
          agentId: this.agentId,
          action: action.type,
          success: actionResult?.success !== false
        });
        this.traceCollector.endSpan(traceId, `action:${action.type}`, { success: actionResult?.success !== false });

        // Record as evidence in chain of thought
        if (actionResult?.data) {
          this.currentChain.recordEvidence(
            `Action ${action.type} result`,
            [],
            [],
            1.0
          );
        }
      }

      // Step 5: OBSERVE - Evaluate results
      thought.result = await this.observe(thought.actions, context);

      // Step 6: Form conclusion
      this.currentChain.conclude(
        thought.result?.summary || 'Analysis complete',
        CONFIDENCE.LIKELY
      );

      // Step 7: LEARN - Update memory and patterns
      this.updateMemory(thought);
      this.learnFromResult(input, thought.result);

      // Emit thought event
      this.emitEvent('agent:thought', {
        agentId: this.agentId,
        agentName: this.name,
        summary: thought.result?.summary,
        actionCount: thought.actions.length
      });

      // Attach chain of thought to result
      thought.chainOfThought = this.currentChain.generateTrace();

      // Record metrics and end trace
      const reasonDuration = Date.now() - reasonStartTime;
      this.metricsCollector.recordExecution(this.agentId, reasonDuration, thought.result?.success !== false);
      this.traceCollector.endTrace(traceId, { success: thought.result?.success !== false, summary: thought.result?.summary });

      // Log decision
      if (thought.result?.recommendation || thought.result?.decision) {
        this.decisionLogger.logDecision(
          this.agentId,
          thought.result.recommendation || thought.result.decision,
          { input: this.sanitizeInput(input), actionCount: thought.actions.length },
          thought.result.summary || ''
        );
      }

    } catch (error) {
      thought.error = error.message;
      thought.result = { success: false, error: error.message };
      this.currentChain.conclude(`Error: ${error.message}`, CONFIDENCE.CERTAIN);
      thought.chainOfThought = this.currentChain.generateTrace();
      const reasonDuration = Date.now() - reasonStartTime;
      this.metricsCollector.recordExecution(this.agentId, reasonDuration, false);
      this.traceCollector.endTrace(traceId, { success: false, error: error.message });
    }

    this.thoughtLog.push(thought);
    this.currentChain = null;
    return thought;
  }

  // Analyze input and context — LLM-enhanced with structured prompts
  async think(input, context) {
    // Gather advisory context for the LLM
    const recentMemory = this.memoryStore.getShortTerm(this.agentId, this.sessionId).slice(0, 5);
    const patternMatches = this.checkPatterns(input);
    let knowledgeResults = [];

    // Try dual retrieval (vector + TF-IDF) — Layer 3 will enhance this further
    try {
      const queryText = typeof input === 'string' ? input : JSON.stringify(input).slice(0, 200);
      const longTermResults = this.memoryStore.queryLongTerm(this.agentId, queryText, 3);
      knowledgeResults = longTermResults;
    } catch (e) {
      // Knowledge retrieval failed, proceed without it
    }

    // Try LLM-enhanced thinking
    if (this.llmClient?.enabled) {
      try {
        const { system, user } = buildThinkPrompt({
          agentName: this.name,
          agentRole: this.role,
          input,
          recentMemory,
          knowledgeResults,
          patternMatches,
          tools: this.tools
        });

        const llmResult = await this.llmClient.complete(system, user);
        const parsed = parseLLMJson(llmResult?.content, null);

        if (parsed?.understanding) {
          return {
            ...parsed,
            relevantMemory: this.retrieveRelevantMemory(input),
            availableTools: Array.from(this.tools.keys()),
            patternMatches,
            llmEnhanced: true
          };
        }
      } catch (e) {
        // Fall through to hardcoded logic
      }
    }

    // Fallback: hardcoded analysis
    return {
      understanding: `Analyzing: ${JSON.stringify(input).slice(0, 200)}`,
      key_risks: [],
      confidence: 0.5,
      suggested_approach: 'default',
      relevantMemory: this.retrieveRelevantMemory(input),
      availableTools: Array.from(this.tools.keys()),
      patternMatches
    };
  }

  // Create action plan — LLM selects tools with reasoning
  async plan(analysis, context) {
    // Gather long-term memory for lessons learned
    const queryText = analysis.understanding || JSON.stringify(context).slice(0, 200);
    const longTermMemory = this.memoryStore.queryLongTerm(this.agentId, queryText, 3);

    // Try LLM-enhanced planning
    if (this.llmClient?.enabled) {
      try {
        const { system, user } = buildPlanPrompt({
          agentName: this.name,
          agentRole: this.role,
          thinkResult: analysis,
          longTermMemory,
          tools: this.tools,
          input: context?.input || context
        });

        const llmResult = await this.llmClient.complete(system, user);
        const parsed = parseLLMJson(llmResult?.content, null);

        if (parsed?.actions?.length > 0) {
          // Validate tool names — only allow tools the agent actually has
          const validActions = parsed.actions
            .filter(a => this.tools.has(a.tool))
            .map(a => ({ type: a.tool, params: a.params || {}, rationale: a.rationale }));

          if (validActions.length > 0) {
            return {
              goal: parsed.goal || 'LLM-planned investigation',
              reasoning: parsed.reasoning || '',
              actions: validActions.slice(0, 10), // Guardrail: max 10 actions
              fallback: null,
              llmEnhanced: true
            };
          }
        }
      } catch (e) {
        // Fall through to hardcoded logic
      }
    }

    // Fallback: generic analyze action
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

  // Evaluate results — LLM synthesizes findings into risk assessment
  async observe(actions, context) {
    // Try LLM-enhanced observation
    if (this.llmClient?.enabled) {
      try {
        const { system, user } = buildObservePrompt({
          agentName: this.name,
          agentRole: this.role,
          actions,
          input: context?.input || context
        });

        const llmResult = await this.llmClient.complete(system, user);
        const parsed = parseLLMJson(llmResult?.content, null);

        if (parsed?.summary) {
          return {
            success: true,
            summary: parsed.summary,
            riskScore: parsed.risk_score,
            recommendation: { action: parsed.recommendation, confidence: parsed.confidence, reason: parsed.reasoning },
            decision: parsed.recommendation,
            confidence: parsed.confidence,
            key_findings: parsed.key_findings || [],
            actions,
            llmEnhanced: true
          };
        }
      } catch (e) {
        // Fall through to hardcoded logic
      }
    }

    // Fallback: rule-based observation
    return {
      success: actions.every(a => a.result?.success !== false),
      summary: `Completed ${actions.length} actions`,
      actions
    };
  }

  // Memory management — enhanced with long-term insights
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
      this.consolidateToLongTerm(removed);
    }

    // Persist to short-term memory store
    this.memoryStore.saveShortTerm(this.agentId, this.sessionId, {
      timestamp: thought.timestamp,
      type: thought.actions?.[0]?.action?.type || 'reasoning',
      summary: thought.result?.summary || 'Action completed',
      key_facts: this.extractKeyFacts(thought),
      success: thought.result?.success
    });

    // Save structured insight to long-term memory
    const decision = thought.result?.recommendation?.action || thought.result?.decision;
    if (decision) {
      const riskScore = thought.result?.overallRisk?.score || thought.result?.riskScore || 0;
      const isUnusual = (decision === 'APPROVE' && riskScore > 50) || (decision === 'REJECT' && riskScore < 30);
      const importance = isUnusual ? 0.8 : (riskScore > 70 ? 0.6 : 0.4);

      this.memoryStore.saveLongTerm(this.agentId, 'insight', {
        decision,
        riskScore,
        summary: thought.result?.summary || '',
        actionCount: thought.actions?.length || 0,
        wasUnusual: isUnusual,
        timestamp: thought.timestamp
      }, importance);
    }

    // Periodically consolidate pattern memory (every 20 decisions)
    if (this.thoughtLog.length % 20 === 0 && this.thoughtLog.length > 0) {
      const topPatterns = this.patternMemory.getTopPatterns(50);
      this.memoryStore.consolidatePatterns(this.agentId, topPatterns);
    }
  }

  retrieveRelevantMemory(input) {
    const inputStr = JSON.stringify(input).toLowerCase();
    // Check in-memory first (fast)
    const inMemory = this.memory.shortTerm
      .filter(m => JSON.stringify(m).toLowerCase().includes(inputStr.slice(0, 50)))
      .slice(-5);
    // Also check persistent long-term memory
    const longTerm = this.memoryStore.queryLongTerm(this.agentId, inputStr.slice(0, 100), 3);
    return { recent: inMemory, learned: longTerm };
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

    // Also persist to long-term memory store
    this.memoryStore.saveLongTerm(this.agentId, 'insight', {
      ...memory,
      consolidatedAt: new Date().toISOString()
    }, 0.5);
  }

  // ============================================================================
  // PATTERN LEARNING
  // ============================================================================

  /**
   * Check pattern memory for similar cases
   */
  checkPatterns(input) {
    const features = this.extractFeaturesForPatternMatching(input);
    return this.patternMemory.matchPatterns(features);
  }

  /**
   * Extract features for pattern matching
   */
  extractFeaturesForPatternMatching(input) {
    // Override in specialized agents for better feature extraction
    return {
      inputType: typeof input,
      hasAmount: 'amount' in (input || {}),
      hasTransaction: 'transactionId' in (input || {}),
      alertType: input?.alertType || 'unknown'
    };
  }

  /**
   * Learn from successful results
   */
  learnFromResult(input, result) {
    if (!result?.success) return;

    const features = this.extractFeaturesForPatternMatching(input);
    const outcome = this.determineOutcome(result);

    if (outcome) {
      this.patternMemory.learnPattern({
        type: PATTERN_TYPES.FRAUD_INDICATOR,
        features,
        outcome,
        confidence: result.confidence || CONFIDENCE_LEVELS.MEDIUM,
        source: this.agentId
      });
    }
  }

  /**
   * Determine outcome for pattern learning
   */
  determineOutcome(result) {
    if (result?.recommendation?.action === 'BLOCK') return 'FRAUD_CONFIRMED';
    if (result?.recommendation?.action === 'APPROVE') return 'LEGITIMATE_CONFIRMED';
    if (result?.recommendation?.action === 'REVIEW') return 'SUSPICIOUS';
    return null;
  }

  // ============================================================================
  // INTER-AGENT COMMUNICATION
  // ============================================================================

  /**
   * Request help from another agent
   * @param {string} capability - The capability needed
   * @param {Object} task - The task to perform
   * @param {Object} context - Additional context
   */
  async requestHelp(capability, task, context = {}) {
    this.emitEvent('agent:action:start', {
      agentId: this.agentId,
      action: 'request_help',
      capability
    });

    try {
      const response = await this.messenger.requestHelp({
        from: this.agentId,
        capability,
        task,
        context,
        priority: PRIORITY.HIGH
      });

      this.emitEvent('agent:action:complete', {
        agentId: this.agentId,
        action: 'request_help',
        success: response?.content?.success
      });

      return response?.content?.result;
    } catch (error) {
      this.emitEvent('agent:action:complete', {
        agentId: this.agentId,
        action: 'request_help',
        success: false,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Handle incoming messages from other agents
   */
  async handleMessage(message) {
    if (message.type === MESSAGE_TYPES.HELP_REQUEST) {
      return this.handleHelpRequest(message);
    }

    if (message.type === MESSAGE_TYPES.TASK_DELEGATION) {
      return this.handleTaskDelegation(message);
    }

    if (message.type === MESSAGE_TYPES.INFORMATION_SHARE) {
      return this.handleInformationShare(message);
    }

    // Default: process as regular input
    return this.reason(message.content);
  }

  /**
   * Handle help request from another agent
   */
  async handleHelpRequest(message) {
    const { capability, task, context } = message.content;

    // Check if we have the capability
    if (!this.capabilities.includes(capability)) {
      await this.messenger.respondToHelp({
        correlationId: message.correlationId,
        from: this.agentId,
        result: null,
        success: false,
        error: `Agent does not have capability: ${capability}`
      });
      return;
    }

    // Execute the task
    try {
      const result = await this.reason(task, { ...context, fromAgent: message.from });

      await this.messenger.respondToHelp({
        correlationId: message.correlationId,
        from: this.agentId,
        result: result.result,
        success: true
      });
    } catch (error) {
      await this.messenger.respondToHelp({
        correlationId: message.correlationId,
        from: this.agentId,
        result: null,
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Handle task delegation
   */
  async handleTaskDelegation(message) {
    const { task, input, context } = message.content;
    return this.reason(input, { ...context, delegatedTask: task, fromAgent: message.from });
  }

  /**
   * Handle information sharing
   */
  handleInformationShare(message) {
    const { topic, data } = message.content;

    // Store in working memory
    this.memory.working[topic] = {
      data,
      from: message.from,
      receivedAt: new Date().toISOString()
    };

    return { received: true };
  }

  /**
   * Share information with other agents
   */
  async shareInformation(topic, data, targetAgentId = null) {
    if (targetAgentId) {
      return this.messenger.send({
        from: this.agentId,
        to: targetAgentId,
        type: MESSAGE_TYPES.INFORMATION_SHARE,
        content: { topic, data }
      });
    }

    // Broadcast to all
    return this.messenger.broadcast({
      from: this.agentId,
      content: { topic, data }
    });
  }

  /**
   * Delegate a subtask to another agent
   */
  async delegate(targetAgentId, subtask) {
    this.emitEvent('agent:action:start', {
      agentId: this.agentId,
      action: 'delegate',
      target: targetAgentId
    });

    try {
      const result = await this.messenger.delegateTask({
        from: this.agentId,
        to: targetAgentId,
        task: subtask.task || 'delegated_task',
        input: subtask,
        context: { delegatedFrom: this.agentId }
      });

      this.emitEvent('agent:action:complete', {
        agentId: this.agentId,
        action: 'delegate',
        success: true
      });

      return result;
    } catch (error) {
      this.emitEvent('agent:action:complete', {
        agentId: this.agentId,
        action: 'delegate',
        success: false,
        error: error.message
      });
      return null;
    }
  }

  // ============================================================================
  // CHAIN OF THOUGHT HELPERS
  // ============================================================================

  /**
   * Add observation to current chain of thought
   */
  addObservation(observation, data = {}) {
    if (this.currentChain) {
      this.currentChain.observe(observation, data);
    }
  }

  /**
   * Add hypothesis to current chain of thought
   */
  addHypothesis(hypothesis, confidence = CONFIDENCE.POSSIBLE) {
    if (this.currentChain) {
      return this.currentChain.hypothesize(hypothesis, confidence);
    }
    return null;
  }

  /**
   * Add evidence to current chain of thought
   */
  addEvidence(evidence, supports = [], contradicts = []) {
    if (this.currentChain) {
      return this.currentChain.recordEvidence(evidence, supports, contradicts);
    }
    return null;
  }

  // ============================================================================
  // EVENT EMISSION
  // ============================================================================

  /**
   * Emit an event to the event bus
   */
  emitEvent(eventType, data) {
    if (eventBus) {
      eventBus.publish(eventType, {
        ...data,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Sanitize input for event emission (remove sensitive data)
   */
  sanitizeInput(input) {
    if (!input) return input;

    const sanitized = { ...input };
    const sensitiveFields = ['password', 'ssn', 'cardNumber', 'cvv', 'pin'];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }

  // ============================================================================
  // AGENT STATE
  // ============================================================================

  /**
   * Get agent state
   */
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
      thoughtLogSize: this.thoughtLog.length,
      patternStats: this.patternMemory.getStats(),
      llmEnabled: this.llmClient?.enabled || false
    };
  }

  // ============================================================================
  // COLLABORATION INTERFACE (Legacy)
  // ============================================================================

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
