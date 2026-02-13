import express from 'express';
import { db_ops } from '../../shared/common/database.js';

const router = express.Router();

// ── Configuration ────────────────────────────────────────────────────────────

const HALF_LIFE_DAYS = 30;
const DE_ESCALATION_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 hours

const TIER_THRESHOLDS = {
  LOW:      { min: 0,  max: 30 },
  MEDIUM:   { min: 31, max: 60 },
  HIGH:     { min: 61, max: 85 },
  CRITICAL: { min: 86, max: 100 }
};

const DOMAIN_WEIGHTS = {
  onboarding:  0.20,
  ato:         0.25,
  payout:      0.20,
  listing:     0.15,
  shipping:    0.10,
  transaction: 0.10
};

// ── Core Functions ───────────────────────────────────────────────────────────

function calculateDecayedScore(originalScore, createdAt) {
  const daysSinceEvent = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return originalScore * Math.pow(0.5, daysSinceEvent / HALF_LIFE_DAYS);
}

function calculateDecayedScoreAt(originalScore, eventCreatedAt, asOfDate) {
  const daysSinceEvent = (new Date(asOfDate).getTime() - new Date(eventCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
  return originalScore * Math.pow(0.5, daysSinceEvent / HALF_LIFE_DAYS);
}

function determineTier(score) {
  if (score >= TIER_THRESHOLDS.CRITICAL.min) return 'CRITICAL';
  if (score >= TIER_THRESHOLDS.HIGH.min) return 'HIGH';
  if (score >= TIER_THRESHOLDS.MEDIUM.min) return 'MEDIUM';
  return 'LOW';
}

function tierLevel(tier) {
  const levels = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  return levels[tier] ?? 0;
}

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
    case 'LOW':
    default:
      return {};
  }
}

function recalculateProfile(sellerId) {
  // 1. Get all risk_events for this seller
  const allEvents = db_ops.getAll('risk_events', 10000, 0)
    .map(e => e.data)
    .filter(e => e.sellerId === sellerId);

  // 2. Calculate decayed scores per domain
  const domainScores = {};
  for (const domain of Object.keys(DOMAIN_WEIGHTS)) {
    const domainEvents = allEvents.filter(e => e.domain === domain);
    const totalDecayed = domainEvents.reduce((sum, evt) => {
      return sum + calculateDecayedScore(evt.riskScore, evt.createdAt);
    }, 0);
    // 3. Cap each domain at 0-100
    domainScores[domain] = Math.max(0, Math.min(100, totalDecayed));
  }

  // 4. Weighted composite = sum(domainScore * weight)
  let compositeScore = 0;
  for (const [domain, weight] of Object.entries(DOMAIN_WEIGHTS)) {
    compositeScore += (domainScores[domain] || 0) * weight;
  }
  compositeScore = Math.round(compositeScore * 100) / 100;

  // 5. Determine new tier
  let newTier = determineTier(compositeScore);

  // 6. Get existing profile for override / cooldown checks
  const existingRecord = db_ops.getById('seller_risk_profiles', 'seller_id', sellerId);
  const existingProfile = existingRecord ? existingRecord.data : null;

  // Check for manual override (keep override tier if set)
  if (existingProfile && existingProfile.manualOverride && existingProfile.manualOverride.active) {
    newTier = existingProfile.manualOverride.tier;
  }

  // 7. Check de-escalation cooldown
  if (existingProfile && !existingProfile.manualOverride?.active) {
    const currentTierLevel = tierLevel(existingProfile.tier);
    const newTierLevel = tierLevel(newTier);

    if (newTierLevel < currentTierLevel) {
      const lastTierChange = existingProfile.lastTierChange
        ? new Date(existingProfile.lastTierChange).getTime()
        : 0;
      const elapsed = Date.now() - lastTierChange;

      if (elapsed < DE_ESCALATION_COOLDOWN_MS) {
        newTier = existingProfile.tier;
      }
    }
  }

  const actions = determineActions(newTier);
  const now = new Date().toISOString();

  const tierChanged = existingProfile ? existingProfile.tier !== newTier : true;

  const profile = {
    sellerId,
    compositeScore,
    domainScores,
    tier: newTier,
    previousTier: existingProfile ? existingProfile.tier : null,
    actions,
    totalEvents: allEvents.length,
    lastTierChange: tierChanged ? now : (existingProfile?.lastTierChange || now),
    manualOverride: existingProfile?.manualOverride || null,
    updatedAt: now,
    createdAt: existingProfile?.createdAt || now
  };

  // 8. Upsert profile in seller_risk_profiles
  if (existingProfile) {
    db_ops.update('seller_risk_profiles', 'seller_id', sellerId, profile);
  } else {
    db_ops.insert('seller_risk_profiles', 'seller_id', sellerId, profile);
  }

  return profile;
}

// ── Endpoints ────────────────────────────────────────────────────────────────
// Static paths BEFORE parameterized paths

