# Autonomous Agents Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build two truly autonomous agents — Cross-Domain Correlation and Policy Evolution — on a new AutonomousAgent base class with self-initiating scan loops, full TPAOR reasoning, and every agentic AI concept.

**Architecture:** New `AutonomousAgent` extends `BaseAgent` with interval + event acceleration run loop. Both agents register tools, subscribe to event bus topics, accumulate signals between scans, and run full reasoning cycles autonomously. Server initializes and starts both at startup. New frontend page at `/autonomous` with two tabs.

**Tech Stack:** Node.js ES modules, BaseAgent framework, event bus, Express routers, React 19 + Tailwind CSS.

---

## Phase 1: AutonomousAgent Base Class

### Task 1: AutonomousAgent Base Class

**Files:**
- Create: `backend/agents/core/autonomous-agent.js`
- Test: `backend/agents/core/__tests__/autonomous-agent.test.js`

**Context:** This extends `BaseAgent` (at `backend/agents/core/base-agent.js`) which provides the full TPAOR reasoning loop via `reason(input, context)`, tool registration via `registerTool(name, desc, handler)`, and all core module integration (messenger, pattern memory, metrics, traces, etc.). The `AutonomousAgent` adds a self-initiating run loop with interval-based scheduling and event-driven acceleration.

**Step 1: Write the test**

```javascript
/**
 * Unit test: AutonomousAgent base class — run loop, event buffer, lifecycle.
 * Run with: node backend/agents/core/__tests__/autonomous-agent.test.js
 */

import { AutonomousAgent } from '../autonomous-agent.js';

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  // ── Test 1: Constructor sets autonomous properties ──
  console.log('\nTest 1: Constructor sets autonomous properties');
  class TestAgent extends AutonomousAgent {
    constructor() {
      super({
        agentId: 'TEST_AUTONOMOUS',
        name: 'Test Autonomous Agent',
        role: 'test',
        capabilities: ['testing'],
        scanIntervalMs: 1000,
        eventAccelerationThreshold: 3,
        subscribedTopics: ['test:event']
      });
    }
    _buildScanInput() { return { events: [...this.eventBuffer] }; }
    _postCycle(result) { this._lastResult = result; }
  }

  const agent = new TestAgent();
  assert(agent.scanIntervalMs === 1000, 'scanIntervalMs set to 1000');
  assert(agent.eventAccelerationThreshold === 3, 'eventAccelerationThreshold set to 3');
  assert(Array.isArray(agent.eventBuffer), 'eventBuffer is an array');
  assert(agent.eventBuffer.length === 0, 'eventBuffer starts empty');
  assert(agent.isRunning === false, 'isRunning starts false');
  assert(agent.lastRunAt === null, 'lastRunAt starts null');
  assert(Array.isArray(agent.runHistory), 'runHistory is an array');
  assert(agent.subscribedTopics.length === 1, 'subscribedTopics has 1 topic');

  // ── Test 2: _onEvent pushes to buffer ──
  console.log('\nTest 2: _onEvent pushes to buffer');
  agent._onEvent({ type: 'test:event', data: { sellerId: 'S1' }, priority: 'NORMAL' });
  assert(agent.eventBuffer.length === 1, 'Buffer has 1 event');
  agent._onEvent({ type: 'test:event', data: { sellerId: 'S2' }, priority: 'HIGH' });
  assert(agent.eventBuffer.length === 2, 'Buffer has 2 events');

  // ── Test 3: _shouldRunNow returns false before interval ──
  console.log('\nTest 3: _shouldRunNow respects interval');
  agent.lastRunAt = Date.now(); // Just ran
  assert(agent._shouldRunNow() === false, 'Should not run immediately after last run');

  // ── Test 4: _shouldRunNow returns true when interval elapsed ──
  console.log('\nTest 4: _shouldRunNow returns true after interval');
  agent.lastRunAt = Date.now() - 2000; // 2s ago, interval is 1s
  assert(agent._shouldRunNow() === true, 'Should run after interval elapsed');

  // ── Test 5: _shouldRunNow returns true on acceleration threshold ──
  console.log('\nTest 5: Event acceleration triggers early run');
  agent.lastRunAt = Date.now(); // Just ran
  agent.eventBuffer = []; // Clear
  agent._onEvent({ type: 'test:event', data: {}, priority: 'CRITICAL' });
  agent._onEvent({ type: 'test:event', data: {}, priority: 'CRITICAL' });
  assert(agent._shouldRunNow() === false, 'Not yet at threshold (2 < 3)');
  agent._onEvent({ type: 'test:event', data: {}, priority: 'CRITICAL' });
  assert(agent._shouldRunNow() === true, 'At threshold (3 >= 3), should run');

  // ── Test 6: _buildScanInput transforms buffer ──
  console.log('\nTest 6: _buildScanInput transforms buffer');
  agent.eventBuffer = [
    { type: 'test:event', data: { id: 1 } },
    { type: 'test:event', data: { id: 2 } }
  ];
  const input = agent._buildScanInput();
  assert(input.events.length === 2, 'Scan input has 2 events');

  // ── Test 7: runOneCycle executes and records history ──
  console.log('\nTest 7: runOneCycle executes and records history');
  // Override reason to avoid full TPAOR (which needs LLM/tools)
  agent.reason = async (input) => ({
    result: { findings: ['test-finding'], confidence: 0.8 },
    success: true
  });
  agent.eventBuffer = [{ type: 'test:event', data: { id: 1 } }];

  await agent.runOneCycle();
  assert(agent.runHistory.length === 1, 'runHistory has 1 entry');
  assert(typeof agent.runHistory[0].cycleId === 'string', 'Cycle has cycleId');
  assert(typeof agent.runHistory[0].startedAt === 'string', 'Cycle has startedAt');
  assert(typeof agent.runHistory[0].completedAt === 'string', 'Cycle has completedAt');
  assert(typeof agent.runHistory[0].durationMs === 'number', 'Cycle has durationMs');
  assert(agent.runHistory[0].eventsProcessed === 1, 'Cycle processed 1 event');
  assert(agent.runHistory[0].success === true, 'Cycle was successful');
  assert(agent.eventBuffer.length === 0, 'Buffer cleared after cycle');
  assert(agent.lastRunAt !== null, 'lastRunAt updated');

  // ── Test 8: runOneCycle handles errors gracefully ──
  console.log('\nTest 8: runOneCycle handles errors');
  agent.reason = async () => { throw new Error('Agent crashed'); };
  agent.eventBuffer = [{ type: 'test:event', data: {} }];
  await agent.runOneCycle();
  assert(agent.runHistory.length === 2, 'runHistory has 2 entries');
  assert(agent.runHistory[1].success === false, 'Failed cycle recorded');
  assert(typeof agent.runHistory[1].error === 'string', 'Error message captured');

  // ── Test 9: start/stop lifecycle ──
  console.log('\nTest 9: start/stop lifecycle');
  agent.reason = async (input) => ({ result: {}, success: true });
  agent.start();
  assert(agent.isRunning === true, 'isRunning is true after start()');
  assert(agent._intervalHandle !== null, 'Interval handle exists');
  agent.stop();
  assert(agent.isRunning === false, 'isRunning is false after stop()');
  assert(agent._intervalHandle === null, 'Interval handle cleared');

  // ── Test 10: runHistory caps at 50 ──
  console.log('\nTest 10: runHistory caps at 50');
  agent.runHistory = [];
  agent.reason = async () => ({ result: {}, success: true });
  for (let i = 0; i < 55; i++) {
    agent.eventBuffer = [{ type: 'test:event', data: {} }];
    await agent.runOneCycle();
  }
  assert(agent.runHistory.length === 50, `History capped at 50 (got ${agent.runHistory.length})`);

  // ── Test 11: getCycleHistory returns copy ──
  console.log('\nTest 11: getCycleHistory returns history');
  const history = agent.getCycleHistory();
  assert(Array.isArray(history), 'getCycleHistory returns array');
  assert(history.length === agent.runHistory.length, 'Same length as internal history');

  // ── Test 12: getStatus returns autonomous state ──
  console.log('\nTest 12: getStatus returns autonomous state');
  const status = agent.getAutonomousStatus();
  assert(typeof status.isRunning === 'boolean', 'Status has isRunning');
  assert(typeof status.scanIntervalMs === 'number', 'Status has scanIntervalMs');
  assert(typeof status.eventsBuffered === 'number', 'Status has eventsBuffered');
  assert(typeof status.totalCycles === 'number', 'Status has totalCycles');
  assert(status.lastRunAt === agent.lastRunAt, 'Status has correct lastRunAt');

  // ── Test 13: Double start is safe ──
  console.log('\nTest 13: Double start is idempotent');
  agent.start();
  const handle1 = agent._intervalHandle;
  agent.start(); // Should not create second interval
  assert(agent._intervalHandle === handle1, 'Same interval handle (no duplicate)');
  agent.stop();

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/core/__tests__/autonomous-agent.test.js`
Expected: FAIL — cannot find module `../autonomous-agent.js`

