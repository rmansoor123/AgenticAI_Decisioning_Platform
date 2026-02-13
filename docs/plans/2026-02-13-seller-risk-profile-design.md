# Seller Risk Profile — Design Document

**Date:** 2026-02-13
**Status:** Approved

## Problem

Each microservice (onboarding, ATO, payout, listing, shipping, decision engine) calculates seller risk independently. There is no cross-service aggregation, no risk history tracking, and no unified seller risk profile. A seller flagged by ATO doesn't affect their payout risk, and a seller whose listings are repeatedly rejected doesn't trigger broader scrutiny.

## Solution

A centralized **Seller Risk Profile Service** that aggregates risk signals from all microservices, maintains a composite score with time decay, enforces tiered automated actions, and exposes both a dashboard and advisory API.

## Architecture

**Approach:** Dedicated microservice (`/api/risk-profile`) following the existing service pattern.

Each existing service calls `POST /api/risk-profile/event` after key operations. The risk profile service recalculates the composite score, applies decay, checks tier thresholds, and enforces automated actions.

## Data Model

### `seller_risk_profiles` table

| Field | Type | Description |
|-------|------|-------------|
| sellerId | TEXT PK | Links to sellers table |
| compositeScore | NUMBER | 0-100, overall risk with decay applied |
| riskTier | TEXT | LOW, MEDIUM, HIGH, CRITICAL |
| domainScores | JSON | Per-service scores: onboarding, ato, payout, listing, shipping, transaction |
| activeActions | JSON | Currently enforced actions |
| tierChangedAt | TIMESTAMP | When the tier last changed (for de-escalation cooldown) |
| lastEventAt | TIMESTAMP | Most recent event |
| lastRecalcAt | TIMESTAMP | Last score recalculation |
| manualOverride | JSON | If ops overrode the tier: { tier, reason, overriddenBy, at } |
| createdAt | TIMESTAMP | Profile creation |
| updatedAt | TIMESTAMP | Last update |

### `risk_events` table

| Field | Type | Description |
|-------|------|-------------|
| eventId | TEXT PK | Unique event ID |
| sellerId | TEXT | FK to seller |
| domain | TEXT | onboarding, ato, payout, listing, shipping, transaction |
| eventType | TEXT | e.g., ATO_NEW_DEVICE, PAYOUT_HELD |
| riskScore | NUMBER | Score this event contributed (can be negative for positive signals) |
| weight | NUMBER | Configurable weight for this event type |
| metadata | JSON | Raw event data |
| createdAt | TIMESTAMP | When the event occurred |

### Decay Formula

```
decayedScore = originalScore * (0.5 ^ (daysSinceEvent / halfLifeDays))
```

- `halfLifeDays = 30` (configurable)
- Composite score = weighted average of all decayed events grouped by domain

## API Endpoints

### Risk Profile Service (`/api/risk-profile`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /:sellerId | Full risk profile |
| GET | /:sellerId/history | Score history over time |
| GET | /:sellerId/events | All risk events (filterable by domain, date range) |
| GET | /:sellerId/timeline | Chronological event timeline |
| POST | /event | Record a new risk event |
| GET | /high-risk | Sellers above threshold |
| GET | /stats | Platform-wide risk distribution |
| PATCH | /:sellerId/override | Manual tier override |

### Event Ingestion (`POST /event`)

```json
{
  "sellerId": "SLR-123",
  "domain": "ato",
  "eventType": "ATO_NEW_DEVICE",
  "riskScore": 65,
  "metadata": {}
}
```

## Tiered Escalation

| Tier | Score | Actions |
|------|-------|---------|
| LOW | 0-30 | Normal operations |
| MEDIUM | 31-60 | Flag for review. Hold payouts > $5,000. Log alert. |
| HIGH | 61-85 | Suspend new listings. Hold all payouts. Urgent alert. Manual review for transactions > $1,000. |
| CRITICAL | 86-100 | Auto-suspend seller. Block transactions. Hold payouts. Critical alert. |

- **Escalation:** Immediate on recalc
- **De-escalation:** 48-hour cooldown before restrictions lift
- **Manual override:** Ops can force tier with logged reason

## Event Wiring

### Onboarding Service
- `ONBOARDING_RISK_ASSESSMENT` — agent's risk score
- `KYC_FAILED` — score 40
- `BANK_VERIFICATION_FAILED` — score 30
- `SELLER_BLOCKED` — score 80

### ATO Service
- `ATO_EVENT` — ATO's calculated score
- `ATO_BLOCKED` — score 75
- `ATO_IMPOSSIBLE_TRAVEL` — score 70
- `ATO_BRUTE_FORCE` — score 60

### Payout Service
- `PAYOUT_HELD` — payout's risk score
- `PAYOUT_HIGH_VELOCITY` — score 50
- `PAYOUT_UNUSUAL_AMOUNT` — score 40
- `PAYOUT_RELEASED` — score -20 (positive signal)

### Listing Service
- `LISTING_REJECTED` — listing's risk score
- `LISTING_PROHIBITED_CONTENT` — score 70
- `LISTING_COUNTERFEIT_RISK` — score 60
- `LISTING_APPROVED` — score -5 (positive signal)

### Shipping Service
- `SHIPPING_FLAGGED` — shipping's risk score
- `SHIPPING_RESHIPPING` — score 55
- `SHIPPING_ADDRESS_MISMATCH` — score 40
- `SHIPPING_DELIVERED` — score -3 (positive signal)

### Decision Engine
- `TRANSACTION_BLOCKED` — score 70
- `TRANSACTION_REVIEW` — score 40
- `TRANSACTION_APPROVED` — score -2 (positive signal)

## Frontend Dashboard

### Seller Risk Profile Page
1. **Risk Overview Panel** — composite score gauge, domain radar chart, active action badges
2. **Risk Timeline** — line chart of score over time with event markers and decay curve
3. **Event Log** — filterable table of all events with original and decayed scores
4. **Tier History** — tier transitions and manual overrides

### High-Risk Sellers View (ops)
- Sortable table of sellers by composite score
- Filter by tier, top domain contributor, recent escalations
- Quick actions: view profile, override tier, suspend

### Navigation
- "Risk Profiles" added to sidebar
- Links from seller detail views to their risk profile
