/**
 * Attack Sequence Pattern Library — defines known multi-step fraud attack
 * patterns and provides a timeline matching algorithm.
 *
 * Each pattern is a sequence of domain-specific event types that, when
 * observed in chronological order on a seller's timeline, signal a
 * particular attack vector.
 *
 * Exports:
 *   getSequencePatterns()  — returns the canonical array of attack patterns
 *   matchSellerTimeline(timeline, patterns) — matches a seller event
 *       timeline against the pattern library
 */

// ────────────────────────────────────────────────────────────
// Pattern definitions
// ────────────────────────────────────────────────────────────

const SEQUENCE_PATTERNS = [
  {
    patternId: 'BUST_OUT',
    name: 'Bust-Out Fraud',
    description:
      'Seller onboards legitimately, builds trust, then rapidly increases volume and extracts funds before disappearing.',
    sequence: [
      {
        domain: 'onboarding',
        eventTypes: ['SELLER_APPROVED', 'SELLER_ONBOARDED'],
        label: 'Seller approved and onboarded'
      },
      {
        domain: 'account_setup',
        eventTypes: ['ACCOUNT_SETUP_OK'],
        label: 'Account setup completed'
      },
      {
        domain: 'listing',
        eventTypes: ['LISTING_APPROVED'],
        label: 'Listings approved'
      },
      {
        domain: 'transaction',
        eventTypes: ['VELOCITY_SPIKE', 'CROSS_BORDER_NEW_ACCOUNT'],
        label: 'Transaction velocity spike or cross-border activity'
      },
      {
        domain: 'profile_updates',
        eventTypes: ['BANK_CHANGE_DURING_DISPUTE'],
        label: 'Bank account changed during dispute period'
      },
      {
        domain: 'payout',
        eventTypes: ['PAYOUT_VELOCITY_SPIKE', 'FIRST_PAYOUT_REVIEW'],
        label: 'Rapid payout extraction'
      }
    ],
    maxDurationDays: 60,
    minConfidence: 0.6,
    severity: 'CRITICAL',
    expectedAction: 'SUSPEND'
  },
  {
    patternId: 'TRIANGULATION',
    name: 'Triangulation Fraud',
    description:
      'Seller lists items below market price, purchases from legitimate retailers with stolen payment methods, and ships to buyers via freight forwarders.',
    sequence: [
      {
        domain: 'onboarding',
        eventTypes: ['SELLER_APPROVED'],
        label: 'Seller approved'
      },
      {
        domain: 'listing',
        eventTypes: ['BELOW_MARKET_PRICE'],
        label: 'Listings priced below market value'
      },
      {
        domain: 'transaction',
        eventTypes: ['VELOCITY_SPIKE'],
        label: 'Transaction velocity spike'
      },
      {
        domain: 'shipping',
        eventTypes: ['ADDRESS_MISMATCH', 'FREIGHT_FORWARDER'],
        label: 'Shipping address mismatch or freight forwarder detected'
      },
      {
        domain: 'returns',
        eventTypes: ['HIGH_RETURN_RATE'],
        label: 'Elevated return rate'
      }
    ],
    maxDurationDays: 30,
    minConfidence: 0.6,
    severity: 'HIGH',
    expectedAction: 'ESCALATE'
  },
  {
    patternId: 'ATO_ESCALATION',
    name: 'Account Takeover Escalation',
    description:
      'Compromised seller account accessed from new device/location, bank details changed, and funds extracted rapidly.',
    sequence: [
      {
        domain: 'ato',
        eventTypes: ['NEW_DEVICE_LOGIN', 'ATO_IMPOSSIBLE_TRAVEL'],
        label: 'New device login or impossible travel detected'
      },
      {
        domain: 'profile_updates',
        eventTypes: ['BANK_CHANGE_DURING_DISPUTE'],
        label: 'Bank account changed'
      },
      {
        domain: 'payout',
        eventTypes: ['PAYOUT_VELOCITY_SPIKE'],
        label: 'Rapid payout extraction'
      }
    ],
    maxDurationDays: 3,
    minConfidence: 0.6,
    severity: 'CRITICAL',
    expectedAction: 'SUSPEND'
  },
  {
    patternId: 'SLOW_BURN',
    name: 'Slow-Burn Fraud',
    description:
      'Seller gradually manipulates prices, undercuts market, increases cross-border volume, and accumulates returns over months.',
    sequence: [
      {
        domain: 'onboarding',
        eventTypes: ['SELLER_APPROVED'],
        label: 'Seller approved'
      },
      {
        domain: 'pricing',
        eventTypes: ['PRICE_MANIPULATION', 'RAPID_PRICE_CHANGE'],
        label: 'Price manipulation detected'
      },
      {
        domain: 'listing',
        eventTypes: ['BELOW_MARKET_PRICE'],
        label: 'Below-market listings'
      },
      {
        domain: 'transaction',
        eventTypes: ['CROSS_BORDER_NEW_ACCOUNT', 'VELOCITY_SPIKE'],
        label: 'Cross-border or velocity anomaly'
      },
      {
        domain: 'returns',
        eventTypes: ['HIGH_RETURN_RATE'],
        label: 'High return rate'
      }
    ],
    maxDurationDays: 180,
    minConfidence: 0.6,
    severity: 'HIGH',
    expectedAction: 'ESCALATE'
  }
];

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Returns the canonical array of attack sequence pattern definitions.
 * The returned array is a deep copy so callers cannot mutate the library.
 */
