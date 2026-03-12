/**
 * Agent Orchestrator - Coordinates multi-agent workflows
 *
 * Responsibilities:
 * - Manages agent lifecycle
 * - Routes tasks to appropriate agents
 * - Coordinates multi-agent collaboration
 * - Maintains global state and context
 * - Handles human-in-the-loop escalations
 * - Routes inter-agent help requests
 */

import { v4 as uuidv4 } from 'uuid';
import { getAgentMessenger, MESSAGE_TYPES } from './agent-messenger.js';
import { getCircuitBreaker } from './circuit-breaker.js';
import { getAgentRouter } from './agent-router.js';
import { db_ops } from '../../shared/common/database.js';

class AgentOrchestrator {
  constructor() {
    this.agents = new Map();
    this.workflows = new Map();
    this.taskQueue = [];
    this.activeWorkflows = new Map();
    this.eventLog = [];
    this.humanEscalations = [];
    this.messenger = getAgentMessenger();
    this.router = getAgentRouter();

    // Start help request routing
    this._startHelpRequestRouting();
  }

  /**
   * Start processing help requests from agents
   */
  _startHelpRequestRouting() {
    // Check for pending help requests periodically
    setInterval(() => {
      this._processHelpRequests();
    }, 100);
  }

  /**
   * Process pending help requests
   */
  async _processHelpRequests() {
    const pendingRequests = this.messenger.getPendingHelpRequests();

    for (const request of pendingRequests) {
      // Mark as processing to prevent duplicate handling
      this.messenger.markHelpRequestProcessing(request.id);

      // Find an agent with the requested capability
      const capability = request.content.capability;
      const targetAgent = this._findAgentByCapability(capability);

      if (targetAgent) {
        // Route the request to the agent
        this.log('HELP_REQUEST_ROUTED', {
          requestId: request.id,
          from: request.from,
          to: targetAgent.agentId,
          capability
        });

        // Deliver the message to the target agent
        try {
          await this.messenger.send({
            from: 'ORCHESTRATOR',
            to: targetAgent.agentId,
            type: MESSAGE_TYPES.HELP_REQUEST,
            content: request.content,
            correlationId: request.correlationId
          });
        } catch (error) {
          // Respond with error
          await this.messenger.respondToHelp({
            correlationId: request.correlationId,
            from: 'ORCHESTRATOR',
            result: null,
            success: false,
            error: `Failed to route request: ${error.message}`
          });
        }
      } else {
        // No agent found with capability
        this.log('HELP_REQUEST_UNROUTABLE', {
          requestId: request.id,
          capability,
          availableCapabilities: this._getAllCapabilities()
        });

        await this.messenger.respondToHelp({
          correlationId: request.correlationId,
          from: 'ORCHESTRATOR',
          result: null,
          success: false,
          error: `No agent found with capability: ${capability}`
        });
      }
    }
  }

  /**
   * Find an agent by capability
   */
  _findAgentByCapability(capability) {
    for (const agent of this.agents.values()) {
      if (agent.capabilities && agent.capabilities.includes(capability)) {
        // Check if agent is available (not busy)
        if (agent.status === 'IDLE' || agent.status === undefined) {
          return agent;
        }
      }
    }

    // If no idle agent, return any agent with the capability
    for (const agent of this.agents.values()) {
      if (agent.capabilities && agent.capabilities.includes(capability)) {
        return agent;
      }
    }

    return null;
  }

  /**
   * Get all available capabilities
   */
  _getAllCapabilities() {
    const capabilities = new Set();
    for (const agent of this.agents.values()) {
      if (agent.capabilities) {
        agent.capabilities.forEach(cap => capabilities.add(cap));
      }
    }
    return Array.from(capabilities);
  }

  // Register an agent with the orchestrator
  registerAgent(agent) {
    this.agents.set(agent.agentId, agent);
    this.router.registerAgent(agent.agentId, agent.capabilities || []);
    this.log('AGENT_REGISTERED', {
      agentId: agent.agentId,
      name: agent.name,
      role: agent.role,
      capabilities: agent.capabilities
    });
    return agent.agentId;
  }

  // Unregister an agent
  unregisterAgent(agentId) {
    if (this.agents.has(agentId)) {
      this.agents.delete(agentId);
      this.log('AGENT_UNREGISTERED', { agentId });
      return true;
    }
    return false;
  }

  // Get agent by ID or role
  getAgent(identifier) {
    if (this.agents.has(identifier)) {
      return this.agents.get(identifier);
    }
    // Search by role
    for (const agent of this.agents.values()) {
      if (agent.role === identifier || agent.name === identifier) {
        return agent;
      }
    }
    return null;
  }

