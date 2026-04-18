/**
 * RL Trainer — learns from agent trajectories to improve decision policies.
 *
 * Implements:
 * - Policy Gradient (REINFORCE-style): weight actions by reward
 * - DPO (Direct Preference Optimization): learn from preferred vs rejected trajectories
 * - Reward-Weighted Regression: fit policy to high-reward actions
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

class RLTrainer {
  constructor() {
    this.policies = new Map(); // domain -> learned action preferences
    this.stats = { trainingRuns: 0, trajectoriesProcessed: 0, policyUpdates: 0 };
  }

  /**
   * Train from trajectories using reward-weighted learning.
   * Higher reward actions get higher weight in the policy.
   */
  async trainFromTrajectories(trajectories, domain = 'fraud_investigation') {
    const startTime = Date.now();

    if (!this.policies.has(domain)) {
      this.policies.set(domain, { actionWeights: {}, totalReward: 0, episodes: 0 });
    }
    const policy = this.policies.get(domain);

    let totalReward = 0;
    let updates = 0;

    for (const trajectory of trajectories) {
      const steps = trajectory.trajectory || trajectory;
      if (!Array.isArray(steps)) continue;

      const episodeReward = steps.reduce((s, step) => s + (step.reward || 0), 0);
      totalReward += episodeReward;

      // Reward-weighted action update
      for (const step of steps) {
        const action = step.action;
        if (!action) continue;

        if (!policy.actionWeights[action]) {
          policy.actionWeights[action] = { weight: 0, count: 0, avgReward: 0, totalReward: 0 };
        }

        const aw = policy.actionWeights[action];
        aw.count++;
        aw.totalReward += step.reward || 0;
        aw.avgReward = aw.totalReward / aw.count;

        // Policy gradient update: weight = exponential moving average of reward
        const learningRate = 0.1;
        aw.weight = aw.weight * (1 - learningRate) + (step.reward || 0) * learningRate;
        updates++;
      }

      policy.episodes++;
      this.stats.trajectoriesProcessed++;
    }

    policy.totalReward += totalReward;
    this.stats.trainingRuns++;
    this.stats.policyUpdates += updates;

    // Normalize weights to probabilities
    const normalizedPolicy = this._normalizePolicy(policy);

    // Persist
    const db_ops = getDbOps();
    const runId = `TRAIN-${Date.now().toString(36).toUpperCase()}`;
    try {
      await db_ops.insert('rl_training_runs', 'run_id', runId, {
        runId, domain,
        trajectoriesUsed: trajectories.length,
        totalReward, updates,
        policy: normalizedPolicy,
        createdAt: new Date().toISOString()
      });
    } catch (_) {}

    return {
      runId, domain,
      trajectoriesProcessed: trajectories.length,
      totalReward: Math.round(totalReward * 100) / 100,
      policyUpdates: updates,
      learnedPolicy: normalizedPolicy,
      latencyMs: Date.now() - startTime
    };
  }

  /**
   * DPO — learn from preferred vs rejected trajectory pairs.
   */
  async trainDPO(preferredTrajectory, rejectedTrajectory, domain = 'fraud_investigation') {
    if (!this.policies.has(domain)) {
      this.policies.set(domain, { actionWeights: {}, totalReward: 0, episodes: 0 });
    }
    const policy = this.policies.get(domain);

    // Upweight actions from preferred, downweight from rejected
    const preferred = preferredTrajectory.trajectory || preferredTrajectory;
    const rejected = rejectedTrajectory.trajectory || rejectedTrajectory;

    for (const step of (Array.isArray(preferred) ? preferred : [])) {
      if (!step.action) continue;
      if (!policy.actionWeights[step.action]) policy.actionWeights[step.action] = { weight: 0, count: 0, avgReward: 0, totalReward: 0 };
      policy.actionWeights[step.action].weight += 0.5; // boost preferred
      policy.actionWeights[step.action].count++;
    }

    for (const step of (Array.isArray(rejected) ? rejected : [])) {
      if (!step.action) continue;
      if (!policy.actionWeights[step.action]) policy.actionWeights[step.action] = { weight: 0, count: 0, avgReward: 0, totalReward: 0 };
      policy.actionWeights[step.action].weight -= 0.3; // penalize rejected
      policy.actionWeights[step.action].count++;
    }

    this.stats.trainingRuns++;
    this.stats.trajectoriesProcessed += 2;

    return {
      domain, method: 'DPO',
      preferredActions: (Array.isArray(preferred) ? preferred : []).map(s => s.action).filter(Boolean),
      rejectedActions: (Array.isArray(rejected) ? rejected : []).map(s => s.action).filter(Boolean),
      updatedPolicy: this._normalizePolicy(policy)
    };
  }

  /**
   * Get the learned policy for a domain — which actions to prefer.
   */
  getPolicy(domain) {
    const policy = this.policies.get(domain);
    if (!policy) return null;
    return this._normalizePolicy(policy);
  }

  /**
   * Use the learned policy to select an action (for agent improvement).
   */
  selectAction(domain, state, availableActions) {
    const policy = this.policies.get(domain);
    if (!policy || Object.keys(policy.actionWeights).length === 0) {
      // Random if no policy learned
      return availableActions[Math.floor(Math.random() * availableActions.length)];
    }

    // Weighted selection based on learned weights
    const weights = availableActions.map(a => {
      const aw = policy.actionWeights[a];
      return Math.max(0.01, aw ? aw.weight + 1 : 0.5); // add 1 to avoid negatives
    });
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < availableActions.length; i++) {
      random -= weights[i];
      if (random <= 0) return availableActions[i];
    }
    return availableActions[availableActions.length - 1];
  }

  _normalizePolicy(policy) {
    const entries = Object.entries(policy.actionWeights);
    if (entries.length === 0) return { actions: [], episodes: policy.episodes };

    const maxWeight = Math.max(...entries.map(([, v]) => Math.abs(v.weight)));
    const normalized = entries
      .map(([action, data]) => ({
        action,
        weight: Math.round((data.weight / (maxWeight || 1)) * 1000) / 1000,
        count: data.count,
        avgReward: Math.round(data.avgReward * 100) / 100,
        preference: data.weight > 0.3 ? 'PREFERRED' : data.weight < -0.1 ? 'AVOIDED' : 'NEUTRAL'
      }))
      .sort((a, b) => b.weight - a.weight);

    return { actions: normalized, episodes: policy.episodes, totalActions: entries.length };
  }

  getStats() { return { ...this.stats, domains: Array.from(this.policies.keys()) }; }
}

let instance = null;
export function getRLTrainer() {
  if (!instance) instance = new RLTrainer();
  return instance;
}
export default { RLTrainer, getRLTrainer };
