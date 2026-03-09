# Business Services & Fraud Rules Reference

> Complete catalog of all 11 business services, their risk assessment logic, decision thresholds, and the 62 predefined checkpoint rule templates.

---

## Table of Contents

1. [Service Overview](#service-overview)
2. [Seller Onboarding](#1-seller-onboarding)
3. [Account Setup](#2-account-setup)
4. [Item Setup](#3-item-setup)
5. [Pricing](#4-pricing)
6. [Profile Updates](#5-profile-updates)
7. [Returns](#6-returns)
8. [Seller ATO (Account Takeover)](#7-seller-ato-account-takeover)
9. [Seller Listing](#8-seller-listing)
10. [Seller Payout](#9-seller-payout)
11. [Seller Shipping](#10-seller-shipping)
12. [Case Queue](#11-case-queue)
13. [Decision Engine](#decision-engine)
14. [Policy Engine (Agent Framework)](#policy-engine)
15. [Checkpoint Rule Templates (62 Rules)](#checkpoint-rule-templates)
16. [Decision Threshold Summary](#decision-threshold-summary)
17. [High-Risk Country Lists](#high-risk-country-lists)
18. [Healing Events](#healing-events)

---

## Service Overview

| # | Service | API Route | Port | Purpose |
|---|---------|-----------|------|---------|
| 1 | Seller Onboarding | `/api/onboarding` | 3001 | KYC evaluation, identity checks, seller risk |
| 2 | Account Setup | `/api/account-setup` | 3001 | Account config risk, brand infringement, payment validation |
| 3 | Item Setup | `/api/item-setup` | 3001 | Listing compliance, restricted categories, duplicates |
| 4 | Pricing | `/api/pricing` | 3001 | Price anomaly detection, manipulation, arbitrage |
| 5 | Profile Updates | `/api/profile-updates` | 3001 | Sensitive field changes, device tracking, disputes |
| 6 | Returns | `/api/returns` | 3001 | Return abuse, wardrobing, serial returners, refund fraud |
| 7 | Seller ATO | `/api/ato` | 3001 | Account takeover, impossible travel, brute force |
| 8 | Seller Listing | `/api/listing` | 3001 | Counterfeit detection, prohibited keywords, price anomalies |
| 9 | Seller Payout | `/api/payout` | 3001 | Payout holds, velocity checks, bank verification |
| 10 | Seller Shipping | `/api/shipping` | 3001 | Address verification, international fraud flags |
| 11 | Case Queue | `/api/cases` | 3001 | Alert triage, case assignment, resolution tracking |

All services are Express routers mounted in `backend/gateway/server.js` on port 3001.

---

## 1. Seller Onboarding

**File:** `backend/services/business/seller-onboarding/index.js`
**Route:** `/api/onboarding`

### Agent-Driven Decision Mapping

| Agent Decision | Seller Status |
|---|---|
| `REJECT` | `BLOCKED` |
| `REVIEW` | `UNDER_REVIEW` |
| `APPROVE` | `PENDING` |
| (fallback) | `UNDER_REVIEW` |

### Risk Events Emitted

| Condition | Event Type | Risk Score |
|---|---|---|
| Every onboarding | `ONBOARDING_RISK_ASSESSMENT` | Agent-calculated |
| KYC not verified | `KYC_FAILED` | **40** |
| Bank not verified | `BANK_VERIFICATION_FAILED` | **30** |
| Decision = REJECT | `SELLER_BLOCKED` | **80** |

### Legacy Risk Assessment Rules

| Risk Factor | Condition | Weight |
|---|---|---|
| `KYC_NOT_VERIFIED` | `!seller.kycVerified` | **+20** |
| `BANK_NOT_VERIFIED` | `!seller.bankVerified` | **+15** |
| `HIGH_RISK_COUNTRY` | Country in `[NG, RO, UA, PK]` | **+25** |
| `DISPOSABLE_EMAIL` | Domain in `[tempmail.com, guerrillamail.com, 10minutemail.com]` | **+30** |

### Decision Thresholds

| Condition | Decision |
|---|---|
| `riskScore >= 50` | **REJECT** |
| `riskScore >= 25` | **REVIEW** |
| `riskScore < 25` | **APPROVE** |

---

## 2. Account Setup

**File:** `backend/services/business/account-setup/index.js`
**Route:** `/api/account-setup`

### Risk Factors

| Risk Factor | Condition | Weight |
|---|---|---|
| `brandInfringement` | Brand infringement detected | **+30** |
| `sharedPaymentMethod` | Shared payment method across accounts | **+40** |
| `timezoneCurrencyAnomaly` | Timezone/currency mismatch | **+15** |
| `taxConfigIncomplete` | Missing tax configuration | **+10** |

### Event: `ACCOUNT_SETUP_RISK` emitted when `riskScore > 0`

---

## 3. Item Setup

**File:** `backend/services/business/item-setup/index.js`
**Route:** `/api/item-setup`

### Risk Factors

| Risk Factor | Condition | Weight |
|---|---|---|
| `restrictedCategory` | Restricted product category | **+50** |
| `weightAnomaly` | Weight/dimension anomaly | **+15** |
| `duplicateProduct` | Duplicate product detected | **+25** |
| `missingComplianceData` | No compliance data provided | **+10** |

### Event: `ITEM_SETUP_RISK` emitted when `riskScore > 0`

---

## 4. Pricing

**File:** `backend/services/business/pricing/index.js`
**Route:** `/api/pricing`

### Risk Factors

| Risk Factor | Condition | Weight |
|---|---|---|
| `belowCost` | Price below cost | **+30** |
| `priceManipulation` | Price manipulation detected | **+35** |
| `arbitrage` | Arbitrage pattern found | **+25** |
| `excessivePriceChanges` | More than 5 price changes in 24h | **+15** |

### Event: `PRICING_RISK` emitted when `riskScore > 0`

---

## 5. Profile Updates

**File:** `backend/services/business/profile-updates/index.js`
**Route:** `/api/profile-updates`

### Risk Factors

| Risk Factor | Condition | Weight |
|---|---|---|
| `bankChangeDuringDispute` | Bank change while dispute is open | **+50** |
| `newDevice` | Update from unrecognized device | **+20** |
| `emailDomainDowngrade` | Email switched to less reputable domain | **+15** |
| `sensitiveFieldChange` | Bank or email change | **+10** |

### Event: `PROFILE_UPDATE_RISK` emitted when `riskScore > 0`

---

## 6. Returns

**File:** `backend/services/business/returns/index.js`
**Route:** `/api/returns`

### Risk Factors

| Risk Factor | Condition | Weight |
|---|---|---|
| `serialReturner` | Identified as serial returner | **+40** |
| `emptyBox` | Empty box return suspected | **+35** |
| `refundExceedsPurchase` | Refund amount > purchase price | **+50** |
| `wardrobing` | Item used and returned (wardrobing) | **+25** |
| `fundsWithdrawn` | Seller withdrew funds before return | **+45** |

### Event: `RETURN_RISK` emitted when `riskScore > 0`

---

## 7. Seller ATO (Account Takeover)

**File:** `backend/services/business/seller-ato/index.js`
**Route:** `/api/ato`

### ATO Risk Signals

| Signal | Condition | Weight |
|---|---|---|
| `newDevice` | Device not in known devices list | **+20** |
| `newLocation` | Country not in known countries list | **+15** |
| `impossibleTravel` | Different country + time diff < **1 hour** | **+40** |
| `bruteForce` | >= 3 failed logins within **15 minutes** | **+35** |
| `unusualTime` | Login between **2:00 AM - 5:00 AM** | **+10** |
| Sensitive event | `PASSWORD_CHANGE`, `EMAIL_CHANGE`, `BANK_CHANGE`, or `MFA_DISABLED` | **+15** |

### ATO Decision Thresholds

| Risk Score | Risk Level | Decision |
|---|---|---|
| `>= 70` | CRITICAL | **BLOCKED** |
| `>= 50` | HIGH | **CHALLENGED** |
| `>= 30` | MEDIUM | **CHALLENGED** |
| `< 30` | LOW | **ALLOWED** |

### Risk Events

| Condition | Event Type | Risk Score |
|---|---|---|
| Every evaluation | `ATO_EVENT` | Calculated score |
| Decision = BLOCKED | `ATO_BLOCKED` | **75** |
| Impossible travel detected | `ATO_IMPOSSIBLE_TRAVEL` | **70** |
| Brute force detected | `ATO_BRUTE_FORCE` | **60** |

### Device Trust Score Formula

```
Base score: 50
+ 2 per successful login (cap +30)
- 10 per blocked attempt
+ 1 per day of account age (cap +20)
Final: clamped [0, 100]
```

---

## 8. Seller Listing

**File:** `backend/services/business/seller-listing/index.js`
**Route:** `/api/listing`

### Price Anomaly Detection (Category-Specific)

| Category | Min Price | Max Price |
|---|---|---|
| Electronics | $10 | $3,000 |
| Fashion | $5 | $500 |
| Home & Garden | $10 | $2,000 |
| Jewelry | $20 | $10,000 |
| Default | $5 | $1,000 |

**Rule:** `price < min * 0.2` OR `price > max * 2` → `PRICE_ANOMALY` (**+25**)

### Prohibited Keywords

`replica`, `counterfeit`, `fake`, `knockoff`, `unauthorized`

Checked in title + description (case-insensitive) → `PROHIBITED_KEYWORD` (**+40**)

### Risk Flag Signals

| Signal | Condition | Weight |
|---|---|---|
| `PROHIBITED_CONTENT_FLAG` | Prohibited content flag set | **+50** |
| `COUNTERFEIT_RISK_FLAG` | Counterfeit risk flag set | **+45** |
| `DUPLICATE_LISTING` | Duplicate listing detected | **+20** |
| `NO_IMAGES` | Listing has no images | **+15** |

### Decision Thresholds

| Risk Score | Decision | Status |
|---|---|---|
| `>= 60` | **REJECT** | `REMOVED` |
| `>= 30` | **REVIEW** | `PENDING_REVIEW` |
| `< 30` | **APPROVE** | `ACTIVE` |

---

## 9. Seller Payout

**File:** `backend/services/business/seller-payout/index.js`
**Route:** `/api/payout`

### Risk Signals

| Signal | Condition | Weight |
|---|---|---|
| `HIGH_RISK_SELLER` | Seller riskTier = HIGH or CRITICAL | **+30** |
| `BANK_NOT_VERIFIED` | Bank account not verified | **+40** |
| `NEW_ACCOUNT` | Account age < **30 days** | **+20** |
| `HIGH_PAYOUT_VELOCITY` | >= 3 payouts in last 24 hours | **+25** |
| `HIGH_AMOUNT` | Amount > **$10,000** | **+15** |
| `UNUSUAL_AMOUNT` | Amount > `averagePayout * 3` | **+20** |

### Decision Threshold

| Risk Score | Decision | Status |
|---|---|---|
| `>= 50` | **HOLD** | `ON_HOLD` |
| `< 50` | **APPROVE** | `PENDING` |

---

## 10. Seller Shipping

**File:** `backend/services/business/seller-shipping/index.js`
**Route:** `/api/shipping`

### Risk Signals

| Signal | Condition | Weight |
|---|---|---|
| `ADDRESS_MISMATCH` | Address mismatch flag | **+30** |
| `RESHIPPING_SERVICE` | Reshipping service detected | **+40** |
| `HIGH_RISK_ZIP` | High-risk zip code | **+25** |
| `PO_BOX_DESTINATION` | PO Box destination | **+15** |
| `INTERNATIONAL_SHIPPING` | Non-US destination | **+10** |
| `HIGH_RISK_COUNTRY` | Country in `[NG, RO, ID, VN]` | **+30** (stacks with international) |

### Risk Levels

| Risk Score | Risk Level |
|---|---|
| `>= 50` | **HIGH** |
| `>= 25` | **MEDIUM** |
| `< 25` | **LOW** |

### Address Verification (Simulated)

| Factor | Detection Method |
|---|---|
| PO Box | Address contains "po box" |
| Reshipping service | 2% probability |
| High-risk zip | 5% probability |
| Commercial address | 30% probability |

---

## 11. Case Queue

**File:** `backend/services/case-queue/index.js`
**Route:** `/api/cases`

No scoring logic — this is operational case management.

| Aspect | Values |
|---|---|
| **Priority order** | `CRITICAL > HIGH > MEDIUM > LOW` |
| **Valid statuses** | `OPEN`, `IN_REVIEW`, `RESOLVED` |
| **Valid resolutions** | `CONFIRMED_FRAUD`, `FALSE_POSITIVE`, `ESCALATED` |
| **Auto-status rule** | Assigning a case auto-transitions `OPEN` → `IN_REVIEW` |

---

## Decision Engine

### Rules Service

**File:** `backend/services/decision-engine/rules/index.js`
**Route:** `/api/rules`

**Condition operators:** `GT`, `LT`, `GTE`, `LTE`, `EQ`, `NE`, `IN`, `NOT_IN`, `CONTAINS`

A rule triggers only when **ALL conditions are met** (AND logic).

**Valid rule statuses:** `ACTIVE`, `SHADOW`, `DISABLED`, `TESTING`
**Valid rule actions:** `BLOCK`, `REVIEW`, `CHALLENGE`, `FLAG`, `ALLOW_WITH_LIMIT`

### Execution Service

**File:** `backend/services/decision-engine/execution/index.js`
**Route:** `/api/decisions`

#### Action Priority (Highest Wins)

| Action | Priority | Maps to Decision |
|---|---|---|
| `BLOCK` | **5** | `BLOCKED` |
| `REVIEW` | **4** | `REVIEW` |
| `CHALLENGE` | **3** | `CHALLENGE` |
| `FLAG` | **2** | `APPROVED` |
| `ALLOW_WITH_LIMIT` | **1** | `APPROVED` |
| (no rules trigger) | — | `APPROVED` |

#### Risk Score Contribution Per Triggered Rule

| Rule Action | Score Added |
|---|---|
| `BLOCK` | **+30** |
| `REVIEW` | **+20** |
| `CHALLENGE` | **+15** |
| `FLAG` | **+10** |

Final score capped at **100**.

#### Auto Case Creation

Cases are created automatically for `BLOCKED` or `REVIEW` decisions.

| Risk Score | Case Priority |
|---|---|
| `> 80` | CRITICAL |
| `> 60` | HIGH |
| `> 40` | MEDIUM |
| `<= 40` | LOW |

#### Transaction Risk Events

| Decision | Event Type | Risk Score |
|---|---|---|
| `BLOCKED` | `TRANSACTION_BLOCKED` | **70** |
| `REVIEW` | `TRANSACTION_REVIEW` | **40** |
| `APPROVED` | `TRANSACTION_APPROVED` | **-2** (healing) |

---

## Policy Engine

**File:** `backend/agents/core/policy-engine.js`

The policy engine runs AFTER the agent reasoning loop and can **override** agent decisions.

### Hard Policies (Force Override)

| ID | Name | Trigger | Action |
|---|---|---|---|
| `POL-001` | Sanctions hard block | Agent approves but evidence has `sanctionsMatch`, `pepMatch`, or `watchlistMatch` | **BLOCK** |
| `POL-002` | KYC failure block | Agent approves but identity verification `verified === false` | **BLOCK** |
| `POL-003` | Duplicate fraud block | Agent approves but duplicate has `riskTier === CRITICAL` or `status === BLOCKED` | **BLOCK** |
| `POL-004` | Low confidence escalate | Decision confidence < **0.3** (30%) | **ESCALATE** |
| `POL-005` | High risk approve block | Agent approves but `riskScore > 80` (configurable) | **BLOCK** |

When any hard policy triggers → decision overridden to **REVIEW** with `escalated: true`.

### Soft Policies (Flag Only)

| ID | Name | Trigger | Action |
|---|---|---|---|
| `POL-101` | Pattern override flag | Agent decision differs from pattern memory recommendation | **FLAG** |
| `POL-102` | Many critical factors | Decision is not REJECT/BLOCK and `criticalFactors > 3` | **FLAG** |
| `POL-103` | Uncertainty language | Reasoning contains "I'm not sure", "possibly", "might be", "uncertain", "unclear" | **LOG** |

### LLM Guardrails

| Guardrail | Limit |
|---|---|
| Max tool calls per cycle | **10** |
| Max LLM calls per decision | **5** |
| Max tokens per decision | **8,000** |

---

## Checkpoint Rule Templates

62 predefined rules seeded from `backend/shared/synthetic-data/generators.js`. Grouped by domain.

### Rule Types

| Type | Description |
|---|---|
| `THRESHOLD` | Simple value comparison (amount > X) |
| `VELOCITY` | Rate-based detection (count in time window) |
| `LIST_MATCH` | Value found in known-bad list |
| `PATTERN` | Behavioral pattern detection |
| `COMPOSITE` | Multiple conditions combined |
| `ML_SCORE` | ML model score threshold |

### Onboarding Rules (5)

| Rule | Type | Severity | Action | Condition |
|---|---|---|---|---|
| High-Risk Country Registration | LIST_MATCH | HIGH | REVIEW | `country IN [NG, RO, UA, PK, BD]` |
| Disposable Email Domain | LIST_MATCH | MEDIUM | REVIEW | `emailDomain IN [tempmail.com, guerrillamail.com, throwaway.email]` |
| Business Category Mismatch | PATTERN | MEDIUM | FLAG | `categoryMismatchScore > 0.7` |
| Duplicate Identity Signals | COMPOSITE | CRITICAL | BLOCK | `duplicateScore > 0.85` |
| New Account Rapid Listing | VELOCITY | HIGH | REVIEW | `accountAgeDays < 3 AND listingCount > 10` |

### ATO Rules (5)

| Rule | Type | Severity | Action | Condition |
|---|---|---|---|---|
| Multiple Failed Logins | VELOCITY | HIGH | CHALLENGE | `failedLogins_1h > 5` |
| New Device + Password Change | COMPOSITE | CRITICAL | BLOCK | `device.isNew AND passwordChanged` |
| Impossible Travel | PATTERN | CRITICAL | BLOCK | `travelSpeedKmh > 1000` |
| Session Anomaly | ML_SCORE | MEDIUM | CHALLENGE | `sessionAnomalyScore > 0.75` |
| Credential Stuffing Pattern | VELOCITY | HIGH | BLOCK | `distinctAccountsFromIP_1h > 10` |

### Transaction Rules (5)

| Rule | Type | Severity | Action | Condition |
|---|---|---|---|---|
| Transaction Velocity Spike | VELOCITY | HIGH | REVIEW | `countLast1h > 10` |
| High Amount Threshold | THRESHOLD | HIGH | REVIEW | `amount > $5,000` |
| High-Risk Merchant Category | LIST_MATCH | MEDIUM | FLAG | `category IN [GAMBLING, CRYPTO, ADULT, PHARMACY]` |
| Cross-Border New Account | COMPOSITE | HIGH | REVIEW | `isCrossBorder AND accountAgeDays < 14` |
| ML Fraud Score Alert | ML_SCORE | CRITICAL | BLOCK | `fraudScore > 0.9` |

### Payout Rules (5)

| Rule | Type | Severity | Action | Condition |
|---|---|---|---|---|
| First Payout Above Threshold | THRESHOLD | HIGH | REVIEW | `isFirst AND amount > $5,000` |
| Payout Velocity Spike | VELOCITY | HIGH | REVIEW | `countLast24h > 3` |
| Bank Change + Immediate Payout | COMPOSITE | CRITICAL | BLOCK | `bankChangedHoursAgo < 24 AND amount > $1,000` |
| Round Amount Pattern | PATTERN | MEDIUM | FLAG | `isRoundAmount AND amount > $1,000` |
| Payout Exceeds Revenue | THRESHOLD | CRITICAL | BLOCK | `exceedsRevenue == true` |

### Listing Rules (5)

| Rule | Type | Severity | Action | Condition |
|---|---|---|---|---|
| Below-Market Price | THRESHOLD | MEDIUM | FLAG | `priceBelowMarketPct > 50` |
| Prohibited Item Keywords | LIST_MATCH | HIGH | BLOCK | `hasProhibitedKeywords` |
| Bulk Listing Creation | VELOCITY | HIGH | REVIEW | `createdLast1h > 20` |
| Copied Listing Content | ML_SCORE | MEDIUM | FLAG | `contentSimilarityScore > 0.9` |
| Mismatched Category Images | ML_SCORE | MEDIUM | FLAG | `imageCategoryMatchScore < 0.3` |

### Shipping Rules (5)

| Rule | Type | Severity | Action | Condition |
|---|---|---|---|---|
| Address Mismatch | PATTERN | MEDIUM | FLAG | `addressMatchScore < 0.5` |
| Freight Forwarder Destination | LIST_MATCH | HIGH | REVIEW | `isFreightForwarder AND amount > $2,000` |
| Multiple Shipments Same Address | VELOCITY | MEDIUM | FLAG | `sameAddressCount7d > 5` |
| Delivery Region Anomaly | PATTERN | HIGH | REVIEW | `regionRiskScore > 70` |
| Express Shipping on New Account | COMPOSITE | MEDIUM | FLAG | `accountAgeDays < 7 AND isExpress` |

### Account Setup Rules (7)

| Rule | Type | Severity | Action | Condition |
|---|---|---|---|---|
| Incomplete Tax Configuration | PATTERN | MEDIUM | FLAG | `taxConfigComplete == false` |
| Multiple Payment Methods Rapidly | VELOCITY | HIGH | REVIEW | `paymentMethodsAdded1h > 3` |
| High-Risk Store Category | LIST_MATCH | MEDIUM | FLAG | `storeCategory IN [GAMBLING, CRYPTO, ADULT, PHARMACY]` |
| Mismatched Business Registration | PATTERN | HIGH | REVIEW | `registrationMismatchScore > 0.7` |
| Unusual Timezone/Currency | PATTERN | MEDIUM | FLAG | `timezoneCurrencyAnomaly` |
| Multiple Accounts Same Payment | COMPOSITE | CRITICAL | BLOCK | `sharedPaymentMethodCount > 1` |
| Store Name Brand Infringement | LIST_MATCH | HIGH | REVIEW | `brandInfringementScore > 0.8` |

### Item Setup Rules (7)

| Rule | Type | Severity | Action | Condition |
|---|---|---|---|---|
| Excessive Variant Creation | VELOCITY | HIGH | REVIEW | `variantsCreated1h > 50` |
| Inventory Count Mismatch | THRESHOLD | MEDIUM | FLAG | `inventoryMismatchPct > 30` |
| Restricted Category Product | LIST_MATCH | CRITICAL | BLOCK | `isRestrictedCategory` |
| Bulk SKU Import New Account | COMPOSITE | HIGH | REVIEW | `accountAgeDays < 7 AND skuImportCount > 100` |
| Missing Compliance Data | PATTERN | MEDIUM | FLAG | `complianceDataComplete == false` |
| Duplicate Product Across Sellers | ML_SCORE | HIGH | REVIEW | `productDuplicateScore > 0.85` |
| Suspicious Weight/Dimension | THRESHOLD | MEDIUM | FLAG | `weightDimensionAnomaly > 0.7` |

### Pricing Rules (7)

| Rule | Type | Severity | Action | Condition |
|---|---|---|---|---|
| Price Below Cost | THRESHOLD | HIGH | REVIEW | `priceBelowCostPct > 20` |
| Rapid Price Fluctuation | VELOCITY | MEDIUM | FLAG | `priceChanges24h > 5` |
| Predatory Pricing | ML_SCORE | HIGH | REVIEW | `predatoryPricingScore > 0.75` |
| Coupon/Discount Stacking Abuse | COMPOSITE | CRITICAL | BLOCK | `activeDiscounts > 3 AND effectiveDiscountPct > 80` |
| Price Manipulation Before Sale | PATTERN | HIGH | REVIEW | `priceInflatedBeforeSale` |
| Dynamic Pricing Anomaly | ML_SCORE | MEDIUM | FLAG | `dynamicPricingAnomaly > 0.6` |
| Cross-Border Price Arbitrage | COMPOSITE | HIGH | REVIEW | `crossBorderPriceDiffPct > 40` |

### Profile Updates Rules (7)

| Rule | Type | Severity | Action | Condition |
|---|---|---|---|---|
| Bank Change After Dispute | COMPOSITE | CRITICAL | BLOCK | `type == BANK_CHANGE AND hasOpenDispute` |
| Multiple Address Changes 24h | VELOCITY | HIGH | REVIEW | `addressChanges24h > 2` |
| Contact Change From New Device | COMPOSITE | HIGH | REVIEW | `device.isNew AND type IN [EMAIL_CHANGE, PHONE_CHANGE]` |
| Business Name Change Pattern | PATTERN | MEDIUM | FLAG | `nameChanges90d > 2` |
| Email Domain Downgrade | LIST_MATCH | MEDIUM | FLAG | `emailDomainDowngrade` |
| Phone Number Velocity | VELOCITY | HIGH | REVIEW | `phoneChanges30d > 3` |
| Identity Document Re-upload | PATTERN | MEDIUM | REVIEW | `idDocReuploadCount > 2` |

### Shipments Rules (7)

| Rule | Type | Severity | Action | Condition |
|---|---|---|---|---|
| Label Created Without Order | COMPOSITE | CRITICAL | BLOCK | `hasMatchingOrder == false` |
| Carrier Mismatch Pattern | PATTERN | MEDIUM | FLAG | `carrierMismatch` |
| Shipment Weight Discrepancy | THRESHOLD | HIGH | REVIEW | `weightDiscrepancyPct > 50` |
| Drop-Ship Detection | ML_SCORE | MEDIUM | FLAG | `dropShipScore > 0.7` |
| Bulk Label Generation | VELOCITY | HIGH | REVIEW | `labelsCreated1h > 50` |
| High-Value No Insurance | THRESHOLD | MEDIUM | FLAG | `value > $500 AND insured == false` |
| Cross-Border Restricted | LIST_MATCH | HIGH | REVIEW | `destinationCountry IN [KP, IR, SY, CU]` |

### Returns Rules (7)

| Rule | Type | Severity | Action | Condition |
|---|---|---|---|---|
| Return Rate Above Threshold | THRESHOLD | HIGH | REVIEW | `returnRate30d > 25%` |
| Serial Returner Pattern | VELOCITY | CRITICAL | BLOCK | `returnCount7d > 10` |
| Return After Funds Withdrawal | COMPOSITE | CRITICAL | BLOCK | `sellerWithdrewFunds AND daysSincePayout < 3` |
| Empty Box Return | PATTERN | HIGH | REVIEW | `weightDiscrepancy > 0.8` |
| Return Address Mismatch | PATTERN | MEDIUM | FLAG | `addressMatchScore < 0.5` |
| Wardrobing Detection | ML_SCORE | HIGH | REVIEW | `wardrobingScore > 0.7` |
| Refund Exceeds Purchase | THRESHOLD | CRITICAL | BLOCK | `refundExceedsPurchase` |

---

## Decision Threshold Summary

| Service | Approve | Review/Hold | Reject/Block |
|---|---|---|---|
| Seller Onboarding | `< 25` | `25 - 49` | `>= 50` |
| Seller ATO | `< 30` (ALLOWED) | `30 - 69` (CHALLENGED) | `>= 70` (BLOCKED) |
| Seller Listing | `< 30` | `30 - 59` | `>= 60` |
| Seller Payout | `< 50` | — | `>= 50` (HOLD) |
| Seller Shipping | `< 25` (LOW) | `25 - 49` (MEDIUM) | `>= 50` (HIGH) |
| Policy Engine | — | — | `> 80` (auto-reject, configurable) |
| Case Priority | LOW `<= 40` | MEDIUM `41-60` | HIGH `61-80`, CRITICAL `> 80` |
| Agent Confidence | — | — | `< 0.3` forces escalation |

---

## High-Risk Country Lists

| Context | Countries |
|---|---|
| Onboarding (legacy) | NG (Nigeria), RO (Romania), UA (Ukraine), PK (Pakistan) |
| Onboarding (templates) | NG, RO, UA, PK, BD (Bangladesh) |
| Shipping | NG, RO, ID (Indonesia), VN (Vietnam) |
| Sanctioned (shipments) | KP (North Korea), IR (Iran), SY (Syria), CU (Cuba) |

---

## Healing Events

Positive events that reduce a seller's risk score over time:

| Event Type | Risk Score | Service |
|---|---|---|
| `LISTING_APPROVED` | **-5** | Seller Listing |
| `PAYOUT_RELEASED` | **-20** | Seller Payout |
| `SHIPPING_DELIVERED` | **-3** | Seller Shipping |
| `TRANSACTION_APPROVED` | **-2** | Decision Engine |

---

*Generated: 2026-03-04*
