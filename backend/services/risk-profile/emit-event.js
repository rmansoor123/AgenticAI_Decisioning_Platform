import { db_ops } from '../../shared/common/database.js';

const HALF_LIFE_DAYS = 30;
const DE_ESCALATION_COOLDOWN_MS = 48 * 60 * 60 * 1000;

const DOMAIN_WEIGHTS = {
  onboarding: 0.12,
  ato: 0.14,
  payout: 0.12,
  listing: 0.07,
  shipping: 0.10,
  transaction: 0.08,
  account_setup: 0.08,
  item_setup: 0.07,
  pricing: 0.08,
  profile_updates: 0.07,
  returns: 0.07
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

export function emitRiskEvent({ sellerId, domain, eventType, riskScore, metadata }) {
  try {
    const eventId = `RE-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();

    const event = {
      eventId, sellerId, domain, eventType, riskScore,
      metadata: metadata || {},
      createdAt: now
    };

    db_ops.insert('risk_events', 'event_id', eventId, event);
    recalculateProfile(sellerId);
    return event;
  } catch (error) {
    console.error(`[RiskProfile] Failed to emit event for ${sellerId}:`, error.message);
  }
}
