/**
 * Integration Tests — 8 New Service → Agent Contracts
 *
 * Validates that each service:
 *   1. Creates a DB record on POST
 *   2. Fires agent .reason() asynchronously
 *   3. Returns HTTP 202 with the created entity ID
 *   4. Agent decision updates the record status
 *
 * Run with: USE_LLM=false node backend/services/business/__tests__/service-agent-integration.test.js
 */

import express from 'express';
import { createServer } from 'http';
import { initializeDatabaseSync, db_ops } from '../../../shared/common/database.js';

// ============================================================================
// SERVICE DEFINITIONS
// ============================================================================

const SERVICES = [
  {
    name: 'transaction-processing',
    importPath: '../transaction-processing/index.js',
    mountPath: '/transactions',
    idField: 'transactionId',
    dbTable: 'transactions',
    dbKeyColumn: 'transaction_id',
    agentFactory: 'getTransactionRiskAgent',
    agentPath: '../../../agents/specialized/transaction-risk-agent.js',
    payload: {
      sellerId: 'SLR-TEST001',
      amount: 149.99,
      buyerId: 'BUY-TEST001',
      paymentMethod: 'credit_card',
      itemId: 'ITM-TEST001',
      shippingAddress: '123 Test St',
      deviceFingerprint: 'DEV-TEST-001'
    }
  },
  {
    name: 'payment-processing',
    importPath: '../payment-processing/index.js',
    mountPath: '/payments',
    idField: 'paymentId',
    dbTable: 'payments',
    dbKeyColumn: 'payment_id',
    agentFactory: 'getPaymentRiskAgent',
    agentPath: '../../../agents/specialized/payment-risk-agent.js',
    payload: {
      sellerId: 'SLR-TEST001',
      amount: 299.99,
      cardBin: '411111',
      cardLast4: '1234',
      paymentType: 'credit',
      currency: 'USD',
      billingCountry: 'US',
      deviceFingerprint: 'DEV-TEST-002'
    }
  },
  {
    name: 'compliance-aml',
    importPath: '../compliance-aml/index.js',
    mountPath: '/checks',
    idField: 'checkId',
    dbTable: 'compliance_checks',
    dbKeyColumn: 'check_id',
    agentFactory: 'getComplianceAgent',
    agentPath: '../../../agents/specialized/compliance-agent.js',
    payload: {
      sellerId: 'SLR-TEST001',
      checkType: 'standard',
      transactionVolume: 50000,
      linkedAccounts: 2,
      jurisdiction: 'US',
      cryptoActivity: false
    }
  },
  {
    name: 'network-intelligence',
    importPath: '../network-intelligence/index.js',
    mountPath: '/scans',
    idField: 'scanId',
    dbTable: 'network_scans',
    dbKeyColumn: 'scan_id',
    agentFactory: 'getNetworkIntelligenceAgent',
    agentPath: '../../../agents/specialized/network-intelligence-agent.js',
    payload: {
      sellerId: 'SLR-TEST001',
      scanType: 'standard',
      linkedSellers: [],
      sharedInfrastructure: [],
      deviceFingerprints: ['DEV-TEST-003'],
      bankAccounts: ['BA-001']
    }
  },
  {
    name: 'review-integrity',
    importPath: '../review-integrity/index.js',
    mountPath: '/checks',
    idField: 'checkId',
    dbTable: 'review_checks',
    dbKeyColumn: 'check_id',
    agentFactory: 'getReviewIntegrityAgent',
    agentPath: '../../../agents/specialized/review-integrity-agent.js',
    payload: {
      sellerId: 'SLR-TEST001',
      reviewId: 'RVW-TEST001',
      reviewerAccount: 'RVWR-001',
      rating: 5,
      reviewText: 'Great product, fast shipping!',
      purchaseDate: '2025-12-01'
    }
  },
  {
    name: 'behavioral-analytics',
    importPath: '../behavioral-analytics/index.js',
    mountPath: '/checks',
    idField: 'checkId',
    dbTable: 'behavior_checks',
    dbKeyColumn: 'check_id',
    agentFactory: 'getBehavioralAnalyticsAgent',
    agentPath: '../../../agents/specialized/behavioral-analytics-agent.js',
    payload: {
      sellerId: 'SLR-TEST001',
      sessionId: 'SESS-TEST001',
      clickRate: 2.5,
      typingSpeed: 45,
      browsingRatio: 0.6,
      deviceFingerprint: 'DEV-TEST-004',
      actionTimestamps: [1000, 2500, 4000]
    }
  },
  {
    name: 'buyer-trust',
    importPath: '../buyer-trust/index.js',
    mountPath: '/checks',
    idField: 'checkId',
    dbTable: 'buyer_checks',
    dbKeyColumn: 'check_id',
    agentFactory: 'getBuyerTrustAgent',
    agentPath: '../../../agents/specialized/buyer-trust-agent.js',
    payload: {
      sellerId: 'SLR-TEST001',
      buyerId: 'BUY-TEST002',
      purchaseAmount: 89.99,
      isFirstPurchase: false,
      chargebackHistory: 0,
      disputeCount: 0,
      deviceFingerprint: 'DEV-TEST-005'
    }
  },
  {
    name: 'policy-enforcement',
    importPath: '../policy-enforcement/index.js',
    mountPath: '/checks',
    idField: 'checkId',
    dbTable: 'policy_checks',
    dbKeyColumn: 'check_id',
    agentFactory: 'getPolicyEnforcementAgent',
    agentPath: '../../../agents/specialized/policy-enforcement-agent.js',
    payload: {
      sellerId: 'SLR-TEST001',
      violationType: 'minor_policy',
      sellerMetrics: { salesCount: 100, avgRating: 4.5 },
      linkedAccounts: [],
      complianceScore: 85,
      priorViolations: 0
    }
  }
];

