/**
 * Reward System — configurable reward functions for RL training.
 * Verifiers validate agent trajectories and compute scores.
 */

class RewardSystem {
  constructor() {
    this.rewardConfigs = new Map();
    this.stats = { evaluated: 0, totalReward: 0 };
    this._seedDefaults();
  }

  _seedDefaults() {
    this.rewardConfigs.set('fraud_investigation', {
      name: 'Fraud Investigation Rewards',
      rewards: {
        TRUE_POSITIVE: { value: 10, description: 'Correctly identified fraud' },
        TRUE_NEGATIVE: { value: 8, description: 'Correctly approved legitimate' },
        FALSE_POSITIVE: { value: -15, description: 'Blocked legitimate user' },
        FALSE_NEGATIVE: { value: -25, description: 'Missed actual fraud' },
        EFFICIENT_RESOLUTION: { value: 5, description: 'Resolved in <5 steps' },
        EXCESSIVE_STEPS: { value: -2, description: 'Took >15 steps' },
        EVIDENCE_GATHERED: { value: 1, description: 'Per relevant evidence collected' },
        UNNECESSARY_ESCALATION: { value: -3, description: 'Escalated when autonomous was possible' },
        COMPLIANCE_VIOLATION: { value: -20, description: 'Violated a policy rule' }
      }
    });

    this.rewardConfigs.set('credit_underwriting', {
      name: 'Credit Underwriting Rewards',
      rewards: {
        CORRECT_APPROVAL: { value: 10, description: 'Approved creditworthy seller' },
        CORRECT_DENIAL: { value: 8, description: 'Denied high-risk seller' },
        BAD_APPROVAL: { value: -20, description: 'Approved seller who defaulted' },
        MISSED_OPPORTUNITY: { value: -5, description: 'Denied creditworthy seller' },
        CORRECT_TIER: { value: 5, description: 'Assigned correct interest tier' },
        WRONG_TIER: { value: -5, description: 'Assigned incorrect tier' },
        THOROUGH_ANALYSIS: { value: 3, description: 'Checked all required factors' }
      }
    });

    this.rewardConfigs.set('payment_processing', {
      name: 'Payment Processing Rewards',
      rewards: {
        CORRECT_AUTHORIZE: { value: 8, description: 'Correctly authorized payment' },
        CORRECT_DECLINE: { value: 10, description: 'Correctly declined fraudulent payment' },
        FALSE_DECLINE: { value: -15, description: 'Declined legitimate payment' },
        MISSED_FRAUD: { value: -25, description: 'Authorized fraudulent payment' },
        FAST_PROCESSING: { value: 3, description: 'Processed in <100ms' },
        SCA_COMPLIANT: { value: 2, description: 'Applied Strong Customer Authentication when required' }
      }
    });
  }

  /**
   * Evaluate a trajectory and compute total reward.
   */
  evaluate(trajectory, domain = 'fraud_investigation') {
    const config = this.rewardConfigs.get(domain);
    if (!config) return { error: `No reward config for domain: ${domain}` };

    let totalReward = 0;
    const breakdown = [];

    for (const step of trajectory) {
      const outcome = step.info?.outcome;
      if (outcome && config.rewards[outcome]) {
        const r = config.rewards[outcome];
        totalReward += r.value;
        breakdown.push({ step: step.step, outcome, reward: r.value, description: r.description });
      }
    }

    // Efficiency bonuses
    if (trajectory.length < 5 && config.rewards.EFFICIENT_RESOLUTION) {
      totalReward += config.rewards.EFFICIENT_RESOLUTION.value;
      breakdown.push({ outcome: 'EFFICIENT_RESOLUTION', reward: config.rewards.EFFICIENT_RESOLUTION.value });
    }
    if (trajectory.length > 15 && config.rewards.EXCESSIVE_STEPS) {
      totalReward += config.rewards.EXCESSIVE_STEPS.value;
      breakdown.push({ outcome: 'EXCESSIVE_STEPS', reward: config.rewards.EXCESSIVE_STEPS.value });
    }

    // Evidence gathering bonus
    const evidenceSteps = trajectory.filter(s => s.action?.includes('CHECK') || s.action?.includes('VERIFY')).length;
    if (evidenceSteps > 0 && config.rewards.EVIDENCE_GATHERED) {
      const evidenceReward = evidenceSteps * config.rewards.EVIDENCE_GATHERED.value;
      totalReward += evidenceReward;
      breakdown.push({ outcome: 'EVIDENCE_GATHERED', reward: evidenceReward, count: evidenceSteps });
    }

    this.stats.evaluated++;
    this.stats.totalReward += totalReward;

    return {
      domain, totalReward: Math.round(totalReward * 100) / 100,
      steps: trajectory.length, breakdown,
      avgRewardPerStep: trajectory.length > 0 ? Math.round(totalReward / trajectory.length * 100) / 100 : 0
    };
  }

  /**
   * Verify a trajectory against quality rubrics.
   */
  verify(trajectory, rubric = {}) {
    const checks = [];
    const { minSteps = 2, maxSteps = 30, requireEvidence = true, requireTerminal = true } = rubric;

    // Step count check
    checks.push({
      check: 'STEP_COUNT', passed: trajectory.length >= minSteps && trajectory.length <= maxSteps,
      detail: `${trajectory.length} steps (range: ${minSteps}-${maxSteps})`
    });

    // Terminal action check
    const hasTerminal = trajectory.some(s => s.terminated);
    checks.push({
      check: 'TERMINAL_ACTION', passed: !requireTerminal || hasTerminal,
      detail: hasTerminal ? 'Agent reached a terminal state' : 'No terminal action taken'
    });

    // Evidence gathering check
    const hasEvidence = trajectory.some(s => s.action?.includes('CHECK') || s.action?.includes('VERIFY'));
    checks.push({
      check: 'EVIDENCE_GATHERED', passed: !requireEvidence || hasEvidence,
      detail: hasEvidence ? 'Agent gathered evidence before deciding' : 'No evidence gathered'
    });

    // No repeated actions
    const actions = trajectory.map(s => s.action);
    const uniqueActions = new Set(actions);
    const repetitionRate = 1 - uniqueActions.size / actions.length;
    checks.push({
      check: 'ACTION_DIVERSITY', passed: repetitionRate < 0.5,
      detail: `${uniqueActions.size}/${actions.length} unique actions (${Math.round(repetitionRate * 100)}% repetition)`
    });

    const passedAll = checks.every(c => c.passed);

    return {
      passed: passedAll, checks,
      passRate: Math.round(checks.filter(c => c.passed).length / checks.length * 100),
      verifiedAt: new Date().toISOString()
    };
  }

  getRewardConfigs() {
    const configs = {};
    for (const [domain, config] of this.rewardConfigs) {
      configs[domain] = { name: config.name, rewards: config.rewards };
    }
    return configs;
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getRewardSystem() {
  if (!instance) instance = new RewardSystem();
  return instance;
}
export default { RewardSystem, getRewardSystem };