**Step 3: Write the implementation**

Create `backend/agents/core/autonomous-agent.js`:

```javascript
/**
 * AutonomousAgent — Base class for self-initiating agents with scan loops.
 *
 * Extends BaseAgent with:
 * - Interval-based scan cycle (configurable per agent)
 * - Event buffer accumulation between scans
 * - Event acceleration (urgent events trigger early scans)
 * - Cycle history for observability
 * - start()/stop() lifecycle management
 *
 * Subclasses must implement:
 * - _buildScanInput()  → transform eventBuffer into reason() input
 * - _postCycle(result)  → act on findings (emit events, create cases, etc.)
 */

import { BaseAgent } from './base-agent.js';
import { getMetricsCollector } from './metrics-collector.js';

// Import event bus
let eventBus = null;
try {
  const module = await import('../../gateway/websocket/event-bus.js');
  eventBus = module.getEventBus();
} catch (e) {
  // Event bus not available
}

const MAX_HISTORY = 50;
const MAX_BUFFER = 1000;

export class AutonomousAgent extends BaseAgent {
  constructor(config) {
    super(config);

    this.scanIntervalMs = config.scanIntervalMs || 300000; // 5 min default
    this.eventAccelerationThreshold = config.eventAccelerationThreshold || 5;
    this.subscribedTopics = config.subscribedTopics || [];
    this.eventBuffer = [];
    this.isRunning = false;
    this.lastRunAt = null;
    this.runHistory = [];
    this._intervalHandle = null;
    this._eventUnsubscribers = [];
    this._cycleInProgress = false;
  }

  /**
   * Start the autonomous scan loop and event subscriptions.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Subscribe to event bus topics
    if (eventBus) {
      for (const topic of this.subscribedTopics) {
        const unsub = eventBus.subscribe(topic, (data) => {
          this._onEvent({ type: topic, data, timestamp: new Date().toISOString() });
        });
        if (typeof unsub === 'function') {
          this._eventUnsubscribers.push(unsub);
        }
      }
    }

    // Start interval
    this._intervalHandle = setInterval(() => {
      if (this._shouldRunNow()) {
        this.runOneCycle().catch(err => {
          console.error(`[${this.agentId}] Cycle error:`, err.message);
        });
      }
    }, Math.min(this.scanIntervalMs, 10000)); // Check at most every 10s

    console.log(`[${this.agentId}] Started autonomous loop (interval: ${this.scanIntervalMs}ms)`);
  }

  /**
   * Stop the autonomous scan loop.
   */
  stop() {
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
    for (const unsub of this._eventUnsubscribers) {
      try { unsub(); } catch (e) { /* ignore */ }
    }
    this._eventUnsubscribers = [];
    this.isRunning = false;
    console.log(`[${this.agentId}] Stopped autonomous loop`);
  }

  /**
   * Push an event into the accumulation buffer.
   */
  _onEvent(event) {
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > MAX_BUFFER) {
      this.eventBuffer = this.eventBuffer.slice(-MAX_BUFFER);
    }

    // Check acceleration — trigger early run if threshold reached
    if (this._shouldRunNow() && !this._cycleInProgress) {
      this.runOneCycle().catch(err => {
        console.error(`[${this.agentId}] Accelerated cycle error:`, err.message);
      });
    }
  }

  /**
   * Determine if the agent should run now.
   * Returns true if interval elapsed OR event acceleration threshold reached.
   */
  _shouldRunNow() {
    // Interval elapsed
    if (this.lastRunAt === null) return this.eventBuffer.length > 0;
    const elapsed = Date.now() - this.lastRunAt;
    if (elapsed >= this.scanIntervalMs && this.eventBuffer.length > 0) return true;

    // Event acceleration — count urgent events
    const urgentCount = this.eventBuffer.filter(e =>
      e.priority === 'CRITICAL' || e.priority === 'HIGH' || e.priority === 'URGENT'
    ).length;
    if (urgentCount >= this.eventAccelerationThreshold) return true;

    return false;
  }

  /**
   * Execute one scan cycle. Transforms buffer → reason() → postCycle().
   */
  async runOneCycle() {
    if (this._cycleInProgress) return;
    this._cycleInProgress = true;

    const cycleId = `CYCLE-${this.agentId}-${Date.now().toString(36)}`;
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const eventsProcessed = this.eventBuffer.length;

    try {
      // Build input from buffered events
      const scanInput = this._buildScanInput();

      // Clear buffer before reasoning (events during reason go to next cycle)
      this.eventBuffer = [];

      // Run full TPAOR reasoning loop
      const result = await this.reason(scanInput, {
        autonomous: true,
        cycleId,
        eventsProcessed
      });

      // Post-cycle actions (emit events, create cases, etc.)
      await this._postCycle(result);

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startMs;

      // Record in history
      this._recordCycle({
        cycleId, startedAt, completedAt, durationMs,
        eventsProcessed, success: true, error: null,
        findingsCount: result?.result?.findings?.length || 0
      });

      // Record metrics
      this.metricsCollector.recordExecution(this.agentId, durationMs, true);
      this.lastRunAt = Date.now();

      // Broadcast cycle completion
      this.emitEvent(`autonomous:cycle:complete`, {
        agentId: this.agentId, cycleId, durationMs, eventsProcessed, success: true
      });

    } catch (err) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startMs;

      this._recordCycle({
        cycleId, startedAt, completedAt, durationMs,
        eventsProcessed, success: false, error: err.message,
        findingsCount: 0
      });

      this.metricsCollector.recordExecution(this.agentId, durationMs, false);
      this.lastRunAt = Date.now();
    } finally {
      this._cycleInProgress = false;
    }
  }

  /**
   * Record a cycle in run history (capped at MAX_HISTORY).
   */
  _recordCycle(entry) {
    this.runHistory.push(entry);
    if (this.runHistory.length > MAX_HISTORY) {
      this.runHistory = this.runHistory.slice(-MAX_HISTORY);
    }
  }

  /**
   * Get cycle history for observability.
   */
  getCycleHistory() {
    return [...this.runHistory];
  }

  /**
   * Get autonomous agent status.
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
      subscribedTopics: this.subscribedTopics
    };
  }

  // ── Abstract methods — subclasses MUST implement ──

  /**
   * Transform eventBuffer into structured input for reason().
   * @returns {Object} Input for the TPAOR reasoning loop
   */
  _buildScanInput() {
    throw new Error(`${this.agentId} must implement _buildScanInput()`);
  }

  /**
   * Act on reasoning results — emit events, create cases, broadcast.
   * @param {Object} result - Output from reason()
   */
  async _postCycle(result) {
    throw new Error(`${this.agentId} must implement _postCycle()`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node backend/agents/core/__tests__/autonomous-agent.test.js`