// ============================================================================
// TEST HELPERS
// ============================================================================

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

function makeRequest(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const url = `http://localhost:${port}${path}`;
      const options = {
        method: method.toUpperCase(),
        headers: { 'Content-Type': 'application/json' }
      };

      fetch(url, { ...options, body: body ? JSON.stringify(body) : undefined })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          server.close();
          resolve({ status: res.status, data });
        })
        .catch(err => {
          server.close();
          reject(err);
        });
    });
  });
}

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runTests() {
  console.log('Service → Agent Integration Tests');
  console.log(`Testing ${SERVICES.length} service contracts\n`);

  // ── Setup: Initialize DB and seed a test seller ──
  console.log('Setup: Initializing database...');
  initializeDatabaseSync();

  // Seed test seller
  const testSeller = {
    sellerId: 'SLR-TEST001',
    businessName: 'Integration Test Seller',
    country: 'US',
    status: 'active',
    riskScore: 20,
    riskTier: 'LOW',
    verificationStatus: 'VERIFIED',
    createdAt: new Date().toISOString()
  };

  try {
    db_ops.insert('sellers', 'seller_id', 'SLR-TEST001', testSeller);
    console.log('  Seeded test seller: SLR-TEST001');
  } catch (e) {
    // Already exists — update it
    db_ops.update('sellers', 'seller_id', 'SLR-TEST001', testSeller);
    console.log('  Test seller SLR-TEST001 already exists, updated');
  }

  // ── Test each service ──
  for (const svc of SERVICES) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Service: ${svc.name}`);
    console.log(`${'─'.repeat(60)}`);

    try {
      // Import the router module
      const routerModule = await import(svc.importPath);
      const router = routerModule.default;
      assert(router !== undefined, `${svc.name} exports a router`);

      // Track agent.reason() invocations via spy
      const agentModule = await import(svc.agentPath);
      const agentFactoryFn = agentModule[svc.agentFactory];
      assert(typeof agentFactoryFn === 'function', `${svc.name} has ${svc.agentFactory} factory`);

      const agent = agentFactoryFn();
      let reasonCalled = false;
      const originalReason = agent.reason.bind(agent);
      agent.reason = async function (...args) {
        reasonCalled = true;
        return originalReason(...args);
      };

      // Mount router on a mini Express app
      const app = express();
      app.use(express.json());
      app.use(svc.mountPath, router);

      // POST with test payload
      const { status, data } = await makeRequest(app, 'POST', svc.mountPath, svc.payload);

      // Assert: HTTP 202 Accepted
      assert(status === 202, `${svc.name} returns HTTP 202 (got ${status})`);

      // Assert: response has success: true
      assert(data.success === true, `${svc.name} returns success: true`);

      // Assert: response contains entity ID
      const entityId = data[svc.idField];
      assert(entityId !== undefined && entityId !== null, `${svc.name} returns ${svc.idField}: ${entityId}`);

      // Assert: record exists in DB
      if (entityId) {
        const record = db_ops.getById(svc.dbTable, svc.dbKeyColumn, entityId);
        assert(record !== undefined && record !== null, `${svc.name} record exists in ${svc.dbTable}`);

        if (record) {
          const recordData = record.data || record;
          assert(recordData.sellerId === 'SLR-TEST001', `${svc.name} record has correct sellerId`);
        }
      }

      // Wait briefly for async agent invocation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Assert: agent.reason() was invoked
      assert(reasonCalled, `${svc.name} invoked ${svc.agentFactory}().reason()`);

      // Check if agent updated the record status (from EVALUATING to a decision)
      if (entityId) {
        const updatedRecord = db_ops.getById(svc.dbTable, svc.dbKeyColumn, entityId);
        if (updatedRecord) {
          const updatedData = updatedRecord.data || updatedRecord;
          const statusUpdated = updatedData.status !== 'EVALUATING';
          assert(statusUpdated, `${svc.name} agent updated status from EVALUATING to ${updatedData.status}`);
        }
      }

      // Restore original reason
      agent.reason = originalReason;

    } catch (err) {
      console.error(`  ERROR: ${svc.name} — ${err.message}`);
      failed++;
    }
  }

  // ── Summary ──
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Service Integration Tests: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(60)}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
