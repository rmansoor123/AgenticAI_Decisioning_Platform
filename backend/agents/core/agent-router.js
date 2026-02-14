/**
 * Agent Router - Dynamic task routing based on capability, load, and performance
 */

class AgentRouter {
  constructor() {
    this.capabilities = new Map();
    this.performance = new Map();
    this.load = new Map();
  }

  registerAgent(agentId, capabilities = []) {
    this.capabilities.set(agentId, new Set(capabilities));
    if (!this.performance.has(agentId)) {
      this.performance.set(agentId, { successes: 0, failures: 0, avgDuration: 0, totalTasks: 0 });
    }
    if (!this.load.has(agentId)) {
      this.load.set(agentId, 0);
    }
  }

  route(taskType) {
    const candidates = [];
    for (const [agentId, caps] of this.capabilities) {
      if (caps.has(taskType)) {
        const perf = this.performance.get(agentId) || { successes: 0, failures: 0, totalTasks: 0 };
        const currentLoad = this.load.get(agentId) || 0;
        const successRate = perf.totalTasks > 0 ? perf.successes / perf.totalTasks : 0.5;
        candidates.push({
          agentId,
          score: successRate * 0.6 + (1 / (currentLoad + 1)) * 0.4,
          currentLoad,
          successRate
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  taskStarted(agentId) {
    this.load.set(agentId, (this.load.get(agentId) || 0) + 1);
  }

  taskCompleted(agentId, success, durationMs) {
    this.load.set(agentId, Math.max(0, (this.load.get(agentId) || 1) - 1));
    const perf = this.performance.get(agentId) || { successes: 0, failures: 0, avgDuration: 0, totalTasks: 0 };
    perf.totalTasks++;
    if (success) perf.successes++;
    else perf.failures++;
    perf.avgDuration = (perf.avgDuration * (perf.totalTasks - 1) + durationMs) / perf.totalTasks;
    this.performance.set(agentId, perf);
  }

  getStats() {
    return {
      agents: Array.from(this.capabilities.entries()).map(([id, caps]) => ({
        agentId: id,
        capabilities: Array.from(caps),
        performance: this.performance.get(id),
        currentLoad: this.load.get(id) || 0
      }))
    };
  }
}

let instance = null;

export function getAgentRouter() {
  if (!instance) {
    instance = new AgentRouter();
  }
  return instance;
}

export default { AgentRouter, getAgentRouter };
