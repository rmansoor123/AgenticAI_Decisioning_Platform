/**
 * Active Learning Module
 *
 * Enables agents to proactively request human feedback when uncertain.
 * Detects low-confidence decisions, policy overrides, reflection revisions,
 * and eval regressions — then creates cases for analyst review.
 *
 * Integrates with:
 * - base-agent.js: hooks into reason() via emitEvent subscriptions
 * - case-queue: creates ACTIVE_LEARNING checkpoint cases
 * - event-bus: subscribes to agent decision events
 *
 * Singleton: getActiveLearningManager()
 */

// Import event bus (only if running in context with WebSocket)
let eventBus = null;
try {
  const module = await import('../../gateway/websocket/event-bus.js');
  eventBus = module.getEventBus();
} catch (e) {
  // Event bus not available, that's okay
}

import { db_ops } from '../../shared/common/database.js';

class ActiveLearningManager {
  constructor() {
    this.isRunning = false;
    this.config = {
      // Confidence below this triggers active learning
      confidenceThreshold: 0.55,
      // Max active learning cases per agent per hour (prevent flooding)
      maxCasesPerAgentPerHour: 5,
      // Eval regression threshold (percentage drop)
      evalRegressionThreshold: 0.15,
      // Enable/disable specific triggers
      triggers: {
        lowConfidence: true,
        policyOverride: true,
        reflectionRevision: true,
        evalRegression: true,
        judgeOverturn: true,
        citationDowngrade: true
      }
    };

    // Rate limiting: agentId → { count, resetAt }
    this._rateLimits = new Map();

    // Metrics
    this._stats = {
      casesCreated: 0,
      casesRateLimited: 0,
      byTrigger: {
        lowConfidence: 0,
        policyOverride: 0,
        reflectionRevision: 0,
        evalRegression: 0,
        judgeOverturn: 0,
        citationDowngrade: 0
      }
    };

    // Event unsubscribers for cleanup
    this._unsubscribers = [];
  }

  /**
   * Start listening for agent events that should trigger active learning.
   */
  start() {
    if (this.isRunning || !eventBus) return;
    this.isRunning = true;

    // Low confidence — listen for completed decisions
    if (this.config.triggers.lowConfidence) {
      this._subscribe('agent:decision:complete', (event) => {
        const confidence = event.data?.confidence ?? event.confidence;
        const decision = event.data?.decision ?? event.decision;
        if (typeof confidence === 'number' && confidence < this.config.confidenceThreshold) {
          this._createLearningCase({
            trigger: 'lowConfidence',
            agentId: event.data?.agentId ?? event.agentId,
            sellerId: event.data?.sellerId ?? event.sellerId,
            decision,
            confidence,
            reasoning: event.data?.reasoning ?? event.reasoning,
            riskScore: event.data?.riskScore ?? event.riskScore,
            metadata: { threshold: this.config.confidenceThreshold }
          });
        }
      });
    }

    // Policy override — agent decision was overridden by policy engine
    if (this.config.triggers.policyOverride) {
      this._subscribe('agent:policy:override', (event) => {
        this._createLearningCase({
          trigger: 'policyOverride',
          agentId: event.data?.agentId ?? event.agentId,
          sellerId: event.data?.sellerId,
          decision: event.data?.enforcedAction,
          reasoning: `Policy overrode agent decision from ${event.data?.originalAction} to ${event.data?.enforcedAction}`,
          metadata: {
            originalAction: event.data?.originalAction,
            enforcedAction: event.data?.enforcedAction,
            violations: event.data?.violations
          }
        });
      });
    }

    // Reflection revision — agent changed its own mind during reflection
    if (this.config.triggers.reflectionRevision) {
      this._subscribe('agent:reflection:revision', (event) => {
        this._createLearningCase({
          trigger: 'reflectionRevision',
          agentId: event.data?.agentId ?? event.agentId,
          sellerId: event.data?.sellerId,
          decision: event.data?.revisedAction,
          reasoning: `Self-reflection revised decision from ${event.data?.originalAction} to ${event.data?.revisedAction}. Concerns: ${(event.data?.concerns || []).join('; ')}`,
          metadata: {
            originalAction: event.data?.originalAction,
            revisedAction: event.data?.revisedAction,
            concerns: event.data?.concerns
          }
        });
      });
    }

    // Eval regression — eval scores dropped significantly
    if (this.config.triggers.evalRegression) {
      this._subscribe('agent:eval:regression', (event) => {
        this._createLearningCase({
          trigger: 'evalRegression',
          agentId: event.data?.agentId ?? event.agentId,
          decision: 'REVIEW',
          reasoning: `Eval regression detected: ${event.data?.metric} dropped from ${event.data?.baseline} to ${event.data?.current}`,
          priority: 'HIGH',
          metadata: {
            metric: event.data?.metric,
            baseline: event.data?.baseline,
            current: event.data?.current,
            dropPercent: event.data?.dropPercent
          }
        });
      });
    }

    // Judge overturn — cross-agent judge overturned a decision
    if (this.config.triggers.judgeOverturn) {
      this._subscribe('agent:judge:overturn', (event) => {
        this._createLearningCase({
          trigger: 'judgeOverturn',
          agentId: event.data?.agentId ?? event.agentId,
          sellerId: event.data?.sellerId,
          decision: 'REVIEW',
          reasoning: `Cross-agent judge overturned ${event.data?.originalDecision}. Issues: ${(event.data?.issues || []).join('; ')}`,
          priority: 'HIGH',
          metadata: {
            originalDecision: event.data?.originalDecision,
            judgeQuality: event.data?.judgeQuality,
            issues: event.data?.issues
          }
        });
      });
    }

    // Citation downgrade — decision downgraded due to weak evidence
    if (this.config.triggers.citationDowngrade) {
      this._subscribe('agent:citation:downgrade', (event) => {
        this._createLearningCase({
          trigger: 'citationDowngrade',
          agentId: event.data?.agentId ?? event.agentId,
          sellerId: event.data?.sellerId,
          decision: event.data?.downgradedTo || 'REVIEW',
          reasoning: `Decision downgraded from ${event.data?.originalDecision} to ${event.data?.downgradedTo} due to weak citations`,
          metadata: {
            originalDecision: event.data?.originalDecision,
            downgradedTo: event.data?.downgradedTo,
            issues: event.data?.issues
          }
        });
      });
    }

    console.log('[ActiveLearning] Started — listening for', Object.entries(this.config.triggers).filter(([, v]) => v).map(([k]) => k).join(', '));
  }