Expected: All 13 tests PASS

**Step 5: Commit**

```bash
git add backend/agents/core/autonomous-agent.js backend/agents/core/__tests__/autonomous-agent.test.js
git commit -m "feat: add AutonomousAgent base class with self-initiating scan loop"
```

---

## Phase 2: Cross-Domain Correlation Agent

### Task 2: Attack Sequence Library

**Files:**
- Create: `backend/agents/core/sequence-patterns.js`
- Test: `backend/agents/core/__tests__/sequence-patterns.test.js`

**Context:** This module defines the attack sequence pattern library and the matching algorithm. Each pattern is an ordered list of domain event steps with timing constraints. The matcher takes a seller's event timeline and checks each pattern with a sliding window approach.

**Step 1: Write the test**

```javascript
/**
 * Unit test: Attack sequence pattern library and matching.
 * Run with: node backend/agents/core/__tests__/sequence-patterns.test.js
 */

import { getSequencePatterns, matchSellerTimeline } from '../sequence-patterns.js';

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  const patterns = getSequencePatterns();

  // ── Test 1: Pattern library has all 4 patterns ──
  console.log('\nTest 1: Pattern library structure');
  assert(Array.isArray(patterns), 'Patterns is an array');
  assert(patterns.length === 4, `Has 4 patterns (got ${patterns.length})`);
  const ids = patterns.map(p => p.patternId);
  assert(ids.includes('BUST_OUT'), 'Has BUST_OUT');
  assert(ids.includes('TRIANGULATION'), 'Has TRIANGULATION');
  assert(ids.includes('ATO_ESCALATION'), 'Has ATO_ESCALATION');
  assert(ids.includes('SLOW_BURN'), 'Has SLOW_BURN');

  // ── Test 2: Pattern structure ──
  console.log('\nTest 2: Pattern structure');
  const bustOut = patterns.find(p => p.patternId === 'BUST_OUT');
  assert(typeof bustOut.name === 'string', 'Has name');
  assert(typeof bustOut.description === 'string', 'Has description');
  assert(Array.isArray(bustOut.sequence), 'Has sequence array');
  assert(bustOut.sequence.length >= 4, `Has 4+ steps (got ${bustOut.sequence.length})`);
  assert(typeof bustOut.maxDurationDays === 'number', 'Has maxDurationDays');
  assert(typeof bustOut.minConfidence === 'number', 'Has minConfidence');
  assert(typeof bustOut.severity === 'string', 'Has severity');
  assert(typeof bustOut.expectedAction === 'string', 'Has expectedAction');

  // ── Test 3: Sequence step structure ──
  console.log('\nTest 3: Sequence step structure');
  const step = bustOut.sequence[0];
  assert(typeof step.domain === 'string', 'Step has domain');
  assert(Array.isArray(step.eventTypes), 'Step has eventTypes array');
  assert(step.eventTypes.length > 0, 'Step has at least one eventType');

  // ── Test 4: matchSellerTimeline with full bust-out match ──
  console.log('\nTest 4: Full bust-out pattern match');
  const now = Date.now();
  const day = 86400000;
  const bustOutTimeline = [
    { domain: 'onboarding', eventType: 'SELLER_APPROVED', createdAt: new Date(now - 50*day).toISOString(), riskScore: 15 },
    { domain: 'account_setup', eventType: 'ACCOUNT_SETUP_OK', createdAt: new Date(now - 45*day).toISOString(), riskScore: 10 },
    { domain: 'listing', eventType: 'LISTING_APPROVED', createdAt: new Date(now - 40*day).toISOString(), riskScore: 5 },
    { domain: 'transaction', eventType: 'VELOCITY_SPIKE', createdAt: new Date(now - 10*day).toISOString(), riskScore: 55 },
    { domain: 'profile_updates', eventType: 'BANK_CHANGE_DURING_DISPUTE', createdAt: new Date(now - 5*day).toISOString(), riskScore: 60 },
    { domain: 'payout', eventType: 'PAYOUT_VELOCITY_SPIKE', createdAt: new Date(now - 1*day).toISOString(), riskScore: 70 }
  ];
  const bustOutMatches = matchSellerTimeline(bustOutTimeline, patterns);
  const bustOutMatch = bustOutMatches.find(m => m.patternId === 'BUST_OUT');
  assert(bustOutMatch !== undefined, 'BUST_OUT pattern detected');
  assert(bustOutMatch.matchScore > 0.7, `High match score (got ${bustOutMatch.matchScore})`);
  assert(bustOutMatch.stepsCompleted >= 4, `Most steps completed (got ${bustOutMatch.stepsCompleted})`);

  // ── Test 5: matchSellerTimeline with partial match ──
  console.log('\nTest 5: Partial pattern match');
  const partialTimeline = [
    { domain: 'onboarding', eventType: 'SELLER_APPROVED', createdAt: new Date(now - 30*day).toISOString(), riskScore: 15 },
    { domain: 'account_setup', eventType: 'ACCOUNT_SETUP_OK', createdAt: new Date(now - 25*day).toISOString(), riskScore: 10 },
    { domain: 'listing', eventType: 'LISTING_APPROVED', createdAt: new Date(now - 20*day).toISOString(), riskScore: 5 }
  ];
  const partialMatches = matchSellerTimeline(partialTimeline, patterns);
  const partialBustOut = partialMatches.find(m => m.patternId === 'BUST_OUT');
  assert(partialBustOut !== undefined, 'Partial BUST_OUT detected');
  assert(partialBustOut.matchScore < bustOutMatch.matchScore, 'Partial has lower score than full');
  assert(partialBustOut.stepsCompleted < bustOutMatch.stepsCompleted, 'Fewer steps completed');
  assert(partialBustOut.stepsRemaining > 0, 'Has remaining steps');

  // ── Test 6: matchSellerTimeline with no match ──
  console.log('\nTest 6: No pattern match');
  const cleanTimeline = [
    { domain: 'onboarding', eventType: 'SELLER_APPROVED', createdAt: new Date(now - 365*day).toISOString(), riskScore: 5 },
    { domain: 'transaction', eventType: 'TRANSACTION_APPROVED', createdAt: new Date(now - 1*day).toISOString(), riskScore: 3 }
  ];
  const cleanMatches = matchSellerTimeline(cleanTimeline, patterns);
  const highScoreClean = cleanMatches.filter(m => m.matchScore > 0.5);
  assert(highScoreClean.length === 0, `No high-score matches for clean seller (got ${highScoreClean.length})`);

  // ── Test 7: ATO escalation pattern ──
  console.log('\nTest 7: ATO escalation pattern');
  const atoTimeline = [
    { domain: 'ato', eventType: 'NEW_DEVICE_LOGIN', createdAt: new Date(now - 2*day).toISOString(), riskScore: 45 },
    { domain: 'profile_updates', eventType: 'BANK_CHANGE_DURING_DISPUTE', createdAt: new Date(now - 1*day).toISOString(), riskScore: 65 },
    { domain: 'payout', eventType: 'PAYOUT_VELOCITY_SPIKE', createdAt: new Date(now - 0.5*day).toISOString(), riskScore: 75 }
  ];
  const atoMatches = matchSellerTimeline(atoTimeline, patterns);
  const atoMatch = atoMatches.find(m => m.patternId === 'ATO_ESCALATION');
  assert(atoMatch !== undefined, 'ATO_ESCALATION detected');
  assert(atoMatch.matchScore > 0.7, `High ATO match score (got ${atoMatch.matchScore})`);

  // ── Test 8: Timing constraint enforcement ──
  console.log('\nTest 8: Timing constraints respected');
  const tooSlowATO = [
    { domain: 'ato', eventType: 'NEW_DEVICE_LOGIN', createdAt: new Date(now - 30*day).toISOString(), riskScore: 45 },
    { domain: 'profile_updates', eventType: 'BANK_CHANGE_DURING_DISPUTE', createdAt: new Date(now - 15*day).toISOString(), riskScore: 65 },
    { domain: 'payout', eventType: 'PAYOUT_VELOCITY_SPIKE', createdAt: new Date(now - 1*day).toISOString(), riskScore: 75 }
  ];
  const slowMatches = matchSellerTimeline(tooSlowATO, patterns);
  const slowATO = slowMatches.find(m => m.patternId === 'ATO_ESCALATION');
  // ATO_ESCALATION has tight timing (3 days) — 30-day spread should have lower score
  assert(slowATO === undefined || slowATO.matchScore < atoMatch.matchScore,
    'Slow timeline has lower score than compressed');

  // ── Test 9: Match result structure ──
  console.log('\nTest 9: Match result structure');
  assert(typeof bustOutMatch.patternId === 'string', 'Has patternId');
  assert(typeof bustOutMatch.patternName === 'string', 'Has patternName');
  assert(typeof bustOutMatch.matchScore === 'number', 'Has matchScore (number)');
  assert(bustOutMatch.matchScore >= 0 && bustOutMatch.matchScore <= 1, 'matchScore in [0,1]');
  assert(typeof bustOutMatch.stepsCompleted === 'number', 'Has stepsCompleted');
  assert(typeof bustOutMatch.stepsRemaining === 'number', 'Has stepsRemaining');
  assert(typeof bustOutMatch.severity === 'string', 'Has severity');
  assert(Array.isArray(bustOutMatch.matchedSteps), 'Has matchedSteps array');

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
```

