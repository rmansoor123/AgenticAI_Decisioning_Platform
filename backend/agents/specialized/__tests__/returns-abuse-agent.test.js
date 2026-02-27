/**
 * Integration test for ReturnsAbuseAgent.
 * Run with: node backend/agents/specialized/__tests__/returns-abuse-agent.test.js
 */

import { ReturnsAbuseAgent, getReturnsAbuseAgent } from '../returns-abuse-agent.js';
import { db_ops } from '../../../shared/common/database.js';

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) { console.log(`  PASS: ${message}`); passed++; }
    else { console.error(`  FAIL: ${message}`); failed++; }
  }

  // ── Test 1: Agent identity ──
  console.log('\nTest 1: Agent identity');
  {
    const agent = getReturnsAbuseAgent();
    assert(agent.agentId === 'RETURNS_ABUSE', 'agentId is RETURNS_ABUSE');
    assert(agent.name === 'Returns Abuse Detector', 'name is correct');
    assert(agent.role === 'returns_analyst', 'role is correct');
  }

  // ── Test 2: Capabilities ──
  console.log('\nTest 2: Capabilities');
  {
    const agent = getReturnsAbuseAgent();
    assert(Array.isArray(agent.capabilities), 'capabilities is array');
    assert(agent.capabilities.length === 3, 'has 3 capabilities');
    assert(agent.capabilities.includes('returns_monitoring'), 'has returns_monitoring');
    assert(agent.capabilities.includes('serial_returner_detection'), 'has serial_returner_detection');
    assert(agent.capabilities.includes('refund_abuse_analysis'), 'has refund_abuse_analysis');
  }

  // ── Test 3: Autonomous config ──
  console.log('\nTest 3: Autonomous configuration');
  {
    const agent = getReturnsAbuseAgent();
    assert(agent.scanIntervalMs === 1200000, 'scanIntervalMs is 1200000 (20 min)');
    assert(agent.eventAccelerationThreshold === 4, 'threshold is 4');
    assert(agent.subscribedTopics.includes('risk:event:created'), 'subscribed to risk:event:created');
    assert(agent.subscribedTopics.includes('return:created'), 'subscribed to return:created');
  }

  // ── Test 4: Tools registered ──
  console.log('\nTest 4: Tools registered');
  {
    const agent = getReturnsAbuseAgent();
    assert(agent.tools instanceof Map, 'tools is a Map');
    assert(agent.tools.size === 5, `5 tools registered (found ${agent.tools.size})`);
    assert(agent.tools.has('get_return_history'), 'has get_return_history');
    assert(agent.tools.has('get_return_rate_stats'), 'has get_return_rate_stats');
    assert(agent.tools.has('check_refund_amount_validity'), 'has check_refund_amount_validity');
    assert(agent.tools.has('get_buyer_return_profile'), 'has get_buyer_return_profile');
    assert(agent.tools.has('check_payout_return_timing'), 'has check_payout_return_timing');
  }

  // ── Test 5: Tool structure ──
  console.log('\nTest 5: Tool structure');
  {
    const agent = getReturnsAbuseAgent();
    for (const [name, tool] of agent.tools) {
      assert(typeof tool.description === 'string' && tool.description.length > 0, `${name} has description`);
      assert(typeof tool.handler === 'function', `${name} has handler`);
    }
  }

  // ── Test 6: _buildScanInput filters return events ──
  console.log('\nTest 6: _buildScanInput filters return events');
  {
    const agent = getReturnsAbuseAgent();
    agent.eventBuffer = [
      { data: { sellerId: 'S-001', domain: 'returns', eventType: 'RETURN_FILED' } },
      { data: { sellerId: 'S-002', domain: 'listing', eventType: 'LISTING_CREATED' } },
      { data: { sellerId: 'S-001', domain: 'transaction', eventType: 'REFUND_ISSUED' } },
      { data: { sellerId: 'S-003', domain: 'returns', eventType: 'RETURN_APPROVED' } }
    ];

    const input = agent._buildScanInput();
    assert(input.sellers.length === 2, '2 sellers with return events');
    assert(input.totalEvents === 3, '3 return-related events');
    const s001 = input.sellers.find(s => s.sellerId === 'S-001');
    assert(s001.eventCount === 2, 'S-001 has 2 events (return + refund)');
  }

  // ── Test 7: _postCycle stores detections ──
  console.log('\nTest 7: _postCycle stores detections');
  {
    const agent = getReturnsAbuseAgent();
    const before = agent.detections.length;
    await agent._postCycle({
      findings: [{ sellerId: 'S-RA-1', type: 'SERIAL_RETURNER', severity: 'HIGH' }]
    });
    assert(agent.detections.length === before + 1, 'detection added');
    assert(agent.detections[agent.detections.length - 1].type === 'SERIAL_RETURNER', 'correct type');
  }

  // ── Test 8: _postCycle caps at 200 ──
  console.log('\nTest 8: _postCycle caps at 200');
  {
    const agent = getReturnsAbuseAgent();
    agent.detections = new Array(199).fill({ sellerId: 'X' });
    await agent._postCycle({ actions: [{ sellerId: 'A' }, { sellerId: 'B' }, { sellerId: 'C' }] });
    assert(agent.detections.length <= 200, `capped (got ${agent.detections.length})`);
  }

  // ── Test 9: Tool handlers require sellerId ──
  console.log('\nTest 9: Tool handlers require sellerId');
  {
    const agent = getReturnsAbuseAgent();
    for (const [name, tool] of agent.tools) {
      const result = await tool.handler({});
      assert(result.success === false, `${name} fails without sellerId`);
    }
  }

  // ── Test 10: get_return_history structure ──
  console.log('\nTest 10: get_return_history structure');
  {
    const agent = getReturnsAbuseAgent();
    const result = await agent.tools.get('get_return_history').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(Array.isArray(result.data.returns), 'returns is array');
    assert(typeof result.data.total === 'number', 'total is number');
  }

  // ── Test 11: get_return_rate_stats structure ──
  console.log('\nTest 11: get_return_rate_stats structure');
  {
    const agent = getReturnsAbuseAgent();
    const result = await agent.tools.get('get_return_rate_stats').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(typeof result.data.returnRate === 'number', 'returnRate is number');
    assert(typeof result.data.byReason === 'object', 'byReason is object');
    assert(result.data.windows !== undefined, 'has windows');
  }

  // ── Test 12: check_refund_amount_validity structure ──
  console.log('\nTest 12: check_refund_amount_validity structure');
  {
    const agent = getReturnsAbuseAgent();
    const result = await agent.tools.get('check_refund_amount_validity').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(typeof result.data.anomalousRefunds === 'number', 'anomalousRefunds is number');
    assert(typeof result.data.anomalyRate === 'number', 'anomalyRate is number');
  }

  // ── Test 13: get_buyer_return_profile structure ──
  console.log('\nTest 13: get_buyer_return_profile structure');
  {
    const agent = getReturnsAbuseAgent();
    const result = await agent.tools.get('get_buyer_return_profile').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(typeof result.data.uniqueBuyers === 'number', 'uniqueBuyers is number');
    assert(Array.isArray(result.data.serialReturners), 'serialReturners is array');
  }

  // ── Test 14: check_payout_return_timing structure ──
  console.log('\nTest 14: check_payout_return_timing structure');
  {
    const agent = getReturnsAbuseAgent();
    const result = await agent.tools.get('check_payout_return_timing').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(typeof result.data.returnsNearPayouts === 'number', 'returnsNearPayouts is number');
    assert('collusionIndicator' in result.data, 'has collusionIndicator');
  }

  // ── Test 15: Singleton ──
  console.log('\nTest 15: Singleton pattern');
  {
    const a = getReturnsAbuseAgent();
    const b = getReturnsAbuseAgent();
    assert(a === b, 'same instance');
    assert(a instanceof ReturnsAbuseAgent, 'correct type');
  }

  // ── Test 16: _postCycle handles empty ──
  console.log('\nTest 16: _postCycle handles empty result');
  {
    const agent = getReturnsAbuseAgent();
    const result = await agent._postCycle({});
    assert(result.detectionsEmitted === 0, 'zero emitted');
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
