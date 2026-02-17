/**
 * Policy Engine — Enforces hard and soft policies on agent decisions.
 *
 * Hard policies: block the decision and escalate to human.
 * Soft policies: flag the decision but allow it to proceed.
 * Guardrails: safety limits on LLM behavior.
 */

let eventBus = null;
try {
  const module = await import('../../gateway/websocket/event-bus.js');
  eventBus = module.getEventBus();
} catch (e) {
  // Event bus not available
}

const POLICY_TYPES = { HARD: 'hard', SOFT: 'soft' };
const ACTIONS = { BLOCK: 'block', ESCALATE: 'escalate', FLAG: 'flag', LOG: 'log' };

// Default policy set
const DEFAULT_POLICIES = [
  // ========== HARD POLICIES ==========
  {
    policyId: 'POL-001',
    name: 'sanctions-hard-block',
    type: POLICY_TYPES.HARD,
    action: ACTIONS.BLOCK,
    message: 'Cannot approve: sanctions/watchlist match detected',
    condition: (decision, evidence) => {
      if (decision.action !== 'APPROVE') return false;
      return evidence.some(e =>
        e.source === 'screen_watchlist' && e.data &&
        (e.data.sanctionsMatch || e.data.pepMatch || e.data.watchlistMatch)
      );
    }
  },
  {
    policyId: 'POL-002',
    name: 'kyc-failure-block',
    type: POLICY_TYPES.HARD,
    action: ACTIONS.BLOCK,
    message: 'Cannot approve: KYC verification failed',
    condition: (decision, evidence) => {
      if (decision.action !== 'APPROVE') return false;
      return evidence.some(e =>
        e.source === 'verify_identity' && e.data && !e.data.verified
      );
    }
  },
  {
    policyId: 'POL-003',
    name: 'duplicate-fraud-block',
    type: POLICY_TYPES.HARD,
    action: ACTIONS.BLOCK,
    message: 'Cannot approve: duplicate account with prior fraud detected',
    condition: (decision, evidence) => {
      if (decision.action !== 'APPROVE') return false;
      return evidence.some(e =>
        e.source === 'check_duplicates' && e.data?.isDuplicate &&
        e.data.duplicates?.some(d => d.riskTier === 'CRITICAL' || d.status === 'BLOCKED')
      );
    }
  },
  {
    policyId: 'POL-004',
    name: 'low-confidence-escalate',
    type: POLICY_TYPES.HARD,
    action: ACTIONS.ESCALATE,
    message: 'LLM confidence too low — escalating to human',
    condition: (decision) => {
      return decision.confidence !== undefined && decision.confidence < 0.3;
    }
  },
  {
    policyId: 'POL-005',
    name: 'high-risk-approve-block',
    type: POLICY_TYPES.HARD,
    action: ACTIONS.BLOCK,
    message: 'Cannot auto-approve: risk score exceeds threshold',
    condition: (decision, evidence, context) => {
      if (decision.action !== 'APPROVE') return false;
      const riskScore = context.riskScore || 0;
      const threshold = context.thresholds?.AUTO_REJECT_MIN_RISK || 80;
      return riskScore > threshold;
    }
  },

  // ========== SOFT POLICIES ==========
  {
    policyId: 'POL-101',
    name: 'pattern-override-flag',
    type: POLICY_TYPES.SOFT,
    action: ACTIONS.FLAG,
    message: 'Agent overrides pattern memory recommendation',
    condition: (decision, evidence, context) => {
      const patternRec = context.patternRecommendation;
      if (!patternRec || patternRec === 'UNKNOWN') return false;
      return decision.action !== patternRec;
    }
  },
  {
    policyId: 'POL-102',
    name: 'many-critical-factors-flag',
    type: POLICY_TYPES.SOFT,
    action: ACTIONS.FLAG,
    message: 'Case has >3 critical risk factors but decision is not REJECT',
    condition: (decision, evidence, context) => {
      if (decision.action === 'REJECT' || decision.action === 'BLOCK') return false;
      const criticalCount = context.criticalFactors || 0;
      return criticalCount > 3;
    }
  },
  {
    policyId: 'POL-103',
    name: 'uncertainty-language-flag',
    type: POLICY_TYPES.SOFT,
    action: ACTIONS.LOG,
    message: 'LLM reasoning contains uncertainty language',
    condition: (decision) => {
      const reasoning = decision.reasoning || decision.reason || '';
      const uncertainPhrases = ["I'm not sure", "possibly", "might be", "uncertain", "unclear"];
      return uncertainPhrases.some(phrase => reasoning.toLowerCase().includes(phrase));
    }
  }
];

// LLM behavior guardrails
const GUARDRAILS = {
  MAX_TOOL_CALLS_PER_CYCLE: 10,
  MAX_LLM_CALLS_PER_DECISION: 5,
  MAX_TOKENS_PER_DECISION: 8000
};