**Step 2: Run test to verify it fails**

Run: `node backend/agents/core/__tests__/sequence-patterns.test.js`
Expected: FAIL — cannot find module

**Step 3: Write the implementation**

Create `backend/agents/core/sequence-patterns.js`. This module exports:
- `getSequencePatterns()` — returns array of 4 attack sequence definitions (BUST_OUT, TRIANGULATION, ATO_ESCALATION, SLOW_BURN)
- `matchSellerTimeline(timeline, patterns)` — matches a seller's event timeline against all patterns

Each pattern has: `patternId`, `name`, `description`, `sequence` (array of `{domain, eventTypes[], label}`), `maxDurationDays`, `minConfidence`, `severity`, `expectedAction`.

The matching algorithm:
1. For each pattern, walk the seller's timeline in chronological order
2. For each step in the pattern's sequence, find the earliest matching event (correct domain + eventType match) that comes after the previous matched step
3. Check timing: total span of matched events <= `maxDurationDays`
4. Compute `matchScore = stepsCompleted / totalSteps` with a timing bonus (compressed timeline → higher score) and risk signal bonus (high riskScore events → higher score)
5. Return matches sorted by score descending, including `matchedSteps` array for citation grounding

**Step 4: Run test to verify it passes**

Run: `node backend/agents/core/__tests__/sequence-patterns.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add backend/agents/core/sequence-patterns.js backend/agents/core/__tests__/sequence-patterns.test.js
git commit -m "feat: add attack sequence pattern library with timeline matching"
```

