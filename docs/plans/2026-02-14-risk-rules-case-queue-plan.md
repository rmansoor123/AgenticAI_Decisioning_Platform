# Risk Rules Library & Case Investigation Queue — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a checkpoint-organized Risk Rules Library with 30+ domain-specific rules, and a Case Investigation Queue that auto-creates cases from REVIEW/BLOCK decisions.

**Architecture:** Extend existing rules engine with checkpoint dimension. New case-queue service creates cases automatically when the execution engine produces REVIEW/BLOCK decisions. Two new React pages for browsing rules by checkpoint and managing the investigation queue.

**Tech Stack:** Express.js, SQLite/memory store via db_ops, React + Tailwind CSS v4 + Recharts, lucide-react icons

---

## Task 1: Database — Cases Table Migration

**Files:**
- Create: `backend/shared/common/migrations/008-case-queue.js`
- Modify: `backend/shared/common/migrations/index.js`
- Modify: `backend/shared/common/database.js`

**Step 1: Create migration file**

Create `backend/shared/common/migrations/008-case-queue.js`:

```javascript
export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      case_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cases_created ON cases(created_at)`);
  console.log('Migration 008-case-queue applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS cases');
  console.log('Migration 008-case-queue rolled back');
};

export default { up, down };
```

**Step 2: Register migration in index.js**

In `backend/shared/common/migrations/index.js`, add import after the existing migration imports:

```javascript
import migration008 from './008-case-queue.js';
```

Add to the migrations array:

```javascript
{ version: 8, name: '008-case-queue', migration: migration008 },
```

**Step 3: Add cases to memoryStore in database.js**

In `backend/shared/common/database.js`, add `cases: new Map()` to the memoryStore object (after `agent_decisions`).

**Step 4: Verify server starts**

```bash
lsof -ti:3005 | xargs kill 2>/dev/null; sleep 1
PORT=3005 node backend/gateway/server.js &
sleep 4
curl -s http://localhost:3005/api/health | head -c 100
kill %1
```

Expected: Server starts with "Migration 008-case-queue applied successfully" in logs.

**Step 5: Commit**

```bash
git add backend/shared/common/migrations/008-case-queue.js backend/shared/common/migrations/index.js backend/shared/common/database.js
git commit -m "feat: add cases table migration for investigation queue"
```

---

## Task 2: Extend Rules with Checkpoint Fields

**Files:**
- Modify: `backend/shared/synthetic-data/generators.js`

**Context:** The existing `generateRule()` function (around line 373) creates rules without checkpoint, tags, or severity. We need to extend it.

**Step 1: Extend generateRule() in generators.js**

Find the `generateRule()` function. Add these fields to the returned object, after the existing fields (before `createdAt`):

```javascript
    checkpoint: ['onboarding', 'ato', 'payout', 'listing', 'shipping', 'transaction'][Math.floor(Math.random() * 6)],
    severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][Math.floor(Math.random() * 4)],
    tags: (() => {
      const allTags = ['velocity', 'threshold', 'geo', 'device', 'identity', 'amount', 'pattern', 'ml-score', 'behavioral', 'network'];
      const count = Math.floor(Math.random() * 3) + 1;
      return allTags.sort(() => Math.random() - 0.5).slice(0, count);
    })(),
