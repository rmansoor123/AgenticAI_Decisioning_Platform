# Checkpoint Agents Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 4 autonomous checkpoint agents (Payout Risk, Listing Intelligence, Profile Mutation, Returns Abuse) that continuously monitor their domains and detect fraud patterns.

**Architecture:** Each extends AutonomousAgent, registers tools, implements `_buildScanInput()` and `_postCycle()`, connects via API router, and appears on the frontend.

**Tech Stack:** Node.js ES modules, AutonomousAgent base class, Express routers, React frontend.

**Design Reference:** `docs/plans/2026-02-26-checkpoint-agents-design.md`

---

### Task 1: Payout Risk Agent + Tests

**Files:**
- Create: `backend/agents/specialized/payout-risk-agent.js`
- Create: `backend/agents/specialized/__tests__/payout-risk-agent.test.js`

Implement the Payout Risk Agent following `backend/agents/specialized/cross-domain-agent.js` pattern exactly.

**Agent (`payout-risk-agent.js`):**

```js
import { AutonomousAgent } from '../core/autonomous-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { getConfidenceCalibrator } from '../core/confidence-calibrator.js';
import { createSelfCorrection } from '../core/self-correction.js';
```

Try/catch optional imports (same pattern as cross-domain-agent.js):
```js
let eventBus = null;
try {
  const module = await import('../../gateway/websocket/event-bus.js');
  eventBus = module.getEventBus();
} catch (e) { /* not available */ }

let messenger = null;
try {
  const { getAgentMessenger } = await import('../core/agent-messenger.js');
  messenger = getAgentMessenger();
} catch (e) { /* not available */ }

let patternMemory = null;
try {
  const { getPatternMemory } = await import('../core/pattern-memory.js');
  patternMemory = getPatternMemory();
} catch (e) { /* not available */ }
```

- Class `PayoutRiskAgent extends AutonomousAgent`
- Constructor calls `super()` with:
  - `agentId`: `'PAYOUT_RISK'`
  - `name`: `'Payout Risk Monitor'`
  - `role`: `'payout_risk_analyst'`
  - `capabilities`: `['payout_velocity_detection', 'bank_change_correlation', 'cash_out_prevention', 'dispute_payout_analysis']`
  - `scanIntervalMs`: `600000` (10 minutes)
  - `eventAccelerationThreshold`: `3`
  - `subscribedTopics`: `['risk:event:created', 'decision:made']`
- Initialize in constructor (same as cross-domain-agent.js):
  ```js
  this.selfCorrection = createSelfCorrection(this.agentId);
  this.calibrator = getConfidenceCalibrator();
  this.knowledgeBase = getKnowledgeBase();
  this.detections = [];
  this._registerTools();
  ```
- `_registerTools()` registers 5 tools using `this.registerTool(name, description, async handler)`:

**Tool 1 — `get_payout_history`:**
- Description: `'Retrieve full payout timeline for a seller with amounts and statuses'`
- Handler receives `{ sellerId }`. Validate sellerId.
- `db_ops.getAll('payouts', 10000, 0)` — map `.data`, filter by `sellerId`, sort by `createdAt` ascending.
- Return `{ success: true, data: { sellerId, payouts: [...], payoutCount } }` or `{ success: false, error }`.

**Tool 2 — `get_payout_velocity`:**
- Description: `'Compute payout frequency and amounts over configurable time windows'`
- Handler receives `{ sellerId, windowDays }`. Default `windowDays` to 30.
- `db_ops.getAll('payouts', 10000, 0)` — filter by sellerId and cutoff timestamp.
- Compute 3 windows: 24h, 7d, 30d. For each: `{ count, totalAmount }`.
- Return `{ success: true, data: { sellerId, windows: { '24h': {...}, '7d': {...}, '30d': {...} } } }`.

**Tool 3 — `check_bank_change_timing`:**
- Description: `'Check timing between most recent bank change and payout requests'`
- Handler receives `{ sellerId }`.
- `db_ops.getAll('profile_updates', 10000, 0)` — filter by sellerId AND `type === 'bank_change'`, sort by date descending, take most recent.
- `db_ops.getAll('payouts', 10000, 0)` — filter by sellerId, sort by date descending, take most recent.
- Compute `timeBetweenMs` = payout date - bank change date.
- Return `{ success: true, data: { sellerId, lastBankChange, lastPayout, timeBetweenMs, withinRiskWindow: timeBetweenMs < 48 * 3600 * 1000 } }`.

**Tool 4 — `get_seller_dispute_status`:**
- Description: `'Get open disputes and chargeback history for a seller'`
- Handler receives `{ sellerId }`.
- `db_ops.getAll('cases', 10000, 0)` — filter by sellerId.
- Count open (`status === 'OPEN'`), resolved, total. Compute dispute rate.
- Return `{ success: true, data: { sellerId, openDisputes, resolvedDisputes, totalDisputes, disputeRate } }`.

**Tool 5 — `compare_payout_to_revenue`:**
- Description: `'Compare total payout amounts vs actual transaction revenue for a seller'`
- Handler receives `{ sellerId }`.
- `db_ops.getAll('payouts', 10000, 0)` — filter by sellerId, sum amounts.
- `db_ops.getAll('transactions', 10000, 0)` — filter by sellerId, sum amounts.
- Compute `ratio = totalPayouts / totalRevenue`.
- Return `{ success: true, data: { sellerId, totalPayouts, totalRevenue, ratio, anomalous: ratio > 1.0 } }`.

**`_buildScanInput()` — follow cross-domain-agent.js exactly:**
```js
_buildScanInput() {
  const sellers = {};
  for (const event of this.eventBuffer) {
    const sellerId = event.data?.sellerId || event.sellerId || 'unknown';
    const domain = event.data?.domain || event.domain || '';
    // Filter for payout-relevant events
    if (!domain || domain === 'payout' || domain === 'profile_updates') {
      if (!sellers[sellerId]) sellers[sellerId] = [];
      sellers[sellerId].push(event);
    }
  }
  return {
    sellers,
    eventCount: this.eventBuffer.length,
    scanTimestamp: new Date().toISOString()
  };
}
```