  // Get all agents
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  // Define a workflow (sequence of agent tasks)
  defineWorkflow(name, config) {
    const workflow = {
      workflowId: `WF-${uuidv4().slice(0, 8).toUpperCase()}`,
      name,
      steps: config.steps,
      triggers: config.triggers || [],
      timeout: config.timeout || 300000, // 5 min default
      createdAt: new Date().toISOString()
    };
    this.workflows.set(workflow.workflowId, workflow);
    this.log('WORKFLOW_DEFINED', { workflowId: workflow.workflowId, name });
    return workflow;
  }

  // Execute a workflow
  async executeWorkflow(workflowId, input) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    const execution = {
      executionId: `EXEC-${uuidv4().slice(0, 8).toUpperCase()}`,
      workflowId,
      workflowName: workflow.name,
      input,
      status: 'RUNNING',
      currentStep: 0,
      steps: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
      result: null
    };

    this.activeWorkflows.set(execution.executionId, execution);
    this.log('WORKFLOW_STARTED', { executionId: execution.executionId, workflowId });

    try {
      let context = { input, previousResults: [] };

      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        execution.currentStep = i;

        let stepResult;
        if (step.type === 'conditional') {
          stepResult = await this.executeConditionalStep(step, context, execution);
        } else {
          stepResult = await this.executeStepWithRetry(step, context, execution);
        }

        // Save checkpoint after each successful step
        if (stepResult.status === 'COMPLETED') {
          this.saveCheckpoint(execution.executionId, i, context);
        }

        execution.steps.push(stepResult);

        if (stepResult.status === 'FAILED' && !step.continueOnError) {
          throw new Error(`Step ${step.name} failed: ${stepResult.error}`);
        }

        if (stepResult.status === 'ESCALATED') {
          execution.status = 'AWAITING_HUMAN';
          this.humanEscalations.push({
            executionId: execution.executionId,
            step: step.name,
            reason: stepResult.escalationReason,
            data: stepResult.data,
            timestamp: new Date().toISOString()
          });
          return execution;
        }

        context.previousResults.push(stepResult);
        context[step.outputKey || `step_${i}`] = stepResult.output;
      }