class PolicyEngine {
  constructor(policies = DEFAULT_POLICIES) {
    this.policies = [...policies];
    this.stats = {
      evaluations: 0,
      hardViolations: 0,
      softViolations: 0,
      cleanPasses: 0
    };
    this.violationLog = [];
    console.log(`[PolicyEngine] Initialized with ${this.policies.length} policies`);
  }

  /**
   * Enforce policies on a proposed decision.
   * @param {Object} decision - { action, confidence, reason/reasoning }
   * @param {Array} evidence - Array of { source, data, success }
   * @param {Object} context - { riskScore, thresholds, patternRecommendation, criticalFactors }
   * @returns {Object} { allowed, violations, flags, originalDecision, enforcedDecision }
   */
  enforce(decision, evidence = [], context = {}) {
    this.stats.evaluations++;

    const hardViolations = [];
    const softViolations = [];

    for (const policy of this.policies) {
      try {
        if (policy.condition(decision, evidence, context)) {
          const violation = {
            policyId: policy.policyId,
            name: policy.name,
            type: policy.type,
            action: policy.action,
            message: policy.message,
            timestamp: new Date().toISOString()
          };

          if (policy.type === POLICY_TYPES.HARD) {
            hardViolations.push(violation);
          } else {
            softViolations.push(violation);
          }
        }
      } catch (e) {
        // Policy evaluation error — skip this policy
      }
    }

    // Log violations
    const allViolations = [...hardViolations, ...softViolations];
    if (allViolations.length > 0) {
      this.violationLog.push({
        decision: decision.action,
        violations: allViolations,
        timestamp: new Date().toISOString()
      });
      if (this.violationLog.length > 500) {
        this.violationLog = this.violationLog.slice(-250);
      }
    }

    // Emit policy events
    for (const v of allViolations) {
      if (eventBus) {
        eventBus.publish('policy:violation', {
          ...v,
          agentDecision: decision.action,
          riskScore: context.riskScore
        });
      }
    }

    if (hardViolations.length > 0) {
      this.stats.hardViolations++;

      // Hard violation: override decision
      const enforcedDecision = {
        ...decision,
        action: 'REVIEW',
        originalAction: decision.action,
        overriddenBy: hardViolations.map(v => v.policyId),
        policyViolations: hardViolations,
        escalated: true,
        escalationReason: hardViolations.map(v => v.message).join('; ')
      };

      return {
        allowed: false,
        violations: hardViolations,
        flags: softViolations,
        originalDecision: decision,
        enforcedDecision
      };
    }

    if (softViolations.length > 0) {
      this.stats.softViolations++;
    } else {
      this.stats.cleanPasses++;
    }

    return {
      allowed: true,
      violations: [],
      flags: softViolations,
      originalDecision: decision,
      enforcedDecision: {
        ...decision,
        policyFlags: softViolations.length > 0 ? softViolations : undefined
      }
    };
  }

  /**
   * Check guardrails (called during reasoning).
   */
  checkGuardrails(metrics) {
    const violations = [];

    if (metrics.toolCalls > GUARDRAILS.MAX_TOOL_CALLS_PER_CYCLE) {
      violations.push(`Tool call limit exceeded: ${metrics.toolCalls}/${GUARDRAILS.MAX_TOOL_CALLS_PER_CYCLE}`);
    }
    if (metrics.llmCalls > GUARDRAILS.MAX_LLM_CALLS_PER_DECISION) {
      violations.push(`LLM call limit exceeded: ${metrics.llmCalls}/${GUARDRAILS.MAX_LLM_CALLS_PER_DECISION}`);
    }
    if (metrics.totalTokens > GUARDRAILS.MAX_TOKENS_PER_DECISION) {
      violations.push(`Token budget exceeded: ${metrics.totalTokens}/${GUARDRAILS.MAX_TOKENS_PER_DECISION}`);
    }

    return { safe: violations.length === 0, violations };
  }

  /**
   * Add a custom policy.
   */
  addPolicy(policy) {
    if (!policy.policyId || !policy.condition) {
      throw new Error('Policy must have policyId and condition');
    }
    this.policies.push(policy);
  }

  getStats() {
    return {
      ...this.stats,
      policyCount: this.policies.length,
      hardPolicies: this.policies.filter(p => p.type === POLICY_TYPES.HARD).length,
      softPolicies: this.policies.filter(p => p.type === POLICY_TYPES.SOFT).length,
      recentViolations: this.violationLog.slice(-5),
      guardrails: GUARDRAILS
    };
  }
}

// Singleton
let instance = null;

export function getPolicyEngine() {
  if (!instance) {
    instance = new PolicyEngine();
  }
  return instance;
}

export { POLICY_TYPES, ACTIONS, GUARDRAILS };
export default { getPolicyEngine, POLICY_TYPES, ACTIONS, GUARDRAILS };
