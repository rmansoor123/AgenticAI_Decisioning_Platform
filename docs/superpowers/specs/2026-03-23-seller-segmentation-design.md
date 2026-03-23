# Seller Segmentation — Design Spec

**Date:** 2026-03-23
**Status:** Approved

---

## Problem

The platform treats all sellers identically. Businesses need to segment sellers by performance and behavior to offer customized features, graduated access, and targeted risk treatment — like Amazon's seller tiers and eBay's Top Rated Seller program.

## Solution

Multi-dimensional seller segmentation with two layers:
1. **Fixed tiers (6)** — composite score from 6 performance dimensions → New, Bronze, Silver, Gold, Platinum, Enterprise
2. **Behavioral tags (10)** — stacked on top of tier, computed independently from behavioral signals

---

## 1. Sidebar Navigation

New "Seller Tools" dropdown between Seller Lifecycle and Risk Operations:

```
Seller Tools (teal, Wrench or UserCog icon)
  └── Seller Segmentation → /seller-tools/segmentation
```

Future tools (Seller Analytics, Seller Health, Recommendations, etc.) will be added as children.

**Files:** Layout.jsx (add dropdown), App.jsx (add route)

---

## 2. Tier Scoring

Composite score (0-100) from 6 weighted dimensions:

| Dimension | Weight | Source | Calculation |
|---|---|---|---|
| GMV | 25% | transactions table | Sum of transaction amounts for seller |
| Order Volume | 20% | transactions table | Count of transactions |
| Account Age | 10% | sellers.createdAt | Days since registration, normalized to 0-100 (cap at 365 days) |
| Risk Score | 20% | risk_profiles / seller risk data | Inverted: (100 - riskScore). Low risk = high segment score |
| Compliance Score | 15% | sellers.status, KYC data | 100 if ACTIVE + KYC complete, deductions for violations |
| Customer Satisfaction | 10% | returns, disputes | 100 - (return_rate * 100 + dispute_count * 10), floor 0 |

### Tier Assignment

| Tier | Score Range | Badge Color | Perks (conceptual) |
|---|---|---|---|
| New | 0-20 or <30 days | Gray | Basic access, standard limits |
| Bronze | 21-40 | Amber | Standard features |
| Silver | 41-60 | Slate | Priority support queue |
| Gold | 61-80 | Yellow | Faster payouts, higher limits |
| Platinum | 81-95 | Cyan | Premium features, dedicated support |
| Enterprise | 96-100 | Purple | Custom terms, API priority, invite-only |

---

## 3. Behavioral Tags

Computed independently from tier, stacked as badges:

| Tag | Condition | Icon/Color |
|---|---|---|
| High-Growth | GMV up >30% month-over-month | Green, TrendingUp |
| International | >20% orders cross-border | Blue, Globe |
| Multi-Category | Sells in 3+ categories | Purple, Grid |
| Premium Seller | Avg item price >2x category median | Gold, Crown |
| Fast Shipper | Avg ship time <24hrs | Emerald, Truck |
| API Power User | Uses API for >50% of operations | Cyan, Code |
| High-Return Risk | Return rate >2x category average | Red, AlertTriangle |
| Price Competitor | Consistently below category median | Orange, ArrowDown |
| Seasonal | >60% revenue in 2 months | Amber, Calendar |
| Brand Registered | Verified brand/trademark | Indigo, Award |

---

## 4. Backend

### Service: `backend/services/business/seller-segmentation/index.js`

Express router with:

**GET /api/seller-tools/segmentation/sellers** — Returns all sellers with computed tier, score, dimension breakdown, and tags. Computes on the fly from existing data (sellers, transactions, risk profiles).

**GET /api/seller-tools/segmentation/sellers/:sellerId** — Single seller full segmentation detail.

**GET /api/seller-tools/segmentation/tiers** — Tier distribution: count and % per tier.

**GET /api/seller-tools/segmentation/tags** — Tag distribution: count per tag across all sellers.

**POST /api/seller-tools/segmentation/recalculate** — Force recalculation (for demo purposes).

### Computation approach:
- Fetch all sellers from DB via `db_ops.getAll('sellers')`
- Fetch transactions via `db_ops.getAll('transactions')`
- Fetch risk profiles where available
- Compute 6 dimension scores per seller
- Apply weights → composite score → tier assignment
- Compute behavioral tags from transaction patterns
- Return enriched seller objects

No new database tables needed — computes from existing data.

---

## 5. Frontend

### Page: `src/pages/SellerSegmentation.jsx`

**Top: Tier Distribution**
- 6 tier cards in a row showing count + % of sellers
- Horizontal distribution bar

**Middle: Seller Table**
- Searchable, sortable
- Columns: Seller ID, Business Name, Tier (badge), Score, GMV, Orders, Risk, Age, Tags
- Click row → expand to show 6-dimension breakdown bars + tag explanations

**Bottom: Tag Analytics**
- Grid of 10 tags with seller count per tag
- Click tag → filters table

**Filters:** Tier checkboxes, tag multi-select, search by name/ID

Simple dark theme, clean table, no fancy effects.

---

## 6. File Inventory

### New Files (2)
| File | Purpose |
|---|---|
| `backend/services/business/seller-segmentation/index.js` | Segmentation API + computation |
| `src/pages/SellerSegmentation.jsx` | Frontend page |

### Modified Files (2)
| File | Changes |
|---|---|
| `src/components/Layout.jsx` | Add Seller Tools dropdown |
| `src/App.jsx` | Add route + import |

### Server Mount
In `backend/gateway/server.js`:
```javascript
import sellerSegmentationRouter from '../services/business/seller-segmentation/index.js';
app.use('/api/seller-tools/segmentation', sellerSegmentationRouter);
```
