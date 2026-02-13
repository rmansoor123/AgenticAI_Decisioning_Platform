# Seller Risk Profile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a centralized Seller Risk Profile service that aggregates risk signals from all microservices, maintains a composite score with time decay, enforces tiered automated actions, and displays a real-time dashboard.

**Architecture:** New Express router service at `/api/risk-profile` following existing patterns (db_ops, JSON data blobs, in-memory fallback). Events flow in from existing services via internal fetch calls to `POST /event`. Composite score calculated with exponential decay. Frontend React page with Recharts and Tailwind.

**Tech Stack:** Express.js, SQLite (via db_ops), React, Recharts, Tailwind CSS, Lucide icons

---

## Task 1: Database Migration

**Files:**
- Create: `backend/shared/common/migrations/003-risk-profiles.js`
- Modify: `backend/shared/common/migrations/index.js`
- Modify: `backend/shared/common/database.js`

**Step 1: Create migration file**

Create `backend/shared/common/migrations/003-risk-profiles.js`:

```js
export const up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seller_risk_profiles (
      seller_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_risk_profiles_created ON seller_risk_profiles(created_at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS risk_events (
      event_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_risk_events_created ON risk_events(created_at)`);

  console.log('Migration 003-risk-profiles applied successfully');
};

export const down = (db) => {
  db.exec('DROP TABLE IF EXISTS risk_events');
  db.exec('DROP TABLE IF EXISTS seller_risk_profiles');
  console.log('Migration 003-risk-profiles rolled back');
};

export default { up, down };
```

**Step 2: Register migration in index.js**

In `backend/shared/common/migrations/index.js`, add import and entry:

```js
import riskProfiles from './003-risk-profiles.js';
```

Add to migrations array:

```js
{ version: '003', name: 'risk-profiles', migration: riskProfiles }
```

**Step 3: Add tables to in-memory store in database.js**

In `backend/shared/common/database.js`, add to `memoryStore`:

```js
seller_risk_profiles: new Map(),
risk_events: new Map()
```

And add to `getIdField`:

```js
seller_risk_profiles: 'seller_id',
risk_events: 'event_id'
```

And add both table names to the `getStats` tables array.

**Step 4: Delete existing database to force re-seed with new tables**

Run: `rm -f backend/data/fraud_detection.db`

**Step 5: Commit**

```bash
git add backend/shared/common/migrations/003-risk-profiles.js backend/shared/common/migrations/index.js backend/shared/common/database.js
git commit -m "feat: add database migration for seller risk profiles and risk events"
```

---

## Task 2: Risk Profile Service — Core Engine

**Files:**
- Create: `backend/services/risk-profile/index.js`

This is the main service file. It includes:
- The decay calculation engine
- The composite score recalculation logic
- The tier determination and action enforcement
- All API endpoints

**Step 1: Create the risk profile service**

Create `backend/services/risk-profile/index.js` with the following structure:

```js
import express from 'express';
import { db_ops } from '../../shared/common/database.js';

const router = express.Router();

// Configuration
const HALF_LIFE_DAYS = 30;
const DE_ESCALATION_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 hours

const TIER_THRESHOLDS = {
  LOW: { min: 0, max: 30 },
  MEDIUM: { min: 31, max: 60 },
  HIGH: { min: 61, max: 85 },
  CRITICAL: { min: 86, max: 100 }
};