      execution.status = 'COMPLETED';
      execution.result = context;
      execution.completedAt = new Date().toISOString();
      this.log('WORKFLOW_COMPLETED', { executionId: execution.executionId });

    } catch (error) {
      execution.status = 'FAILED';
      execution.error = error.message;
      execution.completedAt = new Date().toISOString();
      this.log('WORKFLOW_FAILED', { executionId: execution.executionId, error: error.message });
    }

    return execution;
  }

  // Execute a single workflow step
  async executeStep(step, context, execution) {
    const startTime = Date.now();
    const stepResult = {
      stepName: step.name,
      agentRole: step.agent,
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      output: null,
      error: null,
      duration: null
    };

    try {
      const agent = this.getAgent(step.agent);
      if (!agent) throw new Error(`Agent not found: ${step.agent}`);

      // Prepare input for agent
      const agentInput = step.inputMapper ? step.inputMapper(context) : context.input;

      // Execute agent reasoning
      const thought = await agent.reason(agentInput, {
        workflow: execution.workflowName,
        step: step.name,
        previousResults: context.previousResults
      });

      // Check if human escalation needed
      if (thought.result?.needsHumanReview) {
        stepResult.status = 'ESCALATED';
        stepResult.escalationReason = thought.result.escalationReason;
        stepResult.data = thought.result;
      } else {
        stepResult.status = thought.result?.success !== false ? 'COMPLETED' : 'FAILED';
        stepResult.output = step.outputMapper ? step.outputMapper(thought.result) : thought.result;
      }

      stepResult.thought = thought;

    } catch (error) {
      stepResult.status = 'FAILED';
      stepResult.error = error.message;
    }

    stepResult.completedAt = new Date().toISOString();
    stepResult.duration = Date.now() - startTime;
    return stepResult;
  }

  // Execute a step with retry logic and circuit breaker integration
  async executeStepWithRetry(step, context, execution) {
    const maxRetries = step.maxRetries || 3;
    const backoffMs = step.backoffMs || 1000;
    const backoffMultiplier = step.backoffMultiplier || 2;

    const agentId = step.agent;
    const breaker = getCircuitBreaker(agentId);

    if (!breaker.canExecute()) {
      return {
        stepName: step.name,
        status: 'CIRCUIT_OPEN',
        error: `Circuit breaker open for agent ${agentId}`,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        duration: 0
      };
    }

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.router.taskStarted(agentId);
        const startTime = Date.now();
        const result = await this.executeStep(step, context, execution);
        const duration = Date.now() - startTime;
        this.router.taskCompleted(agentId, result.status === 'COMPLETED', duration);

        if (result.status === 'COMPLETED' || result.status === 'ESCALATED') {
          breaker.recordSuccess();
          return result;
        }

        lastError = result.error;
        breaker.recordFailure();
      } catch (error) {
        lastError = error.message;
        breaker.recordFailure();
        this.router.taskCompleted(agentId, false, 0);
      }

      if (attempt < maxRetries) {
        const delay = backoffMs * Math.pow(backoffMultiplier, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        this.log('STEP_RETRY', { step: step.name, attempt: attempt + 1, delay });
      }
    }

    return {
      stepName: step.name,
      status: 'FAILED',
      error: `Failed after ${maxRetries + 1} attempts: ${lastError}`,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 0
    };
  }

  // Execute a conditional branching step
  async executeConditionalStep(step, context, execution) {
    const branchKey = step.evaluate(context);
    const branchSteps = step.branches[branchKey];

    if (!branchSteps) {
      return { stepName: step.name, status: 'FAILED', error: `No branch for key: ${branchKey}` };
    }

    this.log('CONDITIONAL_BRANCH', { step: step.name, branch: branchKey });

    const results = [];
    for (const subStep of branchSteps) {
      const result = await this.executeStepWithRetry(subStep, context, execution);
      results.push(result);
      if (result.status === 'FAILED' && !subStep.continueOnError) break;
      context[subStep.outputKey || `sub_${results.length}`] = result.output;
    }

    return {
      stepName: step.name,
      status: results.every(r => r.status !== 'FAILED') ? 'COMPLETED' : 'FAILED',
      branch: branchKey,
      subResults: results
    };
  }

  // Save workflow checkpoint for resumability
  saveCheckpoint(executionId, stepIndex, state) {
    const checkpointId = `${executionId}-step-${stepIndex}`;
    db_ops.insert('workflow_checkpoints', 'checkpoint_id', checkpointId, {
      executionId,
      stepIndex,
      state,
      status: 'saved',
      savedAt: new Date().toISOString()
    });
  }

  // Load the latest checkpoint for an execution
  loadCheckpoint(executionId) {
    const all = db_ops.getAll('workflow_checkpoints', 100, 0)
      .map(r => r.data)
      .filter(c => c.executionId === executionId)
      .sort((a, b) => b.stepIndex - a.stepIndex);
    return all[0] || null;
  }

  // Direct task assignment to an agent
  async assignTask(agentIdentifier, task) {
    const agent = this.getAgent(agentIdentifier);
    if (!agent) throw new Error(`Agent not found: ${agentIdentifier}`);

    this.log('TASK_ASSIGNED', { agentId: agent.agentId, task: task.type });
    return await agent.reason(task);
  }

  // Multi-agent collaboration
  async collaborate(agentIds, task, strategy = 'sequential') {
    const results = [];
    const agents = agentIds.map(id => this.getAgent(id)).filter(Boolean);

    if (strategy === 'sequential') {
      let context = task;
      for (const agent of agents) {
        const result = await agent.reason(context);
        results.push({ agent: agent.agentId, result });
        context = { ...task, previousAgentResult: result };
      }
    } else if (strategy === 'parallel') {
      const promises = agents.map(agent => agent.reason(task));
      const outcomes = await Promise.all(promises);
      agents.forEach((agent, i) => results.push({ agent: agent.agentId, result: outcomes[i] }));
    } else if (strategy === 'consensus') {
      // All agents vote, majority wins
      const votes = await Promise.all(agents.map(agent => agent.reason(task)));
      const decisions = votes.map(v => v.result?.decision).filter(Boolean);
      const consensus = this.findConsensus(decisions);
      results.push({ strategy: 'consensus', votes, consensus });
    }

    return results;
  }

  findConsensus(decisions) {
    const counts = {};
    decisions.forEach(d => counts[d] = (counts[d] || 0) + 1);
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  // Human-in-the-loop
  async resolveEscalation(executionId, humanDecision) {
    const execution = this.activeWorkflows.get(executionId);
    if (!execution || execution.status !== 'AWAITING_HUMAN') {
      throw new Error('No pending escalation found');
    }

    execution.humanDecision = humanDecision;
    execution.status = 'RUNNING';

    // Mark escalation as resolved
    const escalation = this.humanEscalations.find(e => e.executionId === executionId && !e.resolved);
    if (escalation) {
      escalation.resolved = true;
      escalation.resolvedAt = new Date().toISOString();
      escalation.decision = humanDecision;
    }

    this.log('ESCALATION_RESOLVED', { executionId, decision: humanDecision });
    return execution;
  }

  // Get pending escalations
  getPendingEscalations() {
    return this.humanEscalations.filter(e => !e.resolved);
  }

  // Logging
  log(event, data) {
    this.eventLog.push({
      timestamp: new Date().toISOString(),
      event,
      data
    });

    // Keep log size manageable
    if (this.eventLog.length > 1000) {
      this.eventLog = this.eventLog.slice(-500);
    }
  }

  // Get recent logs
  getRecentLogs(limit = 50) {
    return this.eventLog.slice(-limit);
  }

  // Get orchestrator state
  getState() {
    return {
      agents: Array.from(this.agents.values()).map(a => a.getState()),
      workflows: Array.from(this.workflows.values()),
      activeWorkflows: Array.from(this.activeWorkflows.values()),
      pendingEscalations: this.humanEscalations.filter(e => !e.resolved),
      eventLogSize: this.eventLog.length,
      availableCapabilities: this._getAllCapabilities(),
      messengerStats: this.messenger.getStats()
    };
  }

  // Get statistics
  getStats() {
    const completedWorkflows = Array.from(this.activeWorkflows.values())
      .filter(w => w.status === 'COMPLETED');

    const failedWorkflows = Array.from(this.activeWorkflows.values())
      .filter(w => w.status === 'FAILED');

    return {
      registeredAgents: this.agents.size,
      definedWorkflows: this.workflows.size,
      totalExecutions: this.activeWorkflows.size,
      completedExecutions: completedWorkflows.length,
      failedExecutions: failedWorkflows.length,
      pendingEscalations: this.humanEscalations.filter(e => !e.resolved).length,
      availableCapabilities: this._getAllCapabilities()
    };
  }

  /**
   * Dynamically spawn a new agent instance.
   * @param {string} agentType - The type of agent to spawn (maps to agent class)
   * @param {Object} config - Configuration overrides for the agent
   * @returns {Object} The spawned agent
   */
  async spawnAgent(agentType, config = {}) {
    const agentId = config.agentId || `${agentType.toUpperCase()}-SPAWN-${Date.now().toString(36)}`;

    // Agent type registry
    const AGENT_TYPES = {
      'seller_onboarding': '../specialized/seller-onboarding-agent.js',
      'fraud_investigation': '../specialized/fraud-investigation-agent.js',
      'alert_triage': '../specialized/alert-triage-agent.js',
      'rule_optimization': '../specialized/rule-optimization-agent.js',
      'payout_risk': '../specialized/payout-risk-agent.js',
      'listing_intelligence': '../specialized/listing-intelligence-agent.js',
      'profile_mutation': '../specialized/profile-mutation-agent.js',
      'returns_abuse': '../specialized/returns-abuse-agent.js',
      'cross_domain': '../specialized/cross-domain-agent.js',
      'policy_evolution': '../specialized/policy-evolution-agent.js',
    };

    const modulePath = AGENT_TYPES[agentType];
    if (!modulePath) {
      throw new Error(`Unknown agent type: ${agentType}. Available: ${Object.keys(AGENT_TYPES).join(', ')}`);
    }

    try {
      const module = await import(modulePath);
      // Find the agent class (first exported class)
      const AgentClass = Object.values(module).find(v => typeof v === 'function' && v.prototype?.reason);
      if (!AgentClass) {
        throw new Error(`No agent class found in module for type: ${agentType}`);
      }

      const agent = new AgentClass(config);

      // Override agentId if specified
      if (config.agentId) {
        agent.agentId = config.agentId;
      }

      // Register with orchestrator
      this.registerAgent(agent);

      this.log('AGENT_SPAWNED', {
        agentId: agent.agentId,
        agentType,
        spawnedAt: new Date().toISOString(),
      });

      return agent;
    } catch (error) {
      this.log('AGENT_SPAWN_FAILED', {
        agentType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Spawn multiple agents in parallel.
   */
  async spawnAgents(specs) {
    const results = await Promise.allSettled(
      specs.map(({ type, config }) => this.spawnAgent(type, config))
    );

    return results.map((r, i) => ({
      type: specs[i].type,
      status: r.status,
      agent: r.status === 'fulfilled' ? r.value : null,
      error: r.status === 'rejected' ? r.reason.message : null,
    }));
  }

  /**
   * Despawn (unregister and clean up) an agent.
   */
  async despawnAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return { success: false, error: 'Agent not found' };

    this.unregisterAgent(agentId);

    this.log('AGENT_DESPAWNED', {
      agentId,
      despawnedAt: new Date().toISOString(),
    });

    return { success: true, agentId };
  }

  // ============================================================================
  // BATCH EXECUTION — run multiple agent tasks concurrently
  // ============================================================================

  /**
   * Execute a batch of agent tasks concurrently with configurable concurrency.
   *
   * @param {Array<{agentId: string, input: Object}>} tasks - Tasks to execute
   * @param {Object} options
   * @param {number} options.concurrency - Max concurrent agents (default: 5)
   * @param {number} options.timeoutMs - Per-task timeout (default: 60000)
   * @param {boolean} options.stopOnError - Abort remaining on first error (default: false)
   * @returns {Array<{agentId, status, result, error, durationMs}>}
   */
  async executeBatch(tasks, options = {}) {
    const {
      concurrency = 5,
      timeoutMs = 60000,
      stopOnError = false
    } = options;

    const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}`;
    this.log('BATCH_STARTED', { batchId, taskCount: tasks.length, concurrency });

    const results = new Array(tasks.length);
    let aborted = false;
    let completed = 0;

    // Process tasks in chunks of `concurrency`
    for (let i = 0; i < tasks.length; i += concurrency) {
      if (aborted) break;

      const chunk = tasks.slice(i, i + concurrency);
      const chunkPromises = chunk.map(async (task, chunkIdx) => {
        const globalIdx = i + chunkIdx;
        if (aborted) {
          results[globalIdx] = { agentId: task.agentId, status: 'SKIPPED', result: null, error: 'Batch aborted', durationMs: 0 };
          return;
        }

        const agent = this.getAgent(task.agentId);
        if (!agent) {
          results[globalIdx] = { agentId: task.agentId, status: 'FAILED', result: null, error: `Agent not found: ${task.agentId}`, durationMs: 0 };
          return;
        }

        const startTime = Date.now();
        try {
          // Race between agent execution and timeout
          const result = await Promise.race([
            agent.reason(task.input, { batch: true, batchId }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
            )
          ]);

          const durationMs = Date.now() - startTime;
          results[globalIdx] = { agentId: task.agentId, status: 'COMPLETED', result, error: null, durationMs };
          completed++;
        } catch (error) {
          const durationMs = Date.now() - startTime;
          results[globalIdx] = { agentId: task.agentId, status: 'FAILED', result: null, error: error.message, durationMs };
          if (stopOnError) aborted = true;
        }
      });

      await Promise.allSettled(chunkPromises);
    }

    // Fill any remaining skipped slots
    for (let i = 0; i < results.length; i++) {
      if (!results[i]) {
        results[i] = { agentId: tasks[i].agentId, status: 'SKIPPED', result: null, error: 'Not executed', durationMs: 0 };
      }
    }

    this.log('BATCH_COMPLETED', {
      batchId,
      total: tasks.length,
      completed,
      failed: results.filter(r => r.status === 'FAILED').length,
      skipped: results.filter(r => r.status === 'SKIPPED').length
    });

    return { batchId, results };
  }

  /**
   * Fan-out: send the same input to multiple agents concurrently and collect results.
   * Useful for cross-domain analysis where each agent evaluates independently.
   *
   * @param {string[]} agentIds - Agents to fan out to
   * @param {Object} input - Shared input for all agents
   * @param {Object} options - Same as executeBatch options
   * @returns {Object} { batchId, results }
   */
  async fanOut(agentIds, input, options = {}) {
    const tasks = agentIds.map(agentId => ({ agentId, input }));
    return this.executeBatch(tasks, options);
  }

  /**
   * Get list of available agent types for spawning.
   */
  getSpawnableTypes() {
    return [
      { type: 'seller_onboarding', description: 'KYC + risk evaluation for new sellers' },
      { type: 'fraud_investigation', description: 'Transaction deep-dive investigation' },
      { type: 'alert_triage', description: 'Alert prioritization and routing' },
      { type: 'rule_optimization', description: 'Rule performance analysis' },
      { type: 'payout_risk', description: 'Payout fraud risk assessment' },
      { type: 'listing_intelligence', description: 'Product listing analysis' },
      { type: 'profile_mutation', description: 'Profile change monitoring' },
      { type: 'returns_abuse', description: 'Return fraud detection' },
      { type: 'cross_domain', description: 'Cross-domain correlation' },
      { type: 'policy_evolution', description: 'Policy rule evolution' },
    ];
  }
}

// Singleton instance
export const orchestrator = new AgentOrchestrator();
export default AgentOrchestrator;
