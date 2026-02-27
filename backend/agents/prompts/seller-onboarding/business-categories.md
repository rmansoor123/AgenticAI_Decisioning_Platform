---
id: business-categories
agent: seller-onboarding
phases: [think, plan, observe]
priority: high
version: 2
---

# Business Category Risk Profiles

## Risk Tier Reference

### HIGH-RISK (Enhanced Due Diligence Required)

| Category | Primary Risk | Required Verification | Auto-Reject Triggers |
|----------|-------------|----------------------|---------------------|
| Cryptocurrency / Digital Assets | Money laundering, regulatory | Enhanced KYC, source of funds, ongoing monitoring | No valid license, sanctioned jurisdiction |
| Adult Content / Services | Chargebacks, regulatory | Age verification infra, content compliance | No age-gate implementation plan |
| Gambling / Gaming Credits | Money laundering, licensing | License verification, transaction monitoring | No gambling license for jurisdiction |
| Pharmaceuticals / Supplements | Counterfeits, safety | License verification, supply chain docs | No pharmaceutical license |
| Firearms / Weapons | Regulatory, safety | FFL verification (US), export control | No valid dealer license |
| CBD / Cannabis | Jurisdiction variance | Jurisdiction-specific compliance | Illegal in seller's jurisdiction |

### MEDIUM-RISK (Standard+ Verification)

| Category | Primary Risk | Watch For |
|----------|-------------|-----------|
| Electronics | High-value fraud, counterfeits | Pricing 40%+ below market, bulk listings of newest devices, inconsistent supplier claims |
| Luxury Goods / Designer | Counterfeits | No authenticity documentation, pricing inconsistent with genuine items, seller location far from supply chain |
| Event Tickets | Scalping, counterfeits | Volume 100+ listings, pricing patterns suggesting bot activity, no verifiable ticket source |
| Gift Cards / Stored Value | Money laundering | Bulk purchases, face value > $500 per card, resale at discount |
| Automotive Parts | Safety counterfeits | Safety-critical parts (brakes, airbags) at suspiciously low prices, no OEM relationship |

### LOW-RISK (Standard Verification)

| Category | Notes |
|----------|-------|
| Books, Media, Music | Low fraud rate, low AOV. Minimal scrutiny unless volume anomalies. |
| Clothing & Apparel (non-luxury) | Moderate return rates expected. Flag only if return rate > 30%. |
| Home & Garden | Generally legitimate. Watch for: furniture "drop-ship" fronts. |
| Toys & Games | Seasonal volume spikes (Q4) are normal, not suspicious. |

## Decision Calibration by Category

<decision_rules>
CRITICAL PRINCIPLE: Category risk affects SCRUTINY LEVEL, not the decision itself.

- A seller in a HIGH-risk category with clean verification → APPROVE (not REVIEW)
- A seller in a LOW-risk category with failed verification → REJECT (category doesn't help)
- Category risk determines which investigation strategy to use:
  - HIGH-risk → COMPREHENSIVE (all tools, all checks)
  - MEDIUM-risk → STANDARD (core checks + category-specific checks)
  - LOW-risk → BASIC (identity + business + sanctions only)

DO NOT penalize sellers simply for being in a high-risk category.
DO increase verification depth for high-risk categories.
A clean high-risk seller is as trustworthy as a clean low-risk seller.
</decision_rules>

## Category Switching Red Flags

When a seller changes their business category after onboarding:
- LOW → HIGH risk category: Trigger re-verification. The original onboarding may not have included enhanced due diligence.
- Within same risk tier: Monitor but do not block. Businesses pivot.
- HIGH → LOW risk category: No action needed (lower risk).
- Multiple category changes in 90 days: FLAG for investigation — may indicate testing category restrictions.