const DOMAIN_WEIGHTS = {
  onboarding: 0.20,
  ato: 0.25,
  payout: 0.20,
  listing: 0.15,
  shipping: 0.10,
  transaction: 0.10
};
```

**Decay function:**

```js
function calculateDecayedScore(originalScore, createdAt) {
  const daysSince = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return originalScore * Math.pow(0.5, daysSince / HALF_LIFE_DAYS);
}
```

**Tier determination:**

```js
function determineTier(score) {
  if (score >= TIER_THRESHOLDS.CRITICAL.min) return 'CRITICAL';
  if (score >= TIER_THRESHOLDS.HIGH.min) return 'HIGH';
  if (score >= TIER_THRESHOLDS.MEDIUM.min) return 'MEDIUM';
  return 'LOW';
}
```

**Determine active actions based on tier:**

```js
function determineActions(tier) {
  switch (tier) {
    case 'CRITICAL':
      return {
        seller_suspended: true,
        transactions_blocked: true,
        payouts_held: true,
        listings_suspended: true,
        alert_level: 'CRITICAL'
      };
    case 'HIGH':
      return {
        listings_suspended: true,
        payouts_held: true,
        large_transactions_review: true,
        alert_level: 'URGENT'
      };
    case 'MEDIUM':
      return {
        large_payouts_held: true,
        flagged_for_review: true,
        alert_level: 'INFO'
      };
    default:
      return {};
  }
}
```

**Recalculate composite score from all events for a seller:**

```js
function recalculateProfile(sellerId) {
  // Get all events for this seller
  const allEvents = db_ops.getAll('risk_events', 100000, 0)
    .map(e => e.data)
    .filter(e => e.sellerId === sellerId);

  // Calculate decayed scores per domain
  const domainScores = {};
  const domainEventCounts = {};

  for (const domain of Object.keys(DOMAIN_WEIGHTS)) {
    domainScores[domain] = 0;
    domainEventCounts[domain] = 0;
  }

  allEvents.forEach(event => {
    const decayed = calculateDecayedScore(event.riskScore, event.createdAt);
    const domain = event.domain;
    if (domainScores[domain] !== undefined) {
      domainScores[domain] += decayed;
      domainEventCounts[domain]++;
    }
  });

  // Normalize domain scores to 0-100 range (cap at 100)
  for (const domain of Object.keys(domainScores)) {
    domainScores[domain] = Math.min(100, Math.max(0, domainScores[domain]));
  }

  // Weighted composite
  let compositeScore = 0;
  for (const [domain, weight] of Object.entries(DOMAIN_WEIGHTS)) {
    compositeScore += domainScores[domain] * weight;
  }
  compositeScore = Math.min(100, Math.max(0, Math.round(compositeScore * 100) / 100));

  const newTier = determineTier(compositeScore);

  // Get existing profile for de-escalation check
  const existing = db_ops.getById('seller_risk_profiles', 'seller_id', sellerId);
  const existingData = existing?.data;
  let effectiveTier = newTier;

  // Check manual override
  if (existingData?.manualOverride) {
    effectiveTier = existingData.manualOverride.tier;
  }
  // De-escalation cooldown: if new tier is lower, check cooldown
  else if (existingData && tierLevel(newTier) < tierLevel(existingData.riskTier)) {
    const tierChangedAt = existingData.tierChangedAt ? new Date(existingData.tierChangedAt).getTime() : 0;
    if (Date.now() - tierChangedAt < DE_ESCALATION_COOLDOWN_MS) {
      effectiveTier = existingData.riskTier; // Keep current tier during cooldown
    }
  }

  const activeActions = determineActions(effectiveTier);
  const now = new Date().toISOString();

  const profile = {
    sellerId,
    compositeScore,
    riskTier: effectiveTier,
    domainScores,
    activeActions,
    tierChangedAt: (existingData?.riskTier !== effectiveTier) ? now : (existingData?.tierChangedAt || now),
    lastEventAt: allEvents.length > 0 ? allEvents[0].createdAt : now,
    lastRecalcAt: now,
    manualOverride: existingData?.manualOverride || null,
    totalEvents: allEvents.length,
    createdAt: existingData?.createdAt || now,
    updatedAt: now
  };

  // Upsert profile
  if (existing) {
    db_ops.update('seller_risk_profiles', 'seller_id', sellerId, profile);
  } else {
    db_ops.insert('seller_risk_profiles', 'seller_id', sellerId, profile);
  }

  return profile;
}

