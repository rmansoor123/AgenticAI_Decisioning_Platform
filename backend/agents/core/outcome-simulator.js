/**
 * Outcome Simulator — Generates simulated outcomes for agent decisions.
 *
 * After every agent decision, schedules a simulated outcome with probabilistic
 * weighting based on decision quality. Emits 'agent:outcome:received' events
 * for the feedback pipeline to process.
 */

let eventBus = null;
try {
  const module = await import('../../gateway/websocket/event-bus.js');
  eventBus = module.getEventBus();
} catch (e) {
  // Event bus not available
}

const OUTCOME_TYPES = {
  CONFIRMED_FRAUD: 'confirmed_fraud',
  LEGITIMATE: 'legitimate',
  FALSE_POSITIVE: 'false_positive',
  FALSE_NEGATIVE: 'false_negative',
  INCONCLUSIVE: 'inconclusive'
};

class OutcomeSimulator {
  constructor() {
    this.pendingOutcomes = new Map();
    this.stats = {
      totalSimulated: 0,
      outcomes: {
        confirmed_fraud: 0,
        legitimate: 0,
        false_positive: 0,
        false_negative: 0,
        inconclusive: 0
      }
    };
    console.log('[OutcomeSimulator] Initialized');
  }

  /**
   * Schedule a simulated outcome for a decision.
   * @param {Object} decision - { agentId, decisionId, action, riskScore, confidence, evidence }
   */
  scheduleOutcome(decision) {
    const { agentId, decisionId, action, riskScore = 50, confidence = 0.5 } = decision;

    const delayMs = Math.floor(Math.random() * 5000); // 0-5 seconds
    const outcome = this._generateOutcome(action, riskScore, confidence);

    const timeoutId = setTimeout(() => {
      this._emitOutcome(agentId, decisionId, decision, outcome);
      this.pendingOutcomes.delete(decisionId);
    }, delayMs);

    this.pendingOutcomes.set(decisionId, { timeoutId, decision, outcome });
    return { decisionId, scheduledOutcome: outcome, delayMs };
  }

  /**
   * Generate a probabilistic outcome based on decision quality.
   */
  _generateOutcome(action, riskScore, confidence) {
    const roll = Math.random();

    if (action === 'REJECT' || action === 'BLOCK') {
      if (riskScore > 80) {
        return roll < 0.85 ? OUTCOME_TYPES.CONFIRMED_FRAUD : OUTCOME_TYPES.FALSE_POSITIVE;
      } else if (riskScore > 50) {
        return roll < 0.65 ? OUTCOME_TYPES.CONFIRMED_FRAUD : (roll < 0.85 ? OUTCOME_TYPES.FALSE_POSITIVE : OUTCOME_TYPES.INCONCLUSIVE);
      } else {
        return roll < 0.30 ? OUTCOME_TYPES.CONFIRMED_FRAUD : OUTCOME_TYPES.FALSE_POSITIVE;
      }
    }

    if (action === 'APPROVE') {
      if (riskScore < 30) {
        return roll < 0.90 ? OUTCOME_TYPES.LEGITIMATE : OUTCOME_TYPES.FALSE_NEGATIVE;
      } else if (riskScore < 60) {
        return roll < 0.70 ? OUTCOME_TYPES.LEGITIMATE : (roll < 0.85 ? OUTCOME_TYPES.FALSE_NEGATIVE : OUTCOME_TYPES.INCONCLUSIVE);
      } else {
        return roll < 0.40 ? OUTCOME_TYPES.LEGITIMATE : OUTCOME_TYPES.FALSE_NEGATIVE;
      }
    }

    if (action === 'REVIEW' || action === 'MONITOR') {
      if (roll < 0.40) return OUTCOME_TYPES.LEGITIMATE;
      if (roll < 0.75) return OUTCOME_TYPES.CONFIRMED_FRAUD;
      return OUTCOME_TYPES.INCONCLUSIVE;
    }

    return OUTCOME_TYPES.INCONCLUSIVE;
  }

  /**
   * Emit the outcome event.
   */
  _emitOutcome(agentId, decisionId, originalDecision, outcome) {
    this.stats.totalSimulated++;
    this.stats.outcomes[outcome] = (this.stats.outcomes[outcome] || 0) + 1;

    const wasCorrect = this._evaluateCorrectness(originalDecision.action, outcome);

    const payload = {
      agentId,
      decisionId,
      originalDecision: {
        action: originalDecision.action,
        riskScore: originalDecision.riskScore,
        confidence: originalDecision.confidence
      },
      outcome,
      wasCorrect,
      timestamp: new Date().toISOString()
    };

    if (eventBus) {
      eventBus.publish('agent:outcome:received', payload);
    }

    return payload;
  }

  /**
   * Determine if the decision was correct given the outcome.
   */
  _evaluateCorrectness(action, outcome) {
    if ((action === 'REJECT' || action === 'BLOCK') && outcome === OUTCOME_TYPES.CONFIRMED_FRAUD) return true;
    if (action === 'APPROVE' && outcome === OUTCOME_TYPES.LEGITIMATE) return true;
    if ((action === 'REJECT' || action === 'BLOCK') && outcome === OUTCOME_TYPES.FALSE_POSITIVE) return false;
    if (action === 'APPROVE' && outcome === OUTCOME_TYPES.FALSE_NEGATIVE) return false;
    return null; // Inconclusive or REVIEW
  }

  getStats() {
    return {
      ...this.stats,
      pendingOutcomes: this.pendingOutcomes.size
    };
  }

  /**
   * Cancel all pending outcomes (for cleanup/testing).
   */
  cancelAll() {
    for (const [, entry] of this.pendingOutcomes) {
      clearTimeout(entry.timeoutId);
    }
    this.pendingOutcomes.clear();
  }
}

// Singleton
let instance = null;

export function getOutcomeSimulator() {
  if (!instance) {
    instance = new OutcomeSimulator();
  }
  return instance;
}

export { OUTCOME_TYPES };
export default { getOutcomeSimulator, OUTCOME_TYPES };