**`_postCycle(result)` — follow cross-domain-agent.js pattern exactly:**
- Extract findings: `result?.result?.findings || result?.findings || result?.detections || []`
- Guard: if not array or empty, return early.
- For each detection with `matchScore > 0.7`:
  - Push to `this.detections` with `detectedAt` timestamp. Cap at 200 via `this.detections = this.detections.slice(-200)`.
  - Log prediction via `this.selfCorrection.logPrediction(...)`.
  - Write to knowledge base: `this.knowledgeBase.addKnowledge('risk-events', [...])` with category `'payout-risk'`, domain `'payout'`.
  - Emit event: `this.emitEvent('payout-risk:detection', { agentId, sellerId, patternId, matchScore, severity })`.
- For detections above calibrated confidence threshold (0.6), broadcast via messenger: `messenger.broadcast({ from, content, priority })`.

**Singleton export (same pattern as cross-domain-agent.js):**
```js
let instance = null;
export function getPayoutRiskAgent() {
  if (!instance) instance = new PayoutRiskAgent();
  return instance;
}
export default PayoutRiskAgent;
```

**Test (`payout-risk-agent.test.js`) — follow `cross-domain-agent.test.js` pattern exactly:**

```js
import { PayoutRiskAgent, getPayoutRiskAgent } from '../payout-risk-agent.js';
import { db_ops } from '../../../shared/common/database.js';

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) { console.log(`  PASS: ${message}`); passed++; }
    else { console.error(`  FAIL: ${message}`); failed++; }
  }
  // ... tests ...
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
runTests();
```

**Test groups (50+ assertions total):**

Test 1 — Agent identity (4 assertions):
- `agent.agentId === 'PAYOUT_RISK'`
- `agent.name === 'Payout Risk Monitor'`
- `agent.role === 'payout_risk_analyst'`
- `agent.capabilities.length === 4`

Test 2 — Autonomous configuration (2 assertions):
- `agent.scanIntervalMs === 600000`
- `agent.eventAccelerationThreshold === 3`

Test 3 — Subscribed topics (3 assertions):
- `subscribedTopics.length === 2`
- includes `'risk:event:created'`
- includes `'decision:made'`

Test 4 — 5 tools registered (6 assertions):
- `agent.tools.size === 5`
- has each of the 5 tool names

Test 5 — `_buildScanInput` groups events by seller (4 assertions):
- Seed `eventBuffer` with 4 events (2 sellers, payout domain). Verify grouping by seller, eventCount, scanTimestamp is string.

Test 6 — `_buildScanInput` filters payout-domain events (3 assertions):
- Seed buffer with payout + listing + profile_updates events. Verify only payout and profile_updates passed through, listing filtered out.

Test 7 — `_buildScanInput` handles missing sellerId (2 assertions):
- Event with no sellerId groups under `'unknown'`.

Test 8 — Singleton pattern (2 assertions):
- `getPayoutRiskAgent() === getPayoutRiskAgent()`
- `instanceof PayoutRiskAgent`

Test 9 — `get_payout_history` tool returns data shape (4 assertions):
- Insert test payouts via `db_ops.insert('payouts', ...)`.
- Call tool handler. Assert `success === true`, `data.sellerId`, `data.payouts` is array, `data.payoutCount` is number.

Test 10 — `get_payout_history` validates sellerId required (2 assertions):
- Call handler with `{}`. Assert `success === false`, `error` contains 'sellerId'.

Test 11 — `get_payout_velocity` computes windows (4 assertions):
- Insert test payouts at known timestamps.
- Call handler. Assert `success === true`, `data.windows['24h']` exists, `data.windows['7d']` exists, `data.windows['30d']` exists.

Test 12 — `check_bank_change_timing` detects risk window (3 assertions):
- Insert profile_update (bank_change) and payout within 48h.
- Assert `success === true`, `data.withinRiskWindow === true`, `typeof data.timeBetweenMs === 'number'`.

Test 13 — `get_seller_dispute_status` counts disputes (4 assertions):
- Insert test cases (open + resolved).
- Assert `success === true`, `data.openDisputes` correct, `data.totalDisputes` correct, `typeof data.disputeRate === 'number'`.

Test 14 — `compare_payout_to_revenue` computes ratio (4 assertions):
- Insert payouts + transactions for same seller.
- Assert `success === true`, `typeof data.totalPayouts === 'number'`, `typeof data.totalRevenue === 'number'`, `typeof data.ratio === 'number'`.

Test 15 — `_postCycle` stores detections (3 assertions):
- Call `_postCycle` with mock result containing finding with `matchScore: 0.85`.
- Assert detection added, detection has `sellerId`, detection has `detectedAt`.

Test 16 — `_postCycle` caps detections at 200 (2 assertions):
- Pre-fill `agent.detections` with 200 items, call `_postCycle` with 1 more.
- Assert `detections.length <= 200`, last item is the new detection.

Test 17 — `_postCycle` ignores low-score detections (1 assertion):
- Call with finding `matchScore: 0.3`. Assert detections length unchanged.

Test 18 — Detections array starts empty (2 assertions):
- Fresh agent: `Array.isArray(detections)`, `length === 0`.

Test 19 — selfCorrection exists (2 assertions):
- `selfCorrection !== null`, `typeof selfCorrection.logPrediction === 'function'`

Test 20 — calibrator exists (2 assertions):
- `calibrator !== null`, `typeof calibrator.getCalibratedConfidence === 'function'`