function tierLevel(tier) {
  const levels = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  return levels[tier] || 0;
}
```

**Endpoints:**

POST /event — Record a risk event and recalculate:

```js
router.post('/event', (req, res) => {
  try {
    const { sellerId, domain, eventType, riskScore, metadata } = req.body;

    if (!sellerId || !domain || !eventType || riskScore === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sellerId, domain, eventType, riskScore'
      });
    }

    const eventId = `RE-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();

    const event = {
      eventId,
      sellerId,
      domain,
      eventType,
      riskScore,
      metadata: metadata || {},
      createdAt: now
    };

    db_ops.insert('risk_events', 'event_id', eventId, event);

    // Recalculate profile
    const profile = recalculateProfile(sellerId);

    res.status(201).json({
      success: true,
      data: { event, profile }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

GET /:sellerId — Full risk profile:

```js
router.get('/:sellerId', (req, res) => {
  try {
    const profile = db_ops.getById('seller_risk_profiles', 'seller_id', req.params.sellerId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Risk profile not found' });
    }
    res.json({ success: true, data: profile.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

GET /:sellerId/events — Events with decay applied:

```js
router.get('/:sellerId/events', (req, res) => {
  try {
    const { domain, limit = 100 } = req.query;

    let events = db_ops.getAll('risk_events', 100000, 0)
      .map(e => e.data)
      .filter(e => e.sellerId === req.params.sellerId);

    if (domain) events = events.filter(e => e.domain === domain);

    // Add decayed score to each event
    events = events.map(e => ({
      ...e,
      decayedScore: Math.round(calculateDecayedScore(e.riskScore, e.createdAt) * 100) / 100
    }));

    // Sort by createdAt descending
    events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    events = events.slice(0, parseInt(limit));

    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

GET /:sellerId/history — Score history over time:

```js
router.get('/:sellerId/history', (req, res) => {
  try {
    const { days = 90 } = req.query;
    const events = db_ops.getAll('risk_events', 100000, 0)
      .map(e => e.data)
      .filter(e => e.sellerId === req.params.sellerId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Build score snapshots at each event point
    const history = [];
    events.forEach((event, idx) => {
      const eventsUpToNow = events.slice(0, idx + 1);
      let compositeScore = 0;
      const domainScores = {};

      for (const domain of Object.keys(DOMAIN_WEIGHTS)) {
        const domainEvents = eventsUpToNow.filter(e => e.domain === domain);
        let score = 0;
        domainEvents.forEach(e => {
          score += calculateDecayedScoreAt(e.riskScore, e.createdAt, event.createdAt);
        });
        domainScores[domain] = Math.min(100, Math.max(0, score));
        compositeScore += domainScores[domain] * DOMAIN_WEIGHTS[domain];
      }

      history.push({
        timestamp: event.createdAt,
        compositeScore: Math.round(Math.min(100, Math.max(0, compositeScore)) * 100) / 100,
        tier: determineTier(compositeScore),
        domainScores,
        triggerEvent: { eventType: event.eventType, domain: event.domain, riskScore: event.riskScore }
      });
    });

    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function calculateDecayedScoreAt(originalScore, eventCreatedAt, asOfDate) {
  const daysSince = (new Date(asOfDate).getTime() - new Date(eventCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
  return originalScore * Math.pow(0.5, Math.max(0, daysSince) / HALF_LIFE_DAYS);
}
```

GET /:sellerId/timeline — Chronological event timeline:

```js
router.get('/:sellerId/timeline', (req, res) => {
  try {
    const events = db_ops.getAll('risk_events', 100000, 0)
      .map(e => e.data)
      .filter(e => e.sellerId === req.params.sellerId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const timeline = events.map(e => ({
      eventId: e.eventId,
      timestamp: e.createdAt,
      domain: e.domain,
      eventType: e.eventType,
      riskScore: e.riskScore,
      decayedScore: Math.round(calculateDecayedScore(e.riskScore, e.createdAt) * 100) / 100,
      isPositive: e.riskScore < 0
    }));

    res.json({ success: true, data: timeline });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

GET /high-risk — Sellers above threshold:

```js
router.get('/high-risk', (req, res) => {
  try {
    // Note: this path must be registered BEFORE /:sellerId to avoid conflicts
    const { tier = 'HIGH', limit = 50 } = req.query;
    const minScore = TIER_THRESHOLDS[tier]?.min || 61;

    const profiles = db_ops.getAll('seller_risk_profiles', 10000, 0)
      .map(p => p.data)
      .filter(p => p.compositeScore >= minScore)
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, parseInt(limit));

    // Enrich with seller info
    const enriched = profiles.map(p => {
      const seller = db_ops.getById('sellers', 'seller_id', p.sellerId);
      return {
        ...p,
        businessName: seller?.data?.businessName,
        email: seller?.data?.email,
        status: seller?.data?.status
      };
    });

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

GET /stats — Platform risk distribution:

```js
router.get('/stats', (req, res) => {
  try {
    // Note: this path must be registered BEFORE /:sellerId to avoid conflicts
    const profiles = db_ops.getAll('seller_risk_profiles', 100000, 0).map(p => p.data);

    const stats = {
      total: profiles.length,
      byTier: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
      avgCompositeScore: 0,
      totalEvents: db_ops.count('risk_events'),
      recentEscalations: [],
      domainContributions: {}
    };

    profiles.forEach(p => {
      stats.byTier[p.riskTier] = (stats.byTier[p.riskTier] || 0) + 1;
      stats.avgCompositeScore += p.compositeScore;
    });

    if (profiles.length > 0) {
      stats.avgCompositeScore = Math.round((stats.avgCompositeScore / profiles.length) * 100) / 100;
    }

    // Recent tier changes (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    stats.recentEscalations = profiles
      .filter(p => p.tierChangedAt > oneDayAgo && (p.riskTier === 'HIGH' || p.riskTier === 'CRITICAL'))
      .slice(0, 10);

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

PATCH /:sellerId/override — Manual tier override:

```js
router.patch('/:sellerId/override', (req, res) => {
  try {
    const { tier, reason, overriddenBy } = req.body;

    if (!tier || !reason || !overriddenBy) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tier, reason, overriddenBy'
      });
    }

    const existing = db_ops.getById('seller_risk_profiles', 'seller_id', req.params.sellerId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Risk profile not found' });
    }

    const now = new Date().toISOString();
    const updated = {
      ...existing.data,
      riskTier: tier,
      manualOverride: { tier, reason, overriddenBy, at: now },
      activeActions: determineActions(tier),
      tierChangedAt: now,
      updatedAt: now
    };

    db_ops.update('seller_risk_profiles', 'seller_id', req.params.sellerId, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

**IMPORTANT — Route ordering:** The static paths (`/high-risk`, `/stats`) must be defined BEFORE the parameterized `/:sellerId` routes. Otherwise Express will match "high-risk" as a sellerId.

**Step 2: Commit**

```bash
git add backend/services/risk-profile/index.js
git commit -m "feat: add seller risk profile service with decay engine and tiered escalation"
```

---

## Task 3: Register Service in Gateway

**Files:**
- Modify: `backend/gateway/server.js`

**Step 1: Add import**

After the existing service imports (around line 108), add:

```js
import riskProfileRouter from '../services/risk-profile/index.js';
```

**Step 2: Mount the route**

After the business services block (around line 219), add:

```js
// Risk Profile
app.use('/api/risk-profile', riskProfileRouter);
```

**Step 3: Update health check**

In the `/api/health` handler, add to the services object:

```js
'risk-profile': 'running'
```

**Step 4: Update API docs**

In the `/api` handler, add to the endpoints object:

```js
'/api/risk-profile': 'Seller Risk Profile Service'
```

**Step 5: Update startup banner**

Add to the ASCII banner:

```
║   • Risk Profile       /api/risk-profile                    ║
```

**Step 6: Commit**

```bash
git add backend/gateway/server.js
git commit -m "feat: register risk profile service in API gateway"
```

---

## Task 4: Wire Events from Existing Services

**Files:**
- Modify: `backend/services/business/seller-onboarding/index.js`
- Modify: `backend/services/business/seller-ato/index.js`
- Modify: `backend/services/business/seller-payout/index.js`
- Modify: `backend/services/business/seller-listing/index.js`
- Modify: `backend/services/business/seller-shipping/index.js`
- Modify: `backend/services/decision-engine/execution/index.js`

Each service needs a helper that calls `POST /api/risk-profile/event` internally. Since all services are in the same Express app, use a direct function import rather than HTTP calls.

**Step 1: Create a shared emitter utility**

Create `backend/services/risk-profile/emit-event.js`:

```js
import { db_ops } from '../../shared/common/database.js';

/**
 * Emit a risk event and recalculate the seller's risk profile.
 * This is called directly by other services (no HTTP overhead).
 */
export function emitRiskEvent({ sellerId, domain, eventType, riskScore, metadata }) {
  try {
    const eventId = `RE-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();

    const event = {
      eventId,
      sellerId,
      domain,
      eventType,
      riskScore,
      metadata: metadata || {},
      createdAt: now
    };

    db_ops.insert('risk_events', 'event_id', eventId, event);

    // Import recalculate lazily to avoid circular deps
    // Profile recalculation happens synchronously
    recalculateProfile(sellerId);

    return event;
  } catch (error) {
    console.error(`[RiskProfile] Failed to emit event for ${sellerId}:`, error.message);
  }
}

// Inline recalculate to avoid circular imports
// (same logic as in index.js — extracted here for reuse)

const HALF_LIFE_DAYS = 30;
const DE_ESCALATION_COOLDOWN_MS = 48 * 60 * 60 * 1000;

const DOMAIN_WEIGHTS = {
  onboarding: 0.20, ato: 0.25, payout: 0.20,
  listing: 0.15, shipping: 0.10, transaction: 0.10
};

function calculateDecayedScore(originalScore, createdAt) {
  const daysSince = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return originalScore * Math.pow(0.5, daysSince / HALF_LIFE_DAYS);
}

function determineTier(score) {
  if (score >= 86) return 'CRITICAL';
  if (score >= 61) return 'HIGH';
  if (score >= 31) return 'MEDIUM';
  return 'LOW';
}

function tierLevel(tier) {
  return { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }[tier] || 0;
}

function determineActions(tier) {
  switch (tier) {
    case 'CRITICAL': return { seller_suspended: true, transactions_blocked: true, payouts_held: true, listings_suspended: true, alert_level: 'CRITICAL' };
    case 'HIGH': return { listings_suspended: true, payouts_held: true, large_transactions_review: true, alert_level: 'URGENT' };
    case 'MEDIUM': return { large_payouts_held: true, flagged_for_review: true, alert_level: 'INFO' };
    default: return {};
  }
}

function recalculateProfile(sellerId) {
  const allEvents = db_ops.getAll('risk_events', 100000, 0)
    .map(e => e.data)
    .filter(e => e.sellerId === sellerId);

  const domainScores = {};
  for (const domain of Object.keys(DOMAIN_WEIGHTS)) {
    domainScores[domain] = 0;
  }

  allEvents.forEach(event => {
    const decayed = calculateDecayedScore(event.riskScore, event.createdAt);
    if (domainScores[event.domain] !== undefined) {
      domainScores[event.domain] += decayed;
    }
  });

  for (const domain of Object.keys(domainScores)) {
    domainScores[domain] = Math.min(100, Math.max(0, domainScores[domain]));
  }

  let compositeScore = 0;
  for (const [domain, weight] of Object.entries(DOMAIN_WEIGHTS)) {
    compositeScore += domainScores[domain] * weight;
  }
  compositeScore = Math.min(100, Math.max(0, Math.round(compositeScore * 100) / 100));

  const newTier = determineTier(compositeScore);
  const existing = db_ops.getById('seller_risk_profiles', 'seller_id', sellerId);
  const existingData = existing?.data;
  let effectiveTier = newTier;

  if (existingData?.manualOverride) {
    effectiveTier = existingData.manualOverride.tier;
  } else if (existingData && tierLevel(newTier) < tierLevel(existingData.riskTier)) {
    const tierChangedAt = existingData.tierChangedAt ? new Date(existingData.tierChangedAt).getTime() : 0;
    if (Date.now() - tierChangedAt < DE_ESCALATION_COOLDOWN_MS) {
      effectiveTier = existingData.riskTier;
    }
  }

  const now = new Date().toISOString();
  const profile = {
    sellerId, compositeScore, riskTier: effectiveTier, domainScores,
    activeActions: determineActions(effectiveTier),
    tierChangedAt: (existingData?.riskTier !== effectiveTier) ? now : (existingData?.tierChangedAt || now),
    lastEventAt: allEvents.length > 0 ? allEvents[0].createdAt : now,
    lastRecalcAt: now,
    manualOverride: existingData?.manualOverride || null,
    totalEvents: allEvents.length,
    createdAt: existingData?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    db_ops.update('seller_risk_profiles', 'seller_id', sellerId, profile);
  } else {
    db_ops.insert('seller_risk_profiles', 'seller_id', sellerId, profile);
  }

  return profile;
}
```

**Step 2: Wire Onboarding Service**

In `backend/services/business/seller-onboarding/index.js`:

Add import at top:
```js
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
```

In the `POST /sellers` handler, after `db_ops.insert('sellers', ...)` (around line 116), add:

```js
    // Emit risk event for onboarding
    const onboardingScore = riskAssessment.riskScore || 0;
    emitRiskEvent({
      sellerId,
      domain: 'onboarding',
      eventType: 'ONBOARDING_RISK_ASSESSMENT',
      riskScore: onboardingScore,
      metadata: { decision: decision.action, confidence: decision.confidence }
    });

    if (!sellerData.kycVerified) {
      emitRiskEvent({ sellerId, domain: 'onboarding', eventType: 'KYC_FAILED', riskScore: 40, metadata: {} });
    }
    if (!sellerData.bankVerified) {
      emitRiskEvent({ sellerId, domain: 'onboarding', eventType: 'BANK_VERIFICATION_FAILED', riskScore: 30, metadata: {} });
    }
    if (decision.action === 'REJECT') {
      emitRiskEvent({ sellerId, domain: 'onboarding', eventType: 'SELLER_BLOCKED', riskScore: 80, metadata: { reason: decision.reason } });
    }
```

**Step 3: Wire ATO Service**

In `backend/services/business/seller-ato/index.js`:

Add import at top:
```js
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
```

In the `POST /evaluate` handler, after `db_ops.insert('ato_events', ...)` (around line 82), add:

```js
    // Emit risk events
    emitRiskEvent({
      sellerId,
      domain: 'ato',
      eventType: 'ATO_EVENT',
      riskScore: evaluation.riskScore,
      metadata: { signals: evaluation.signals, decision: evaluation.decision }
    });

    if (evaluation.decision === 'BLOCKED') {
      emitRiskEvent({ sellerId, domain: 'ato', eventType: 'ATO_BLOCKED', riskScore: 75, metadata: {} });
    }
    if (evaluation.signals.impossibleTravel) {
      emitRiskEvent({ sellerId, domain: 'ato', eventType: 'ATO_IMPOSSIBLE_TRAVEL', riskScore: 70, metadata: {} });
    }
    if (evaluation.signals.bruteForce) {
      emitRiskEvent({ sellerId, domain: 'ato', eventType: 'ATO_BRUTE_FORCE', riskScore: 60, metadata: {} });
    }
```

**Step 4: Wire Payout Service**

In `backend/services/business/seller-payout/index.js`:

Add import at top:
```js
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
```

Find the payout creation handler (`POST /payouts`) and after the payout is stored, add risk events based on the risk assessment result. Look for the payout risk assessment and decision:

```js
    // After payout is stored
    if (payout.status === 'HELD') {
      emitRiskEvent({
        sellerId: payout.sellerId,
        domain: 'payout',
        eventType: 'PAYOUT_HELD',
        riskScore: riskAssessment.riskScore || 45,
        metadata: { amount: payout.amount, reason: riskAssessment.signals }
      });
    }
    if (riskAssessment.signals?.some(s => s.signal === 'HIGH_PAYOUT_VELOCITY')) {
      emitRiskEvent({ sellerId: payout.sellerId, domain: 'payout', eventType: 'PAYOUT_HIGH_VELOCITY', riskScore: 50, metadata: {} });
    }
    if (riskAssessment.signals?.some(s => s.signal === 'UNUSUAL_AMOUNT')) {
      emitRiskEvent({ sellerId: payout.sellerId, domain: 'payout', eventType: 'PAYOUT_UNUSUAL_AMOUNT', riskScore: 40, metadata: {} });
    }
```

For the payout release endpoint (`POST /payouts/:payoutId/release`), add:

```js
    emitRiskEvent({
      sellerId: payout.data.sellerId,
      domain: 'payout',
      eventType: 'PAYOUT_RELEASED',
      riskScore: -20,
      metadata: { approvedBy: req.body.approvedBy }
    });
```

**Step 5: Wire Listing Service**

In `backend/services/business/seller-listing/index.js`:

Add import at top:
```js
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
```

In the listing creation handler (`POST /listings`), after the listing is stored and risk assessed, add events based on the assessment result:

```js
    if (listing.status === 'REJECTED') {
      emitRiskEvent({
        sellerId: listing.sellerId,
        domain: 'listing',
        eventType: 'LISTING_REJECTED',
        riskScore: riskAssessment.riskScore || 50,
        metadata: { listingId: listing.listingId }
      });
    }
    if (riskAssessment.signals?.some(s => s.signal === 'PROHIBITED_KEYWORD' || s.signal === 'PROHIBITED_CONTENT_FLAG')) {
      emitRiskEvent({ sellerId: listing.sellerId, domain: 'listing', eventType: 'LISTING_PROHIBITED_CONTENT', riskScore: 70, metadata: {} });
    }
    if (riskAssessment.signals?.some(s => s.signal === 'COUNTERFEIT_RISK_FLAG')) {
      emitRiskEvent({ sellerId: listing.sellerId, domain: 'listing', eventType: 'LISTING_COUNTERFEIT_RISK', riskScore: 60, metadata: {} });
    }
    if (listing.status === 'ACTIVE') {
      emitRiskEvent({ sellerId: listing.sellerId, domain: 'listing', eventType: 'LISTING_APPROVED', riskScore: -5, metadata: {} });
    }
```

**Step 6: Wire Shipping Service**

In `backend/services/business/seller-shipping/index.js`:

Add import at top:
```js
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
```

In shipment creation (`POST /shipments`), after shipping risk assessment and store:

```js
    if (shipment.riskLevel === 'HIGH') {
      emitRiskEvent({
        sellerId: shipment.sellerId,
        domain: 'shipping',
        eventType: 'SHIPPING_FLAGGED',
        riskScore: riskAssessment.riskScore || 50,
        metadata: { shipmentId: shipment.shipmentId }
      });
    }
    if (riskAssessment.signals?.some(s => s.signal === 'RESHIPPING_SERVICE')) {
      emitRiskEvent({ sellerId: shipment.sellerId, domain: 'shipping', eventType: 'SHIPPING_RESHIPPING', riskScore: 55, metadata: {} });
    }
    if (riskAssessment.signals?.some(s => s.signal === 'ADDRESS_MISMATCH')) {
      emitRiskEvent({ sellerId: shipment.sellerId, domain: 'shipping', eventType: 'SHIPPING_ADDRESS_MISMATCH', riskScore: 40, metadata: {} });
    }
```

In shipment status update (`PATCH /shipments/:shipmentId/status`), when status is DELIVERED:

```js
    if (req.body.status === 'DELIVERED') {
      emitRiskEvent({ sellerId: shipment.data.sellerId, domain: 'shipping', eventType: 'SHIPPING_DELIVERED', riskScore: -3, metadata: {} });
    }
```

**Step 7: Wire Decision Engine**

In `backend/services/decision-engine/execution/index.js`:

Add import at top:
```js
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
```

In the `POST /evaluate` handler, after the decision is made and stored, add:

```js
    if (result.transaction?.sellerId) {
      const sellerId = result.transaction.sellerId;
      if (result.decision === 'BLOCKED') {
        emitRiskEvent({ sellerId, domain: 'transaction', eventType: 'TRANSACTION_BLOCKED', riskScore: 70, metadata: { transactionId: result.transactionId } });
      } else if (result.decision === 'REVIEW') {
        emitRiskEvent({ sellerId, domain: 'transaction', eventType: 'TRANSACTION_REVIEW', riskScore: 40, metadata: { transactionId: result.transactionId } });
      } else if (result.decision === 'APPROVED') {
        emitRiskEvent({ sellerId, domain: 'transaction', eventType: 'TRANSACTION_APPROVED', riskScore: -2, metadata: {} });
      }
    }
```

**Step 8: Commit**

```bash
git add backend/services/risk-profile/emit-event.js backend/services/business/ backend/services/decision-engine/
git commit -m "feat: wire risk events from all services to risk profile engine"
```

---

## Task 5: Seed Risk Profiles for Existing Sellers

**Files:**
- Modify: `backend/gateway/server.js`

In the `seedDatabase()` function, after existing seed logic, add seeding of risk profiles for existing sellers so the dashboard has data on first load.

**Step 1: Add risk profile seeding**

After the existing seed logic in `seedDatabase()` (around line 88), add:

```js
  // Seed risk profiles for existing sellers
  const { emitRiskEvent } = await import('../services/risk-profile/emit-event.js');
  const allSellers = db_ops.getAll('sellers', 100, 0).map(s => s.data);

  allSellers.forEach(seller => {
    // Emit onboarding event based on existing risk score
    emitRiskEvent({
      sellerId: seller.sellerId,
      domain: 'onboarding',
      eventType: 'ONBOARDING_RISK_ASSESSMENT',
      riskScore: seller.riskScore || Math.floor(Math.random() * 60),
      metadata: { seeded: true }
    });

    // Randomly add some historical events for variety
    if (Math.random() > 0.7) {
      emitRiskEvent({ sellerId: seller.sellerId, domain: 'ato', eventType: 'ATO_EVENT', riskScore: Math.floor(Math.random() * 50) + 10, metadata: { seeded: true } });
    }
    if (Math.random() > 0.8) {
      emitRiskEvent({ sellerId: seller.sellerId, domain: 'payout', eventType: 'PAYOUT_HELD', riskScore: Math.floor(Math.random() * 40) + 20, metadata: { seeded: true } });
    }
    if (Math.random() > 0.6) {
      emitRiskEvent({ sellerId: seller.sellerId, domain: 'listing', eventType: 'LISTING_APPROVED', riskScore: -5, metadata: { seeded: true } });
    }
    if (Math.random() > 0.85) {
      emitRiskEvent({ sellerId: seller.sellerId, domain: 'shipping', eventType: 'SHIPPING_FLAGGED', riskScore: Math.floor(Math.random() * 40) + 30, metadata: { seeded: true } });
    }
    if (Math.random() > 0.5) {
      emitRiskEvent({ sellerId: seller.sellerId, domain: 'transaction', eventType: 'TRANSACTION_APPROVED', riskScore: -2, metadata: { seeded: true } });
    }
  });

  console.log(`  Risk Profiles: ${db_ops.count('seller_risk_profiles')}`);
  console.log(`  Risk Events: ${db_ops.count('risk_events')}`);
```

Note: since `seedDatabase()` is currently synchronous, the import needs to be changed to an async pattern or use a dynamic import. Wrap the seeding call inside the function accordingly. Check the existing seedDatabase function — if it's sync, the dynamic import (`await import(...)`) will need the function to become `async` and the call at startup to be awaited.

**Step 2: Commit**

```bash
git add backend/gateway/server.js
git commit -m "feat: seed risk profiles with synthetic data for existing sellers"
```

---

## Task 6: Frontend — Risk Profile Page

**Files:**
- Create: `src/pages/SellerRiskProfile.jsx`

This is a large React component with 4 sections: Risk Overview, Risk Timeline chart, Event Log table, and Tier History. Use Recharts for charts and Tailwind for styling, matching existing page patterns.

**Step 1: Create the page component**

Create `src/pages/SellerRiskProfile.jsx`. The component should:

1. Fetch `/api/risk-profile/high-risk` and `/api/risk-profile/stats` on load for the overview
2. When a seller is selected, fetch their full profile, events, and history
3. Display:
   - **High-Risk Sellers table** (default view) — sortable by score, shows tier badge, business name, top domain, last event
   - **Risk Profile detail** (when seller selected):
     - Score gauge (circular progress or large number with color)
     - Domain scores as horizontal bars (6 bars, one per domain)
     - Active actions as badges
     - Risk timeline chart (Recharts LineChart of compositeScore over time)
     - Event log table (filterable by domain)
     - Manual override form (tier dropdown + reason text + submit)

Use this general structure:

```jsx
import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts'
import { Shield, AlertTriangle, TrendingUp, TrendingDown, Clock, Filter, ArrowLeft, UserX, CreditCard, Package, ShoppingBag, Truck, Activity } from 'lucide-react'

const API_BASE = 'http://localhost:3005/api'

// Tier color mapping
const TIER_COLORS = {
  LOW: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500' },
  MEDIUM: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500' },
  HIGH: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500' },
  CRITICAL: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500' }
}

const DOMAIN_ICONS = {
  onboarding: UserX,
  ato: Shield,
  payout: CreditCard,
  listing: ShoppingBag,
  shipping: Truck,
  transaction: Activity
}
```

Include:
- A stats summary bar at the top (total profiles, by tier counts)
- The high-risk sellers table with click-to-drill-down
- The detail view with back button
- Recharts LineChart for score history
- Domain breakdown bars
- Event log with domain filter pills
- Override form (PATCH to `/:sellerId/override`)

The component should be ~400-500 lines following the patterns in existing pages like `Dashboard.jsx` and `Onboarding.jsx`.

**Step 2: Commit**

```bash
git add src/pages/SellerRiskProfile.jsx
git commit -m "feat: add seller risk profile dashboard page"
```

---

## Task 7: Wire Frontend — Routes and Navigation

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Layout.jsx`

**Step 1: Add route in App.jsx**

Add import:
```jsx
import SellerRiskProfile from './pages/SellerRiskProfile'
```

Add route inside `<Routes>` (after the seller-network route):
```jsx
<Route path="/risk-profiles" element={<SellerRiskProfile />} />
<Route path="/risk-profiles/:sellerId" element={<SellerRiskProfile />} />
```

**Step 2: Add navigation in Layout.jsx**

Add `ShieldAlert` to the lucide-react import:
```jsx
import { ..., ShieldAlert } from 'lucide-react'
```

Add to the navigation array (after the Seller Onboarding entry, before Services):
```jsx
{
  name: 'Risk Profiles',
  href: '/risk-profiles',
  icon: ShieldAlert,
  color: 'text-red-400'
}
```

**Step 3: Commit**

```bash
git add src/App.jsx src/components/Layout.jsx
git commit -m "feat: add risk profiles to navigation and routing"
```

---

## Task 8: Test End-to-End

**Step 1: Delete old database and restart backend**

```bash
rm -f backend/data/fraud_detection.db
# Restart backend server on port 3005
```

**Step 2: Verify backend API**

```bash
curl http://localhost:3005/api/risk-profile/stats
curl http://localhost:3005/api/risk-profile/high-risk
```

Both should return `{ success: true, data: ... }` with populated data from seeding.

**Step 3: Verify event ingestion**

```bash
curl -X POST http://localhost:3005/api/risk-profile/event \
  -H "Content-Type: application/json" \
  -d '{"sellerId":"SLR-TEST","domain":"ato","eventType":"ATO_BRUTE_FORCE","riskScore":60}'
```

Should return the event and a recalculated profile.

**Step 4: Verify frontend**

Open http://localhost:5173/risk-profiles in browser. Should show:
- Stats bar with tier distribution
- High-risk sellers table
- Click a seller to see detail view with charts

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end testing"
```
