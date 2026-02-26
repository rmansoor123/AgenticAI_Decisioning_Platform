/**
 * Integration test for AutonomousAgent base class.
 * Run with: node backend/agents/core/__tests__/autonomous-agent.test.js
 */

import { AutonomousAgent } from '../autonomous-agent.js';

/**
 * Concrete TestAgent subclass for testing.
 * Implements the abstract methods and stubs out reason() to avoid LLM calls.
 */
class TestAgent extends AutonomousAgent {
  constructor(config) {
    super(config);
    this.buildScanInputCalls = [];
    this.postCycleCalls = [];
    this.reasonResult = { decision: 'MONITOR', summary: 'test cycle complete', success: true };
  }

  _buildScanInput() {
    const input = {
      type: 'autonomous_scan',
      eventCount: this.eventBuffer.length,
      events: [...this.eventBuffer]
    };
    this.buildScanInputCalls.push(input);
    return input;
  }

  async _postCycle(result) {
    this.postCycleCalls.push(result);
  }

  // Override reason() to return a mock result without hitting the full TPAOR loop
  async reason(input, context) {
    return this.reasonResult;
  }
}

/**
 * TestAgent that throws in reason()
 */
class FailingTestAgent extends AutonomousAgent {
  constructor(config) {
    super(config);
  }

  _buildScanInput() {
    return { type: 'autonomous_scan', events: [...this.eventBuffer] };
  }

  async _postCycle(result) {
    // no-op
  }

  async reason(input, context) {
    throw new Error('Simulated reasoning failure');
  }
}