Test 21 — knowledgeBase exists (2 assertions):
- `knowledgeBase !== null`, `typeof knowledgeBase.addKnowledge === 'function'`

**Total: 54 assertions.**

---

### Task 2: Listing Intelligence Agent + Tests

**Files:**
- Create: `backend/agents/specialized/listing-intelligence-agent.js`
- Create: `backend/agents/specialized/__tests__/listing-intelligence-agent.test.js`

Same structure as Task 1, following `cross-domain-agent.js` pattern.

**Agent (`listing-intelligence-agent.js`):**

Imports: same set as payout-risk-agent.js (AutonomousAgent, db_ops, getKnowledgeBase, getConfidenceCalibrator, createSelfCorrection, optional eventBus/messenger/patternMemory).

- Class `ListingIntelligenceAgent extends AutonomousAgent`
- Constructor calls `super()` with:
  - `agentId`: `'LISTING_INTELLIGENCE'`
  - `name`: `'Listing Intelligence Monitor'`
  - `role`: `'listing_intelligence_analyst'`
  - `capabilities`: `['listing_anomaly_detection', 'pricing_analysis', 'content_similarity', 'bulk_creation_detection']`
  - `scanIntervalMs`: `900000` (15 minutes)
  - `eventAccelerationThreshold`: `5`
  - `subscribedTopics`: `['risk:event:created', 'listing:created']`
- Initialize: `selfCorrection`, `calibrator`, `knowledgeBase`, `detections = []`, `_registerTools()`

**5 Tools:**

**Tool 1 — `get_listing_history`:**
- Description: `'Retrieve full listing timeline for a seller with statuses and changes'`
- `db_ops.getAll('listings', 10000, 0)` — filter by sellerId, sort by `createdAt` ascending.
- Return `{ success: true, data: { sellerId, listings, listingCount } }`.

**Tool 2 — `get_category_pricing`:**
- Description: `'Get median/mean pricing statistics for a product category'`
- Handler receives `{ category }`. Validate category.
- `db_ops.getAll('listings', 10000, 0)` — filter by category.
- Compute `prices` array from price field. Calculate `median` (sort + middle), `mean` (sum / count), `count`.
- Return `{ success: true, data: { category, median, mean, count, min, max } }`.

**Tool 3 — `check_listing_velocity`:**
- Description: `'Count listings created per time window for a seller'`
- Handler receives `{ sellerId }`.
- `db_ops.getAll('listings', 10000, 0)` — filter by sellerId.
- Compute 3 windows (1h, 24h, 7d): count listings created within each window.
- Return `{ success: true, data: { sellerId, windows: { '1h': count, '24h': count, '7d': count } } }`.

**Tool 4 — `find_similar_listings`:**
- Description: `'Find listings with similar titles/descriptions using TF-IDF text similarity'`
- Handler receives `{ listingId, threshold }`. Default threshold to `0.8`.
- Get target listing from `db_ops.getAll('listings', ...)`.
- Build simple term frequency vectors from `title + ' ' + description`. For each other listing, compute cosine similarity.
- Return top matches above threshold: `{ success: true, data: { listingId, similarListings: [{ listingId, sellerId, similarity }], matchCount } }`.
- TF-IDF implementation: tokenize (lowercase, split on non-alpha), build term frequency map, compute cosine similarity between two term-frequency vectors. Keep it simple — no external library.

**Tool 5 — `get_seller_category_profile`:**
- Description: `'Get historical category distribution and shifts for a seller'`
- Handler receives `{ sellerId }`.
- `db_ops.getAll('listings', 10000, 0)` — filter by sellerId, group by category, count per category.
- Return `{ success: true, data: { sellerId, categories: { [category]: count }, totalListings, topCategory } }`.

**`_buildScanInput()`:**
- Filter `eventBuffer` for listing-domain events (`domain === 'listing'` or event type matches listing patterns).
- Group by sellerId.
- Return `{ sellers, eventCount, scanTimestamp }`.

**`_postCycle(result)`:**
- Same pattern as Task 1 but with:
  - Event name: `'listing-intelligence:detection'`
  - KB category: `'listing-intelligence'`
  - KB domain: `'listing'`

**Singleton:**
```js
let instance = null;
export function getListingIntelligenceAgent() {
  if (!instance) instance = new ListingIntelligenceAgent();
  return instance;
}
export default ListingIntelligenceAgent;
```

**Test (`listing-intelligence-agent.test.js`) — 50+ assertions:**

Test 1 — Agent identity (4): agentId `'LISTING_INTELLIGENCE'`, name, role, capabilities length 4.

Test 2 — Autonomous config (2): `scanIntervalMs === 900000`, `eventAccelerationThreshold === 5`.

Test 3 — Subscribed topics (3): length 2, includes `'risk:event:created'`, includes `'listing:created'`.

Test 4 — 5 tools registered (6): `tools.size === 5`, each tool name exists.

Test 5 — `_buildScanInput` groups by seller (4): seed events, verify grouping.

Test 6 — `_buildScanInput` filters listing-domain (3): mix of domains, verify only listing passed through.

Test 7 — Singleton pattern (2).

Test 8 — `get_listing_history` returns data (4): insert test listings, verify shape.

Test 9 — `get_listing_history` validates sellerId (2).

Test 10 — `get_category_pricing` computes stats (5): insert listings with known prices, verify median, mean, count, min, max.

Test 11 — `get_category_pricing` validates category required (2).

Test 12 — `check_listing_velocity` computes windows (4): insert listings at known times, verify counts.

Test 13 — `find_similar_listings` finds matches (3): insert listings with similar titles, verify similarity found.

Test 14 — `get_seller_category_profile` groups categories (3): insert listings in 2 categories, verify distribution.

Test 15 — `_postCycle` stores detections (3).

Test 16 — `_postCycle` caps at 200 (2).

Test 17 — Detections starts empty (2).