// 1. GET /high-risk — List high-risk sellers
router.get('/high-risk', (req, res) => {
  try {
    const { tier = 'HIGH', limit = 50 } = req.query;
    const threshold = TIER_THRESHOLDS[tier]?.min ?? TIER_THRESHOLDS.HIGH.min;

    const allProfiles = db_ops.getAll('seller_risk_profiles', 10000, 0)
      .map(r => r.data)
      .filter(p => p.compositeScore >= threshold)
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, parseInt(limit));

    // Enrich with seller info
    const enriched = allProfiles.map(profile => {
      const sellerRecord = db_ops.getById('sellers', 'seller_id', profile.sellerId);
      const sellerData = sellerRecord ? sellerRecord.data : {};
      return {
        ...profile,
        seller: {
          businessName: sellerData.businessName || null,
          email: sellerData.email || null,
          status: sellerData.status || null
        }
      };
    });

    res.json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. GET /stats — Platform risk distribution
router.get('/stats', (req, res) => {
  try {
    const allProfiles = db_ops.getAll('seller_risk_profiles', 10000, 0).map(r => r.data);

    const tierCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    let totalComposite = 0;

    allProfiles.forEach(p => {
      tierCounts[p.tier] = (tierCounts[p.tier] || 0) + 1;
      totalComposite += p.compositeScore;
    });

    const totalProfiles = allProfiles.length;
    const avgCompositeScore = totalProfiles > 0
      ? Math.round((totalComposite / totalProfiles) * 100) / 100
      : 0;

    const totalEvents = db_ops.count('risk_events');

    // Recent escalations: tier changes to HIGH or CRITICAL in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentEscalations = allProfiles.filter(p =>
      (p.tier === 'HIGH' || p.tier === 'CRITICAL') &&
      p.lastTierChange &&
      p.lastTierChange > oneDayAgo &&
      p.previousTier &&
      tierLevel(p.tier) > tierLevel(p.previousTier)
    ).length;

    res.json({
      success: true,
      data: {
        totalProfiles,
        tierCounts,
        avgCompositeScore,
        totalEvents,
        recentEscalations
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. POST /event — Record risk event
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

    const updatedProfile = recalculateProfile(sellerId);

    res.json({
      success: true,
      data: {
        event,
        profile: updatedProfile
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. GET /:sellerId — Full risk profile
router.get('/:sellerId', (req, res) => {
  try {
    const record = db_ops.getById('seller_risk_profiles', 'seller_id', req.params.sellerId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Risk profile not found' });
    }
    res.json({ success: true, data: record.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. GET /:sellerId/events — All risk events for seller
router.get('/:sellerId/events', (req, res) => {
  try {
    const { domain, limit = 100 } = req.query;

    let events = db_ops.getAll('risk_events', 10000, 0)
      .map(r => r.data)
      .filter(e => e.sellerId === req.params.sellerId);

    if (domain) {
      events = events.filter(e => e.domain === domain);
    }

    // Add decayedScore to each event
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

// 6. GET /:sellerId/history — Score history over time
router.get('/:sellerId/history', (req, res) => {
  try {
    const allEvents = db_ops.getAll('risk_events', 10000, 0)
      .map(r => r.data)
      .filter(e => e.sellerId === req.params.sellerId);

    // Sort events chronologically (ascending)
    allEvents.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Build score snapshots at each event point
    const history = allEvents.map((triggerEvent, index) => {
      const asOfDate = triggerEvent.createdAt;
      const eventsUpToNow = allEvents.slice(0, index + 1);

      // Replay all events up to that point using calculateDecayedScoreAt
      const domainScores = {};
      for (const domain of Object.keys(DOMAIN_WEIGHTS)) {
        const domainEvents = eventsUpToNow.filter(e => e.domain === domain);
        const totalDecayed = domainEvents.reduce((sum, evt) => {
          return sum + calculateDecayedScoreAt(evt.riskScore, evt.createdAt, asOfDate);
        }, 0);
        domainScores[domain] = Math.max(0, Math.min(100, totalDecayed));
      }

      let compositeScore = 0;
      for (const [domain, weight] of Object.entries(DOMAIN_WEIGHTS)) {
        compositeScore += (domainScores[domain] || 0) * weight;
      }
      compositeScore = Math.round(compositeScore * 100) / 100;

      return {
        timestamp: asOfDate,
        compositeScore,
        tier: determineTier(compositeScore),
        domainScores,
        triggerEvent: {
          eventId: triggerEvent.eventId,
          domain: triggerEvent.domain,
          eventType: triggerEvent.eventType,
          riskScore: triggerEvent.riskScore
        }
      };
    });

    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. GET /:sellerId/timeline — Chronological event timeline
router.get('/:sellerId/timeline', (req, res) => {
  try {
    const events = db_ops.getAll('risk_events', 10000, 0)
      .map(r => r.data)
      .filter(e => e.sellerId === req.params.sellerId)
      .map(e => ({
        ...e,
        decayedScore: Math.round(calculateDecayedScore(e.riskScore, e.createdAt) * 100) / 100,
        isPositive: e.riskScore <= 0
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. PATCH /:sellerId/override — Manual tier override
router.patch('/:sellerId/override', (req, res) => {
  try {
    const { tier, reason, overriddenBy } = req.body;

    if (!tier || !reason || !overriddenBy) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tier, reason, overriddenBy'
      });
    }

    if (!TIER_THRESHOLDS[tier]) {
      return res.status(400).json({
        success: false,
        error: `Invalid tier: ${tier}. Must be one of: ${Object.keys(TIER_THRESHOLDS).join(', ')}`
      });
    }

    const { sellerId } = req.params;
    const record = db_ops.getById('seller_risk_profiles', 'seller_id', sellerId);

    if (!record) {
      return res.status(404).json({ success: false, error: 'Risk profile not found' });
    }

    const existingProfile = record.data;
    const now = new Date().toISOString();

    const updatedProfile = {
      ...existingProfile,
      tier,
      previousTier: existingProfile.tier,
      manualOverride: {
        active: true,
        tier,
        reason,
        overriddenBy,
        overriddenAt: now
      },
      actions: determineActions(tier),
      lastTierChange: existingProfile.tier !== tier ? now : existingProfile.lastTierChange,
      updatedAt: now
    };

    db_ops.update('seller_risk_profiles', 'seller_id', sellerId, updatedProfile);

    res.json({ success: true, data: updatedProfile });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
