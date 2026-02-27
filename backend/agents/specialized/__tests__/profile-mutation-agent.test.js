/**
 * Integration test for ProfileMutationAgent.
 * Run with: node backend/agents/specialized/__tests__/profile-mutation-agent.test.js
 */

import { ProfileMutationAgent, getProfileMutationAgent } from '../profile-mutation-agent.js';
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
    const agent = getProfileMutationAgent();
    assert(agent.agentId === 'PROFILE_MUTATION', 'agentId is PROFILE_MUTATION');
    assert(agent.name === 'Profile Mutation Tracker', 'name is correct');
    assert(agent.role === 'profile_analyst', 'role is correct');
  }

  // ── Test 2: Capabilities ──
  console.log('\nTest 2: Capabilities');
  {
    const agent = getProfileMutationAgent();
    assert(Array.isArray(agent.capabilities), 'capabilities is array');
    assert(agent.capabilities.length === 3, 'has 3 capabilities');
    assert(agent.capabilities.includes('profile_monitoring'), 'has profile_monitoring');
    assert(agent.capabilities.includes('identity_change_detection'), 'has identity_change_detection');
  }

  // ── Test 3: Autonomous config ──
  console.log('\nTest 3: Autonomous configuration');
  {
    const agent = getProfileMutationAgent();
    assert(agent.scanIntervalMs === 600000, 'scanIntervalMs is 600000 (10 min)');
    assert(agent.eventAccelerationThreshold === 3, 'threshold is 3');
    assert(agent.subscribedTopics.includes('risk:event:created'), 'subscribed to risk:event:created');
    assert(agent.subscribedTopics.includes('profile:updated'), 'subscribed to profile:updated');
  }

  // ── Test 4: Tools registered ──
  console.log('\nTest 4: Tools registered');
  {
    const agent = getProfileMutationAgent();
    assert(agent.tools instanceof Map, 'tools is a Map');
    assert(agent.tools.size === 5, `5 tools registered (found ${agent.tools.size})`);
    assert(agent.tools.has('get_profile_change_history'), 'has get_profile_change_history');
    assert(agent.tools.has('get_change_velocity'), 'has get_change_velocity');
    assert(agent.tools.has('check_device_history'), 'has check_device_history');
    assert(agent.tools.has('get_dispute_context'), 'has get_dispute_context');
    assert(agent.tools.has('compare_identity_documents'), 'has compare_identity_documents');
  }

  // ── Test 5: Tool structure ──
  console.log('\nTest 5: Tool structure');
  {
    const agent = getProfileMutationAgent();
    for (const [name, tool] of agent.tools) {
      assert(typeof tool.description === 'string' && tool.description.length > 0, `${name} has description`);
      assert(typeof tool.handler === 'function', `${name} has handler`);
    }
  }

  // ── Test 6: _buildScanInput filters profile events ──
  console.log('\nTest 6: _buildScanInput filters profile events');
  {
    const agent = getProfileMutationAgent();
    agent.eventBuffer = [
      { data: { sellerId: 'S-001', domain: 'profile_updates', eventType: 'EMAIL_CHANGED' } },
      { data: { sellerId: 'S-002', domain: 'transaction', eventType: 'VELOCITY_SPIKE' } },
      { data: { sellerId: 'S-001', domain: 'payout', eventType: 'BANK_CHANGE' } },
      { data: { sellerId: 'S-003', domain: 'profile_updates', eventType: 'ADDRESS_CHANGED' } }
    ];

    const input = agent._buildScanInput();
    assert(input.sellers.length === 2, 'filters to 2 sellers with profile events');
    assert(input.totalEvents === 3, '3 profile-related events');
    const s001 = input.sellers.find(s => s.sellerId === 'S-001');
    assert(s001 !== undefined, 'S-001 included');
    assert(s001.eventCount === 2, 'S-001 has 2 events (profile + bank_change)');
  }

  // ── Test 7: _postCycle stores detections ──
  console.log('\nTest 7: _postCycle stores detections');
  {
    const agent = getProfileMutationAgent();
    const before = agent.detections.length;
    await agent._postCycle({
      findings: [{ sellerId: 'S-PM-1', type: 'RAPID_IDENTITY_CHANGES', severity: 'HIGH' }]
    });
    assert(agent.detections.length === before + 1, 'detection added');
    assert(agent.detections[agent.detections.length - 1].sellerId === 'S-PM-1', 'correct sellerId');
  }

  // ── Test 8: _postCycle caps at 200 ──
  console.log('\nTest 8: _postCycle caps at 200');
  {
    const agent = getProfileMutationAgent();
    agent.detections = new Array(199).fill({ sellerId: 'X' });
    await agent._postCycle({ actions: [{ sellerId: 'A' }, { sellerId: 'B' }, { sellerId: 'C' }] });
    assert(agent.detections.length <= 200, `capped at 200 (got ${agent.detections.length})`);
  }

  // ── Test 9: Tool handlers require sellerId ──
  console.log('\nTest 9: Tool handlers require sellerId');
  {
    const agent = getProfileMutationAgent();
    for (const [name, tool] of agent.tools) {
      const result = await tool.handler({});
      assert(result.success === false, `${name} fails without sellerId`);
    }
  }

  // ── Test 10: get_profile_change_history structure ──
  console.log('\nTest 10: get_profile_change_history structure');
  {
    const agent = getProfileMutationAgent();
    const result = await agent.tools.get('get_profile_change_history').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(Array.isArray(result.data.updates), 'updates is array');
    assert(typeof result.data.total === 'number', 'total is number');
  }

  // ── Test 11: get_change_velocity returns windows ──
  console.log('\nTest 11: get_change_velocity returns windows');
  {
    const agent = getProfileMutationAgent();
    const result = await agent.tools.get('get_change_velocity').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(result.data.windows['24h'] !== undefined, 'has 24h window');
    assert(result.data.windows['7d'] !== undefined, 'has 7d window');
    assert(typeof result.data.windows['24h'].count === 'number', '24h count is number');
  }

  // ── Test 12: check_device_history structure ──
  console.log('\nTest 12: check_device_history structure');
  {
    const agent = getProfileMutationAgent();
    const result = await agent.tools.get('check_device_history').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(Array.isArray(result.data.knownDevices), 'knownDevices is array');
    assert(typeof result.data.deviceCount === 'number', 'deviceCount is number');
  }

  // ── Test 13: get_dispute_context structure ──
  console.log('\nTest 13: get_dispute_context structure');
  {
    const agent = getProfileMutationAgent();
    const result = await agent.tools.get('get_dispute_context').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(typeof result.data.openDisputes === 'number', 'openDisputes is number');
    assert('riskIndicator' in result.data, 'has riskIndicator');
  }

  // ── Test 14: compare_identity_documents structure ──
  console.log('\nTest 14: compare_identity_documents structure');
  {
    const agent = getProfileMutationAgent();
    const result = await agent.tools.get('compare_identity_documents').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(typeof result.data.totalReUploads === 'number', 'totalReUploads is number');
    assert('rapidReUpload' in result.data, 'has rapidReUpload');
  }

  // ── Test 15: Singleton ──
  console.log('\nTest 15: Singleton pattern');
  {
    const a = getProfileMutationAgent();
    const b = getProfileMutationAgent();
    assert(a === b, 'same instance');
    assert(a instanceof ProfileMutationAgent, 'correct type');
  }

  // ── Test 16: _postCycle handles empty ──
  console.log('\nTest 16: _postCycle handles empty result');
  {
    const agent = getProfileMutationAgent();
    const result = await agent._postCycle({});
    assert(result.detectionsEmitted === 0, 'zero emitted');
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