---

### Task 3: Cross-Domain Correlation Agent

**Files:**
- Create: `backend/agents/specialized/cross-domain-agent.js`
- Test: `backend/agents/specialized/__tests__/cross-domain-agent.test.js`

**Context:** This agent extends `AutonomousAgent` (from Task 1). It subscribes to `risk:event:created`, `decision:made`, and `case:resolved` topics. Every 5 minutes (or on 3+ urgent events), it runs a full TPAOR cycle: groups buffered events by seller, matches seller timelines against the attack sequence library (Task 2), and emits risk events + creates cases for high-confidence detections.

**Dependencies:**
- `backend/agents/core/autonomous-agent.js` (Task 1)
- `backend/agents/core/sequence-patterns.js` (Task 2)
- `backend/services/risk-profile/index.js` (existing — for `GET /api/risk-profile/:sellerId/events`)
- `backend/agents/core/confidence-calibrator.js` (existing)
- `backend/agents/core/citation-tracker.js` (existing)
- `backend/agents/core/self-correction.js` (existing)
- `backend/agents/core/pattern-memory.js` (existing)
- `backend/agents/core/knowledge-base.js` (existing)
- `backend/graph/graph-queries.js` (existing)

**Step 1: Write the test**

The test should verify:
- Agent extends AutonomousAgent and has correct agentId (`CROSS_DOMAIN_CORRELATION`), capabilities, 5-min interval, 3 event acceleration threshold
- 6 tools registered: `get_seller_timeline`, `get_domain_velocity`, `compare_seller_trajectories`, `check_sequence_pattern`, `get_network_peers`, `predict_next_step`
- `_buildScanInput()` groups events by sellerId
- Tools return correct shapes (mock db_ops for seller/event data)
- `_postCycle()` emits risk events for high-score matches (via mock emitEvent)
- Self-correction integration: logPrediction called on detections