async function runTests() {
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
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_1',
      name: 'Test Autonomous Agent',
      role: 'tester',
      capabilities: ['testing'],
      scanIntervalMs: 60000,
      eventAccelerationThreshold: 3,
      subscribedTopics: ['transaction:*', 'alert:*']
    });

    assert(agent.scanIntervalMs === 60000, 'scanIntervalMs is 60000');
    assert(agent.eventAccelerationThreshold === 3, 'eventAccelerationThreshold is 3');
    assert(Array.isArray(agent.eventBuffer), 'eventBuffer is array');
    assert(agent.eventBuffer.length === 0, 'eventBuffer starts empty');
    assert(agent.isRunning === false, 'isRunning starts false');
    assert(agent.lastRunAt === null, 'lastRunAt starts null');
    assert(Array.isArray(agent.runHistory), 'runHistory is array');
    assert(agent.runHistory.length === 0, 'runHistory starts empty');
    assert(Array.isArray(agent.subscribedTopics), 'subscribedTopics is array');
    assert(agent.subscribedTopics.length === 2, 'subscribedTopics has 2 entries');
    assert(agent._intervalHandle === null, '_intervalHandle starts null');
    assert(agent._cycleInProgress === false, '_cycleInProgress starts false');
    assert(Array.isArray(agent._eventUnsubscribers), '_eventUnsubscribers is array');
  }

  // ── Test 2: _onEvent pushes to buffer ──
  console.log('\nTest 2: _onEvent pushes to buffer');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_2',
      name: 'Buffer Test Agent',
      role: 'tester',
      capabilities: ['testing']
    });
    // Prevent _shouldRunNow from triggering a cycle
    agent.lastRunAt = Date.now();

    agent._onEvent({ type: 'transaction:received', data: { id: 'tx1' } });
    agent._onEvent({ type: 'alert:created', data: { id: 'a1' } });

    assert(agent.eventBuffer.length === 2, 'Buffer has 2 events after 2 _onEvent calls');
    assert(agent.eventBuffer[0].type === 'transaction:received', 'First event type correct');
    assert(agent.eventBuffer[1].data.id === 'a1', 'Second event data correct');
  }

  // ── Test 3: _shouldRunNow returns false before interval elapsed ──
  console.log('\nTest 3: _shouldRunNow returns false before interval elapsed');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_3',
      name: 'Interval Test Agent',
      role: 'tester',
      capabilities: ['testing'],
      scanIntervalMs: 300000
    });
    agent.lastRunAt = Date.now(); // Just ran
    agent.eventBuffer.push({ type: 'test', data: {} });

    assert(agent._shouldRunNow() === false, '_shouldRunNow is false when interval not elapsed');
  }

  // ── Test 4: _shouldRunNow returns true after interval elapsed (with events) ──
  console.log('\nTest 4: _shouldRunNow returns true after interval elapsed');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_4',
      name: 'Elapsed Test Agent',
      role: 'tester',
      capabilities: ['testing'],
      scanIntervalMs: 1000
    });
    agent.lastRunAt = Date.now() - 2000; // 2 seconds ago, interval is 1s
    agent.eventBuffer.push({ type: 'test', data: {} });

    assert(agent._shouldRunNow() === true, '_shouldRunNow is true when interval elapsed and buffer has events');
  }

  // ── Test 5: _shouldRunNow returns true on acceleration threshold ──
  console.log('\nTest 5: _shouldRunNow returns true on acceleration threshold');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_5',
      name: 'Acceleration Test Agent',
      role: 'tester',
      capabilities: ['testing'],
      scanIntervalMs: 300000,
      eventAccelerationThreshold: 3
    });
    agent.lastRunAt = Date.now(); // Just ran — interval NOT elapsed

    // Add 3 CRITICAL events
    agent.eventBuffer.push({ type: 'alert:created', data: { priority: 'CRITICAL' } });
    agent.eventBuffer.push({ type: 'alert:created', data: { priority: 'HIGH' } });
    agent.eventBuffer.push({ type: 'alert:created', data: { priority: 'URGENT' } });

    assert(agent._shouldRunNow() === true, '_shouldRunNow true when acceleration threshold reached');
  }

  // ── Test 5b: _shouldRunNow returns true with null lastRunAt and events ──
  console.log('\nTest 5b: _shouldRunNow returns true with null lastRunAt and events');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_5B',
      name: 'Null LastRun Test Agent',
      role: 'tester',
      capabilities: ['testing']
    });
    assert(agent._shouldRunNow() === false, '_shouldRunNow false with null lastRunAt and empty buffer');
    agent.eventBuffer.push({ type: 'test', data: {} });
    assert(agent._shouldRunNow() === true, '_shouldRunNow true with null lastRunAt and events in buffer');
  }

  // ── Test 6: _buildScanInput transforms buffer ──
  console.log('\nTest 6: _buildScanInput transforms buffer');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_6',
      name: 'BuildInput Test Agent',
      role: 'tester',
      capabilities: ['testing']
    });

    agent.eventBuffer.push({ type: 'tx1', data: { amount: 100 } });
    agent.eventBuffer.push({ type: 'tx2', data: { amount: 200 } });

    const input = agent._buildScanInput();
    assert(input.type === 'autonomous_scan', '_buildScanInput returns correct type');
    assert(input.eventCount === 2, '_buildScanInput returns correct event count');
    assert(input.events.length === 2, '_buildScanInput includes all events');
  }

  // ── Test 7: runOneCycle executes and records history ──
  console.log('\nTest 7: runOneCycle executes and records history');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_7',
      name: 'Cycle Test Agent',
      role: 'tester',
      capabilities: ['testing']
    });

    agent.eventBuffer.push({ type: 'event1', data: {} });
    agent.eventBuffer.push({ type: 'event2', data: {} });

    const result = await agent.runOneCycle();

    assert(result !== null, 'runOneCycle returns a result');
    assert(result.decision === 'MONITOR', 'Result has expected decision');
    assert(agent.runHistory.length === 1, 'runHistory has 1 entry');
    assert(agent.runHistory[0].status === 'success', 'Cycle recorded as success');
    assert(agent.runHistory[0].eventsProcessed === 2, 'Cycle recorded 2 events processed');
    assert(typeof agent.runHistory[0].cycleId === 'string', 'Cycle has a cycleId');
    assert(typeof agent.runHistory[0].duration === 'number', 'Cycle has a duration');
    assert(agent.eventBuffer.length === 0, 'Event buffer cleared after cycle');
    assert(agent.lastRunAt !== null, 'lastRunAt updated after cycle');
    assert(agent.buildScanInputCalls.length === 1, '_buildScanInput was called');
    assert(agent.postCycleCalls.length === 1, '_postCycle was called');
    assert(agent._cycleInProgress === false, '_cycleInProgress is false after cycle');
  }

  // ── Test 8: runOneCycle handles errors gracefully ──
  console.log('\nTest 8: runOneCycle handles errors gracefully');
  {
    const agent = new FailingTestAgent({
      agentId: 'TEST_AUTO_8',
      name: 'Failing Agent',
      role: 'tester',
      capabilities: ['testing']
    });

    agent.eventBuffer.push({ type: 'event1', data: {} });

    const result = await agent.runOneCycle();

    assert(result === null, 'runOneCycle returns null on error');
    assert(agent.runHistory.length === 1, 'Failed cycle is recorded');
    assert(agent.runHistory[0].status === 'failed', 'Cycle recorded as failed');
    assert(agent.runHistory[0].error === 'Simulated reasoning failure', 'Error message recorded');
    assert(agent._cycleInProgress === false, '_cycleInProgress reset to false after error');
    assert(agent.lastRunAt !== null, 'lastRunAt still updated after failed cycle');
  }

  // ── Test 9: start/stop lifecycle ──
  console.log('\nTest 9: start/stop lifecycle');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_9',
      name: 'Lifecycle Test Agent',
      role: 'tester',
      capabilities: ['testing'],
      scanIntervalMs: 60000
    });

    assert(agent.isRunning === false, 'Agent starts not running');
    assert(agent._intervalHandle === null, 'No interval handle before start');

    agent.start();
    assert(agent.isRunning === true, 'Agent is running after start()');
    assert(agent._intervalHandle !== null, 'Interval handle created after start()');

    const handle = agent._intervalHandle;

    agent.stop();
    assert(agent.isRunning === false, 'Agent not running after stop()');
    assert(agent._intervalHandle === null, 'Interval handle cleared after stop()');
    assert(agent._eventUnsubscribers.length === 0, 'Event unsubscribers cleared after stop()');
  }

  // ── Test 10: runHistory caps at 50 ──
  console.log('\nTest 10: runHistory caps at 50');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_10',
      name: 'History Cap Test Agent',
      role: 'tester',
      capabilities: ['testing']
    });

    // Add 55 cycle entries
    for (let i = 0; i < 55; i++) {
      agent._recordCycle({
        cycleId: `CYCLE-${i}`,
        startedAt: new Date().toISOString(),
        duration: 100,
        eventsProcessed: 1,
        status: 'success'
      });
    }

    assert(agent.runHistory.length === 50, 'runHistory capped at 50 entries');
    assert(agent.runHistory[0].cycleId === 'CYCLE-5', 'Oldest entries dropped (first is CYCLE-5)');
    assert(agent.runHistory[49].cycleId === 'CYCLE-54', 'Newest entry is CYCLE-54');
  }

  // ── Test 11: getCycleHistory returns copy ──
  console.log('\nTest 11: getCycleHistory returns copy');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_11',
      name: 'History Copy Test Agent',
      role: 'tester',
      capabilities: ['testing']
    });

    agent._recordCycle({
      cycleId: 'CYCLE-COPY-TEST',
      startedAt: new Date().toISOString(),
      duration: 50,
      eventsProcessed: 1,
      status: 'success'
    });

    const history = agent.getCycleHistory();
    assert(Array.isArray(history), 'getCycleHistory returns array');
    assert(history.length === 1, 'getCycleHistory has correct length');
    assert(history !== agent.runHistory, 'getCycleHistory returns a different array instance');

    // Mutating the copy should not affect the original
    history.push({ cycleId: 'INJECTED' });
    assert(agent.runHistory.length === 1, 'Original runHistory unaffected by mutation of copy');
  }

  // ── Test 12: getAutonomousStatus returns correct shape ──
  console.log('\nTest 12: getAutonomousStatus returns correct shape');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_12',
      name: 'Status Test Agent',
      role: 'tester',
      capabilities: ['testing'],
      scanIntervalMs: 120000,
      eventAccelerationThreshold: 7,
      subscribedTopics: ['alert:*']
    });

    agent.eventBuffer.push({ type: 'test', data: {} });
    agent.eventBuffer.push({ type: 'test2', data: {} });

    const status = agent.getAutonomousStatus();

    assert(status.agentId === 'TEST_AUTO_12', 'status.agentId correct');
    assert(status.name === 'Status Test Agent', 'status.name correct');
    assert(status.isRunning === false, 'status.isRunning correct');
    assert(status.scanIntervalMs === 120000, 'status.scanIntervalMs correct');
    assert(status.eventAccelerationThreshold === 7, 'status.eventAccelerationThreshold correct');
    assert(status.eventsBuffered === 2, 'status.eventsBuffered correct');
    assert(status.lastRunAt === null, 'status.lastRunAt correct');
    assert(status.totalCycles === 0, 'status.totalCycles correct');
    assert(Array.isArray(status.subscribedTopics), 'status.subscribedTopics is array');
    assert(status.subscribedTopics.length === 1, 'status.subscribedTopics has correct length');
    assert(status.subscribedTopics[0] === 'alert:*', 'status.subscribedTopics[0] correct');

    // Verify subscribedTopics is a copy
    status.subscribedTopics.push('injected');
    assert(agent.subscribedTopics.length === 1, 'Original subscribedTopics unaffected');
  }

  // ── Test 13: Double start is idempotent ──
  console.log('\nTest 13: Double start is idempotent');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_13',
      name: 'Idempotent Start Agent',
      role: 'tester',
      capabilities: ['testing'],
      scanIntervalMs: 60000
    });

    agent.start();
    const firstHandle = agent._intervalHandle;

    agent.start(); // Second call should be a no-op
    const secondHandle = agent._intervalHandle;

    assert(firstHandle === secondHandle, 'Same interval handle after double start');
    assert(agent.isRunning === true, 'Agent still running after double start');

    agent.stop();
  }

  // ── Test 14: Abstract methods throw when not implemented ──
  console.log('\nTest 14: Abstract methods throw when not implemented');
  {
    const agent = new AutonomousAgent({
      agentId: 'TEST_AUTO_14',
      name: 'Abstract Test Agent',
      role: 'tester',
      capabilities: ['testing']
    });

    let buildThrew = false;
    try {
      agent._buildScanInput();
    } catch (e) {
      buildThrew = true;
      assert(e.message.includes('must implement _buildScanInput'), 'Error message mentions _buildScanInput');
    }
    assert(buildThrew, '_buildScanInput throws for base class');

    let postThrew = false;
    try {
      await agent._postCycle({});
    } catch (e) {
      postThrew = true;
      assert(e.message.includes('must implement _postCycle'), 'Error message mentions _postCycle');
    }
    assert(postThrew, '_postCycle throws for base class');
  }

  // ── Test 15: Event buffer caps at 1000 ──
  console.log('\nTest 15: Event buffer caps at 1000');
  {
    const agent = new TestAgent({
      agentId: 'TEST_AUTO_15',
      name: 'Buffer Cap Agent',
      role: 'tester',
      capabilities: ['testing']
    });
    // Prevent cycle triggering
    agent.lastRunAt = Date.now();

    for (let i = 0; i < 1050; i++) {
      agent._onEvent({ type: 'test', data: { index: i } });
    }

    assert(agent.eventBuffer.length === 1000, 'Event buffer capped at 1000');
    assert(agent.eventBuffer[0].data.index === 50, 'Oldest events dropped (first index is 50)');
    assert(agent.eventBuffer[999].data.index === 1049, 'Newest event is index 1049');
  }

  // ── Results ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
