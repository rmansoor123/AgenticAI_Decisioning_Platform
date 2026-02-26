/**
 * Standalone test for the feedback API service.
 * Verifies the module exports an Express router function.
 * Run with: node backend/services/feedback/__tests__/feedback-api.test.js
 */

import feedbackRouter from '../index.js';

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

  // ── Test 1: Module exports a function (Express router) ──
  console.log('\nTest 1: Module exports a function');
  assert(typeof feedbackRouter === 'function', 'feedbackRouter is a function');

  // ── Test 2: Router has standard Express router properties ──
  console.log('\nTest 2: Router has Express router properties');
  assert(typeof feedbackRouter.stack !== 'undefined', 'router has a stack property');
  assert(Array.isArray(feedbackRouter.stack), 'router.stack is an array');

  // ── Test 3: Router has registered routes ──
  console.log('\nTest 3: Router has registered routes');
  const routes = feedbackRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
    }));

  assert(routes.length >= 3, `At least 3 routes registered (got ${routes.length})`);

  // ── Test 4: POST / route exists ──
  console.log('\nTest 4: POST / route exists');
  const postRoot = routes.find(r => r.path === '/' && r.methods.includes('post'));
  assert(!!postRoot, 'POST / route is registered');

  // ── Test 5: GET /queue route exists ──
  console.log('\nTest 5: GET /queue route exists');
  const getQueue = routes.find(r => r.path === '/queue' && r.methods.includes('get'));
  assert(!!getQueue, 'GET /queue route is registered');

  // ── Test 6: GET /stats route exists ──
  console.log('\nTest 6: GET /stats route exists');
  const getStats = routes.find(r => r.path === '/stats' && r.methods.includes('get'));
  assert(!!getStats, 'GET /stats route is registered');

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
