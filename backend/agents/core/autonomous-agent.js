/**
 * Autonomous Agent - Abstract base class for self-initiating agents
 *
 * Extends BaseAgent with autonomous scan loop capabilities:
 * - Subscribes to event bus topics and accumulates events in a buffer
 * - Runs periodic scan cycles (configurable interval, default 5 min)
 * - Supports event-driven acceleration: if enough high-priority events
 *   arrive before the interval elapses, the agent triggers early
 * - Records cycle history with success/failure metrics
 *
 * Subclasses MUST implement:
 *   _buildScanInput()  — transform the event buffer into a reason() input
 *   _postCycle(result)  — act on the cycle result (e.g. emit alerts)
 */

import { BaseAgent } from './base-agent.js';

// Import event bus (only if running in context with WebSocket)
let eventBus = null;
try {
  const module = await import('../../gateway/websocket/event-bus.js');
  eventBus = module.getEventBus();
} catch (e) {
  // Event bus not available, that's okay
}

export class AutonomousAgent extends BaseAgent {
  constructor(config) {
    super(config);

    // Autonomous scan configuration
    this.scanIntervalMs = config.scanIntervalMs ?? 300000; // 5 minutes
    this.eventAccelerationThreshold = config.eventAccelerationThreshold ?? 5;
    this.subscribedTopics = config.subscribedTopics || [];

    // Runtime state
    this.eventBuffer = [];
    this.isRunning = false;
    this.lastRunAt = null;
    this.runHistory = [];
    this._intervalHandle = null;
    this._cycleInProgress = false;
    this._eventUnsubscribers = [];
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Start the autonomous scan loop.
   * Subscribes to event bus topics and starts the interval timer.
   * Idempotent — calling start() when already running is a no-op.
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Subscribe to event bus topics
    if (eventBus && this.subscribedTopics.length > 0) {
      for (const topic of this.subscribedTopics) {
        const unsub = eventBus.subscribe(topic, (event) => this._onEvent(event));
        this._eventUnsubscribers.push(unsub);
      }
    }

    // Start the periodic check interval
    const checkInterval = Math.min(10000, this.scanIntervalMs);
    this._intervalHandle = setInterval(() => {
      if (this._shouldRunNow() && !this._cycleInProgress) {
        this.runOneCycle();
      }
    }, checkInterval);

    this.emitEvent('agent:autonomous:started', {
      agentId: this.agentId,
      name: this.name,
      scanIntervalMs: this.scanIntervalMs,
      subscribedTopics: this.subscribedTopics
    });
  }

  /**
   * Stop the autonomous scan loop.
   * Clears interval, unsubscribes from events, sets isRunning=false.
   */
  stop() {
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }

    // Unsubscribe from all event bus topics
    for (const unsub of this._eventUnsubscribers) {
      unsub();
    }
    this._eventUnsubscribers = [];

    this.isRunning = false;

    this.emitEvent('agent:autonomous:stopped', {
      agentId: this.agentId,
      name: this.name
    });
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  /**
   * Handle an incoming event from the event bus.
   * Pushes to buffer (capped at 1000). If conditions are met and no cycle
   * is in progress, triggers an immediate cycle.
   */
  _onEvent(event) {
    this.eventBuffer.push(event);

    // Cap buffer at 1000 events
    if (this.eventBuffer.length > 1000) {
      this.eventBuffer = this.eventBuffer.slice(-1000);
    }

    // If acceleration threshold met, trigger immediately
    if (this._shouldRunNow() && !this._cycleInProgress) {
      this.runOneCycle();
    }
  }

  /**
   * Determine whether it is time to run a scan cycle.
   *
   * Returns true if:
   *   (a) The scan interval has elapsed since lastRunAt AND buffer has events, OR
   *   (b) The count of CRITICAL/HIGH/URGENT priority events >= eventAccelerationThreshold
   *
   * If lastRunAt is null, returns true only if buffer has events.
   */
  _shouldRunNow() {
    const bufferHasEvents = this.eventBuffer.length > 0;

    // Check acceleration: count high-priority events
    const highPriorityCount = this.eventBuffer.filter(e => {
      const priority = e.data?.priority || e.metadata?.priority || e.priority;
      if (typeof priority === 'string') {
        return ['CRITICAL', 'HIGH', 'URGENT'].includes(priority.toUpperCase());
      }
      return false;
    }).length;

    if (highPriorityCount >= this.eventAccelerationThreshold) {
      return true;
    }

    // Check interval elapsed
    if (this.lastRunAt === null) {
      return bufferHasEvents;
    }

    const elapsed = Date.now() - this.lastRunAt;
    return elapsed >= this.scanIntervalMs && bufferHasEvents;
  }

