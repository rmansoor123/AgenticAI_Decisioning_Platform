/**
 * Integration test for CrossDomainCorrelationAgent.
 * Run with: node backend/agents/specialized/__tests__/cross-domain-agent.test.js
 *
 * Standalone Node.js test — no test framework required.
 */

import { CrossDomainCorrelationAgent, getCrossDomainAgent } from '../cross-domain-agent.js';
import { db_ops } from '../../../shared/common/database.js';
import { getSequencePatterns } from '../../core/sequence-patterns.js';

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

  // ── Test 1: Agent identity properties ──
  console.log('\nTest 1: Agent identity properties');
  {
    const agent = getCrossDomainAgent();

    assert(agent.agentId === 'CROSS_DOMAIN_CORRELATION', 'agentId is CROSS_DOMAIN_CORRELATION');
    assert(agent.name === 'Cross-Domain Correlation Agent', 'name is Cross-Domain Correlation Agent');
    assert(agent.role === 'cross_domain_analyst', 'role is cross_domain_analyst');
  }

  // ── Test 2: Capabilities ──
  console.log('\nTest 2: Capabilities');
  {
    const agent = getCrossDomainAgent();

    assert(Array.isArray(agent.capabilities), 'capabilities is an array');
    assert(agent.capabilities.length === 4, 'capabilities has 4 entries');
    assert(agent.capabilities.includes('cross_domain_detection'), 'has cross_domain_detection');
    assert(agent.capabilities.includes('trajectory_analysis'), 'has trajectory_analysis');
    assert(agent.capabilities.includes('sequence_matching'), 'has sequence_matching');
    assert(agent.capabilities.includes('coordinated_behavior_detection'), 'has coordinated_behavior_detection');
  }

  // ── Test 3: Autonomous configuration ──
  console.log('\nTest 3: Autonomous configuration');
  {
    const agent = getCrossDomainAgent();

    assert(agent.scanIntervalMs === 300000, 'scanIntervalMs is 300000 (5 minutes)');
    assert(agent.eventAccelerationThreshold === 3, 'eventAccelerationThreshold is 3');
  }

  // ── Test 4: Subscribed topics ──
  console.log('\nTest 4: Subscribed topics');
  {
    const agent = getCrossDomainAgent();

    assert(Array.isArray(agent.subscribedTopics), 'subscribedTopics is an array');
    assert(agent.subscribedTopics.length === 3, 'subscribedTopics has 3 entries');
    assert(agent.subscribedTopics.includes('risk:event:created'), 'subscribed to risk:event:created');
    assert(agent.subscribedTopics.includes('decision:made'), 'subscribed to decision:made');
    assert(agent.subscribedTopics.includes('case:resolved'), 'subscribed to case:resolved');
  }

  // ── Test 5: 6 tools registered ──
  console.log('\nTest 5: 6 tools registered');
  {
    const agent = getCrossDomainAgent();

    assert(agent.tools.size === 6, `6 tools registered (found ${agent.tools.size})`);
    assert(agent.tools.has('get_seller_timeline'), 'has get_seller_timeline tool');
    assert(agent.tools.has('get_domain_velocity'), 'has get_domain_velocity tool');
    assert(agent.tools.has('compare_seller_trajectories'), 'has compare_seller_trajectories tool');
    assert(agent.tools.has('check_sequence_pattern'), 'has check_sequence_pattern tool');
    assert(agent.tools.has('get_network_peers'), 'has get_network_peers tool');
    assert(agent.tools.has('predict_next_step'), 'has predict_next_step tool');
  }

  // ── Test 6: _buildScanInput groups events by sellerId ──
  console.log('\nTest 6: _buildScanInput groups events by sellerId');
  {
    const agent = getCrossDomainAgent();
    // Seed the event buffer
    agent.eventBuffer = [
      { data: { sellerId: 'S-001' }, type: 'risk:event:created' },
      { data: { sellerId: 'S-002' }, type: 'risk:event:created' },
      { data: { sellerId: 'S-001' }, type: 'decision:made' },
      { data: { sellerId: 'S-003' }, type: 'case:resolved' }
    ];

    const input = agent._buildScanInput();

    assert(input.sellerEvents['S-001'].length === 2, 'S-001 has 2 events');
    assert(input.sellerEvents['S-002'].length === 1, 'S-002 has 1 event');
    assert(input.sellerEvents['S-003'].length === 1, 'S-003 has 1 event');
    assert(Object.keys(input.sellerEvents).length === 3, '3 unique sellers in sellerEvents');
  }

  // ── Test 7: _buildScanInput returns totalEvents count ──
  console.log('\nTest 7: _buildScanInput returns totalEvents count');
  {
    const agent = getCrossDomainAgent();
    agent.eventBuffer = [
      { data: { sellerId: 'S-A' }, type: 'test' },
      { data: { sellerId: 'S-B' }, type: 'test' },
      { data: { sellerId: 'S-A' }, type: 'test' }
    ];

    const input = agent._buildScanInput();

    assert(input.totalEvents === 3, 'totalEvents is 3');
    assert(typeof input.scanTimestamp === 'string', 'scanTimestamp is a string');
  }

  // ── Test 8: Singleton pattern ──
  console.log('\nTest 8: Singleton pattern');
  {
    const a = getCrossDomainAgent();
    const b = getCrossDomainAgent();

    assert(a === b, 'getCrossDomainAgent() returns the same instance');
    assert(a instanceof CrossDomainCorrelationAgent, 'instance is CrossDomainCorrelationAgent');
  }

  // ── Test 9: check_sequence_pattern returns match results ──
  console.log('\nTest 9: check_sequence_pattern returns match results');
  {
    const agent = getCrossDomainAgent();

    // Seed risk_events with a timeline that matches BUST_OUT partially
    const testSellerId = `TEST-SELLER-${Date.now().toString(36)}`;
    const now = Date.now();

    const events = [
      {
        sellerId: testSellerId,
        domain: 'onboarding',
        eventType: 'SELLER_APPROVED',
        riskScore: 30,
        createdAt: new Date(now - 50 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        sellerId: testSellerId,
        domain: 'account_setup',
        eventType: 'ACCOUNT_SETUP_OK',
        riskScore: 10,
        createdAt: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        sellerId: testSellerId,
        domain: 'listing',
        eventType: 'LISTING_APPROVED',
        riskScore: 20,
        createdAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    // Insert test events into the database
    for (let i = 0; i < events.length; i++) {
      const eventId = `EVT-TEST-${Date.now()}-${i}`;
      db_ops.insert('risk_events', 'event_id', eventId, events[i]);
    }

    const tool = agent.tools.get('check_sequence_pattern');
    const result = await tool.handler({ sellerId: testSellerId, patternId: 'BUST_OUT' });

    assert(result.success === true, 'check_sequence_pattern returns success');
    assert(result.data !== undefined, 'check_sequence_pattern returns data');
    assert(result.data.patternId === 'BUST_OUT', 'result has correct patternId');
    assert(typeof result.data.stepsCompleted === 'number', 'result has stepsCompleted');
    assert(result.data.stepsCompleted >= 2, 'at least 2 steps completed for partial BUST_OUT match');
  }

  // ── Test 10: get_domain_velocity counts events correctly ──
  console.log('\nTest 10: get_domain_velocity counts events correctly');
  {
    const agent = getCrossDomainAgent();

    // Insert fresh events for a known seller
    const velocitySellerId = `VEL-SELLER-${Date.now().toString(36)}`;
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      db_ops.insert('risk_events', 'event_id', `VEL-EVT-${now}-${i}`, {
        sellerId: velocitySellerId,
        domain: 'transaction',
        eventType: 'VELOCITY_SPIKE',
        riskScore: 60 + i,
        createdAt: new Date(now - i * 24 * 60 * 60 * 1000).toISOString()
      });
    }

    const tool = agent.tools.get('get_domain_velocity');
    const result = await tool.handler({
      sellerId: velocitySellerId,
      domain: 'transaction',
      windowDays: 30
    });

    assert(result.success === true, 'get_domain_velocity returns success');
    assert(result.data.count === 5, 'get_domain_velocity counts 5 events');
    assert(result.data.domain === 'transaction', 'domain is transaction');
    assert(typeof result.data.avgRiskScore === 'number', 'avgRiskScore is a number');
    assert(result.data.avgRiskScore > 0, 'avgRiskScore is positive');
  }

  // ── Test 11: predict_next_step returns expected shape ──
  console.log('\nTest 11: predict_next_step returns expected shape');
  {
    const agent = getCrossDomainAgent();
    const tool = agent.tools.get('predict_next_step');
    const result = await tool.handler({
      sellerId: 'S-PREDICT-001',
      matchedPattern: 'BUST_OUT',
      stepsCompleted: 3
    });

    assert(result.success === true, 'predict_next_step returns success');
    assert(typeof result.data.predictedDomain === 'string', 'predictedDomain is a string');
    assert(Array.isArray(result.data.predictedEventTypes), 'predictedEventTypes is an array');
    assert(typeof result.data.confidence === 'number', 'confidence is a number');
    assert(result.data.confidence >= 0 && result.data.confidence <= 1, 'confidence is between 0 and 1');
  }

  // ── Test 12: detections array starts empty ──
  console.log('\nTest 12: detections array starts empty');
  {
    // Create a fresh instance to verify initial state
    const freshAgent = new CrossDomainCorrelationAgent();

    assert(Array.isArray(freshAgent.detections), 'detections is an array');
    assert(freshAgent.detections.length === 0, 'detections starts empty');
  }

  // ── Test 13: Agent has selfCorrection instance ──
  console.log('\nTest 13: Agent has selfCorrection instance');
  {
    const agent = getCrossDomainAgent();

    assert(agent.selfCorrection !== null && agent.selfCorrection !== undefined, 'selfCorrection exists');
    assert(typeof agent.selfCorrection.logPrediction === 'function', 'selfCorrection has logPrediction method');
    assert(typeof agent.selfCorrection.getAccuracy === 'function', 'selfCorrection has getAccuracy method');
  }

  // ── Test 14: Agent has calibrator instance ──
  console.log('\nTest 14: Agent has calibrator instance');
  {
    const agent = getCrossDomainAgent();

    assert(agent.calibrator !== null && agent.calibrator !== undefined, 'calibrator exists');
    assert(typeof agent.calibrator.getCalibratedConfidence === 'function', 'calibrator has getCalibratedConfidence');
    assert(typeof agent.calibrator.recordPrediction === 'function', 'calibrator has recordPrediction');
  }

  // ── Test 15: get_seller_timeline tool ──
  console.log('\nTest 15: get_seller_timeline returns sorted events');
  {
    const agent = getCrossDomainAgent();
    const timelineSellerId = `TL-SELLER-${Date.now().toString(36)}`;
    const now = Date.now();

    // Insert events out of order
    db_ops.insert('risk_events', 'event_id', `TL-EVT-${now}-2`, {
      sellerId: timelineSellerId,
      domain: 'transaction',
      eventType: 'VELOCITY_SPIKE',
      riskScore: 70,
      createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString()
    });
    db_ops.insert('risk_events', 'event_id', `TL-EVT-${now}-1`, {
      sellerId: timelineSellerId,
      domain: 'onboarding',
      eventType: 'SELLER_APPROVED',
      riskScore: 20,
      createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString()
    });

    const tool = agent.tools.get('get_seller_timeline');
    const result = await tool.handler({ sellerId: timelineSellerId });

    assert(result.success === true, 'get_seller_timeline returns success');
    assert(result.data.eventCount === 2, 'timeline has 2 events');
    assert(result.data.events[0].domain === 'onboarding', 'first event is the earlier one (onboarding)');
    assert(result.data.events[1].domain === 'transaction', 'second event is the later one (transaction)');
  }

  // ── Test 16: get_network_peers handles missing graph gracefully ──
  console.log('\nTest 16: get_network_peers handles missing graph gracefully');
  {
    const agent = getCrossDomainAgent();
    const tool = agent.tools.get('get_network_peers');
    const result = await tool.handler({ sellerId: 'S-NO-GRAPH' });

    assert(result.success === true, 'get_network_peers returns success even without graph');
    assert(Array.isArray(result.data.peers), 'peers is an array');
  }

  // ── Test 17: predict_next_step with invalid pattern ──
  console.log('\nTest 17: predict_next_step with invalid pattern');
  {
    const agent = getCrossDomainAgent();
    const tool = agent.tools.get('predict_next_step');
    const result = await tool.handler({
      sellerId: 'S-001',
      matchedPattern: 'NONEXISTENT_PATTERN',
      stepsCompleted: 1
    });

    assert(result.success === false, 'predict_next_step fails for unknown pattern');
    assert(typeof result.error === 'string', 'error message is a string');
  }

  // ── Test 18: _postCycle processes detections ──
  console.log('\nTest 18: _postCycle processes detections');
  {
    const agent = getCrossDomainAgent();
    const initialDetections = agent.detections.length;

    await agent._postCycle({
      result: {
        findings: [
          {
            sellerId: 'S-POST-001',
            patternId: 'BUST_OUT',
            patternName: 'Bust-Out Fraud',
            matchScore: 0.85,
            stepsCompleted: 4,
            totalSteps: 6,
            severity: 'CRITICAL'
          }
        ]
      }
    });

    assert(agent.detections.length === initialDetections + 1, 'detection added to detections array');
    const lastDetection = agent.detections[agent.detections.length - 1];
    assert(lastDetection.sellerId === 'S-POST-001', 'detection has correct sellerId');
    assert(lastDetection.patternId === 'BUST_OUT', 'detection has correct patternId');
    assert(typeof lastDetection.detectedAt === 'string', 'detection has detectedAt timestamp');
  }

  // ── Test 19: _buildScanInput handles events without sellerId ──
  console.log('\nTest 19: _buildScanInput handles events without sellerId');
  {
    const agent = getCrossDomainAgent();
    agent.eventBuffer = [
      { data: {}, type: 'risk:event:created' },
      { data: { sellerId: 'S-KNOWN' }, type: 'risk:event:created' }
    ];

    const input = agent._buildScanInput();

    assert(input.sellerEvents['unknown'] !== undefined, 'events without sellerId grouped under "unknown"');
    assert(input.sellerEvents['unknown'].length === 1, '"unknown" group has 1 event');
    assert(input.sellerEvents['S-KNOWN'].length === 1, 'S-KNOWN group has 1 event');
  }

  // ── Test 20: knowledgeBase is initialized ──
  console.log('\nTest 20: knowledgeBase is initialized');
  {
    const agent = getCrossDomainAgent();
    assert(agent.knowledgeBase !== null && agent.knowledgeBase !== undefined, 'knowledgeBase exists');
    assert(typeof agent.knowledgeBase.addKnowledge === 'function', 'knowledgeBase has addKnowledge method');
    assert(typeof agent.knowledgeBase.searchKnowledge === 'function', 'knowledgeBase has searchKnowledge method');
  }

  // ── Results ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