```

**Step 2: Add checkpoint-specific rule templates generator**

Add this new function AFTER `generateRule()` in generators.js:

```javascript
export function generateCheckpointRules() {
  const templates = [
    // Onboarding (5 rules)
    { name: 'High-Risk Country Registration', checkpoint: 'onboarding', type: 'LIST_MATCH', severity: 'HIGH', action: 'REVIEW', tags: ['geo', 'identity'], conditions: [{ field: 'seller.country', operator: 'IN', value: ['NG', 'RO', 'UA', 'PK', 'BD'] }], description: 'Flag sellers registering from high-risk countries' },
    { name: 'Disposable Email Domain', checkpoint: 'onboarding', type: 'LIST_MATCH', severity: 'MEDIUM', action: 'REVIEW', tags: ['identity', 'pattern'], conditions: [{ field: 'seller.emailDomain', operator: 'IN', value: ['tempmail.com', 'guerrillamail.com', 'throwaway.email'] }], description: 'Detect disposable email addresses during registration' },
    { name: 'Business Category Mismatch', checkpoint: 'onboarding', type: 'PATTERN', severity: 'MEDIUM', action: 'FLAG', tags: ['identity', 'behavioral'], conditions: [{ field: 'seller.categoryMismatchScore', operator: 'GT', value: 0.7 }], description: 'Business description does not match selected category' },
    { name: 'Duplicate Identity Signals', checkpoint: 'onboarding', type: 'COMPOSITE', severity: 'CRITICAL', action: 'BLOCK', tags: ['identity', 'network'], conditions: [{ field: 'seller.duplicateScore', operator: 'GT', value: 0.85 }], description: 'Multiple accounts sharing identity attributes' },
    { name: 'New Account Rapid Listing', checkpoint: 'onboarding', type: 'VELOCITY', severity: 'HIGH', action: 'REVIEW', tags: ['velocity', 'behavioral'], conditions: [{ field: 'seller.accountAgeDays', operator: 'LT', value: 3 }, { field: 'seller.listingCount', operator: 'GT', value: 10 }], description: 'New account creating many listings immediately' },

    // ATO (5 rules)
    { name: 'Multiple Failed Logins', checkpoint: 'ato', type: 'VELOCITY', severity: 'HIGH', action: 'CHALLENGE', tags: ['velocity', 'identity'], conditions: [{ field: 'auth.failedLogins_1h', operator: 'GT', value: 5 }], description: 'Too many failed login attempts in one hour' },
    { name: 'New Device + Password Change', checkpoint: 'ato', type: 'COMPOSITE', severity: 'CRITICAL', action: 'BLOCK', tags: ['device', 'identity'], conditions: [{ field: 'device.isNew', operator: 'EQ', value: true }, { field: 'auth.passwordChanged', operator: 'EQ', value: true }], description: 'Password changed from a previously unseen device' },
    { name: 'Impossible Travel', checkpoint: 'ato', type: 'PATTERN', severity: 'CRITICAL', action: 'BLOCK', tags: ['geo', 'behavioral'], conditions: [{ field: 'geo.travelSpeedKmh', operator: 'GT', value: 1000 }], description: 'Login from geographically impossible location given last activity' },
    { name: 'Session Anomaly', checkpoint: 'ato', type: 'ML_SCORE', severity: 'MEDIUM', action: 'CHALLENGE', tags: ['behavioral', 'ml-score'], conditions: [{ field: 'ml.sessionAnomalyScore', operator: 'GT', value: 0.75 }], description: 'Session behavior deviates from established pattern' },
    { name: 'Credential Stuffing Pattern', checkpoint: 'ato', type: 'VELOCITY', severity: 'HIGH', action: 'BLOCK', tags: ['velocity', 'network'], conditions: [{ field: 'auth.distinctAccountsFromIP_1h', operator: 'GT', value: 10 }], description: 'Same IP attempting access to multiple accounts' },

    // Payout (5 rules)
    { name: 'First Payout Above Threshold', checkpoint: 'payout', type: 'THRESHOLD', severity: 'HIGH', action: 'REVIEW', tags: ['amount', 'threshold'], conditions: [{ field: 'payout.isFirst', operator: 'EQ', value: true }, { field: 'payout.amount', operator: 'GT', value: 5000 }], description: 'First-ever payout exceeds safety threshold' },
    { name: 'Payout Velocity Spike', checkpoint: 'payout', type: 'VELOCITY', severity: 'HIGH', action: 'REVIEW', tags: ['velocity', 'amount'], conditions: [{ field: 'payout.countLast24h', operator: 'GT', value: 3 }], description: 'Unusual number of payout requests in 24 hours' },
    { name: 'Bank Account Change + Immediate Payout', checkpoint: 'payout', type: 'COMPOSITE', severity: 'CRITICAL', action: 'BLOCK', tags: ['identity', 'behavioral'], conditions: [{ field: 'payout.bankChangedHoursAgo', operator: 'LT', value: 24 }, { field: 'payout.amount', operator: 'GT', value: 1000 }], description: 'Payout requested shortly after changing bank details' },
    { name: 'Round Amount Pattern', checkpoint: 'payout', type: 'PATTERN', severity: 'MEDIUM', action: 'FLAG', tags: ['amount', 'pattern'], conditions: [{ field: 'payout.isRoundAmount', operator: 'EQ', value: true }, { field: 'payout.amount', operator: 'GT', value: 1000 }], description: 'Payout is a suspiciously round amount' },
    { name: 'Payout Exceeds Revenue', checkpoint: 'payout', type: 'THRESHOLD', severity: 'CRITICAL', action: 'BLOCK', tags: ['amount', 'threshold'], conditions: [{ field: 'payout.amount', operator: 'GT', value: 0 }, { field: 'payout.exceedsRevenue', operator: 'EQ', value: true }], description: 'Requested payout exceeds total earned revenue' },

    // Listing (5 rules)
    { name: 'Below-Market Price', checkpoint: 'listing', type: 'THRESHOLD', severity: 'MEDIUM', action: 'FLAG', tags: ['amount', 'pattern'], conditions: [{ field: 'listing.priceBelowMarketPct', operator: 'GT', value: 50 }], description: 'Listed price is significantly below market average' },
    { name: 'Prohibited Item Keywords', checkpoint: 'listing', type: 'LIST_MATCH', severity: 'HIGH', action: 'BLOCK', tags: ['pattern', 'identity'], conditions: [{ field: 'listing.hasProhibitedKeywords', operator: 'EQ', value: true }], description: 'Listing contains prohibited item keywords' },
    { name: 'Bulk Listing Creation', checkpoint: 'listing', type: 'VELOCITY', severity: 'HIGH', action: 'REVIEW', tags: ['velocity', 'behavioral'], conditions: [{ field: 'listing.createdLast1h', operator: 'GT', value: 20 }], description: 'Excessive number of listings created in short period' },
    { name: 'Copied Listing Content', checkpoint: 'listing', type: 'ML_SCORE', severity: 'MEDIUM', action: 'FLAG', tags: ['ml-score', 'pattern'], conditions: [{ field: 'ml.contentSimilarityScore', operator: 'GT', value: 0.9 }], description: 'Listing content appears to be copied from another seller' },
    { name: 'Mismatched Category Images', checkpoint: 'listing', type: 'ML_SCORE', severity: 'MEDIUM', action: 'FLAG', tags: ['ml-score', 'identity'], conditions: [{ field: 'ml.imageCategoryMatchScore', operator: 'LT', value: 0.3 }], description: 'Product images do not match the listed category' },

    // Shipping (5 rules)
    { name: 'Address Mismatch', checkpoint: 'shipping', type: 'PATTERN', severity: 'MEDIUM', action: 'FLAG', tags: ['geo', 'identity'], conditions: [{ field: 'shipping.addressMatchScore', operator: 'LT', value: 0.5 }], description: 'Shipping address does not match billing address' },
    { name: 'Freight Forwarder Destination', checkpoint: 'shipping', type: 'LIST_MATCH', severity: 'HIGH', action: 'REVIEW', tags: ['geo', 'pattern'], conditions: [{ field: 'shipping.isFreightForwarder', operator: 'EQ', value: true }, { field: 'transaction.amount', operator: 'GT', value: 2000 }], description: 'High-value shipment to known freight forwarder' },
    { name: 'Multiple Shipments Same Address', checkpoint: 'shipping', type: 'VELOCITY', severity: 'MEDIUM', action: 'FLAG', tags: ['velocity', 'network'], conditions: [{ field: 'shipping.sameAddressCount7d', operator: 'GT', value: 5 }], description: 'Multiple different sellers shipping to same address' },
    { name: 'Delivery Region Anomaly', checkpoint: 'shipping', type: 'PATTERN', severity: 'HIGH', action: 'REVIEW', tags: ['geo', 'behavioral'], conditions: [{ field: 'shipping.regionRiskScore', operator: 'GT', value: 70 }], description: 'Delivery destination is in a high-risk region' },
    { name: 'Express Shipping on New Account', checkpoint: 'shipping', type: 'COMPOSITE', severity: 'MEDIUM', action: 'FLAG', tags: ['behavioral', 'velocity'], conditions: [{ field: 'seller.accountAgeDays', operator: 'LT', value: 7 }, { field: 'shipping.isExpress', operator: 'EQ', value: true }], description: 'New seller using express shipping on first orders' },

    // Transaction (5 rules)
    { name: 'Transaction Velocity Spike', checkpoint: 'transaction', type: 'VELOCITY', severity: 'HIGH', action: 'REVIEW', tags: ['velocity', 'amount'], conditions: [{ field: 'transaction.countLast1h', operator: 'GT', value: 10 }], description: 'Unusually high transaction count in last hour' },
    { name: 'High Amount Threshold', checkpoint: 'transaction', type: 'THRESHOLD', severity: 'HIGH', action: 'REVIEW', tags: ['amount', 'threshold'], conditions: [{ field: 'transaction.amount', operator: 'GT', value: 5000 }], description: 'Transaction amount exceeds review threshold' },
    { name: 'High-Risk Merchant Category', checkpoint: 'transaction', type: 'LIST_MATCH', severity: 'MEDIUM', action: 'FLAG', tags: ['pattern', 'identity'], conditions: [{ field: 'transaction.merchantCategory', operator: 'IN', value: ['GAMBLING', 'CRYPTO', 'ADULT', 'PHARMACY'] }], description: 'Transaction with high-risk merchant category' },
    { name: 'Cross-Border New Account', checkpoint: 'transaction', type: 'COMPOSITE', severity: 'HIGH', action: 'REVIEW', tags: ['geo', 'identity'], conditions: [{ field: 'transaction.isCrossBorder', operator: 'EQ', value: true }, { field: 'seller.accountAgeDays', operator: 'LT', value: 14 }], description: 'Cross-border transaction from recently created account' },
    { name: 'ML Fraud Score Alert', checkpoint: 'transaction', type: 'ML_SCORE', severity: 'CRITICAL', action: 'BLOCK', tags: ['ml-score'], conditions: [{ field: 'ml.fraudScore', operator: 'GT', value: 0.9 }], description: 'ML model predicts high fraud probability' },
  ];

  return templates.map((t, i) => ({
    ruleId: `RULE-CP-${String(i + 1).padStart(3, '0')}`,
    ...t,
    status: Math.random() > 0.2 ? 'ACTIVE' : 'SHADOW',
    priority: Math.floor(Math.random() * 50) + 50,
    performance: {
      triggered: Math.floor(Math.random() * 5000) + 100,
      truePositives: Math.floor(Math.random() * 2000) + 50,
      falsePositives: Math.floor(Math.random() * 500) + 10,
      catchRate: Math.round((Math.random() * 0.3 + 0.65) * 100) / 100,
      falsePositiveRate: Math.round((Math.random() * 0.1 + 0.01) * 100) / 100
    },
    createdAt: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: 'system@fraud-platform.com'
  }));
}
```

Make sure `generateCheckpointRules` is added to the default export at the bottom of the file alongside the other generators.

**Step 2: Verify the function works**

```bash
PORT=3005 node -e "import('./backend/shared/synthetic-data/generators.js').then(g => { const rules = g.generateCheckpointRules(); console.log('Generated', rules.length, 'rules'); console.log('Checkpoints:', [...new Set(rules.map(r => r.checkpoint))]); })"
```

Expected: "Generated 30 rules" with all 6 checkpoints listed.

**Step 3: Commit**

```bash
git add backend/shared/synthetic-data/generators.js
git commit -m "feat: extend rules with checkpoint fields and add 30 checkpoint-specific rule templates"
```

---

## Task 3: Rules API — Checkpoint Filtering and Templates Endpoint

**Files:**
- Modify: `backend/services/decision-engine/rules/index.js`

**Context:** The existing rules router has endpoints for CRUD operations. We need to add checkpoint filtering to GET and a new templates endpoint.

**Step 1: Add checkpoint filter to existing GET / endpoint**

In `backend/services/decision-engine/rules/index.js`, find the GET `/` handler. It currently filters by `status`, `type`, and `action`. Add checkpoint filtering alongside those:

After the existing filter logic (where it filters by status/type/action), add:

```javascript
    if (req.query.checkpoint) {
      filtered = filtered.filter(r => r.checkpoint === req.query.checkpoint);
    }
    if (req.query.severity) {
      filtered = filtered.filter(r => r.severity === req.query.severity);
    }
    if (req.query.tag) {
      filtered = filtered.filter(r => r.tags && r.tags.includes(req.query.tag));
    }
