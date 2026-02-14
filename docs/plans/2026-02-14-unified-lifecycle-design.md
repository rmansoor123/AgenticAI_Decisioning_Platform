# Unified Seller Lifecycle Architecture — Design

## Goal

Reorganize the fraud detection platform to present a cohesive seller lifecycle architecture. All 11 checkpoint services are organized by lifecycle phase, Risk Profiles becomes the real-time seller health dashboard, and navigation clearly separates the platform foundation from the business services.

## Architecture

The platform has two layers:

1. **Platform Foundation** — Data, ML, Decisioning, Experimentation. The infrastructure that powers risk detection.
2. **Seller Lifecycle Services** — 11 checkpoints representing every stage where seller risk arises, from onboarding through returns.

Risk Profiles sits between them as the **unified view** — the real-time scorecard showing how any seller is doing across all checkpoints at any moment.

```
┌──────────────────────────────────────────────────┐
│  Seller Lifecycle Services (11 checkpoints)       │
│  Onboarding → Account Setup → Item Setup →        │
│  Listings → Pricing → Transaction → Payout →      │
│  Shipping → Returns   |  ATO, Profile Updates     │
├──────────────────────────────────────────────────┤
│  Risk Operations (Profiles, Rules, Case Queue)    │
├──────────────────────────────────────────────────┤
│  Platform Foundation                              │
│  Data Foundation | ML Layer | Decisions | Exp/Sim │
└──────────────────────────────────────────────────┘
```

## Navigation Structure

```
Dashboard (Home)

▼ Seller Lifecycle
  Pre-Launch
    Onboarding
    Account Setup
    Item Setup
    Listings
    Pricing
  Live Operations
    Transaction
    Payout
    Shipping
    Returns
  Security
    ATO
    Profile Updates

▼ Risk Operations
   Risk Profiles
   Risk Rules
   Case Queue

▼ Platform
   Data Foundation  ▸  (Ingestion, Catalog, Query)
   ML Models        ▸  (Registry, Inference, Monitoring)
   Decision Engine  ▸  (Rules, Builder, Execution)
   Experimentation  ▸  (A/B Tests, Simulation)
   Transaction Flow
   Agentic AI
   Observability
```

Phase labels ("Pre-Launch", "Live Operations", "Security") are visual dividers, not expandable groups.

## Shipping Merge

Merge the `shipping` (original) and `shipments` (new) services into a single `shipping` checkpoint. Remove the `/api/shipments` route and `Shipments.jsx` page. The Shipping service covers fulfillment verification + outbound shipment tracking.

## 11-Domain Weight Rebalance

| Domain | Weight | Rationale |
|---|---|---|
| onboarding | 0.12 | Entry point risk |
| account_setup | 0.08 | Post-onboarding config |
| item_setup | 0.07 | Catalog integrity |
| listing | 0.07 | Marketplace presence |
| pricing | 0.08 | Price manipulation |
| transaction | 0.08 | Core financial flow |
| payout | 0.12 | Financial risk |
| shipping | 0.10 | Combined shipping + shipments |
| returns | 0.07 | Return fraud |
| ato | 0.14 | Highest security risk |
| profile_updates | 0.07 | Account change monitoring |
| **Total** | **1.00** | |

## Enhanced Risk Profiles Page

The Risk Profiles page becomes the unified seller health command center.

### Overview (default view)
- Tier distribution stats (LOW/MEDIUM/HIGH/CRITICAL)
- High-risk sellers table
- Heatmap grid: sellers x 11 domains, colored by risk score

### Seller Detail (click into seller)
- **Lifecycle Flow Visualization** — horizontal pipeline showing 11 checkpoints in lifecycle order, each node colored by domain risk score (green/yellow/orange/red)
- **Domain Score Breakdown** — bar chart of all 11 domains with weighted scores
- **Risk Timeline** — composite score over time (existing)
- **Event Log** — all risk events across all domains (existing)
- **Manual Override** — tier override form (existing)

## Services Page Removal

Remove `Services.jsx` (/services). Absorb service health monitoring into the Observability page.

## Files to Modify

- `src/components/Layout.jsx` — 3-group navigation with phase sub-labels
- `src/App.jsx` — Remove /shipments route, remove /services route, update imports
- `src/pages/SellerRiskProfile.jsx` — Lifecycle flow visualization, 11-domain breakdown, heatmap
- `src/pages/Observability.jsx` — Absorb service health from Services page
- `backend/services/risk-profile/index.js` — 11-domain weights
- `backend/services/risk-profile/emit-event.js` — 11-domain weights
- `backend/gateway/server.js` — Remove /api/shipments, merge seeding, update health check

## Files to Delete

- `src/pages/Shipments.jsx`
- `src/pages/Services.jsx`
- `backend/services/business/shipments/index.js`

## Tech Stack

Same as existing: React + Tailwind CSS v4 + lucide-react frontend, Express.js backend. No new dependencies.
