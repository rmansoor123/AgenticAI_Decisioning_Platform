/**
 * Agent Coordinator - Parallel dispatch, result aggregation, consensus
 */

import { v4 as uuidv4 } from 'uuid';
import { getConsensusEngine } from './consensus-engine.js';

class AgentCoordinator {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.consensusEngine = getConsensusEngine();
    this.stats = {
      parallelDispatches: 0,
      delegations: 0,
      consensusSessions: 0
    };
  }

  async dispatchParallel(agentIds, task, options = {}) {
    this.stats.parallelDispatches++;
    const timeout = options.timeout || 30000;

    const promises = agentIds.map(id => {
      const agent = this.orchestrator.getAgent(id);
      if (!agent) return Promise.resolve({ agentId: id, status: 'not_found', result: null });

      const taskPromise = agent.reason(task).then(result => ({
        agentId: id,
        status: 'completed',
        result
      }));

      const timeoutPromise = new Promise(resolve => {
        setTimeout(() => resolve({ agentId: id, status: 'timeout', result: null }), timeout);
      });

      return Promise.race([taskPromise, timeoutPromise]);
    });

    const results = await Promise.allSettled(promises);
    return results.map(r => r.status === 'fulfilled' ? r.value : { agentId: 'unknown', status: 'error', error: r.reason?.message });
  }

  async delegate(fromAgentId, toAgentId, subtask, options = {}) {
    this.stats.delegations++;
    const timeout = options.timeout || 30000;

    const agent = this.orchestrator.getAgent(toAgentId);
    if (!agent) throw new Error(`Agent ${toAgentId} not found`);

    const taskPromise = agent.reason(subtask, { delegatedFrom: fromAgentId });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Delegation timeout')), timeout);
    });

    try {
      return await Promise.race([taskPromise, timeoutPromise]);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async runConsensus(agentIds, task, strategy = 'majority') {
    this.stats.consensusSessions++;
    const sessionId = `CONS-${uuidv4().slice(0, 8)}`;

    this.consensusEngine.createSession(sessionId, {
      strategy,
      requiredVoters: agentIds
    });

    const results = await this.dispatchParallel(agentIds, task);

    for (const result of results) {
      if (result.status === 'completed' && result.result?.result) {
        const decision = result.result.result.recommendation?.action ||
                        result.result.result.decision?.action ||
                        result.result.result.decision ||
                        'UNKNOWN';
        const confidence = result.result.result.confidence ||
                          result.result.result.recommendation?.confidence ||
                          0.5;

        this.consensusEngine.vote(sessionId, result.agentId, decision, confidence,
          result.result.result.summary || '');
      }
    }

    const consensus = this.consensusEngine.evaluate(sessionId);

    return {
      sessionId,
      consensus,
      agentResults: results,
      timestamp: new Date().toISOString()
    };
  }

  getStats() {
    return {
      ...this.stats,
      consensus: this.consensusEngine.getStats()
    };
  }
}

let instance = null;

export function getAgentCoordinator(orchestrator) {
  if (!instance && orchestrator) {
    instance = new AgentCoordinator(orchestrator);
  }
  return instance;
}

export default { AgentCoordinator, getAgentCoordinator };