```

**Step 2: Add GET /by-checkpoint endpoint**

Add this new endpoint BEFORE any parameterized routes (like `/:ruleId`). Find a spot after the GET `/` endpoint and before `/:ruleId` routes:

```javascript
// Get rules grouped by checkpoint
router.get('/by-checkpoint', (req, res) => {
  try {
    const allRules = db_ops.getAll('rules', 10000, 0).map(r => r.data);
    const checkpoints = ['onboarding', 'ato', 'payout', 'listing', 'shipping', 'transaction'];

    const grouped = {};
    for (const cp of checkpoints) {
      const cpRules = allRules.filter(r => r.checkpoint === cp);
      grouped[cp] = {
        total: cpRules.length,
        active: cpRules.filter(r => r.status === 'ACTIVE').length,
        rules: cpRules.sort((a, b) => (b.priority || 0) - (a.priority || 0))
      };
    }

    // Rules without a checkpoint
    const uncategorized = allRules.filter(r => !r.checkpoint);
    if (uncategorized.length > 0) {
      grouped.uncategorized = {
        total: uncategorized.length,
        active: uncategorized.filter(r => r.status === 'ACTIVE').length,
        rules: uncategorized
      };
    }

    res.json({ success: true, data: grouped });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get rule templates for each checkpoint
router.get('/templates', (req, res) => {
  try {
    const { generateCheckpointRules } = require('../../../shared/synthetic-data/generators.js');
    const templates = generateCheckpointRules();

    const { checkpoint } = req.query;
    const filtered = checkpoint
      ? templates.filter(t => t.checkpoint === checkpoint)
      : templates;

    res.json({ success: true, data: filtered });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

IMPORTANT: Since this is an ES module project, the `require` won't work. Instead, use a dynamic import or import at the top of the file:

```javascript
import generators from '../../../shared/synthetic-data/generators.js';
```

Then in the templates endpoint, use:

```javascript
const templates = generators.generateCheckpointRules ? generators.generateCheckpointRules() : [];
```

Wait — the generators file uses `export default` with an object of functions. You'll need to check how `generateCheckpointRules` is exported. If it's a named export, use:

```javascript
import { generateCheckpointRules } from '../../../shared/synthetic-data/generators.js';
```

Or if added to the default export object in generators.js, use:

```javascript
import generators from '../../../shared/synthetic-data/generators.js';
// then: generators.generateCheckpointRules()
```

Make sure whichever approach matches how you exported it in Task 2.

**Step 3: Verify**

```bash
lsof -ti:3005 | xargs kill 2>/dev/null; sleep 1
PORT=3005 node backend/gateway/server.js &
sleep 4
curl -s http://localhost:3005/api/rules/by-checkpoint | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(Object.keys(j.data).map(k=>k+': '+j.data[k].total).join(', '))})"
curl -s http://localhost:3005/api/rules/templates | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log('Templates:',j.data.length)})"
kill %1
```

Expected: Shows rule counts per checkpoint. Templates: 30.

**Step 4: Commit**

```bash
git add backend/services/decision-engine/rules/index.js
git commit -m "feat: add checkpoint filtering and rule templates endpoint"
```

---

## Task 4: Case Queue Backend Service

**Files:**
- Create: `backend/services/case-queue/index.js`

**Step 1: Create the case queue service**

Create `backend/services/case-queue/index.js`:

```javascript
import express from 'express';
import { db_ops } from '../../shared/common/database.js';

const router = express.Router();

// GET /cases — List cases with filters
router.get('/', (req, res) => {
  try {
    const { status, priority, checkpoint, assignee, limit = 100, offset = 0 } = req.query;

    let cases = db_ops.getAll('cases', 10000, 0).map(r => r.data);

    if (status) cases = cases.filter(c => c.status === status.toUpperCase());
    if (priority) cases = cases.filter(c => c.priority === priority.toUpperCase());
    if (checkpoint) cases = cases.filter(c => c.checkpoint === checkpoint);
    if (assignee) cases = cases.filter(c => c.assignee === assignee);

    // Sort by priority (CRITICAL first) then by creation date (newest first)
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    cases.sort((a, b) => {
      const pDiff = (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
      if (pDiff !== 0) return pDiff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const total = cases.length;
    cases = cases.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({ success: true, data: cases, total });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /cases/stats — Queue statistics
router.get('/stats', (req, res) => {
  try {
    const allCases = db_ops.getAll('cases', 10000, 0).map(r => r.data);

    const byStatus = { OPEN: 0, IN_REVIEW: 0, RESOLVED: 0 };
    const byPriority = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const byCheckpoint = {};
    let totalAge = 0;
    let openCount = 0;

    allCases.forEach(c => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      byPriority[c.priority] = (byPriority[c.priority] || 0) + 1;
      byCheckpoint[c.checkpoint] = (byCheckpoint[c.checkpoint] || 0) + 1;

      if (c.status !== 'RESOLVED') {
        const age = Date.now() - new Date(c.createdAt).getTime();
        totalAge += age;
        openCount++;
      }
    });

    const avgAgeMs = openCount > 0 ? totalAge / openCount : 0;
    const avgAgeHours = Math.round(avgAgeMs / (1000 * 60 * 60) * 10) / 10;

    res.json({
      success: true,
      data: {
        total: allCases.length,
        byStatus,
        byPriority,
        byCheckpoint,
        avgAgeHours,
        openCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /cases/:caseId — Full case detail
router.get('/:caseId', (req, res) => {
  try {
    const record = db_ops.getById('cases', 'case_id', req.params.caseId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const caseData = record.data;

    // Enrich with seller info
    if (caseData.sellerId) {
      const sellerRecord = db_ops.getById('sellers', 'seller_id', caseData.sellerId);
      if (sellerRecord) {
        caseData.seller = {
          businessName: sellerRecord.data.businessName,
          email: sellerRecord.data.email,
          country: sellerRecord.data.country,
          status: sellerRecord.data.status,
          riskTier: sellerRecord.data.riskTier
        };
      }
    }

    // Enrich with triggered rule details
    if (caseData.triggeredRules && caseData.triggeredRules.length > 0) {
      caseData.ruleDetails = caseData.triggeredRules.map(ruleId => {
        const ruleRecord = db_ops.getById('rules', 'rule_id', ruleId);
        return ruleRecord ? { ruleId, name: ruleRecord.data.name, type: ruleRecord.data.type, severity: ruleRecord.data.severity, action: ruleRecord.data.action } : { ruleId, name: 'Unknown Rule' };
      });
    }

    res.json({ success: true, data: caseData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /cases/:caseId/status — Update case status
router.patch('/:caseId/status', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['OPEN', 'IN_REVIEW', 'RESOLVED'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const record = db_ops.getById('cases', 'case_id', req.params.caseId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const updated = {
      ...record.data,
      status,
      updatedAt: new Date().toISOString()
    };

    if (status === 'RESOLVED' && req.body.resolution) {
      const validResolutions = ['CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'ESCALATED'];
      if (!validResolutions.includes(req.body.resolution)) {
        return res.status(400).json({ success: false, error: `Invalid resolution. Must be one of: ${validResolutions.join(', ')}` });
      }
      updated.resolution = req.body.resolution;
      updated.resolvedAt = new Date().toISOString();
    }

    db_ops.update('cases', 'case_id', req.params.caseId, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /cases/:caseId/assign — Assign case
router.patch('/:caseId/assign', (req, res) => {
  try {
    const { assignee } = req.body;
    if (!assignee) {
      return res.status(400).json({ success: false, error: 'assignee is required' });
    }

    const record = db_ops.getById('cases', 'case_id', req.params.caseId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const updated = {
      ...record.data,
      assignee,
      status: record.data.status === 'OPEN' ? 'IN_REVIEW' : record.data.status,
      updatedAt: new Date().toISOString()
    };

    db_ops.update('cases', 'case_id', req.params.caseId, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /cases/:caseId/notes — Add note
router.post('/:caseId/notes', (req, res) => {
  try {
    const { author, text } = req.body;
    if (!author || !text) {
      return res.status(400).json({ success: false, error: 'author and text are required' });
    }

    const record = db_ops.getById('cases', 'case_id', req.params.caseId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const note = { author, text, timestamp: new Date().toISOString() };
    const updated = {
      ...record.data,
      notes: [...(record.data.notes || []), note],
      updatedAt: new Date().toISOString()
    };

    db_ops.update('cases', 'case_id', req.params.caseId, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

**Step 2: Commit**

```bash
git add backend/services/case-queue/index.js
git commit -m "feat: add case queue REST API service"
```

---

## Task 5: Wire Case Creation into Execution Engine

**Files:**
- Modify: `backend/services/decision-engine/execution/index.js`

**Context:** The execution engine evaluates rules and produces decisions. When a decision is REVIEW or BLOCK, we auto-create a case. Find the section where BLOCKED and REVIEW decisions are handled (around lines 86-89 where `emitRiskEvent` is called).

**Step 1: Add case creation function**

At the top of `execution/index.js`, add the import (alongside existing imports):

```javascript
import { db_ops } from '../../shared/common/database.js';
```

Note: `db_ops` may already be imported — check first. If it is, skip this import.

Then, add this helper function before the router endpoints:

```javascript
function createCaseFromDecision(decision, triggeredRules, transaction) {
  const caseId = `CASE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

  const riskScore = decision.riskScore || 0;
  let priority = 'LOW';
  if (riskScore > 80) priority = 'CRITICAL';
  else if (riskScore > 60) priority = 'HIGH';
  else if (riskScore > 40) priority = 'MEDIUM';

  // Determine checkpoint from triggered rules
  const checkpoints = triggeredRules.map(r => r.checkpoint).filter(Boolean);
  const checkpoint = checkpoints[0] || 'transaction';

  const caseData = {
    caseId,
    status: 'OPEN',
    priority,
    sourceType: 'transaction',
    sourceId: decision.transactionId,
    decisionId: decision.decisionId,
    checkpoint,
    sellerId: transaction?.sellerId || null,
    riskScore,
    triggeredRules: triggeredRules.map(r => r.ruleId),
    decision: decision.action,
    assignee: null,
    notes: [],
    resolution: null,
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    db_ops.insert('cases', 'case_id', caseId, caseData);
  } catch (e) {
    console.error('Failed to create case:', e.message);
  }

  return caseData;
}
```

**Step 2: Call createCaseFromDecision after BLOCK/REVIEW decisions**

Find where the decision is finalized and risk events are emitted (the BLOCKED and REVIEW branches). After the `emitRiskEvent` calls for BLOCKED and REVIEW, add:

```javascript
    createCaseFromDecision(decision, triggeredRules, transaction);
```

Add this line in BOTH the BLOCKED branch and the REVIEW branch.

**Step 3: Verify**

```bash
lsof -ti:3005 | xargs kill 2>/dev/null; sleep 1
PORT=3005 node backend/gateway/server.js &
sleep 4
# Evaluate a transaction to trigger case creation
curl -s -X POST http://localhost:3005/api/decisions/evaluate -H 'Content-Type: application/json' -d '{"transactionId":"TXN-CASE-TEST","amount":9999,"riskScore":85,"sellerId":"SELLER-001"}' | head -c 200
# Check if a case was created
curl -s http://localhost:3005/api/cases/stats
kill %1
```

Note: The cases endpoint won't be mounted yet (that's Task 6), so the stats call may 404. That's fine — we can verify via the execution response.

**Step 4: Commit**

```bash
git add backend/services/decision-engine/execution/index.js
git commit -m "feat: auto-create investigation cases on BLOCK/REVIEW decisions"
```

---

## Task 6: Mount Routes and Seed Data

**Files:**
- Modify: `backend/gateway/server.js`

**Step 1: Import and mount the case queue router**

In `backend/gateway/server.js`, add the import alongside other service imports (after the observability import):

```javascript
import caseQueueRouter from '../services/case-queue/index.js';
```

Mount the route (after the observability mount):

```javascript
// Case Queue
app.use('/api/cases', caseQueueRouter);
```

**Step 2: Add to health check and API docs**

In the health check response object, add:

```javascript
'case-queue': 'running',
```

In the API docs endpoint response, add:

```javascript
'/api/cases': 'Case Investigation Queue',
```

**Step 3: Seed checkpoint rules and cases during startup**

In the `seedDatabase()` function, after the existing rule seeding block (where it seeds 50 generic rules), add:

```javascript
  // Seed checkpoint-specific rules
  const { generateCheckpointRules } = generators;
  if (generateCheckpointRules) {
    const checkpointRules = generateCheckpointRules();
    checkpointRules.forEach(rule => {
      db_ops.insert('rules', 'rule_id', rule.ruleId, rule);
    });
    console.log(`  Checkpoint Rules: ${checkpointRules.length}`);
  }
```

After ALL seeding is done (after the knowledge base seeding), seed some cases:

```javascript
  // Seed investigation cases from recent decisions
  const transactions = db_ops.getAll('transactions', 100, 0).map(t => t.data);
  let caseCount = 0;
  transactions.slice(0, 30).forEach(tx => {
    if (tx.riskScore > 50 || Math.random() > 0.7) {
      const riskScore = tx.riskScore || Math.floor(Math.random() * 60) + 30;
      let priority = 'LOW';
      if (riskScore > 80) priority = 'CRITICAL';
      else if (riskScore > 60) priority = 'HIGH';
      else if (riskScore > 40) priority = 'MEDIUM';

      const checkpoints = ['onboarding', 'ato', 'payout', 'listing', 'shipping', 'transaction'];
      const statuses = ['OPEN', 'OPEN', 'OPEN', 'IN_REVIEW', 'IN_REVIEW', 'RESOLVED'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const analysts = ['alice@fraud-team.com', 'bob@fraud-team.com', 'carol@fraud-team.com', null, null];

      const caseId = `CASE-SEED-${String(caseCount + 1).padStart(3, '0')}`;
      const caseData = {
        caseId,
        status,
        priority,
        sourceType: 'transaction',
        sourceId: tx.transactionId,
        checkpoint: checkpoints[Math.floor(Math.random() * checkpoints.length)],
        sellerId: tx.sellerId || null,
        riskScore,
        triggeredRules: [],
        decision: riskScore > 70 ? 'BLOCK' : 'REVIEW',
        assignee: status !== 'OPEN' ? analysts[Math.floor(Math.random() * 3)] : null,
        notes: status === 'RESOLVED' ? [{ author: 'system', text: 'Auto-resolved during seeding', timestamp: new Date().toISOString() }] : [],
        resolution: status === 'RESOLVED' ? (Math.random() > 0.5 ? 'CONFIRMED_FRAUD' : 'FALSE_POSITIVE') : null,
        resolvedAt: status === 'RESOLVED' ? new Date().toISOString() : null,
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString()
      };

      db_ops.insert('cases', 'case_id', caseId, caseData);
      caseCount++;
    }
  });
  console.log(`  Cases: ${caseCount}`);
```

Also add the same seeding in the "already seeded" branch (the `if (isSeeded())` block), if cases count is 0:

```javascript
  // Ensure cases are populated on restart
  if (db_ops.count('cases') === 0) {
    // (same case seeding logic as above)
  }
```

**Step 4: Add to startup banner**

In the server startup banner (the ASCII art block), add these two lines in the Services list:

```
║   • Case Queue         /api/cases                           ║
```

**Step 5: Verify**

```bash
lsof -ti:3005 | xargs kill 2>/dev/null; sleep 1
PORT=3005 node backend/gateway/server.js &
sleep 5
curl -s http://localhost:3005/api/cases/stats
curl -s "http://localhost:3005/api/cases?limit=3" | head -c 500
curl -s http://localhost:3005/api/rules/by-checkpoint | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);Object.entries(j.data).forEach(([k,v])=>console.log(k+':',v.total,'rules,',v.active,'active'))})"
kill %1
```

Expected: Cases stats show ~20 cases, rules show checkpoint-specific counts.

**Step 6: Commit**

```bash
git add backend/gateway/server.js
git commit -m "feat: mount case queue routes, seed checkpoint rules and investigation cases"
```

---

## Task 7: Risk Rules Frontend Page

**Files:**
- Create: `src/pages/RiskRules.jsx`

**Context:** React + Tailwind CSS v4 + lucide-react icons. Dark theme (`bg-[#0a0e1a]` backgrounds, cyan accents). Follow existing page patterns from DecisionEngine.jsx.

**Step 1: Create the Risk Rules page**

Create `src/pages/RiskRules.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { Shield, Filter, Search, ChevronDown, ChevronRight, Activity, AlertTriangle, CheckCircle, XCircle, Zap, Eye } from 'lucide-react';

const API_BASE = 'http://localhost:3005/api';

const CHECKPOINTS = [
  { id: 'all', label: 'All Checkpoints', icon: Shield },
  { id: 'onboarding', label: 'Onboarding', icon: Shield },
  { id: 'ato', label: 'Account Takeover', icon: AlertTriangle },
  { id: 'payout', label: 'Payout', icon: Activity },
  { id: 'listing', label: 'Listing', icon: Eye },
  { id: 'shipping', label: 'Shipping', icon: Zap },
  { id: 'transaction', label: 'Transaction', icon: Activity },
];

const SEVERITY_COLORS = {
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  LOW: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const ACTION_COLORS = {
  BLOCK: 'bg-red-500/20 text-red-400',
  REVIEW: 'bg-yellow-500/20 text-yellow-400',
  CHALLENGE: 'bg-orange-500/20 text-orange-400',
  FLAG: 'bg-blue-500/20 text-blue-400',
  ALLOW_WITH_LIMIT: 'bg-green-500/20 text-green-400',
};

const TYPE_COLORS = {
  THRESHOLD: 'text-cyan-400',
  VELOCITY: 'text-purple-400',
  LIST_MATCH: 'text-pink-400',
  ML_SCORE: 'text-green-400',
  COMPOSITE: 'text-orange-400',
  PATTERN: 'text-yellow-400',
};

export default function RiskRules() {
  const [activeCheckpoint, setActiveCheckpoint] = useState('all');
  const [groupedRules, setGroupedRules] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedRule, setExpandedRule] = useState(null);
  const [stats, setStats] = useState({});

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const res = await fetch(`${API_BASE}/rules/by-checkpoint`);
        const data = await res.json();
        if (data.success) {
          setGroupedRules(data.data);
          // Calculate stats
          const allRules = Object.values(data.data).flatMap(g => g.rules);
          setStats({
            total: allRules.length,
            active: allRules.filter(r => r.status === 'ACTIVE').length,
            critical: allRules.filter(r => r.severity === 'CRITICAL').length,
            avgCatchRate: allRules.length > 0
              ? Math.round(allRules.reduce((sum, r) => sum + (r.performance?.catchRate || 0), 0) / allRules.length * 100)
              : 0,
          });
        }
      } catch (error) {
        console.error('Error fetching rules:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRules();
  }, []);

  const getDisplayRules = () => {
    let rules = [];
    if (activeCheckpoint === 'all') {
      rules = Object.values(groupedRules).flatMap(g => g.rules);
    } else {
      rules = groupedRules[activeCheckpoint]?.rules || [];
    }
    if (search) {
      const s = search.toLowerCase();
      rules = rules.filter(r =>
        r.name?.toLowerCase().includes(s) ||
        r.description?.toLowerCase().includes(s) ||
        r.tags?.some(t => t.toLowerCase().includes(s))
      );
    }
    return rules;
  };

  const displayRules = getDisplayRules();

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-gray-400 text-center py-20">Loading rules library...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Risk Rules Library</h1>
          <p className="text-gray-400 mt-1">Detection rules organized by checkpoint across the seller lifecycle</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-4 py-2 text-sm">
            <span className="text-gray-400">Total:</span> <span className="text-white font-bold">{stats.total}</span>
            <span className="text-gray-600 mx-2">|</span>
            <span className="text-gray-400">Active:</span> <span className="text-green-400 font-bold">{stats.active}</span>
            <span className="text-gray-600 mx-2">|</span>
            <span className="text-gray-400">Catch Rate:</span> <span className="text-cyan-400 font-bold">{stats.avgCatchRate}%</span>
          </div>
        </div>
      </div>

      {/* Checkpoint Tabs */}
      <div className="flex gap-2 flex-wrap">
        {CHECKPOINTS.map(cp => {
          const count = cp.id === 'all'
            ? Object.values(groupedRules).reduce((sum, g) => sum + g.total, 0)
            : groupedRules[cp.id]?.total || 0;
          const Icon = cp.icon;
          return (
            <button
              key={cp.id}
              onClick={() => setActiveCheckpoint(cp.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeCheckpoint === cp.id
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-[#1a1f2e] text-gray-400 border border-gray-700 hover:border-gray-600'
              }`}
            >
              <Icon size={14} />
              {cp.label}
              <span className="text-xs opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Search rules by name, description, or tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#1a1f2e] border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-cyan-500/50 focus:outline-none"
        />
      </div>

      {/* Rules Grid */}
      <div className="space-y-3">
        {displayRules.length === 0 ? (
          <div className="text-center text-gray-500 py-12">No rules found for this checkpoint</div>
        ) : (
          displayRules.map(rule => (
            <div
              key={rule.ruleId}
              className="bg-[#1a1f2e] border border-gray-700 rounded-lg overflow-hidden hover:border-gray-600 transition-all"
            >
              {/* Rule Header */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer"
                onClick={() => setExpandedRule(expandedRule === rule.ruleId ? null : rule.ruleId)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {expandedRule === rule.ruleId ? <ChevronDown size={14} className="text-gray-500 shrink-0" /> : <ChevronRight size={14} className="text-gray-500 shrink-0" />}
                  <span className={`text-xs font-mono ${TYPE_COLORS[rule.type] || 'text-gray-400'}`}>{rule.type}</span>
                  <span className="text-white font-medium truncate">{rule.name}</span>
                  {rule.severity && (
                    <span className={`text-xs px-2 py-0.5 rounded border ${SEVERITY_COLORS[rule.severity]}`}>{rule.severity}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {rule.tags?.map(tag => (
                    <span key={tag} className="text-xs bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded">{tag}</span>
                  ))}
                  <span className={`text-xs px-2 py-0.5 rounded ${ACTION_COLORS[rule.action] || ''}`}>{rule.action}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    rule.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                    rule.status === 'SHADOW' ? 'bg-purple-500/20 text-purple-400' :
                    rule.status === 'TESTING' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>{rule.status}</span>
                  <span className="text-xs text-gray-500">{rule.performance?.catchRate ? `${Math.round(rule.performance.catchRate * 100)}%` : '-'}</span>
                </div>
              </div>

              {/* Expanded Detail */}
              {expandedRule === rule.ruleId && (
                <div className="border-t border-gray-700 px-4 py-3 bg-[#0f1320]">
                  <p className="text-sm text-gray-400 mb-3">{rule.description || 'No description'}</p>
                  <div className="grid grid-cols-4 gap-4 mb-3">
                    <div>
                      <div className="text-xs text-gray-500">Triggered</div>
                      <div className="text-sm text-white font-mono">{rule.performance?.triggered?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">True Positives</div>
                      <div className="text-sm text-green-400 font-mono">{rule.performance?.truePositives?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">False Positives</div>
                      <div className="text-sm text-red-400 font-mono">{rule.performance?.falsePositives?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">FP Rate</div>
                      <div className="text-sm text-yellow-400 font-mono">{rule.performance?.falsePositiveRate ? `${Math.round(rule.performance.falsePositiveRate * 100)}%` : '-'}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Conditions</div>
                    <div className="space-y-1">
                      {rule.conditions?.map((c, i) => (
                        <div key={i} className="text-xs font-mono text-gray-300 bg-[#1a1f2e] px-2 py-1 rounded">
                          {c.field} <span className="text-cyan-400">{c.operator}</span> <span className="text-yellow-400">{JSON.stringify(c.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/RiskRules.jsx
git commit -m "feat: add Risk Rules Library frontend page"
```

---

## Task 8: Case Queue Frontend Page

**Files:**
- Create: `src/pages/CaseQueue.jsx`

**Step 1: Create the Case Queue page**

Create `src/pages/CaseQueue.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { FolderOpen, AlertTriangle, Clock, CheckCircle, XCircle, User, MessageSquare, ChevronDown, ChevronRight, Search, Filter } from 'lucide-react';

const API_BASE = 'http://localhost:3005/api';

const PRIORITY_COLORS = {
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  LOW: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const STATUS_COLORS = {
  OPEN: 'bg-blue-500/20 text-blue-400',
  IN_REVIEW: 'bg-purple-500/20 text-purple-400',
  RESOLVED: 'bg-green-500/20 text-green-400',
};

export default function CaseQueue() {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState(null);
  const [caseDetail, setCaseDetail] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCheckpoint, setFilterCheckpoint] = useState('');
  const [noteText, setNoteText] = useState('');

  const fetchCases = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);
      if (filterCheckpoint) params.set('checkpoint', filterCheckpoint);

      const [casesRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/cases?${params}`),
        fetch(`${API_BASE}/cases/stats`)
      ]);

      const casesData = await casesRes.json();
      const statsData = await statsRes.json();

      if (casesData.success) setCases(casesData.data || []);
      if (statsData.success) setStats(statsData.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCases(); }, [filterStatus, filterPriority, filterCheckpoint]);

  useEffect(() => {
    const interval = setInterval(fetchCases, 15000);
    return () => clearInterval(interval);
  }, [filterStatus, filterPriority, filterCheckpoint]);

  const fetchCaseDetail = async (caseId) => {
    try {
      const res = await fetch(`${API_BASE}/cases/${caseId}`);
      const data = await res.json();
      if (data.success) setCaseDetail(data.data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleSelectCase = (caseId) => {
    if (selectedCase === caseId) {
      setSelectedCase(null);
      setCaseDetail(null);
    } else {
      setSelectedCase(caseId);
      fetchCaseDetail(caseId);
    }
  };

  const updateStatus = async (caseId, status, resolution) => {
    try {
      const body = { status };
      if (resolution) body.resolution = resolution;
      await fetch(`${API_BASE}/cases/${caseId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      fetchCases();
      if (selectedCase === caseId) fetchCaseDetail(caseId);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const assignCase = async (caseId) => {
    try {
      await fetch(`${API_BASE}/cases/${caseId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee: 'current-analyst@fraud-team.com' })
      });
      fetchCases();
      if (selectedCase === caseId) fetchCaseDetail(caseId);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const addNote = async (caseId) => {
    if (!noteText.trim()) return;
    try {
      await fetch(`${API_BASE}/cases/${caseId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: 'analyst@fraud-team.com', text: noteText })
      });
      setNoteText('');
      fetchCaseDetail(caseId);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const getAge = (createdAt) => {
    const hours = Math.round((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60));
    if (hours < 1) return '< 1h';
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
  };

  if (loading) {
    return <div className="p-6 text-gray-400 text-center py-20">Loading case queue...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Case Investigation Queue</h1>
          <p className="text-gray-400 mt-1">Review and resolve flagged transactions from risk checkpoints</p>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-4">
            <div className="text-xs text-gray-500">Open Cases</div>
            <div className="text-2xl font-bold text-blue-400">{stats.byStatus?.OPEN || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-4">
            <div className="text-xs text-gray-500">In Review</div>
            <div className="text-2xl font-bold text-purple-400">{stats.byStatus?.IN_REVIEW || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-4">
            <div className="text-xs text-gray-500">Critical Priority</div>
            <div className="text-2xl font-bold text-red-400">{stats.byPriority?.CRITICAL || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-4">
            <div className="text-xs text-gray-500">Avg Age</div>
            <div className="text-2xl font-bold text-yellow-400">{stats.avgAgeHours || 0}h</div>
          </div>
          <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-4">
            <div className="text-xs text-gray-500">Resolved</div>
            <div className="text-2xl font-bold text-green-400">{stats.byStatus?.RESOLVED || 0}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Filter size={14} className="text-gray-500" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select value={filterCheckpoint} onChange={e => setFilterCheckpoint(e.target.value)} className="bg-[#1a1f2e] border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white">
          <option value="">All Checkpoints</option>
          <option value="onboarding">Onboarding</option>
          <option value="ato">ATO</option>
          <option value="payout">Payout</option>
          <option value="listing">Listing</option>
          <option value="shipping">Shipping</option>
          <option value="transaction">Transaction</option>
        </select>
        <span className="text-xs text-gray-500 ml-auto">{cases.length} cases</span>
      </div>

      {/* Cases Table */}
      <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Case ID</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Priority</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Checkpoint</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Seller</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Risk Score</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Decision</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Status</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Age</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {cases.map(c => (
              <tr
                key={c.caseId}
                onClick={() => handleSelectCase(c.caseId)}
                className={`border-b border-gray-700/50 cursor-pointer transition-all ${
                  selectedCase === c.caseId ? 'bg-cyan-500/5' : 'hover:bg-[#0f1320]'
                }`}
              >
                <td className="px-4 py-3 text-sm font-mono text-cyan-400">{c.caseId}</td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded border ${PRIORITY_COLORS[c.priority]}`}>{c.priority}</span></td>
                <td className="px-4 py-3 text-sm text-gray-300 capitalize">{c.checkpoint}</td>
                <td className="px-4 py-3 text-sm text-gray-400 font-mono">{c.sellerId ? c.sellerId.slice(0, 12) + '...' : '-'}</td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-mono ${c.riskScore > 70 ? 'text-red-400' : c.riskScore > 40 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {c.riskScore}
                  </span>
                </td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${c.decision === 'BLOCK' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{c.decision}</span></td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[c.status]}`}>{c.status}</span></td>
                <td className="px-4 py-3 text-sm text-gray-400">{getAge(c.createdAt)}</td>
                <td className="px-4 py-3 text-sm text-gray-400">{c.assignee ? c.assignee.split('@')[0] : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cases.length === 0 && (
          <div className="text-center text-gray-500 py-12">No cases matching filters</div>
        )}
      </div>

      {/* Case Detail Panel */}
      {selectedCase && caseDetail && (
        <div className="bg-[#1a1f2e] border border-cyan-500/30 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">{caseDetail.caseId}</h3>
            <div className="flex gap-2">
              {caseDetail.status === 'OPEN' && (
                <button onClick={() => assignCase(caseDetail.caseId)} className="px-3 py-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-lg text-sm hover:bg-purple-500/30">
                  Take Case
                </button>
              )}
              {caseDetail.status !== 'RESOLVED' && (
                <>
                  <button onClick={() => updateStatus(caseDetail.caseId, 'RESOLVED', 'CONFIRMED_FRAUD')} className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm hover:bg-red-500/30">
                    Confirmed Fraud
                  </button>
                  <button onClick={() => updateStatus(caseDetail.caseId, 'RESOLVED', 'FALSE_POSITIVE')} className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-sm hover:bg-green-500/30">
                    False Positive
                  </button>
                  <button onClick={() => updateStatus(caseDetail.caseId, 'RESOLVED', 'ESCALATED')} className="px-3 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg text-sm hover:bg-orange-500/30">
                    Escalate
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div><div className="text-xs text-gray-500">Priority</div><div className={`text-sm font-bold ${caseDetail.priority === 'CRITICAL' ? 'text-red-400' : caseDetail.priority === 'HIGH' ? 'text-orange-400' : 'text-yellow-400'}`}>{caseDetail.priority}</div></div>
            <div><div className="text-xs text-gray-500">Checkpoint</div><div className="text-sm text-white capitalize">{caseDetail.checkpoint}</div></div>
            <div><div className="text-xs text-gray-500">Risk Score</div><div className="text-sm text-white font-mono">{caseDetail.riskScore}</div></div>
            <div><div className="text-xs text-gray-500">Decision</div><div className="text-sm text-white">{caseDetail.decision}</div></div>
          </div>

          {/* Seller Info */}
          {caseDetail.seller && (
            <div className="bg-[#0f1320] rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-2">Seller Information</div>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div><span className="text-gray-400">Name:</span> <span className="text-white">{caseDetail.seller.businessName}</span></div>
                <div><span className="text-gray-400">Email:</span> <span className="text-white">{caseDetail.seller.email}</span></div>
                <div><span className="text-gray-400">Country:</span> <span className="text-white">{caseDetail.seller.country}</span></div>
                <div><span className="text-gray-400">Risk:</span> <span className="text-white">{caseDetail.seller.riskTier}</span></div>
              </div>
            </div>
          )}

          {/* Triggered Rules */}
          {caseDetail.ruleDetails && caseDetail.ruleDetails.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2">Triggered Rules</div>
              <div className="space-y-1">
                {caseDetail.ruleDetails.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-[#0f1320] rounded px-3 py-1.5">
                    <span className="text-cyan-400 font-mono text-xs">{r.ruleId}</span>
                    <span className="text-white">{r.name}</span>
                    {r.severity && <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLORS[r.severity]}`}>{r.severity}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div className="text-xs text-gray-500 mb-2">Investigation Notes</div>
            {caseDetail.notes && caseDetail.notes.length > 0 ? (
              <div className="space-y-2 mb-3">
                {caseDetail.notes.map((n, i) => (
                  <div key={i} className="bg-[#0f1320] rounded px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <User size={10} />
                      <span>{n.author}</span>
                      <span>{new Date(n.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-sm text-gray-300 mt-1">{n.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-600 mb-3">No notes yet</div>
            )}
            {caseDetail.status !== 'RESOLVED' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addNote(caseDetail.caseId)}
                  placeholder="Add investigation note..."
                  className="flex-1 bg-[#0f1320] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-cyan-500/50 focus:outline-none"
                />
                <button onClick={() => addNote(caseDetail.caseId)} className="px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm hover:bg-cyan-500/30">
                  Add Note
                </button>
              </div>
            )}
          </div>

          {caseDetail.resolution && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
              <div className="text-xs text-gray-500">Resolution</div>
              <div className="text-sm text-green-400 font-bold">{caseDetail.resolution}</div>
              <div className="text-xs text-gray-500 mt-1">Resolved {new Date(caseDetail.resolvedAt).toLocaleString()}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/CaseQueue.jsx
git commit -m "feat: add Case Investigation Queue frontend page"
```

---

## Task 9: Wire Navigation and Routes

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Layout.jsx`

**Step 1: Add routes in App.jsx**

Import the new page components at the top of `src/App.jsx` (alongside other lazy/import statements):

```javascript
import RiskRules from './pages/RiskRules';
import CaseQueue from './pages/CaseQueue';
```

Add the routes inside the `<Routes>` block (before the closing `</Routes>`):

```jsx
<Route path="/risk-rules" element={<RiskRules />} />
<Route path="/case-queue" element={<CaseQueue />} />
```

**Step 2: Add nav items in Layout.jsx**

In `src/components/Layout.jsx`, add the icon imports. Find the lucide-react import line and add `BookOpen` and `FolderOpen`:

```javascript
import { ..., BookOpen, FolderOpen } from 'lucide-react';
```

In the `navigation` array, add these items. Find a good location — after the "Agentic AI" entry and before "Observability":

```javascript
{ name: 'Risk Rules', href: '/risk-rules', icon: BookOpen, color: 'text-amber-400' },
{ name: 'Case Queue', href: '/case-queue', icon: FolderOpen, color: 'text-pink-400' },
```

**Step 3: Verify**

```bash
lsof -ti:3005 | xargs kill 2>/dev/null; sleep 1
PORT=3005 node backend/gateway/server.js &
sleep 5
# Check backend
curl -s http://localhost:3005/api/cases/stats
curl -s http://localhost:3005/api/rules/by-checkpoint | head -c 200
# Check frontend renders (the Vite dev server should already be running on 5173)
curl -s http://localhost:5173/ | head -c 100
kill %1
```

**Step 4: Commit**

```bash
git add src/App.jsx src/components/Layout.jsx
git commit -m "feat: wire Risk Rules and Case Queue pages into navigation and routing"
```

---

## Summary

| Task | Component | New Files | Modified Files | Key Deliverable |
|------|-----------|-----------|---------------|-----------------|
| 1 | Database | 008-case-queue.js | database.js, migrations/index.js | Cases table |
| 2 | Rules Data | — | generators.js | 30 checkpoint-specific rules + extended fields |
| 3 | Rules API | — | rules/index.js | /by-checkpoint and /templates endpoints |
| 4 | Case Queue API | case-queue/index.js | — | Full CRUD case management API |
| 5 | Integration | — | execution/index.js | Auto-create cases on BLOCK/REVIEW |
| 6 | Gateway | — | server.js | Mount routes, seed rules + cases |
| 7 | Risk Rules UI | RiskRules.jsx | — | Checkpoint-organized rule browsing page |
| 8 | Case Queue UI | CaseQueue.jsx | — | Investigation queue with detail panel |
| 9 | Navigation | — | App.jsx, Layout.jsx | Routes and sidebar nav items |
