/**
 * Integration test for PayoutRiskAgent.
 * Run with: node backend/agents/specialized/__tests__/payout-risk-agent.test.js
 */

import { PayoutRiskAgent, getPayoutRiskAgent } from '../payout-risk-agent.js';
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
    const agent = getPayoutRiskAgent();
    assert(agent.agentId === 'PAYOUT_RISK', 'agentId is PAYOUT_RISK');
    assert(agent.name === 'Payout Risk Monitor', 'name is correct');
    assert(agent.role === 'payout_risk_analyst', 'role is correct');
  }

  // ── Test 2: Capabilities ──
  console.log('\nTest 2: Capabilities');
  {
    const agent = getPayoutRiskAgent();
    assert(Array.isArray(agent.capabilities), 'capabilities is array');
    assert(agent.capabilities.length === 3, 'has 3 capabilities');
    assert(agent.capabilities.includes('payout_monitoring'), 'has payout_monitoring');
    assert(agent.capabilities.includes('velocity_detection'), 'has velocity_detection');
    assert(agent.capabilities.includes('cash_out_analysis'), 'has cash_out_analysis');
  }

  // ── Test 3: Autonomous config ──
  console.log('\nTest 3: Autonomous configuration');
  {
    const agent = getPayoutRiskAgent();
    assert(agent.scanIntervalMs === 600000, 'scanIntervalMs is 600000 (10 min)');
    assert(agent.eventAccelerationThreshold === 3, 'eventAccelerationThreshold is 3');
    assert(agent.subscribedTopics.includes('risk:event:created'), 'subscribed to risk:event:created');
    assert(agent.subscribedTopics.includes('decision:made'), 'subscribed to decision:made');
  }

  // ── Test 4: Tools registered ──
  console.log('\nTest 4: Tools registered');
  {
    const agent = getPayoutRiskAgent();
    assert(agent.tools instanceof Map, 'tools is a Map');
    assert(agent.tools.size === 5, `5 tools registered (found ${agent.tools.size})`);
    assert(agent.tools.has('get_payout_history'), 'has get_payout_history');
    assert(agent.tools.has('get_payout_velocity'), 'has get_payout_velocity');
    assert(agent.tools.has('check_bank_change_timing'), 'has check_bank_change_timing');
    assert(agent.tools.has('get_seller_dispute_status'), 'has get_seller_dispute_status');
    assert(agent.tools.has('compare_payout_to_revenue'), 'has compare_payout_to_revenue');
  }

  // ── Test 5: Tool structure ──
  console.log('\nTest 5: Tool structure');
  {
    const agent = getPayoutRiskAgent();
    for (const [name, tool] of agent.tools) {
      assert(typeof tool.description === 'string' && tool.description.length > 0, `${name} has description`);
      assert(typeof tool.handler === 'function', `${name} has handler function`);
    }
  }

  // ── Test 6: _buildScanInput filters payout events ──
  console.log('\nTest 6: _buildScanInput filters payout events');
  {
    const agent = getPayoutRiskAgent();
    agent.eventBuffer = [
      { data: { sellerId: 'S-001', domain: 'payout', eventType: 'PAYOUT_REQUESTED' } },
      { data: { sellerId: 'S-002', domain: 'listing', eventType: 'LISTING_CREATED' } },
      { data: { sellerId: 'S-001', domain: 'profile_updates', eventType: 'BANK_CHANGE' } },
      { data: { sellerId: 'S-003', domain: 'payout', eventType: 'PAYOUT_COMPLETED' } }
    ];

    const input = agent._buildScanInput();
    assert(input.sellers.length === 2, 'filters to 2 sellers with payout events');
    assert(input.totalEvents === 3, '3 payout-related events total');
    assert(typeof input.scanTimestamp === 'string', 'has scanTimestamp');

    const s001 = input.sellers.find(s => s.sellerId === 'S-001');
    assert(s001 !== undefined, 'S-001 included (payout + bank_change)');
    assert(s001.eventCount === 2, 'S-001 has 2 events');
  }

  // ── Test 7: _buildScanInput groups by seller ──
  console.log('\nTest 7: _buildScanInput groups by seller');
  {
    const agent = getPayoutRiskAgent();
    agent.eventBuffer = [
      { data: { sellerId: 'S-A', domain: 'payout' } },
      { data: { sellerId: 'S-A', domain: 'payout' } },
      { data: { sellerId: 'S-B', domain: 'payout' } }
    ];

    const input = agent._buildScanInput();
    assert(input.sellers.length === 2, '2 unique sellers');
    const sA = input.sellers.find(s => s.sellerId === 'S-A');
    assert(sA.eventCount === 2, 'S-A has 2 events');
  }

  // ── Test 8: _postCycle stores detections ──
  console.log('\nTest 8: _postCycle stores detections');
  {
    const agent = getPayoutRiskAgent();
    const before = agent.detections.length;

    await agent._postCycle({
      actions: [
        { sellerId: 'S-POST-1', type: 'CASH_OUT', severity: 'HIGH', riskScore: 80 },
        { sellerId: 'S-POST-2', type: 'VELOCITY_SPIKE', severity: 'MEDIUM', riskScore: 60 }
      ]
    });

    assert(agent.detections.length === before + 2, 'two detections added');
    const last = agent.detections[agent.detections.length - 1];
    assert(last.sellerId === 'S-POST-2', 'last detection sellerId correct');
    assert(typeof last.detectedAt === 'string', 'detection has detectedAt');
  }

  // ── Test 9: _postCycle caps at 200 ──
  console.log('\nTest 9: _postCycle caps at 200');
  {
    const agent = getPayoutRiskAgent();
    agent.detections = new Array(199).fill({ sellerId: 'X', type: 'test' });

    await agent._postCycle({
      actions: [
        { sellerId: 'S-CAP-1' },
        { sellerId: 'S-CAP-2' },
        { sellerId: 'S-CAP-3' }
      ]
    });

    assert(agent.detections.length <= 200, `detections capped at 200 (got ${agent.detections.length})`);
  }

  // ── Test 10: Tool handlers require sellerId ──
  console.log('\nTest 10: Tool handlers require sellerId');
  {
    const agent = getPayoutRiskAgent();
    for (const [name, tool] of agent.tools) {
      const result = await tool.handler({});
      assert(result.success === false, `${name} fails without sellerId`);
      assert(result.error.includes('sellerId'), `${name} error mentions sellerId`);
    }
  }

  // ── Test 11: get_payout_history returns structure ──
  console.log('\nTest 11: get_payout_history returns structure');
  {
    const agent = getPayoutRiskAgent();
    const tool = agent.tools.get('get_payout_history');
    const result = await tool.handler({ sellerId: 'S-NONEXISTENT' });
    assert(result.success === true, 'succeeds even with no data');
    assert(result.data.sellerId === 'S-NONEXISTENT', 'returns sellerId');
    assert(Array.isArray(result.data.payouts), 'payouts is array');
    assert(typeof result.data.total === 'number', 'total is number');
  }

  // ── Test 12: get_payout_velocity returns windows ──
  console.log('\nTest 12: get_payout_velocity returns windows');
  {
    const agent = getPayoutRiskAgent();
    const tool = agent.tools.get('get_payout_velocity');
    const result = await tool.handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(result.data.windows['24h'] !== undefined, 'has 24h window');
    assert(result.data.windows['7d'] !== undefined, 'has 7d window');
    assert(result.data.windows['30d'] !== undefined, 'has 30d window');
    assert(typeof result.data.windows['24h'].count === 'number', '24h has count');
    assert(typeof result.data.windows['24h'].totalAmount === 'number', '24h has totalAmount');
  }

  // ── Test 13: check_bank_change_timing returns structure ──
  console.log('\nTest 13: check_bank_change_timing returns structure');
  {
    const agent = getPayoutRiskAgent();
    const tool = agent.tools.get('check_bank_change_timing');
    const result = await tool.handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert('riskIndicator' in result.data, 'has riskIndicator');
    assert('recentBankChange' in result.data, 'has recentBankChange');
    assert('recentPayouts' in result.data, 'has recentPayouts');
  }

  // ── Test 14: compare_payout_to_revenue returns ratio ──
  console.log('\nTest 14: compare_payout_to_revenue returns ratio');
  {
    const agent = getPayoutRiskAgent();
    const tool = agent.tools.get('compare_payout_to_revenue');
    const result = await tool.handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(typeof result.data.payoutToRevenueRatio === 'number', 'has payoutToRevenueRatio');
    assert('isAnomalous' in result.data, 'has isAnomalous');
  }

  // ── Test 15: Singleton pattern ──
  console.log('\nTest 15: Singleton pattern');
  {
    const a = getPayoutRiskAgent();
    const b = getPayoutRiskAgent();
    assert(a === b, 'same instance returned');
    assert(a instanceof PayoutRiskAgent, 'is PayoutRiskAgent');
  }

  // ── Test 16: Detections start empty ──
  console.log('\nTest 16: Detections start empty');
  {
    const fresh = new PayoutRiskAgent();
    assert(Array.isArray(fresh.detections), 'detections is array');
    assert(fresh.detections.length === 0, 'starts empty');
  }

  // ── Test 17: _postCycle handles empty result ──
  console.log('\nTest 17: _postCycle handles empty result');
  {
    const agent = getPayoutRiskAgent();
    const before = agent.detections.length;
    const result = await agent._postCycle({});
    assert(result.detectionsEmitted === 0, 'zero detections emitted');
    assert(agent.detections.length === before, 'no change to detections');
  }

  // ── Results ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
