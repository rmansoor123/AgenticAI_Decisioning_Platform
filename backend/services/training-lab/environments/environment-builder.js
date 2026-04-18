/**
 * RL Environment Builder — define state spaces, action spaces,
 * reward functions for agent evaluation and post-training.
 *
 * Environments simulate real-world workflows that agents must navigate:
 * - Fraud investigation workflow
 * - Credit underwriting workflow
 * - Seller onboarding workflow
 * - Payment processing workflow
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

class EnvironmentBuilder {
  constructor() {
    this.environments = new Map();
    this.stats = { created: 0, runs: 0, totalSteps: 0 };
  }

  /**
   * Create a new RL environment.
   */
  create(config) {
    const { envId, name, description, domain, stateSpace, actionSpace, rewardFunction,
            maxSteps = 50, difficulty = 'MEDIUM', metadata = {} } = config;

    const env = {
      envId: envId || `ENV-${Date.now().toString(36).toUpperCase()}`,
      name, description, domain,
      stateSpace: stateSpace || this._getDefaultStateSpace(domain),
      actionSpace: actionSpace || this._getDefaultActionSpace(domain),
      rewardFunction: rewardFunction || this._getDefaultRewardFunction(domain),
      maxSteps, difficulty, metadata,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      runCount: 0, avgReward: 0, avgSteps: 0
    };

    this.environments.set(env.envId, env);
    this.stats.created++;
    return env;
  }

  /**
   * Run an episode in the environment.
   */
  async runEpisode(envId, agent = null) {
    const env = this.environments.get(envId);
    if (!env) throw new Error(`Environment ${envId} not found`);

    const startTime = Date.now();
    const trajectory = [];
    let state = this._initializeState(env);
    let totalReward = 0;
    let done = false;
    let step = 0;

    while (!done && step < env.maxSteps) {
      // Get action (from agent or random)
      const action = agent ? await agent(state, env.actionSpace) : this._randomAction(env.actionSpace);

      // Apply action to get next state + reward
      const { nextState, reward, terminated, info } = this._step(env, state, action, step);

      trajectory.push({
        step, state: { ...state }, action, reward,
        nextState: { ...nextState }, terminated, info,
        timestamp: new Date().toISOString()
      });

      totalReward += reward;
      state = nextState;
      done = terminated;
      step++;
    }

    this.stats.runs++;
    this.stats.totalSteps += step;
    env.runCount++;
    env.avgReward = Math.round(((env.avgReward * (env.runCount - 1) + totalReward) / env.runCount) * 100) / 100;
    env.avgSteps = Math.round(((env.avgSteps * (env.runCount - 1) + step) / env.runCount) * 100) / 100;

    const episodeId = `EP-${Date.now().toString(36).toUpperCase()}`;

    // Persist trajectory
    const db_ops = getDbOps();
    try {
      await db_ops.insert('rl_episodes', 'episode_id', episodeId, {
        episodeId, envId, totalReward, steps: step, done,
        trajectory: trajectory.slice(0, 100), // cap storage
        createdAt: new Date().toISOString()
      });
    } catch (_) {}

    return {
      episodeId, envId, totalReward: Math.round(totalReward * 100) / 100,
      steps: step, completed: done,
      trajectory, latencyMs: Date.now() - startTime
    };
  }

  _getDefaultStateSpace(domain) {
    const spaces = {
      'fraud_investigation': {
        dimensions: ['riskScore', 'evidenceCount', 'toolsUsed', 'timeElapsed', 'confidenceLevel', 'escalationStatus'],
        ranges: { riskScore: [0, 100], evidenceCount: [0, 20], toolsUsed: [0, 15], timeElapsed: [0, 300], confidenceLevel: [0, 1], escalationStatus: [0, 3] }
      },
      'credit_underwriting': {
        dimensions: ['creditScore', 'gmv30d', 'accountAge', 'riskScore', 'documentVerification', 'fraudRate'],
        ranges: { creditScore: [0, 850], gmv30d: [0, 1000000], accountAge: [0, 3650], riskScore: [0, 100], documentVerification: [0, 1], fraudRate: [0, 0.5] }
      },
      'seller_onboarding': {
        dimensions: ['kycStatus', 'businessVerified', 'bankVerified', 'watchlistCleared', 'riskScore', 'documentsSubmitted'],
        ranges: { kycStatus: [0, 1], businessVerified: [0, 1], bankVerified: [0, 1], watchlistCleared: [0, 1], riskScore: [0, 100], documentsSubmitted: [0, 10] }
      },
      'payment_processing': {
        dimensions: ['amount', 'riskScore', 'velocityScore', 'deviceTrust', 'countryRisk', 'authStatus'],
        ranges: { amount: [0, 100000], riskScore: [0, 100], velocityScore: [0, 100], deviceTrust: [0, 1], countryRisk: [0, 1], authStatus: [0, 3] }
      }
    };
    return spaces[domain] || spaces['fraud_investigation'];
  }

  _getDefaultActionSpace(domain) {
    const actions = {
      'fraud_investigation': [
        'CHECK_IDENTITY', 'CHECK_FRAUD_DB', 'CHECK_WATCHLIST', 'VERIFY_BUSINESS',
        'CHECK_DEVICE', 'CHECK_IP', 'ESCALATE', 'APPROVE', 'REJECT', 'HOLD',
        'REQUEST_DOCUMENTS', 'CALL_SELLER', 'CHECK_NETWORK', 'RUN_ML_INFERENCE'
      ],
      'credit_underwriting': [
        'CHECK_CREDIT_BUREAU', 'VERIFY_INCOME', 'CHECK_BANK_STATEMENTS', 'CALCULATE_DTI',
        'RUN_SCORING_MODEL', 'APPROVE_CREDIT', 'DENY_CREDIT', 'REQUEST_COLLATERAL',
        'SET_TIER_A', 'SET_TIER_B', 'SET_TIER_C', 'ESCALATE_TO_MANUAL'
      ],
      'seller_onboarding': [
        'VERIFY_IDENTITY', 'VERIFY_EMAIL', 'CHECK_BUSINESS', 'SCREEN_WATCHLIST',
        'VERIFY_BANK', 'CHECK_DUPLICATES', 'RUN_ML_MODEL', 'APPROVE', 'REJECT',
        'REQUEST_MORE_INFO', 'ESCALATE', 'FLAG_FOR_REVIEW'
      ],
      'payment_processing': [
        'AUTHORIZE', 'CAPTURE', 'HOLD', 'DECLINE', 'FLAG_FRAUD',
        'CHECK_VELOCITY', 'CHECK_DEVICE', 'THREE_D_SECURE', 'RELEASE', 'REFUND'
      ]
    };
    return actions[domain] || actions['fraud_investigation'];
  }

  _getDefaultRewardFunction(domain) {
    return {
      correctDecision: 10,
      wrongDecision: -20,
      efficientPath: 5,     // bonus for fewer steps
      unnecessaryStep: -1,  // penalty for each extra step
      falsePositive: -15,   // blocked legitimate user
      falseNegative: -25,   // missed fraud
      escalation: -2,       // slight penalty for not being autonomous
      timeBonus: 3          // bonus for fast resolution
    };
  }

  _initializeState(env) {
    const state = {};
    for (const dim of env.stateSpace.dimensions) {
      const range = env.stateSpace.ranges[dim] || [0, 1];
      state[dim] = range[0] + Math.random() * (range[1] - range[0]);
      // Round to 2 decimal places
      state[dim] = Math.round(state[dim] * 100) / 100;
    }
    return state;
  }

  _randomAction(actionSpace) {
    return actionSpace[Math.floor(Math.random() * actionSpace.length)];
  }

  _step(env, state, action, stepNum) {
    const rf = env.rewardFunction;
    let reward = rf.unnecessaryStep; // base penalty per step
    let terminated = false;
    const nextState = { ...state };
    const info = { action, stepNum };

    // Terminal actions
    if (['APPROVE', 'REJECT', 'APPROVE_CREDIT', 'DENY_CREDIT', 'AUTHORIZE', 'DECLINE'].includes(action)) {
      terminated = true;

      // Reward based on decision quality
      const isHighRisk = state.riskScore > 70;
      const isRejectAction = ['REJECT', 'DENY_CREDIT', 'DECLINE'].includes(action);

      if (isHighRisk && isRejectAction) {
        reward = rf.correctDecision; // correctly caught risk
        info.outcome = 'TRUE_POSITIVE';
      } else if (!isHighRisk && !isRejectAction) {
        reward = rf.correctDecision; // correctly approved
        info.outcome = 'TRUE_NEGATIVE';
      } else if (!isHighRisk && isRejectAction) {
        reward = rf.falsePositive; // blocked legitimate
        info.outcome = 'FALSE_POSITIVE';
      } else {
        reward = rf.falseNegative; // missed risk
        info.outcome = 'FALSE_NEGATIVE';
      }

      // Efficiency bonus
      if (stepNum < env.maxSteps * 0.3) reward += rf.efficientPath;
      if (stepNum < env.maxSteps * 0.1) reward += rf.timeBonus;
    } else if (action === 'ESCALATE' || action === 'ESCALATE_TO_MANUAL') {
      reward = rf.escalation;
      terminated = true;
      info.outcome = 'ESCALATED';
    } else {
      // Information-gathering actions
      // Update state based on action
      if (action.includes('CHECK') || action.includes('VERIFY')) {
        nextState.evidenceCount = (state.evidenceCount || 0) + 1;
        nextState.confidenceLevel = Math.min(1, (state.confidenceLevel || 0) + 0.1);
        reward += 1; // small bonus for gathering evidence
      }
      if (action === 'RUN_ML_INFERENCE' || action === 'RUN_ML_MODEL' || action === 'RUN_SCORING_MODEL') {
        nextState.confidenceLevel = Math.min(1, (state.confidenceLevel || 0) + 0.25);
        reward += 2; // good action
      }
    }

    return { nextState, reward: Math.round(reward * 100) / 100, terminated, info };
  }

  getEnvironment(envId) { return this.environments.get(envId); }
  listEnvironments() { return Array.from(this.environments.values()).map(e => ({ envId: e.envId, name: e.name, domain: e.domain, difficulty: e.difficulty, status: e.status, runCount: e.runCount, avgReward: e.avgReward })); }
  getStats() { return { ...this.stats, activeEnvironments: this.environments.size }; }
}

let instance = null;
export function getEnvironmentBuilder() {
  if (!instance) instance = new EnvironmentBuilder();
  return instance;
}
export default { EnvironmentBuilder, getEnvironmentBuilder };
