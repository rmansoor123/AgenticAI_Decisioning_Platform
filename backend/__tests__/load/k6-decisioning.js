/**
 * k6 load test for the decisioning platform.
 * Run: k6 run backend/__tests__/load/k6-decisioning.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 },  // Ramp up
    { duration: '30s', target: 50 },   // Sustain
    { duration: '10s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% under 500ms
    http_req_failed: ['rate<0.05'],     // Less than 5% errors
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  // 1. Health check
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  // 2. ML inference
  const mlPayload = JSON.stringify({
    features: {
      country: 'US',
      businessCategory: 'SOFTWARE',
      businessAgeDays: 365
    }
  });
  const ml = http.post(`${BASE_URL}/api/ml/inference/test`, mlPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(ml, { 'ml inference 200': (r) => r.status === 200 });

  // 3. Seller segmentation
  const seg = http.get(`${BASE_URL}/api/seller-tools/segmentation`);
  check(seg, { 'segmentation 200': (r) => r.status === 200 });

  // 4. Financial underwriting
  const uwPayload = JSON.stringify({
    sellerId: 'SLR-LOADTEST',
    riskScore: 30,
    gmv30d: 50000,
    accountAgeDays: 180,
    sellerTier: 'Gold'
  });
  const uw = http.post(`${BASE_URL}/api/financial-platform/underwrite`, uwPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(uw, { 'underwriting 200': (r) => r.status === 200 });

  sleep(0.5);
}