Test file: `backend/agents/specialized/__tests__/cross-domain-agent.test.js`
Run: `node backend/agents/specialized/__tests__/cross-domain-agent.test.js`

**Step 2: Write the implementation**

The `CrossDomainCorrelationAgent` class:
- Constructor: `super({ agentId: 'CROSS_DOMAIN_CORRELATION', name: 'Cross-Domain Correlation Agent', role: 'cross_domain_analyst', capabilities: ['cross_domain_detection', 'trajectory_analysis', 'sequence_matching', 'coordinated_behavior_detection'], scanIntervalMs: 300000, eventAccelerationThreshold: 3, subscribedTopics: ['risk:event:created', 'decision:made', 'case:resolved'] })`
- Registers 6 tools with `this.registerTool()`
- `_buildScanInput()`: Groups eventBuffer by sellerId, returns `{ sellerEvents: Map<sellerId, events[]>, totalEvents }`
- Tool handlers query db_ops and graph-queries for real data
- `_postCycle(result)`: For each detection with matchScore > 0.7 and calibrated confidence above pattern's minConfidence:
  - Emit risk event via POST to risk-profile service (domain of latest matched step, tagged `crossDomain: true`)
  - Create case via db_ops insert into cases collection
  - Broadcast via messenger to all agents
  - Log prediction via self-correction
  - Write to knowledge base

**Step 3: Run test and commit**

```bash
git add backend/agents/specialized/cross-domain-agent.js backend/agents/specialized/__tests__/cross-domain-agent.test.js
git commit -m "feat: add Cross-Domain Correlation Agent with trajectory detection"
```

---

## Phase 3: Policy Evolution Agent

### Task 4: Rule Drafting Engine

**Files:**
- Create: `backend/agents/core/rule-drafter.js`
- Test: `backend/agents/core/__tests__/rule-drafter.test.js`

**Context:** A utility module that takes a cluster of similar transactions/decisions (sharing common features) and generates a candidate rule structure compatible with the decision engine's rule format. The rule format is defined in `backend/services/decision-engine/rules/index.js` — rules have: `name`, `description`, `checkpoint`, `type`, `severity`, `action`, `conditions[]` (each with `field`, `operator`, `value`), `tags`, `priority`.

**Step 1: Write the test**

The test should verify:
- `draftRuleFromCluster(cluster)` returns a valid rule object with all required fields
- Cluster input format: `{ features: [{field, values, operator}], checkpoint, severity, action, reason }`
- Generates conditions from features (e.g., `{field: 'amount', values: [3000, 5000, 7000]}` → `{field: 'amount', operator: 'GT', value: 3000}` using the minimum as threshold)
- Rule name auto-generated from checkpoint + features
- Rule status always starts as 'TESTING'
- `createdBy` field set to 'POLICY_EVOLUTION'
- Handles edge cases: empty features → returns null, missing checkpoint → returns null

Test file: `backend/agents/core/__tests__/rule-drafter.test.js`
Run: `node backend/agents/core/__tests__/rule-drafter.test.js`

**Step 2: Write implementation, run test, commit**

```bash
git add backend/agents/core/rule-drafter.js backend/agents/core/__tests__/rule-drafter.test.js
git commit -m "feat: add rule drafting engine for Policy Evolution Agent"
```

---

### Task 5: Policy Evolution Agent

**Files:**
- Create: `backend/agents/specialized/policy-evolution-agent.js`
- Test: `backend/agents/specialized/__tests__/policy-evolution-agent.test.js`

**Context:** This agent extends `AutonomousAgent` (Task 1). It subscribes to `decision:made`, `agent:outcome:received`, `case:resolved`, `rule:triggered`. Every 30 minutes (or on 5+ false negatives), it runs two analysis tracks:
- Track A (Gap Detection): find false negatives, cluster by features, draft rules, simulate, deploy to shadow
- Track B (Friction Reduction): find false positives, identify worst rules, propose modifications

Uses the rule-drafter (Task 4) and the existing simulation service (`backend/services/experimentation/simulation/index.js`) for impact analysis.

