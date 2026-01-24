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

class AgentOrchestrator {
  constructor() {
    this.agents = new Map();
    this.workflows = new Map();
    this.taskQueue = [];
    this.activeWorkflows = new Map();
    this.eventLog = [];
    this.humanEscalations = [];
    this.messenger = getAgentMessenger();

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

        const stepResult = await this.executeStep(step, context, execution);
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
}

// Singleton instance
export const orchestrator = new AgentOrchestrator();
export default AgentOrchestrator;