  // ============================================================================
  // SCAN CYCLE
  // ============================================================================

  /**
   * Execute one autonomous scan cycle.
   * Guarded by _cycleInProgress to prevent concurrent cycles.
   */
  async runOneCycle() {
    if (this._cycleInProgress) {
      return null;
    }

    this._cycleInProgress = true;
    const cycleId = `CYCLE-${this.agentId}-${Date.now().toString(36)}`;
    const cycleStart = Date.now();
    const eventsProcessed = this.eventBuffer.length;

    try {
      // Build input from buffer, then clear it
      const input = this._buildScanInput();
      this.eventBuffer = [];

      // Run the reasoning loop
      const result = await this.reason(input, {
        autonomous: true,
        cycleId,
        eventsProcessed
      });

      // Post-processing hook
      await this._postCycle(result);

      const duration = Date.now() - cycleStart;
      this.lastRunAt = Date.now();

      // Record successful cycle
      const entry = {
        cycleId,
        startedAt: new Date(cycleStart).toISOString(),
        duration,
        eventsProcessed,
        status: 'success',
        resultSummary: result?.summary || result?.decision || 'completed'
      };
      this._recordCycle(entry);

      // Record metrics
      this.metricsCollector.recordExecution(this.agentId, duration, true);

      this.emitEvent('agent:autonomous:cycle:complete', {
        agentId: this.agentId,
        cycleId,
        duration,
        eventsProcessed,
        status: 'success'
      });

      return result;
    } catch (error) {
      const duration = Date.now() - cycleStart;
      this.lastRunAt = Date.now();

      // Record failed cycle
      const entry = {
        cycleId,
        startedAt: new Date(cycleStart).toISOString(),
        duration,
        eventsProcessed,
        status: 'failed',
        error: error.message
      };
      this._recordCycle(entry);

      // Record metrics
      this.metricsCollector.recordExecution(this.agentId, duration, false);

      this.emitEvent('agent:autonomous:cycle:error', {
        agentId: this.agentId,
        cycleId,
        error: error.message
      });

      return null;
    } finally {
      this._cycleInProgress = false;
    }
  }

  // ============================================================================
  // HISTORY
  // ============================================================================

  /**
   * Record a cycle entry in runHistory, capped at 50 entries.
   */
  _recordCycle(entry) {
    this.runHistory.push(entry);
    if (this.runHistory.length > 50) {
      this.runHistory = this.runHistory.slice(-50);
    }
  }

  /**
   * Return a copy of the run history.
   */
  getCycleHistory() {
    return [...this.runHistory];
  }

  /**
   * Return the current autonomous status.
   */
  getAutonomousStatus() {
    return {
      agentId: this.agentId,
      name: this.name,
      isRunning: this.isRunning,
      scanIntervalMs: this.scanIntervalMs,
      eventAccelerationThreshold: this.eventAccelerationThreshold,
      eventsBuffered: this.eventBuffer.length,
      lastRunAt: this.lastRunAt,
      totalCycles: this.runHistory.length,
      subscribedTopics: [...this.subscribedTopics]
    };
  }

  // ============================================================================
  // ABSTRACT METHODS — subclasses MUST override
  // ============================================================================

  /**
   * Transform the event buffer into input for the reason() loop.
   * Called at the start of each cycle BEFORE the buffer is cleared.
   * @returns {Object} Input object for reason()
   */
  _buildScanInput() {
    throw new Error(
      `${this.constructor.name} must implement _buildScanInput(). ` +
      'This method should transform the event buffer into a reason() input object.'
    );
  }

  /**
   * Post-processing hook called after a successful reason() cycle.
   * Use this to emit alerts, update dashboards, etc.
   * @param {Object} result - The result from reason()
   */
  async _postCycle(result) {
    throw new Error(
      `${this.constructor.name} must implement _postCycle(result). ` +
      'This method should handle the result of an autonomous scan cycle.'
    );
  }
}

export default AutonomousAgent;
