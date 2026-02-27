/**
 * Integration test for ListingIntelligenceAgent.
 * Run with: node backend/agents/specialized/__tests__/listing-intelligence-agent.test.js
 */

import { ListingIntelligenceAgent, getListingIntelligenceAgent } from '../listing-intelligence-agent.js';
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
    const agent = getListingIntelligenceAgent();
    assert(agent.agentId === 'LISTING_INTELLIGENCE', 'agentId is LISTING_INTELLIGENCE');
    assert(agent.name === 'Listing Intelligence Monitor', 'name is correct');
    assert(agent.role === 'listing_analyst', 'role is correct');
  }

  // ── Test 2: Capabilities ──
  console.log('\nTest 2: Capabilities');
  {
    const agent = getListingIntelligenceAgent();
    assert(Array.isArray(agent.capabilities), 'capabilities is array');
    assert(agent.capabilities.length === 3, 'has 3 capabilities');
    assert(agent.capabilities.includes('listing_monitoring'), 'has listing_monitoring');
    assert(agent.capabilities.includes('pricing_analysis'), 'has pricing_analysis');
    assert(agent.capabilities.includes('content_similarity'), 'has content_similarity');
  }

  // ── Test 3: Autonomous config ──
  console.log('\nTest 3: Autonomous configuration');
  {
    const agent = getListingIntelligenceAgent();
    assert(agent.scanIntervalMs === 900000, 'scanIntervalMs is 900000 (15 min)');
    assert(agent.eventAccelerationThreshold === 5, 'threshold is 5');
    assert(agent.subscribedTopics.includes('risk:event:created'), 'subscribed to risk:event:created');
    assert(agent.subscribedTopics.includes('listing:created'), 'subscribed to listing:created');
  }

  // ── Test 4: Tools registered ──
  console.log('\nTest 4: Tools registered');
  {
    const agent = getListingIntelligenceAgent();
    assert(agent.tools instanceof Map, 'tools is a Map');
    assert(agent.tools.size === 5, `5 tools registered (found ${agent.tools.size})`);
    assert(agent.tools.has('get_listing_history'), 'has get_listing_history');
    assert(agent.tools.has('get_category_pricing'), 'has get_category_pricing');
    assert(agent.tools.has('check_listing_velocity'), 'has check_listing_velocity');
    assert(agent.tools.has('find_similar_listings'), 'has find_similar_listings');
    assert(agent.tools.has('get_seller_category_profile'), 'has get_seller_category_profile');
  }

  // ── Test 5: Tool structure ──
  console.log('\nTest 5: Tool structure');
  {
    const agent = getListingIntelligenceAgent();
    for (const [name, tool] of agent.tools) {
      assert(typeof tool.description === 'string' && tool.description.length > 0, `${name} has description`);
      assert(typeof tool.handler === 'function', `${name} has handler`);
    }
  }

  // ── Test 6: _buildScanInput filters listing events ──
  console.log('\nTest 6: _buildScanInput filters listing events');
  {
    const agent = getListingIntelligenceAgent();
    agent.eventBuffer = [
      { data: { sellerId: 'S-001', domain: 'listing', eventType: 'LISTING_CREATED' } },
      { data: { sellerId: 'S-002', domain: 'payout', eventType: 'PAYOUT_REQUESTED' } },
      { data: { sellerId: 'S-001', domain: 'listing', eventType: 'LISTING_UPDATED' } },
      { data: { sellerId: 'S-003', domain: 'listing', eventType: 'LISTING_FLAGGED' } }
    ];

    const input = agent._buildScanInput();
    assert(input.sellers.length === 2, '2 sellers with listing events');
    assert(input.totalEvents === 3, '3 listing events');
    const s001 = input.sellers.find(s => s.sellerId === 'S-001');
    assert(s001.eventCount === 2, 'S-001 has 2 events');
  }

  // ── Test 7: _postCycle stores detections ──
  console.log('\nTest 7: _postCycle stores detections');
  {
    const agent = getListingIntelligenceAgent();
    const before = agent.detections.length;
    await agent._postCycle({
      findings: [{ sellerId: 'S-LI-1', type: 'BELOW_MARKET', severity: 'HIGH' }]
    });
    assert(agent.detections.length === before + 1, 'detection added');
  }

  // ── Test 8: _postCycle caps at 200 ──
  console.log('\nTest 8: _postCycle caps at 200');
  {
    const agent = getListingIntelligenceAgent();
    agent.detections = new Array(199).fill({ sellerId: 'X' });
    await agent._postCycle({ actions: [{ sellerId: 'A' }, { sellerId: 'B' }, { sellerId: 'C' }] });
    assert(agent.detections.length <= 200, `capped (got ${agent.detections.length})`);
  }

  // ── Test 9: Tools requiring sellerId fail without it ──
  console.log('\nTest 9: Tools requiring sellerId fail without it');
  {
    const agent = getListingIntelligenceAgent();
    const sellerIdTools = ['get_listing_history', 'check_listing_velocity', 'get_seller_category_profile'];
    for (const name of sellerIdTools) {
      const tool = agent.tools.get(name);
      const result = await tool.handler({});
      assert(result.success === false, `${name} fails without sellerId`);
    }
    // find_similar_listings requires listingId or title
    const fsl = await agent.tools.get('find_similar_listings').handler({});
    assert(fsl.success === false, 'find_similar_listings fails without listingId or title');
    // get_category_pricing works without params (queries all)
    const gcp = await agent.tools.get('get_category_pricing').handler({});
    assert(gcp.success === true, 'get_category_pricing succeeds without sellerId');
  }

  // ── Test 10: get_listing_history structure ──
  console.log('\nTest 10: get_listing_history structure');
  {
    const agent = getListingIntelligenceAgent();
    const result = await agent.tools.get('get_listing_history').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(Array.isArray(result.data.listings), 'listings is array');
    assert(typeof result.data.total === 'number', 'total is number');
  }

  // ── Test 11: get_category_pricing structure ──
  console.log('\nTest 11: get_category_pricing structure');
  {
    const agent = getListingIntelligenceAgent();
    const result = await agent.tools.get('get_category_pricing').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(Array.isArray(result.data.categories), 'categories is array');
    assert(typeof result.data.totalListings === 'number', 'totalListings is number');
  }

  // ── Test 12: check_listing_velocity structure ──
  console.log('\nTest 12: check_listing_velocity structure');
  {
    const agent = getListingIntelligenceAgent();
    const result = await agent.tools.get('check_listing_velocity').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(result.data.windows !== undefined, 'has windows');
    assert(typeof result.data.totalListings === 'number', 'totalListings is number');
  }

  // ── Test 13: find_similar_listings structure ──
  console.log('\nTest 13: find_similar_listings structure');
  {
    const agent = getListingIntelligenceAgent();
    const result = await agent.tools.get('find_similar_listings').handler({ title: 'Test product listing' });
    assert(result.success === true, 'succeeds');
    assert(Array.isArray(result.data.similarListings), 'similarListings is array');
  }

  // ── Test 14: get_seller_category_profile structure ──
  console.log('\nTest 14: get_seller_category_profile structure');
  {
    const agent = getListingIntelligenceAgent();
    const result = await agent.tools.get('get_seller_category_profile').handler({ sellerId: 'S-TEST' });
    assert(result.success === true, 'succeeds');
    assert(Array.isArray(result.data.categories), 'categories is array');
    assert(typeof result.data.totalListings === 'number', 'totalListings is number');
  }

  // ── Test 15: Singleton ──
  console.log('\nTest 15: Singleton pattern');
  {
    const a = getListingIntelligenceAgent();
    const b = getListingIntelligenceAgent();
    assert(a === b, 'same instance');
    assert(a instanceof ListingIntelligenceAgent, 'correct type');
  }

  // ── Test 16: _postCycle handles empty ──
  console.log('\nTest 16: _postCycle handles empty result');
  {
    const agent = getListingIntelligenceAgent();
    const result = await agent._postCycle({});
    assert(result.detectionsEmitted === 0, 'zero emitted');
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