**Dependencies:**
- `backend/agents/core/autonomous-agent.js` (Task 1)
- `backend/agents/core/rule-drafter.js` (Task 4)
- `backend/services/decision-engine/rules/index.js` (existing — rule CRUD)
- `backend/services/decision-engine/execution/index.js` (existing — rule evaluation)
- `backend/services/experimentation/simulation/index.js` (existing — simulation)
- `backend/agents/core/adversarial-tester.js` (existing — post-promotion testing)
- `backend/agents/core/confidence-calibrator.js` (existing)
- `backend/agents/core/self-correction.js` (existing)
- `backend/agents/core/pattern-memory.js` (existing)
- `backend/agents/core/knowledge-base.js` (existing)

**Step 1: Write the test**

The test should verify:
- Agent extends AutonomousAgent with agentId `POLICY_EVOLUTION`, 30-min interval, 5 event acceleration threshold
- 10 tools registered: `get_false_negatives`, `get_false_positives`, `get_rule_performance`, `cluster_features`, `draft_rule`, `simulate_rule`, `deploy_shadow`, `check_shadow_results`, `promote_rule`, `deprecate_rule`
- `_buildScanInput()` separates events into false negatives and false positives
- Tool handlers: `get_false_negatives` returns decisions where outcome=fraud and decision=APPROVE (from db_ops)
- `_postCycle()` creates rules via db_ops insert into rules collection with status='TESTING' and createdBy='POLICY_EVOLUTION'
- Rule lifecycle tracking: agent maintains internal `rulePipeline` Map tracking each rule's stage
- `checkShadowRules()` evaluates rules that have been in SHADOW long enough (24+ hours)
- Self-correction: tracks which drafted rules succeeded vs got rejected

Test file: `backend/agents/specialized/__tests__/policy-evolution-agent.test.js`
Run: `node backend/agents/specialized/__tests__/policy-evolution-agent.test.js`

**Step 2: Write implementation, run test, commit**

```bash
git add backend/agents/specialized/policy-evolution-agent.js backend/agents/specialized/__tests__/policy-evolution-agent.test.js
git commit -m "feat: add Policy Evolution Agent with autonomous rule lifecycle"
```

---

## Phase 4: API Endpoints & Server Integration

### Task 6: Cross-Domain API Router

**Files:**
- Create: `backend/services/autonomous/cross-domain-router.js`
- Modify: `backend/gateway/server.js` (add import + mount)

**Context:** Express router exposing Cross-Domain Correlation Agent state. Pattern follows existing routers (e.g., `backend/services/observability/index.js`). Mount at `/api/agents/cross-domain`.

**Endpoints:**
- `GET /status` — Returns `agent.getAutonomousStatus()` + detection stats
- `GET /detections` — Recent detections from agent's internal detection log (limit/offset query params)
- `GET /patterns` — Returns `getSequencePatterns()` with per-pattern detection counts
- `GET /history` — Returns `agent.getCycleHistory()`
- `POST /scan` — Calls `agent.runOneCycle()`, returns result

**Step 1: Write the router**

```javascript
import { Router } from 'express';
const router = Router();
// Agent instance will be set after initialization
let agent = null;
export function setCrossDomainAgent(a) { agent = a; }

router.get('/status', (req, res) => { ... });
router.get('/detections', (req, res) => { ... });
router.get('/patterns', (req, res) => { ... });
router.get('/history', (req, res) => { ... });
router.post('/scan', async (req, res) => { ... });

export default router;
```

**Step 2: Add to server.js**

Add after existing agent imports (~line 340):
```javascript
import crossDomainRouter, { setCrossDomainAgent } from '../services/autonomous/cross-domain-router.js';
```

Add mount after existing routes (~line 500s):
```javascript
app.use('/api/agents/cross-domain', crossDomainRouter);
```

**Step 3: Commit**

```bash
git add backend/services/autonomous/cross-domain-router.js backend/gateway/server.js
git commit -m "feat: add Cross-Domain Correlation Agent API endpoints"
```

---

### Task 7: Policy Evolution API Router

**Files:**
- Create: `backend/services/autonomous/policy-evolution-router.js`
- Modify: `backend/gateway/server.js` (add import + mount)

**Context:** Same pattern as Task 6. Mount at `/api/agents/policy-evolution`.

**Endpoints:**
- `GET /status` — Running state + rule pipeline summary (count per stage)
- `GET /proposals` — All agent-created rules with lifecycle stage
- `GET /pipeline` — Rules currently in SHADOW with live performance
- `GET /history` — Cycle history
- `POST /scan` — Force immediate cycle
- `POST /promote/:ruleId` — Manual promotion
- `POST /reject/:ruleId` — Manual rejection

**Step 1: Write, Step 2: Mount in server.js, Step 3: Commit**

```bash
git add backend/services/autonomous/policy-evolution-router.js backend/gateway/server.js
git commit -m "feat: add Policy Evolution Agent API endpoints"
```

---

### Task 8: Server Startup Integration

**Files:**
- Modify: `backend/gateway/server.js` (initialization block + AGENT_PROMPT_MAP + graceful shutdown)

**Context:** Both agents need to be instantiated and started after the database is seeded and ML models loaded. They also need to register with the orchestrator and be added to the AGENT_PROMPT_MAP in base-agent.js.

**Step 1: Add to server.js after ML model warmup (~line 386)**