Test 18 — selfCorrection, calibrator, knowledgeBase exist (6).

**Total: 54 assertions.**

---

### Task 3: Profile Mutation Agent + Tests

**Files:**
- Create: `backend/agents/specialized/profile-mutation-agent.js`
- Create: `backend/agents/specialized/__tests__/profile-mutation-agent.test.js`

Same structure as Task 1, following `cross-domain-agent.js` pattern.

**Agent (`profile-mutation-agent.js`):**

Imports: same set as previous agents.

- Class `ProfileMutationAgent extends AutonomousAgent`
- Constructor calls `super()` with:
  - `agentId`: `'PROFILE_MUTATION'`
  - `name`: `'Profile Mutation Tracker'`
  - `role`: `'profile_mutation_analyst'`
  - `capabilities`: `['identity_change_detection', 'ato_followthrough_detection', 'device_history_analysis', 'multi_field_correlation']`
  - `scanIntervalMs`: `600000` (10 minutes)
  - `eventAccelerationThreshold`: `3`
  - `subscribedTopics`: `['risk:event:created', 'profile:updated']`
- Initialize: `selfCorrection`, `calibrator`, `knowledgeBase`, `detections = []`, `_registerTools()`

**5 Tools:**

**Tool 1 — `get_profile_change_history`:**
- Description: `'Retrieve full profile change timeline for a seller'`
- `db_ops.getAll('profile_updates', 10000, 0)` — filter by sellerId, sort by `createdAt` ascending.
- Return `{ success: true, data: { sellerId, changes, changeCount } }`.

**Tool 2 — `get_change_velocity`:**
- Description: `'Count profile changes by type per time window'`
- Handler receives `{ sellerId }`.
- `db_ops.getAll('profile_updates', 10000, 0)` — filter by sellerId.
- Group by `type` field (bank_change, email_change, phone_change, address_change, document_upload).
- For each type, compute count within 24h, 7d, 30d windows.
- Return `{ success: true, data: { sellerId, changesByType: { [type]: { '24h': n, '7d': n, '30d': n } }, totalChanges } }`.

**Tool 3 — `check_device_history`:**
- Description: `'Check whether the device used for profile changes is known for this seller'`
- Handler receives `{ sellerId, deviceId }`.
- `db_ops.getAll('profile_updates', 10000, 0)` — filter by sellerId, collect unique `deviceId` values.
- Also check `db_ops.getAll('ato_events', 10000, 0)` — filter by sellerId, collect device IDs from ATO events.
- Determine if `deviceId` is in known set.
- Return `{ success: true, data: { sellerId, deviceId, isKnownDevice, knownDevices, atoDeviceMatch } }`.
- `atoDeviceMatch`: true if deviceId appears in ATO events for any seller (signals compromised device).

**Tool 4 — `get_dispute_context`:**
- Description: `'Get open disputes and their timing relative to profile changes'`
- Handler receives `{ sellerId }`.
- `db_ops.getAll('cases', 10000, 0)` — filter by sellerId and `status === 'OPEN'`.
- `db_ops.getAll('profile_updates', 10000, 0)` — filter by sellerId, get most recent.
- Compute time between most recent profile change and each open dispute.
- Return `{ success: true, data: { sellerId, openDisputes, recentProfileChange, disputesDuringChanges } }`.

**Tool 5 — `compare_identity_documents`:**
- Description: `'Compare current vs previous identity document metadata for a seller'`
- Handler receives `{ sellerId }`.
- `db_ops.getAll('profile_updates', 10000, 0)` — filter by sellerId AND `type === 'document_upload'`, sort by date descending.
- Take the two most recent. Compare metadata fields (document type, issuing country, expiry).
- Return `{ success: true, data: { sellerId, current, previous, fieldsChanged, changeCount, rapidResubmission } }`.
- `rapidResubmission`: true if time between uploads < 24h.

**`_buildScanInput()`:**
- Filter `eventBuffer` for profile_updates domain events.
- Group by sellerId.
- Return `{ sellers, eventCount, scanTimestamp }`.

**`_postCycle(result)`:**
- Same pattern. Event name: `'profile-mutation:detection'`. KB category: `'profile-mutation'`. KB domain: `'profile_updates'`.

**Singleton:**
```js
let instance = null;
export function getProfileMutationAgent() {
  if (!instance) instance = new ProfileMutationAgent();
  return instance;
}
export default ProfileMutationAgent;
```

**Test (`profile-mutation-agent.test.js`) — 50+ assertions:**

Test 1 — Agent identity (4): agentId `'PROFILE_MUTATION'`, name, role, capabilities length 4.

Test 2 — Autonomous config (2): `scanIntervalMs === 600000`, `eventAccelerationThreshold === 3`.

Test 3 — Subscribed topics (3): length 2, includes `'risk:event:created'`, includes `'profile:updated'`.

Test 4 — 5 tools registered (6): `tools.size === 5`, each tool name exists.

Test 5 — `_buildScanInput` groups by seller (4).

Test 6 — `_buildScanInput` filters profile_updates domain (3).

Test 7 — Singleton pattern (2).

Test 8 — `get_profile_change_history` returns data (4): insert test profile_updates, verify shape.

Test 9 — `get_profile_change_history` validates sellerId (2).

Test 10 — `get_change_velocity` groups by type (4): insert changes of different types, verify per-type counts.

Test 11 — `check_device_history` identifies known device (3): insert profile_updates with deviceIds, verify known/unknown.

Test 12 — `check_device_history` detects ATO device match (2): insert ato_event with matching deviceId.

Test 13 — `get_dispute_context` finds open disputes (3): insert open cases + profile changes.

Test 14 — `compare_identity_documents` compares submissions (3): insert 2 document_uploads, verify comparison.

Test 15 — `compare_identity_documents` detects rapid resubmission (2): uploads within 24h.

