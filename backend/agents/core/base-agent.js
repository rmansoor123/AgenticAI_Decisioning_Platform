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
import { getKnowledgeBase } from './knowledge-base.js';
import { getOutcomeSimulator } from './outcome-simulator.js';
import { getThresholdManager } from './threshold-manager.js';
import { getPolicyEngine } from './policy-engine.js';

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
    this.outcomeSimulator = getOutcomeSimulator();
    this.thresholdManager = getThresholdManager();
    this.policyEngine = getPolicyEngine();

    // Listen for outcome feedback events
    if (eventBus) {
      eventBus.subscribe('agent:outcome:received', (payload) => {
        if (payload.agentId === this.agentId) {
          this.handleOutcomeFeedback(payload);
        }
      });
    }

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

      // Step 5.25: POLICY CHECK — enforce hard/soft policies on the proposed decision
      const proposedDecision = thought.result?.recommendation || { action: thought.result?.decision, confidence: thought.result?.confidence };
      if (proposedDecision?.action) {
        const policyResult = this.policyEngine.enforce(
          proposedDecision,
          thought.actions.map(a => ({ source: a.action?.type, data: a.result?.data, success: a.result?.success !== false })),
          {
            riskScore: thought.result?.riskScore || thought.result?.overallRisk?.score || 0,
            thresholds: this.thresholdManager.getThresholds(this.agentId),
            patternRecommendation: thought.patternMatches?.recommendation?.action,
            criticalFactors: thought.result?.overallRisk?.criticalFactors || 0
          }
        );

        // Apply policy enforcement
        if (!policyResult.allowed) {
          thought.result.recommendation = policyResult.enforcedDecision;
          thought.result.decision = policyResult.enforcedDecision.action;
          thought.result.policyOverride = true;
          thought.result.policyViolations = policyResult.violations;
          this.emitEvent('agent:policy:override', {
            agentId: this.agentId,
            originalAction: policyResult.originalDecision.action,
            enforcedAction: policyResult.enforcedDecision.action,
            violations: policyResult.violations.map(v => v.policyId)
          });
        } else if (policyResult.flags.length > 0) {
          thought.result.policyFlags = policyResult.flags;
        }
      }

      // Step 5.5: Write decision back to knowledge base
      await this.writeBackKnowledge(input, thought.result);

      // Step 6: Form conclusion
      this.currentChain.conclude(
        thought.result?.summary || 'Analysis complete',
        CONFIDENCE.LIKELY
      );

      // Step 7: LEARN - Update memory and patterns
      this.updateMemory(thought);
      this.learnFromResult(input, thought.result);

      // Step 7.5: Schedule simulated outcome for feedback loop
      const decision = thought.result?.recommendation?.action || thought.result?.decision;
      if (decision) {
        const decisionId = `DEC-${this.agentId}-${Date.now().toString(36)}`;
        this.outcomeSimulator.scheduleOutcome({
          agentId: this.agentId,
          decisionId,
          action: decision,
          riskScore: thought.result?.riskScore || thought.result?.overallRisk?.score || 50,
          confidence: thought.result?.confidence || 0.5
        });

        // Save pattern IDs for feedback later
        if (thought.patternMatches?.matches?.length > 0) {
          this.memory.working._lastPatternIds = thought.patternMatches.matches.map(m => m.patternId);
        }
      }

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
    // Try dual retrieval (vector + TF-IDF)
    const queryText = typeof input === 'string' ? input : JSON.stringify(input).slice(0, 200);
    const domain = input?.domain || context?.domain || 'fraud';
    let knowledgeResults = [];
    try {
      knowledgeResults = await this.dualRetrieve(queryText, domain);
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

  /**
   * Dual retrieval: Pinecone vector search + TF-IDF knowledge base.
   * Returns merged, deduplicated results with source tags.
   */
  async dualRetrieve(query, domain) {
    const results = [];

    // Map domain to namespace
    const domainToNamespace = {
      'onboarding': 'onboarding-knowledge',
      'transaction': 'fraud-cases',
      'transactions': 'fraud-cases',
      'fraud': 'fraud-cases',
      'risk': 'risk-patterns'
    };
    const vectorNamespace = domainToNamespace[domain] || 'fraud-cases';
    const tfidfNamespace = {
      'onboarding': 'onboarding',
      'transaction': 'transactions',
      'transactions': 'transactions',
      'fraud': 'transactions',
      'risk': 'risk-events'
    }[domain] || 'transactions';

    // 1. Try Pinecone vector search
    const evalServiceUrl = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
    try {
      const response = await fetch(`${evalServiceUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, namespace: vectorNamespace, top_k: 5 }),
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        const data = await response.json();
        for (const r of (data.results || [])) {
          results.push({
            text: r.text,
            _score: r.score,
            _source: 'vector',
            ...r.metadata
          });
        }
      }
    } catch (e) {
      // Vector search unavailable
    }

    // 2. TF-IDF knowledge base search
    try {
      const knowledgeBase = getKnowledgeBase();
      const tfidfResults = knowledgeBase.searchKnowledge(tfidfNamespace, query, {}, 5);
      for (const r of tfidfResults) {
        // Deduplicate: skip if similar text already in results
        const isDuplicate = results.some(existing =>
          existing.text && r.text && existing.text.slice(0, 80) === r.text.slice(0, 80)
        );
        if (!isDuplicate) {
          results.push({ ...r, _source: 'tfidf' });
        }
      }
    } catch (e) {
      // TF-IDF search failed
    }

    // Sort by score descending, take top 5
    return results
      .sort((a, b) => (b._score || 0) - (a._score || 0))
      .slice(0, 5);
  }

  /**
   * Write decision back to knowledge base and Pinecone.
   * Called after observe() in the reason() loop.
   */
  async writeBackKnowledge(input, result) {
    const decision = result?.recommendation?.action || result?.decision;
    if (!decision) return;

    const domain = input?.domain || 'transactions';
    const namespace = {
      'onboarding': 'onboarding',
      'transaction': 'transactions',
      'transactions': 'transactions',
      'fraud': 'transactions',
      'risk': 'risk-events'
    }[domain] || 'decisions';

    const text = `Decision: ${decision}. ${result?.summary || ''}. Risk: ${result?.riskScore || result?.overallRisk?.score || 'unknown'}.`;
    const knowledgeEntry = {
      text,
      category: domain,
      sellerId: input?.sellerId || null,
      domain,
      outcome: decision === 'APPROVE' ? 'legitimate' : decision === 'REJECT' || decision === 'BLOCK' ? 'fraud' : 'pending',
      riskScore: result?.riskScore || result?.overallRisk?.score || null,
      source: this.agentId,
      timestamp: new Date().toISOString()
    };

    // Write to local knowledge base
    try {
      const knowledgeBase = getKnowledgeBase();
      knowledgeBase.addKnowledge(namespace, [knowledgeEntry]);
    } catch (e) {
      // Local KB write failed — not critical
    }

    // Write to Pinecone via eval service
    const evalServiceUrl = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
    try {
      const vectorNamespace = {
        'onboarding': 'onboarding-knowledge',
        'transactions': 'fraud-cases',
        'risk-events': 'risk-patterns'
      }[namespace] || 'fraud-cases';

      await fetch(`${evalServiceUrl}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namespace: vectorNamespace,
          records: [{ id: `decision-${Date.now()}`, text, ...knowledgeEntry }]
        }),
        signal: AbortSignal.timeout(5000)
      });
    } catch (e) {
      // Pinecone ingest failed — not critical
    }
  }

  /**
   * Handle outcome feedback — update patterns, memory, and knowledge base.
   * Called when agent:outcome:received event fires for this agent's decision.
   */
  handleOutcomeFeedback(payload) {
    const { decisionId, originalDecision, outcome, wasCorrect } = payload;

    // 1. Update pattern memory feedback (provideFeedback finally gets called!)
    if (this.memory.working._lastPatternIds) {
      for (const patternId of this.memory.working._lastPatternIds) {
        this.patternMemory.provideFeedback(patternId, outcome, wasCorrect === true);
      }
    }

    // 2. Record outcome in threshold manager
    this.thresholdManager.recordOutcome(
      this.agentId,
      originalDecision.action,
      outcome,
      originalDecision.riskScore
    );

    // 3. Save outcome to long-term memory
    const importance = wasCorrect === false ? 0.8 : 0.5;
    const type = wasCorrect === false ? 'correction' : 'insight';
    this.memoryStore.saveLongTerm(this.agentId, type, {
      decisionId,
      originalAction: originalDecision.action,
      originalRiskScore: originalDecision.riskScore,
      outcome,
      wasCorrect,
      lesson: wasCorrect === false
        ? `Decision ${originalDecision.action} at risk ${originalDecision.riskScore} was WRONG (outcome: ${outcome})`
        : `Decision ${originalDecision.action} at risk ${originalDecision.riskScore} was correct (outcome: ${outcome})`,
      timestamp: new Date().toISOString()
    }, importance);

    // 4. Emit feedback event
    this.emitEvent('agent:feedback:processed', {
      agentId: this.agentId,
      decisionId,
      outcome,
      wasCorrect
    });
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