  /**
   * Stop listening for events.
   */
  stop() {
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];
    this.isRunning = false;
    console.log('[ActiveLearning] Stopped');
  }

  /**
   * Subscribe to an event bus topic and track the unsubscriber.
   */
  _subscribe(topic, handler) {
    if (!eventBus) return;
    const unsub = eventBus.subscribe(topic, handler);
    this._unsubscribers.push(unsub);
  }

  /**
   * Create an active learning case for human review.
   * Rate-limited per agent to prevent case flooding.
   */
  async _createLearningCase({ trigger, agentId, sellerId, decision, confidence, reasoning, riskScore, priority, metadata }) {
    // Rate limit check
    if (!this._checkRateLimit(agentId)) {
      this._stats.casesRateLimited++;
      return null;
    }

    const caseId = `CASE-AL-${Date.now().toString(36).toUpperCase()}`;
    const caseData = {
      caseId,
      checkpoint: 'ACTIVE_LEARNING',
      priority: priority || (trigger === 'evalRegression' || trigger === 'judgeOverturn' ? 'HIGH' : 'MEDIUM'),
      status: 'OPEN',
      sellerId: sellerId || 'SYSTEM',
      entityId: caseId,
      entityType: 'active_learning',
      decision: decision || 'REVIEW',
      riskScore: riskScore || 50,
      reasoning: `[Active Learning — ${trigger}] ${reasoning || 'Agent requested human review'}`,
      agentId: agentId || 'UNKNOWN',
      activeLearningTrigger: trigger,
      activeLearningMetadata: metadata || {},
      createdAt: new Date().toISOString()
    };

    // Persist to database
    try {
      await db_ops.insert('cases', 'case_id', caseId, caseData);
    } catch (e) {
      // If cases table doesn't support the fields, just log
      console.warn('[ActiveLearning] Failed to persist case:', e.message);
    }

    // Emit event for dashboards / websocket
    if (eventBus) {
      eventBus.publish('active_learning:case_created', caseData);
    }

    // Update stats
    this._stats.casesCreated++;
    this._stats.byTrigger[trigger] = (this._stats.byTrigger[trigger] || 0) + 1;

    return caseData;
  }

  /**
   * Rate limit: max N cases per agent per hour.
   */
  _checkRateLimit(agentId) {
    const now = Date.now();
    const limit = this._rateLimits.get(agentId);

    if (!limit || now >= limit.resetAt) {
      this._rateLimits.set(agentId, { count: 1, resetAt: now + 3600000 });
      return true;
    }

    if (limit.count >= this.config.maxCasesPerAgentPerHour) {
      return false;
    }

    limit.count++;
    return true;
  }

  /**
   * Update configuration.
   */
  configure(updates) {
    if (updates.confidenceThreshold !== undefined) {
      this.config.confidenceThreshold = updates.confidenceThreshold;
    }
    if (updates.maxCasesPerAgentPerHour !== undefined) {
      this.config.maxCasesPerAgentPerHour = updates.maxCasesPerAgentPerHour;
    }
    if (updates.triggers) {
      Object.assign(this.config.triggers, updates.triggers);
    }
  }

  /**
   * Get active learning statistics.
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      config: { ...this.config },
      stats: { ...this._stats },
      rateLimits: Object.fromEntries(this._rateLimits)
    };
  }
}

// Singleton
let instance = null;
export function getActiveLearningManager() {
  if (!instance) {
    instance = new ActiveLearningManager();
  }
  return instance;
}

export default ActiveLearningManager;