```javascript
// Initialize Autonomous Agents
import { CrossDomainCorrelationAgent } from '../agents/specialized/cross-domain-agent.js';
import { PolicyEvolutionAgent } from '../agents/specialized/policy-evolution-agent.js';

const crossDomainAgent = new CrossDomainCorrelationAgent();
const policyEvolutionAgent = new PolicyEvolutionAgent();

// Register with orchestrator
import { orchestrator } from '../agents/core/agent-orchestrator.js';
orchestrator.registerAgent(crossDomainAgent);
orchestrator.registerAgent(policyEvolutionAgent);

// Wire up API routers
setCrossDomainAgent(crossDomainAgent);
setPolicyEvolutionAgent(policyEvolutionAgent);

// Start autonomous loops
crossDomainAgent.start();
policyEvolutionAgent.start();
console.log('Autonomous agents started: Cross-Domain Correlation, Policy Evolution');
```

**Step 2: Add AGENT_PROMPT_MAP entries in base-agent.js (~line 52)**

```javascript
'CROSS_DOMAIN_CORRELATION': 'cross-domain',
'POLICY_EVOLUTION': 'policy-evolution'
```

**Step 3: Add graceful shutdown before server.listen**

```javascript
process.on('SIGTERM', () => {
  crossDomainAgent.stop();
  policyEvolutionAgent.stop();
  process.exit(0);
});
```

**Step 4: Add to startup banner**

Add these lines to the banner:
```
║   • Cross-Domain Agent  /api/agents/cross-domain            ║
║   • Policy Evolution    /api/agents/policy-evolution         ║
```

**Step 5: Commit**

```bash
git add backend/gateway/server.js backend/agents/core/base-agent.js
git commit -m "feat: initialize and start autonomous agents at server startup"
```

---

## Phase 5: Frontend

### Task 9: Autonomous Agents Page

**Files:**
- Create: `src/pages/AutonomousAgents.jsx`
- Modify: `src/App.jsx` (import + route)
- Modify: `src/components/Layout.jsx` (navigation entry)

**Context:** A new page at `/autonomous` with two tabs: Cross-Domain Correlation and Policy Evolution. Follows the same dark theme and tab pattern as `src/pages/Observability.jsx`. Uses Tailwind CSS classes matching existing pages (bg-[#0a0a0f], border-gray-800, etc.).

**Tab 1: Cross-Domain Correlation**
- Status card (top): isRunning indicator (green/amber dot), last scan time, next scan time, events buffered, total cycles
- Detections table: sellerId, pattern name, match score (color-coded bar), steps completed/total, confidence (raw + calibrated), status badge (NEW/INVESTIGATING/ESCALATED/RESOLVED), timestamp
- Pattern library section: 4 cards (one per attack pattern) with name, description, step count, severity badge, detection count
- Cycle history: expandable rows with cycleId, timestamp, events processed, findings count, duration, success/fail badge

**Tab 2: Policy Evolution**
- Status card: isRunning, rules per stage (PROPOSED/SIMULATED/SHADOW/ACTIVE/REJECTED/DEPRECATED), total cycles
- Rule pipeline: visual columns (4 status columns), each rule as a card with name, checkpoint, catch rate, FP rate, time-in-stage
- Active agent-created rules table: name, checkpoint, conditions count, catch rate, FP rate, created date
- Cycle history: similar to Tab 1

**API calls:**
- Tab 1: `GET /api/agents/cross-domain/status`, `GET /api/agents/cross-domain/detections`, `GET /api/agents/cross-domain/patterns`, `GET /api/agents/cross-domain/history`
- Tab 2: `GET /api/agents/policy-evolution/status`, `GET /api/agents/policy-evolution/proposals`, `GET /api/agents/policy-evolution/pipeline`, `GET /api/agents/policy-evolution/history`
- Manual triggers: `POST /api/agents/cross-domain/scan`, `POST /api/agents/policy-evolution/scan`

**Step 1: Create the page component**

Full React component (~400-500 lines) with:
- `useState` for active tab, data states, loading states
- `useEffect` to fetch data on tab change (10s auto-refresh via `setInterval`)
- Tab bar matching Observability page pattern
- Responsive grid layouts
- Color-coded badges and bars

**Step 2: Add route to App.jsx**

Add import:
```javascript
import AutonomousAgents from './pages/AutonomousAgents'
```

Add route after `/feedback-review`:
```jsx
<Route path="/autonomous" element={<AutonomousAgents />} />
```

**Step 3: Add navigation to Layout.jsx**

In the Platform section children array (after `{ name: 'Observability', href: '/observability' }`), add:
```javascript
{ name: 'Autonomous Agents', href: '/autonomous' }
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 5: Commit**

```bash
git add src/pages/AutonomousAgents.jsx src/App.jsx src/components/Layout.jsx
git commit -m "feat: add Autonomous Agents page with cross-domain and policy evolution tabs"
```

---

## Task Summary

| Task | Phase | Component | Files Created | Files Modified |
|------|-------|-----------|---------------|----------------|
| 1 | Foundation | AutonomousAgent base class | 2 (class + test) | 0 |
| 2 | Cross-Domain | Attack sequence library | 2 (lib + test) | 0 |
| 3 | Cross-Domain | CrossDomainCorrelationAgent | 2 (agent + test) | 0 |
| 4 | Policy Evolution | Rule drafting engine | 2 (lib + test) | 0 |
| 5 | Policy Evolution | PolicyEvolutionAgent | 2 (agent + test) | 0 |
| 6 | APIs | Cross-Domain router | 1 (router) | 1 (server.js) |
| 7 | APIs | Policy Evolution router | 1 (router) | 1 (server.js) |
| 8 | Integration | Server startup | 0 | 2 (server.js, base-agent.js) |
| 9 | Frontend | Autonomous Agents page | 1 (page) | 2 (App.jsx, Layout.jsx) |

**Total: 13 new files, 6 file modifications, 9 commits**
