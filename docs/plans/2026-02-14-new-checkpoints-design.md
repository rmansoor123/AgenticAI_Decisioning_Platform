# New Business Services & Checkpoints — Design

## Goal

Add 6 new business services and risk checkpoints to complement the existing 6, creating a comprehensive 12-checkpoint decisioning system across the full seller lifecycle.

## Architecture

Each new service is a self-contained Express router following the existing pattern (`db_ops`, `emitRiskEvent`, standardized response format). Services are mounted in `server.js`, seeded with synthetic data, and emit risk events that feed into the existing risk profile, rules engine, and case queue systems.

**Lifecycle Flow:**
```
Onboarding → Account Setup → Item Setup → Pricing → Listing → Shipments → Shipping → Returns
                                    ↕                                          ↕
                              Profile Updates                            Transaction
                                    ↕
                                   ATO
                                    ↕
                                  Payout
```

## New Services

| Service | Route | Checkpoint | Purpose |
|---|---|---|---|
| Account Setup | `/api/account-setup` | `account_setup` | Store config, payment methods, tax settings |
| Item Setup | `/api/item-setup` | `item_setup` | Product catalog, variants, inventory |
| Pricing | `/api/pricing` | `pricing` | Price changes, promotions, dynamic pricing |
| Profile Updates | `/api/profile-updates` | `profile_updates` | Seller info changes (address, bank, contact) |
| Shipments | `/api/shipments` | `shipments` | Outbound shipment creation, label generation |
| Returns | `/api/returns` | `returns` | Return/refund processing, abuse detection |

### Service Endpoints (each service)

| Method | Path | Purpose |
|--------|------|---------|
| GET | / | List records with filters/pagination |
| GET | /stats | Domain statistics |
| GET | /:id | Get by ID |
| POST | / | Create new record (emits risk event) |
| PATCH | /:id/status | Update status |

## Domain Weight Rebalance

All 12 domains must sum to 1.0 in the risk profile composite score calculation.

| Domain | Current Weight | New Weight | Rationale |
|---|---|---|---|
| onboarding | 0.20 | 0.12 | Shared with account_setup |
| ato | 0.25 | 0.15 | Highest security risk |
| payout | 0.20 | 0.12 | Financial risk stays high |
| listing | 0.15 | 0.07 | Shared with item_setup |
| shipping | 0.10 | 0.05 | Shared with shipments |
| transaction | 0.10 | 0.07 | Core financial flow |
| account_setup | — | 0.08 | Post-onboarding risk signals |
| item_setup | — | 0.06 | Product catalog integrity |
| pricing | — | 0.08 | Price manipulation detection |
| profile_updates | — | 0.08 | Account change monitoring |
| shipments | — | 0.06 | Outbound shipment risk |
| returns | — | 0.06 | Return fraud detection |
| **Total** | 1.00 | **1.00** | |

## New Checkpoint Rules (42 total, 7 per domain)

### Account Setup
1. Incomplete Tax Configuration — PATTERN/MEDIUM/FLAG
2. Multiple Payment Methods Added Rapidly — VELOCITY/HIGH/REVIEW
3. High-Risk Store Category — LIST_MATCH/MEDIUM/FLAG
4. Mismatched Business Registration — PATTERN/HIGH/REVIEW
5. Unusual Timezone/Currency Combination — PATTERN/MEDIUM/FLAG
6. Multiple Accounts Same Payment Method — COMPOSITE/CRITICAL/BLOCK
7. Store Name Contains Brand Infringement — LIST_MATCH/HIGH/REVIEW

### Item Setup
1. Excessive Variant Creation — VELOCITY/HIGH/REVIEW
2. Inventory Count Mismatch — THRESHOLD/MEDIUM/FLAG
3. Restricted Category Product — LIST_MATCH/CRITICAL/BLOCK
4. Bulk SKU Import From New Account — COMPOSITE/HIGH/REVIEW
5. Missing Product Compliance Data — PATTERN/MEDIUM/FLAG
6. Duplicate Product Across Sellers — ML_SCORE/HIGH/REVIEW
7. Suspicious Weight/Dimension Ratio — THRESHOLD/MEDIUM/FLAG