Test 16 — `_postCycle` stores detections (3).

Test 17 — `_postCycle` caps at 200 (2).

Test 18 — Detections starts empty (2).

Test 19 — selfCorrection, calibrator, knowledgeBase exist (6).

**Total: 55 assertions.**

---

### Task 4: Returns Abuse Agent + Tests

**Files:**
- Create: `backend/agents/specialized/returns-abuse-agent.js`
- Create: `backend/agents/specialized/__tests__/returns-abuse-agent.test.js`

Same structure as Task 1, following `cross-domain-agent.js` pattern.

**Agent (`returns-abuse-agent.js`):**

Imports: same set as previous agents.

- Class `ReturnsAbuseAgent extends AutonomousAgent`
- Constructor calls `super()` with:
  - `agentId`: `'RETURNS_ABUSE'`
  - `name`: `'Returns Abuse Detector'`
  - `role`: `'returns_abuse_analyst'`
  - `capabilities`: `['serial_return_detection', 'refund_validation', 'buyer_profiling', 'payout_return_correlation']`
  - `scanIntervalMs`: `1200000` (20 minutes)
  - `eventAccelerationThreshold`: `4`
  - `subscribedTopics`: `['risk:event:created', 'return:created']`
- Initialize: `selfCorrection`, `calibrator`, `knowledgeBase`, `detections = []`, `_registerTools()`

**5 Tools:**

**Tool 1 — `get_return_history`:**
- Description: `'Retrieve full return timeline for a seller with reasons and statuses'`
- `db_ops.getAll('returns', 10000, 0)` — filter by sellerId, sort by `createdAt` ascending.
- Return `{ success: true, data: { sellerId, returns, returnCount } }`.

**Tool 2 — `get_return_rate_stats`:**
- Description: `'Compute return rates by category and time window'`
- Handler receives `{ sellerId }`.
- `db_ops.getAll('returns', 10000, 0)` — filter by sellerId.
- `db_ops.getAll('transactions', 10000, 0)` — filter by sellerId, count total.
- Group returns by category. Compute per-category return rate = returns / transactions.
- Compute overall return rate and rates for 7d, 30d, 90d windows.
- Return `{ success: true, data: { sellerId, overallRate, byCategory: { [cat]: rate }, byWindow: { '7d': rate, '30d': rate, '90d': rate } } }`.

**Tool 3 — `check_refund_amount_validity`:**
- Description: `'Compare refund amounts to original transaction amounts for discrepancies'`
- Handler receives `{ sellerId }`.
- `db_ops.getAll('returns', 10000, 0)` — filter by sellerId. For each return, get `refundAmount` and `originalTransactionId`.
- `db_ops.getAll('transactions', 10000, 0)` — build lookup map by transactionId.
- For each return, compare refundAmount vs original transaction amount.
- Flag any where `refundAmount > originalAmount`.
- Return `{ success: true, data: { sellerId, validRefunds, invalidRefunds, flaggedReturns: [...] } }`.

**Tool 4 — `get_buyer_return_profile`:**
- Description: `'Analyze buyer return patterns across all sellers to detect serial returners'`
- Handler receives `{ sellerId }`.
- `db_ops.getAll('returns', 10000, 0)` — filter by sellerId.
- Group by `buyerId`. For each buyer: count returns, compute return rate.
- Flag serial returners (>5 returns in 30 days).
- Return `{ success: true, data: { sellerId, buyerProfiles: [...], serialReturners: [...] } }`.

**Tool 5 — `check_payout_return_timing`:**
- Description: `'Correlate seller payout timestamps with return filing timestamps'`
- Handler receives `{ sellerId }`.
- `db_ops.getAll('payouts', 10000, 0)` — filter by sellerId, sort by date.
- `db_ops.getAll('returns', 10000, 0)` — filter by sellerId, sort by date.
- For each payout, count returns filed within 48h after. Flag clusters.
- Return `{ success: true, data: { sellerId, correlations: [{ payoutDate, returnsWithin48h }], suspiciousPayouts } }`.

**`_buildScanInput()`:**
- Filter `eventBuffer` for returns domain events (`domain === 'returns'`).
- Group by sellerId.
- Return `{ sellers, eventCount, scanTimestamp }`.

**`_postCycle(result)`:**
- Same pattern. Event name: `'returns-abuse:detection'`. KB category: `'returns-abuse'`. KB domain: `'returns'`.

**Singleton:**
```js
let instance = null;
export function getReturnsAbuseAgent() {
  if (!instance) instance = new ReturnsAbuseAgent();
  return instance;
}
export default ReturnsAbuseAgent;
```

**Test (`returns-abuse-agent.test.js`) — 50+ assertions:**

Test 1 — Agent identity (4): agentId `'RETURNS_ABUSE'`, name, role, capabilities length 4.

Test 2 — Autonomous config (2): `scanIntervalMs === 1200000`, `eventAccelerationThreshold === 4`.

Test 3 — Subscribed topics (3): length 2, includes `'risk:event:created'`, includes `'return:created'`.

Test 4 — 5 tools registered (6): `tools.size === 5`, each tool name exists.

Test 5 — `_buildScanInput` groups by seller (4).

Test 6 — `_buildScanInput` filters returns domain (3).

Test 7 — Singleton pattern (2).

Test 8 — `get_return_history` returns data (4): insert test returns, verify shape.

Test 9 — `get_return_history` validates sellerId (2).

Test 10 — `get_return_rate_stats` computes rates (4): insert returns + transactions, verify overall rate and byWindow.

Test 11 — `check_refund_amount_validity` detects invalid refunds (3): insert return with refund > original, verify flagged.

Test 12 — `get_buyer_return_profile` groups by buyer (3): insert returns from 2 buyers, verify profiles.

Test 13 — `get_buyer_return_profile` flags serial returners (2): insert >5 returns from one buyer.