export function getSequencePatterns() {
  return JSON.parse(JSON.stringify(SEQUENCE_PATTERNS));
}

/**
 * Match a seller's event timeline against a set of attack patterns.
 *
 * @param {Array<{domain: string, eventType: string, createdAt: string|number, riskScore: number}>} timeline
 *   Chronologically sorted array of seller events.
 * @param {Array} patterns  — pattern definitions from getSequencePatterns().
 * @returns {Array<{patternId, patternName, matchScore, stepsCompleted, stepsRemaining, totalSteps, severity, expectedAction, matchedSteps}>}
 *   Matches with stepsCompleted >= 2, sorted by matchScore descending.
 */
export function matchSellerTimeline(timeline, patterns) {
  if (!Array.isArray(timeline) || !Array.isArray(patterns)) {
    return [];
  }

  const results = [];

  for (const pattern of patterns) {
    const { matchedSteps, stepsCompleted } = walkTimeline(timeline, pattern.sequence);
    const totalSteps = pattern.sequence.length;
    const stepsRemaining = totalSteps - stepsCompleted;

    if (stepsCompleted < 2) {
      continue; // Not enough signal
    }

    const matchScore = computeMatchScore(matchedSteps, stepsCompleted, totalSteps, pattern.maxDurationDays);

    results.push({
      patternId: pattern.patternId,
      patternName: pattern.name,
      matchScore,
      stepsCompleted,
      stepsRemaining,
      totalSteps,
      severity: pattern.severity,
      expectedAction: pattern.expectedAction,
      matchedSteps
    });
  }

  // Sort by matchScore descending
  results.sort((a, b) => b.matchScore - a.matchScore);

  return results;
}

// ────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────

/**
 * Walk the timeline in order and greedily match each pattern step to the
 * earliest qualifying event that occurs AFTER the previously matched event.
 */
function walkTimeline(timeline, sequence) {
  const matchedSteps = [];
  let lastMatchedTime = -Infinity;

  for (let stepIndex = 0; stepIndex < sequence.length; stepIndex++) {
    const step = sequence[stepIndex];
    let found = false;

    for (const event of timeline) {
      const eventTime = toTimestamp(event.createdAt);

      // Must come after the previously matched event
      if (eventTime <= lastMatchedTime) {
        continue;
      }

      // Domain must match
      if (event.domain !== step.domain) {
        continue;
      }

      // Event type must be in the step's eventTypes
      if (!step.eventTypes.includes(event.eventType)) {
        continue;
      }

      // Match found
      matchedSteps.push({
        stepIndex,
        domain: event.domain,
        eventType: event.eventType,
        createdAt: event.createdAt,
        riskScore: event.riskScore ?? 0
      });

      lastMatchedTime = eventTime;
      found = true;
      break;
    }

    // If no match found for this step, skip it (partial match)
    // Subsequent steps can still be matched if events come after lastMatchedTime
  }

  return {
    matchedSteps,
    stepsCompleted: matchedSteps.length
  };
}

/**
 * Compute the composite match score.
 *
 * Formula:
 *   base = stepsCompleted / totalSteps
 *   timingFactor = 1.0 if within maxDurationDays, else degraded
 *   riskBonus = avg(riskScore of matched events) / 100
 *   final = base * 0.6 + timingFactor * 0.2 + riskBonus * 0.2
 *   clamped to [0, 1]
 */
function computeMatchScore(matchedSteps, stepsCompleted, totalSteps, maxDurationDays) {
  // Base score
  const base = stepsCompleted / totalSteps;

  // Timing factor
  let timingFactor = 1.0;
  if (matchedSteps.length >= 2) {
    const firstTime = toTimestamp(matchedSteps[0].createdAt);
    const lastTime = toTimestamp(matchedSteps[matchedSteps.length - 1].createdAt);
    const actualDays = (lastTime - firstTime) / (1000 * 60 * 60 * 24);

    if (actualDays > maxDurationDays) {
      timingFactor = Math.max(0.5, 1 - (actualDays - maxDurationDays) / maxDurationDays);
    }
  }

  // Risk bonus: average riskScore of matched events, normalized to [0, 1]
  const avgRisk = matchedSteps.reduce((sum, s) => sum + (s.riskScore || 0), 0) / matchedSteps.length;
  const riskBonus = avgRisk / 100;

  // Composite
  const raw = base * 0.6 + timingFactor * 0.2 + riskBonus * 0.2;

  return Math.max(0, Math.min(1, raw));
}

/**
 * Convert a createdAt value (ISO string or epoch ms) to a numeric timestamp.
 */
function toTimestamp(value) {
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
}