### Pricing
1. Price Below Cost Threshold — THRESHOLD/HIGH/REVIEW
2. Rapid Price Fluctuation — VELOCITY/MEDIUM/FLAG
3. Predatory Pricing Pattern — ML_SCORE/HIGH/REVIEW
4. Coupon/Discount Stacking Abuse — COMPOSITE/CRITICAL/BLOCK
5. Price Manipulation Before Sale — PATTERN/HIGH/REVIEW
6. Dynamic Pricing Anomaly — ML_SCORE/MEDIUM/FLAG
7. Cross-Border Price Arbitrage — COMPOSITE/HIGH/REVIEW

### Profile Updates
1. Bank Account Change After Dispute — COMPOSITE/CRITICAL/BLOCK
2. Multiple Address Changes in 24h — VELOCITY/HIGH/REVIEW
3. Contact Info Changed From New Device — COMPOSITE/HIGH/REVIEW
4. Business Name Change Pattern — PATTERN/MEDIUM/FLAG
5. Email Domain Downgrade — LIST_MATCH/MEDIUM/FLAG
6. Phone Number Velocity — VELOCITY/HIGH/REVIEW
7. Identity Document Re-upload — PATTERN/MEDIUM/REVIEW

### Shipments
1. Label Created Without Order — COMPOSITE/CRITICAL/BLOCK
2. Carrier Mismatch Pattern — PATTERN/MEDIUM/FLAG
3. Shipment Weight Discrepancy — THRESHOLD/HIGH/REVIEW
4. Drop-Ship Detection — ML_SCORE/MEDIUM/FLAG
5. Bulk Label Generation — VELOCITY/HIGH/REVIEW
6. High-Value Shipment No Insurance — THRESHOLD/MEDIUM/FLAG
7. Cross-Border Restricted Destination — LIST_MATCH/HIGH/REVIEW

### Returns
1. Return Rate Above Threshold — THRESHOLD/HIGH/REVIEW
2. Serial Returner Pattern — VELOCITY/CRITICAL/BLOCK
3. Return After Funds Withdrawal — COMPOSITE/CRITICAL/BLOCK
4. Empty Box Return — PATTERN/HIGH/REVIEW
5. Return Address Mismatch — PATTERN/MEDIUM/FLAG
6. Wardrobing Detection — ML_SCORE/HIGH/REVIEW
7. Refund Amount Exceeds Purchase — THRESHOLD/CRITICAL/BLOCK

## Seeding & Data Generation

- Add 6 generator functions to `generators.js` (one per service)
- Seed ~50 records per service during startup
- Emit risk events for new domains during seeding, aligned with seller risk tiers
- Update case seeding to include new checkpoints

## Frontend & Navigation

Sidebar groups services into expandable "Business Services" section:
```
Seller Onboarding (existing)
  ├── Onboarding Dashboard
  ├── Onboard New Seller
  ├── Risk Lifecycle
  └── Network Analysis
Business Services (NEW expandable group)
  ├── Account Setup
  ├── Item Setup
  ├── Pricing
  ├── Profile Updates
  ├── Shipments
  └── Returns
```

Each new service gets a lightweight page: stats cards + recent records table with status badges. No complex detail views — Risk Rules, Case Queue, and Risk Profiles handle the decisioning visualization and automatically pick up new checkpoints from the API.

## Files to Create/Modify

### New Files
- `backend/services/business/account-setup/index.js`
- `backend/services/business/item-setup/index.js`
- `backend/services/business/pricing/index.js`
- `backend/services/business/profile-updates/index.js`
- `backend/services/business/shipments/index.js`
- `backend/services/business/returns/index.js`
- `src/pages/AccountSetup.jsx`
- `src/pages/ItemSetup.jsx`
- `src/pages/Pricing.jsx`
- `src/pages/ProfileUpdates.jsx`
- `src/pages/Shipments.jsx`
- `src/pages/Returns.jsx`

### Modified Files
- `backend/shared/synthetic-data/generators.js` — Add 6 generators + 42 checkpoint rules
- `backend/services/risk-profile/emit-event.js` — Rebalance domain weights, add 6 new domains
- `backend/gateway/server.js` — Import/mount 6 services, seed data, update health check
- `src/App.jsx` — Add 6 routes
- `src/components/Layout.jsx` — Add Business Services nav group

## Tech Stack

- Backend: Express.js routes, db_ops for storage
- Frontend: React + Tailwind CSS v4 + lucide-react
- Same patterns as existing codebase (no new dependencies)