Test 14 — `check_payout_return_timing` detects correlations (3): insert payout and returns within 48h.

Test 15 — `_postCycle` stores detections (3).

Test 16 — `_postCycle` caps at 200 (2).

Test 17 — Detections starts empty (2).

Test 18 — selfCorrection, calibrator, knowledgeBase exist (6).

**Total: 53 assertions.**

---

### Task 5: API Routers for All 4 Agents

**Files:**
- Create: `backend/services/autonomous/payout-risk-router.js`
- Create: `backend/services/autonomous/listing-intelligence-router.js`
- Create: `backend/services/autonomous/profile-mutation-router.js`
- Create: `backend/services/autonomous/returns-abuse-router.js`

Each follows `backend/services/autonomous/cross-domain-router.js` pattern exactly. Use the simpler cross-domain-router pattern (not the policy-evolution router which has extra pipeline-specific routes).

**Template for each router (substituting agent-specific names):**

```js
import { Router } from 'express';

const router = Router();
let agent = null;

export function setXxxAgent(a) { agent = a; }

// GET /status — Autonomous status + detection count
router.get('/status', (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    const status = agent.getAutonomousStatus();
    res.json({
      success: true,
      data: {
        ...status,
        detectionCount: agent.detections ? agent.detections.length : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /detections — Paginated detections
router.get('/detections', (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    const { limit = 20, offset = 0 } = req.query;
    const all = agent.detections || [];
    const start = parseInt(offset) || 0;
    const end = start + (parseInt(limit) || 20);
    const detections = all.slice(start, end);
    res.json({
      success: true,
      data: { detections, total: all.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /history — Cycle history with limit
router.get('/history', (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    const { limit = 20 } = req.query;
    const cycles = agent.getCycleHistory();
    const limited = cycles.slice(0, parseInt(limit));
    res.json({
      success: true,
      data: { cycles: limited, total: cycles.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /scan — Trigger a single autonomous scan cycle
router.post('/scan', async (req, res) => {
  try {
    if (!agent) {
      return res.status(503).json({ success: false, error: 'Agent not initialized' });
    }
    await agent.runOneCycle();
    res.json({
      success: true,
      data: { message: 'Scan triggered', cycleCount: agent.runHistory.length }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

**Specific setter function names:**
- `payout-risk-router.js`: `export function setPayoutRiskAgent(a) { agent = a; }`
- `listing-intelligence-router.js`: `export function setListingIntelligenceAgent(a) { agent = a; }`
- `profile-mutation-router.js`: `export function setProfileMutationAgent(a) { agent = a; }`
- `returns-abuse-router.js`: `export function setReturnsAbuseAgent(a) { agent = a; }`

---

### Task 6: Server Integration

**Files:**
- Modify: `backend/gateway/server.js`
- Modify: `backend/agents/core/base-agent.js`

**`server.js` changes — follow the exact pattern used for cross-domain and policy-evolution at lines 354-355, 409-421, 645-646, 848-853, 890-891:**

**1. Import routers (add after line 355):**
```js
import payoutRiskRouter, { setPayoutRiskAgent } from '../services/autonomous/payout-risk-router.js';
import listingIntelligenceRouter, { setListingIntelligenceAgent } from '../services/autonomous/listing-intelligence-router.js';
import profileMutationRouter, { setProfileMutationAgent } from '../services/autonomous/profile-mutation-router.js';
import returnsAbuseRouter, { setReturnsAbuseAgent } from '../services/autonomous/returns-abuse-router.js';
```

**2. Import agent getter functions (add after line 410):**
```js
import { getPayoutRiskAgent } from '../agents/specialized/payout-risk-agent.js';
import { getListingIntelligenceAgent } from '../agents/specialized/listing-intelligence-agent.js';
import { getProfileMutationAgent } from '../agents/specialized/profile-mutation-agent.js';
import { getReturnsAbuseAgent } from '../agents/specialized/returns-abuse-agent.js';
```

**3. Initialize agents (add after line 421, inside the autonomous agents block):**
```js
const payoutRiskAgent = getPayoutRiskAgent();
const listingIntelligenceAgent = getListingIntelligenceAgent();
const profileMutationAgent = getProfileMutationAgent();
const returnsAbuseAgent = getReturnsAbuseAgent();
orchestrator.registerAgent(payoutRiskAgent);
orchestrator.registerAgent(listingIntelligenceAgent);
orchestrator.registerAgent(profileMutationAgent);
orchestrator.registerAgent(returnsAbuseAgent);
setPayoutRiskAgent(payoutRiskAgent);
setListingIntelligenceAgent(listingIntelligenceAgent);
setProfileMutationAgent(profileMutationAgent);
setReturnsAbuseAgent(returnsAbuseAgent);
payoutRiskAgent.start();
listingIntelligenceAgent.start();
profileMutationAgent.start();
returnsAbuseAgent.start();
console.log('Checkpoint agents started: Payout Risk, Listing Intelligence, Profile Mutation, Returns Abuse');
```

**4. Mount routes (add after line 646):**
```js
app.use('/api/agents/payout-risk', payoutRiskRouter);
app.use('/api/agents/listing-intelligence', listingIntelligenceRouter);
app.use('/api/agents/profile-mutation', profileMutationRouter);
app.use('/api/agents/returns-abuse', returnsAbuseRouter);
```

**5. SIGTERM handler (add after line 851, before `server.close`):**
```js
payoutRiskAgent.stop();
listingIntelligenceAgent.stop();
profileMutationAgent.stop();
returnsAbuseAgent.stop();
```

**6. Startup banner (add after line 891):**
```
║   • Payout Risk      /api/agents/payout-risk             ║
║   • Listing Intel    /api/agents/listing-intelligence     ║
║   • Profile Mutation /api/agents/profile-mutation         ║
║   • Returns Abuse    /api/agents/returns-abuse            ║
```

**`base-agent.js` changes — add to AGENT_PROMPT_MAP (line 57, before the closing `}`):**

```js
'PAYOUT_RISK': 'payout-risk',
'LISTING_INTELLIGENCE': 'listing-intelligence',
'PROFILE_MUTATION': 'profile-mutation',
'RETURNS_ABUSE': 'returns-abuse'
```

The map at line 51 should become:
```js
const AGENT_PROMPT_MAP = {
  'SELLER_ONBOARDING': 'seller-onboarding',
  'FRAUD_INVESTIGATOR': 'fraud-investigation',
  'ALERT_TRIAGE': 'alert-triage',
  'RULE_OPTIMIZER': 'rule-optimization',
  'CROSS_DOMAIN_CORRELATION': 'cross-domain',
  'POLICY_EVOLUTION': 'policy-evolution',
  'PAYOUT_RISK': 'payout-risk',
  'LISTING_INTELLIGENCE': 'listing-intelligence',
  'PROFILE_MUTATION': 'profile-mutation',
  'RETURNS_ABUSE': 'returns-abuse'
};
```

---

### Task 7: Frontend — Add 4 Tabs to Autonomous Agents Page

**Files:**
- Modify: `src/pages/AutonomousAgents.jsx`

Add 4 new tabs for a total of 6 tabs. Follow the existing Cross-Domain tab pattern exactly.

**1. Add Lucide icons import (line 2):**
Add to the existing import: `DollarSign, ShoppingBag, UserCog, RotateCcw` (or re-use existing icons from the project).

Pick appropriate icons:
- Payout Risk: `DollarSign`
- Listing Intelligence: `ShoppingBag` (or `Package`)
- Profile Mutation: `UserCog`
- Returns Abuse: `RotateCcw`

**2. Add state variables (after line 32):**
```js
// Payout Risk
const [prStatus, setPrStatus] = useState(null)
const [prDetections, setPrDetections] = useState([])
const [prHistory, setPrHistory] = useState([])
// Listing Intelligence
const [liStatus, setLiStatus] = useState(null)
const [liDetections, setLiDetections] = useState([])
const [liHistory, setLiHistory] = useState([])
// Profile Mutation
const [pmStatus, setPmStatus] = useState(null)
const [pmDetections, setPmDetections] = useState([])
const [pmHistory, setPmHistory] = useState([])
// Returns Abuse
const [raStatus, setRaStatus] = useState(null)
const [raDetections, setRaDetections] = useState([])
const [raHistory, setRaHistory] = useState([])
```

**3. Add 4 fetch functions (after `fetchPolicyEvolutionData`):**

Each follows the `fetchCrossDomainData` pattern with `useCallback`:

```js
const fetchPayoutRiskData = useCallback(async () => {
  try {
    const [statusRes, detectionsRes, historyRes] = await Promise.all([
      fetch(`${API_BASE}/agents/payout-risk/status`).then(r => r.json()),
      fetch(`${API_BASE}/agents/payout-risk/detections?limit=50`).then(r => r.json()),
      fetch(`${API_BASE}/agents/payout-risk/history?limit=20`).then(r => r.json())
    ])
    if (statusRes.success) setPrStatus(statusRes.data)
    if (detectionsRes.success) setPrDetections(detectionsRes.data?.detections || [])
    if (historyRes.success) setPrHistory(historyRes.data?.cycles || [])
  } catch (err) {
    console.error('Failed to fetch payout risk data:', err)
  }
}, [])
```

Same pattern for `fetchListingIntelligenceData`, `fetchProfileMutationData`, `fetchReturnsAbuseData` — changing the API path and state setters.

**4. Update `useEffect` (replace existing at line 69):**

```js
useEffect(() => {
  const fetchData = async () => {
    setLoading(true)
    if (activeTab === 'cross-domain') await fetchCrossDomainData()
    else if (activeTab === 'policy-evolution') await fetchPolicyEvolutionData()
    else if (activeTab === 'payout-risk') await fetchPayoutRiskData()
    else if (activeTab === 'listing-intelligence') await fetchListingIntelligenceData()
    else if (activeTab === 'profile-mutation') await fetchProfileMutationData()
    else if (activeTab === 'returns-abuse') await fetchReturnsAbuseData()
    setLoading(false)
  }
  fetchData()
  const interval = setInterval(fetchData, 15000)
  return () => clearInterval(interval)
}, [activeTab, fetchCrossDomainData, fetchPolicyEvolutionData, fetchPayoutRiskData, fetchListingIntelligenceData, fetchProfileMutationData, fetchReturnsAbuseData])
```

**5. Update `handleScan` (replace existing at line 85):**

Build endpoint map:
```js
const scanEndpoints = {
  'cross-domain': `${API_BASE}/agents/cross-domain/scan`,
  'policy-evolution': `${API_BASE}/agents/policy-evolution/scan`,
  'payout-risk': `${API_BASE}/agents/payout-risk/scan`,
  'listing-intelligence': `${API_BASE}/agents/listing-intelligence/scan`,
  'profile-mutation': `${API_BASE}/agents/profile-mutation/scan`,
  'returns-abuse': `${API_BASE}/agents/returns-abuse/scan`
}
```

After scan, call the appropriate fetch function.

**6. Update tabs array (replace existing at line 104):**

```js
const tabs = [
  { id: 'cross-domain', label: 'Cross-Domain', icon: GitBranch },
  { id: 'policy-evolution', label: 'Policy Evolution', icon: Shield },
  { id: 'payout-risk', label: 'Payout Risk', icon: DollarSign },
  { id: 'listing-intelligence', label: 'Listing Intelligence', icon: ShoppingBag },
  { id: 'profile-mutation', label: 'Profile Mutation', icon: UserCog },
  { id: 'returns-abuse', label: 'Returns Abuse', icon: RotateCcw }
]
```

Add `overflow-x-auto` to the tab container div for horizontal scroll on narrow screens.

**7. Update header description (line 133):**
```
<p className="text-gray-400 text-sm mt-1">6 autonomous agents monitoring fraud patterns</p>
```

**8. Add 4 tab content sections (after the policy-evolution tab, before `</>`)**

Each checkpoint agent tab follows the same template. Here is the template using Payout Risk as an example:

```jsx
{activeTab === 'payout-risk' && (
  <div className="space-y-6">
    {/* Status Bar */}
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${prStatus?.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className={`text-sm font-medium ${prStatus?.isRunning ? 'text-emerald-400' : 'text-amber-400'}`}>
              {prStatus?.isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Clock className="w-4 h-4" />
            <span>Last scan: {timeAgo(prStatus?.lastRunAt)}</span>
          </div>
          <div className="text-sm text-gray-400">
            <span className="text-white font-medium">{prStatus?.eventsBuffered ?? 0}</span> events buffered
          </div>
          <div className="text-sm text-gray-400">
            <span className="text-white font-medium">{prStatus?.totalCycles ?? 0}</span> cycles
          </div>
        </div>
        <button onClick={handleScan} disabled={scanning} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${scanning ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30'}`}>
          <Zap className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning...' : 'Run Scan Now'}
        </button>
      </div>
    </div>

    {/* Detections Table */}
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">Detections</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
            <th className="text-left p-3">Seller</th>
            <th className="text-left p-3">Pattern</th>
            <th className="text-left p-3">Score</th>
            <th className="text-left p-3">Confidence</th>
            <th className="text-left p-3">Status</th>
            <th className="text-left p-3">Timestamp</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {prDetections.length === 0 ? (
            <tr><td colSpan={6} className="p-8 text-center text-gray-500">No detections yet. Agent scans every 10 minutes.</td></tr>
          ) : prDetections.map((d, i) => (
            <tr key={i} className="hover:bg-gray-800/30">
              <td className="p-3 text-indigo-400 font-mono text-xs">{d.sellerId || 'N/A'}</td>
              <td className="p-3 text-white text-xs">{d.patternId || d.pattern || 'Unknown'}</td>
              <td className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${(d.matchScore || 0) > 0.8 ? 'bg-red-500' : (d.matchScore || 0) > 0.6 ? 'bg-amber-500' : 'bg-gray-500'}`} style={{ width: `${(d.matchScore || 0) * 100}%` }} />
                  </div>
                  <span className="text-xs text-gray-400">{((d.matchScore || 0) * 100).toFixed(0)}%</span>
                </div>
              </td>
              <td className="p-3 text-xs text-gray-300">{d.confidence ? `${(d.confidence * 100).toFixed(0)}%` : 'N/A'}</td>
              <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityBadge(d.severity)}`}>{(d.severity || 'UNKNOWN').toUpperCase()}</span></td>
              <td className="p-3 text-xs text-gray-500">{d.detectedAt ? timeAgo(d.detectedAt) : 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Cycle History */}
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">Cycle History</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
            <th className="text-left p-3">Cycle ID</th>
            <th className="text-left p-3">Started At</th>
            <th className="text-left p-3">Duration</th>
            <th className="text-left p-3">Events Processed</th>
            <th className="text-left p-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {prHistory.length === 0 ? (
            <tr><td colSpan={5} className="p-8 text-center text-gray-500">No cycle history yet.</td></tr>
          ) : prHistory.map((h, i) => (
            <tr key={h.cycleId || i} className="hover:bg-gray-800/30">
              <td className="p-3 text-indigo-400 font-mono text-xs">{(h.cycleId || '').slice(0, 16)}...</td>
              <td className="p-3 text-xs text-gray-400">{h.startedAt ? new Date(h.startedAt).toLocaleString() : 'N/A'}</td>
              <td className="p-3 text-xs text-gray-300">{formatDuration(h.duration)}</td>
              <td className="p-3 text-xs text-gray-300">{h.eventsProcessed ?? 0}</td>
              <td className="p-3">{h.status === 'success' || h.status === 'completed' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}
```

Repeat this template for all 4 agents, substituting:
- Tab id, status variable prefix, detections variable, history variable
- Scan interval text in empty state message:
  - Payout Risk: "every 10 minutes"
  - Listing Intelligence: "every 15 minutes"
  - Profile Mutation: "every 10 minutes"
  - Returns Abuse: "every 20 minutes"

**Detection table columns for all checkpoint agents:**
| Seller | Pattern | Score | Confidence | Status | Timestamp |

Uses `d.detectedAt` for timestamp (from `_postCycle`) and `d.severity` for status badge (re-using existing `severityBadge` helper).

---

### Verification Checklist

After all tasks are complete, verify:

1. **Tests pass:**
   ```bash
   node backend/agents/specialized/__tests__/payout-risk-agent.test.js
   node backend/agents/specialized/__tests__/listing-intelligence-agent.test.js
   node backend/agents/specialized/__tests__/profile-mutation-agent.test.js
   node backend/agents/specialized/__tests__/returns-abuse-agent.test.js
   ```

2. **Server starts without errors:**
   ```bash
   cd backend && node gateway/server.js
   ```
   Console should show "Checkpoint agents started: Payout Risk, Listing Intelligence, Profile Mutation, Returns Abuse".

3. **API endpoints respond:**
   ```bash
   curl http://localhost:3001/api/agents/payout-risk/status
   curl http://localhost:3001/api/agents/listing-intelligence/status
   curl http://localhost:3001/api/agents/profile-mutation/status
   curl http://localhost:3001/api/agents/returns-abuse/status
   ```

4. **Frontend renders 6 tabs** on `/autonomous` page with no console errors.

5. **AGENT_PROMPT_MAP** has 10 entries (6 existing + 4 new).
