/**
 * Circuit Breaker - Prevents cascade failures
 *
 * States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing)
 * Opens after 5 failures in 60s, tests after 30s cooldown.
 */

const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 60 * 1000;
const COOLDOWN_MS = 30 * 1000;

const STATES = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

class CircuitBreaker {
  constructor(name) {
    this.name = name;
    this.state = STATES.CLOSED;
    this.failures = [];
    this.lastFailure = null;
    this.lastStateChange = Date.now();
    this.successCount = 0;
    this.failureCount = 0;
  }

  canExecute() {
    this._cleanOldFailures();
    if (this.state === STATES.CLOSED) return true;
    if (this.state === STATES.OPEN) {
      if (Date.now() - this.lastStateChange >= COOLDOWN_MS) {
        this.state = STATES.HALF_OPEN;
        this.lastStateChange = Date.now();
        return true;
      }
      return false;
    }
    if (this.state === STATES.HALF_OPEN) return true;
    return false;
  }

  recordSuccess() {
    this.successCount++;
    if (this.state === STATES.HALF_OPEN) {
      this.state = STATES.CLOSED;
      this.failures = [];
      this.lastStateChange = Date.now();
    }
  }

  recordFailure() {
    this.failureCount++;
    this.failures.push(Date.now());
    this.lastFailure = Date.now();
    this._cleanOldFailures();
    if (this.state === STATES.HALF_OPEN) {
      this.state = STATES.OPEN;
      this.lastStateChange = Date.now();
    } else if (this.state === STATES.CLOSED && this.failures.length >= FAILURE_THRESHOLD) {
      this.state = STATES.OPEN;
      this.lastStateChange = Date.now();
    }
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      recentFailures: this.failures.length,
      successCount: this.successCount,
      failureCount: this.failureCount,
      lastFailure: this.lastFailure ? new Date(this.lastFailure).toISOString() : null
    };
  }

  _cleanOldFailures() {
    const cutoff = Date.now() - FAILURE_WINDOW_MS;
    this.failures = this.failures.filter(f => f > cutoff);
  }

  /**
   * Record a decision for potential rollback if this agent's circuit opens.
   */
  recordDecision(agentId, decisionId, decision) {
    if (!this._recentDecisions) this._recentDecisions = new Map();
    if (!this._recentDecisions.has(agentId)) this._recentDecisions.set(agentId, []);
    const decisions = this._recentDecisions.get(agentId);
    decisions.push({ decisionId, decision, timestamp: Date.now() });
    // Keep only last 20
    if (decisions.length > 20) decisions.shift();
  }

  /**
   * Get decisions that should be reviewed/rolled back when circuit opens.
   * Returns decisions made in the last `windowMs` that may be unreliable.
   */
  getDecisionsForRollback(agentId) {
    if (!this._recentDecisions) return [];
    const decisions = this._recentDecisions.get(agentId) || [];
    const state = this.states.get(agentId);
    if (!state || state.state !== 'OPEN') return [];
    // Return decisions made during the failure window
    const cutoff = Date.now() - (this.windowMs || 60000);
    return decisions.filter(d => d.timestamp >= cutoff);
  }
}

const breakers = new Map();

export function getCircuitBreaker(name) {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(name));
  }
  return breakers.get(name);
}

export function getAllCircuitBreakerStates() {
  return Array.from(breakers.values()).map(b => b.getState());
}

export { STATES };
export default { CircuitBreaker, getCircuitBreaker, getAllCircuitBreakerStates, STATES };
