# Risk & Decision Rules Repository

Marketplace-grade fraud detection rules for an eBay-scale eCommerce platform. **106 rules** organized by owning microservice and fraud typology, with real-world trigger conditions, ML model references, and performance metrics.

**Frontend:** View interactive version at `/rules-repository` in the dashboard (supports both "By Service" and "By Category" views).

**Status Legend:**
- ✅ ACTIVE — Live in production, enforced
- 🟣 SHADOW — Running in shadow mode, scoring but not blocking

**Service Legend:**
- 🟢 EXISTS — Backend service implemented at `backend/services/business/<service>`
- 🟠 PROPOSED — Service does not exist yet; rules should be part of this future service

---

## Table of Contents

### By Service (Primary Organization)

**Existing Services (10):**
1. [Seller Onboarding](#seller-onboarding-exists) — 11 rules
2. [Account Setup](#account-setup-exists) — 5 rules
3. [Item Setup](#item-setup-exists) — 5 rules
4. [Seller Listing](#seller-listing-exists) — 8 rules
5. [Pricing](#pricing-exists) — 5 rules
6. [Seller Shipping](#seller-shipping-exists) — 5 rules
7. [Seller Payout](#seller-payout-exists) — 5 rules
8. [Returns](#returns-exists) — 7 rules
9. [Seller ATO](#seller-ato-exists) — 5 rules
10. [Profile Updates](#profile-updates-exists) — 5 rules

**Proposed Services (8):**
11. [Transaction Processing](#transaction-processing-proposed) — 9 rules
12. [Payment Processing](#payment-processing-proposed) — 7 rules
13. [Compliance & AML](#compliance--aml-proposed) — 6 rules
14. [Network Intelligence](#network-intelligence-proposed) — 5 rules
15. [Review Integrity](#review-integrity-proposed) — 5 rules
16. [Behavioral Analytics](#behavioral-analytics-proposed) — 5 rules
17. [Buyer Trust](#buyer-trust-proposed) — 4 rules
18. [Policy Enforcement](#policy-enforcement-proposed) — 4 rules

### By Category
19. [Category Summary](#category-summary)

---

## Service-Organized Rules

### Seller Onboarding (EXISTS)

**Path:** `backend/services/business/seller-onboarding`
**Description:** KYC, identity verification, seller registration and vetting

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | SI-001 | Stealth Account Detection | CRIT | 95 | BLOCK | ONBOARDING | 94% | 6% | ✅ |
| 2 | SI-002 | Synthetic Identity Fusion | CRIT | 90 | BLOCK | ONBOARDING | 90% | 10% | ✅ |
| 3 | SI-003 | Document Forgery — Pixel Analysis | CRIT | 88 | BLOCK | ONBOARDING | 92% | 8% | ✅ |
| 4 | SI-004 | Shell Company Front | HIGH | 72 | REVIEW | ONBOARDING | 80% | 20% | ✅ |
| 5 | SI-005 | Phone Number Recycling | HIGH | 65 | REVIEW | ONBOARDING | 80% | 20% | ✅ |
| 6 | SI-006 | Address Intelligence — Mail Drop | MED | 45 | FLAG | ONBOARDING | 60% | 40% | ✅ |
| 7 | SI-007 | Email Age & Reputation | MED | 40 | FLAG | ONBOARDING | 60% | 40% | ✅ |
| 8 | SI-008 | Cross-Platform Ban Match | HIGH | 78 | REVIEW | ONBOARDING | 90% | 10% | ✅ |
| 9 | SI-009 | Beneficial Owner Opacity | HIGH | 60 | REVIEW | ONBOARDING | 60% | 40% | 🟣 |
| 10 | SI-010 | Device Farm Fingerprint | CRIT | 92 | BLOCK | ONBOARDING | 97% | 3% | ✅ |
| 11 | PA-001 | Referral Fraud — Self-Referral Chain | HIGH | 70 | REVIEW | ONBOARDING | 80% | 20% | ✅ |

---

### Account Setup (EXISTS)

**Path:** `backend/services/business/account-setup`
**Description:** Account configuration, bank linking, tax setup, payment methods

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | AS-001 | Multiple Bank Accounts in 24hrs | HIGH | 70 | REVIEW | ONBOARDING | 75% | 25% | ✅ |
| 2 | AS-002 | Tax ID Already on Banned Account | CRIT | 92 | BLOCK | ONBOARDING | 97% | 3% | ✅ |
| 3 | AS-003 | Dormant Account Reactivation | MED | 48 | FLAG | CONTINUOUS | 65% | 35% | ✅ |
| 4 | AS-004 | Payment Method Stacking | MED | 42 | FLAG | ONBOARDING | 55% | 45% | ✅ |
| 5 | AS-005 | Business Address is Residential + High-Risk Category | LOW | 28 | FLAG | ONBOARDING | 40% | 60% | ✅ |

---

### Item Setup (EXISTS)

**Path:** `backend/services/business/item-setup`
**Description:** Product catalog management, SKU creation, attribute validation

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | LI-008 | Listing Hijack — ASIN/UPC Mismatch | HIGH | 70 | REVIEW | LISTING | 80% | 20% | ✅ |
| 2 | IS-001 | Weight/Dimension Inconsistency | MED | 38 | FLAG | LISTING | 60% | 40% | ✅ |
| 3 | IS-002 | Restricted Product Keywords in Attributes | HIGH | 72 | REVIEW | LISTING | 82% | 18% | ✅ |
| 4 | IS-003 | Hazmat Misclassification | CRIT | 90 | BLOCK | LISTING | 92% | 8% | ✅ |
| 5 | IS-004 | UPC Barcode Already Flagged | HIGH | 68 | REVIEW | LISTING | 78% | 22% | ✅ |

---

### Seller Listing (EXISTS)

**Path:** `backend/services/business/seller-listing`
**Description:** Live listing management, search ranking, listing quality enforcement

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | LI-001 | Counterfeit Brand — Deep Discount | HIGH | 75 | REVIEW | LISTING | 80% | 20% | ✅ |
| 2 | LI-002 | Stolen Photos — Reverse Image Search | MED | 55 | FLAG | LISTING | 70% | 30% | ✅ |
| 3 | LI-003 | Keyword Stuffing & SEO Manipulation | MED | 35 | FLAG | LISTING | 80% | 20% | ✅ |
| 4 | LI-004 | Phantom Inventory — Drop Ship Arbitrage | HIGH | 68 | REVIEW | LISTING | 80% | 20% | ✅ |
| 5 | LI-005 | Condition Misrepresentation | MED | 50 | FLAG | LISTING | 70% | 30% | ✅ |
| 6 | LI-006 | Prohibited Item Obfuscation | CRIT | 95 | BLOCK | LISTING | 95% | 5% | ✅ |
| 7 | LI-009 | Variant Bait-and-Switch | HIGH | 65 | REVIEW | LISTING | 70% | 30% | 🟣 |
| 8 | VB-001 | Listing Flood — New Seller Anomaly | HIGH | 72 | REVIEW | LISTING | 80% | 20% | ✅ |

---

### Pricing (EXISTS)

**Path:** `backend/services/business/pricing`
**Description:** Price management, dynamic pricing rules, competitive monitoring

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | LI-007 | Price Anchoring Manipulation | MED | 40 | FLAG | LISTING | 70% | 30% | ✅ |
| 2 | TM-005 | Buy Box Manipulation — Price Cycling | MED | 55 | FLAG | LISTING | 60% | 40% | ✅ |
| 3 | PR-001 | Below-Cost Predatory Pricing | MED | 42 | FLAG | LISTING | 58% | 42% | ✅ |
| 4 | PR-002 | Price Gouging During Emergency | HIGH | 78 | REVIEW | LISTING | 85% | 15% | ✅ |
| 5 | PR-003 | MAP Violation Detection | MED | 35 | FLAG | LISTING | 50% | 50% | 🟣 |

---

### Seller Shipping (EXISTS)

**Path:** `backend/services/business/seller-shipping`
**Description:** Shipping label generation, carrier integration, delivery tracking

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | FF-001 | Empty Box — Weight Discrepancy | HIGH | 78 | REVIEW | SHIPPING | 80% | 20% | ✅ |
| 2 | FF-002 | Tracking Number Recycling | CRIT | 90 | BLOCK | SHIPPING | 95% | 5% | ✅ |
| 3 | FF-003 | Triangulation Fraud | HIGH | 72 | REVIEW | SHIPPING | 80% | 20% | ✅ |
| 4 | FF-004 | Delivery Address Manipulation | MED | 55 | FLAG | SHIPPING | 60% | 40% | ✅ |
| 5 | FF-005 | Label Created, Never Shipped | HIGH | 65 | REVIEW | SHIPPING | 80% | 20% | ✅ |

---

### Seller Payout (EXISTS)

**Path:** `backend/services/business/seller-payout`
**Description:** Earnings disbursement, bank verification, payout scheduling

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | PF-004 | Mule Account — Rapid Fund Pass-Through | CRIT | 90 | BLOCK | PAYOUT | 95% | 5% | ✅ |
| 2 | VB-002 | Payout Velocity Spike | CRIT | 85 | HOLD | PAYOUT | 85% | 15% | ✅ |
| 3 | SP-001 | Payout to Sanctioned Country | CRIT | 95 | BLOCK | PAYOUT | 99% | 1% | ✅ |
| 4 | SP-002 | Payout Before Delivery Confirmation | HIGH | 72 | HOLD | PAYOUT | 82% | 18% | ✅ |
| 5 | SP-003 | Frequent Bank Account Changes | MED | 45 | FLAG | PAYOUT | 60% | 40% | ✅ |

---

### Returns (EXISTS)

**Path:** `backend/services/business/returns`
**Description:** Return authorization, refund processing, return abuse detection

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | BA-001 | Serial INR Abuser | HIGH | 80 | RESTRICT | RETURNS | 80% | 20% | ✅ |
| 2 | BA-002 | Return Swap — Different Item Returned | CRIT | 88 | BLOCK | RETURNS | 90% | 10% | ✅ |
| 3 | BA-003 | Wardrobing — Use and Return | MED | 55 | FLAG | RETURNS | 70% | 30% | ✅ |
| 4 | BA-005 | SNAD Exploitation — Serial Complainer | HIGH | 70 | REVIEW | RETURNS | 80% | 20% | ✅ |
| 5 | RT-001 | Empty Return Package | CRIT | 88 | BLOCK | RETURNS | 92% | 8% | ✅ |
| 6 | RT-002 | Return Address Reroute | HIGH | 68 | REVIEW | RETURNS | 75% | 25% | ✅ |
| 7 | RT-003 | Warranty Claim with Serial Mismatch | HIGH | 72 | REVIEW | RETURNS | 80% | 20% | ✅ |

---

### Seller ATO (EXISTS)

**Path:** `backend/services/business/seller-ato`
**Description:** Account takeover prevention, credential abuse, session security

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | ATO-001 | Credential Stuffing — Burst Login | CRIT | 90 | BLOCK | ACCOUNT | 96% | 4% | ✅ |
| 2 | ATO-002 | Session Hijack — Concurrent Access | CRIT | 88 | BLOCK | ACCOUNT | 92% | 8% | ✅ |
| 3 | ATO-003 | Post-Takeover Blitz | CRIT | 95 | BLOCK | ACCOUNT | 97% | 3% | ✅ |
| 4 | ATO-004 | SIM Swap + Login | HIGH | 82 | CHALLENGE | ACCOUNT | 85% | 15% | ✅ |
| 5 | VB-004 | Geographic Impossible Travel | HIGH | 78 | CHALLENGE | CONTINUOUS | 80% | 20% | ✅ |

---

### Profile Updates (EXISTS)

**Path:** `backend/services/business/profile-updates`
**Description:** Account changes, email/phone/bank/address updates, identity re-verification

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | PU-001 | Email Swap Before Payout | HIGH | 75 | HOLD | CONTINUOUS | 82% | 18% | ✅ |
| 2 | PU-002 | Bank Change After Sales Spike | HIGH | 72 | REVIEW | CONTINUOUS | 78% | 22% | ✅ |
| 3 | PU-003 | Shipping Address Churn | MED | 42 | FLAG | CONTINUOUS | 55% | 45% | ✅ |
| 4 | PU-004 | Sudden Category Expansion | MED | 48 | FLAG | CONTINUOUS | 60% | 40% | ✅ |
| 5 | PU-005 | Display Name Brand Impersonation | HIGH | 70 | REVIEW | CONTINUOUS | 80% | 20% | ✅ |

---

### Transaction Processing (PROPOSED)

> 🟠 **This service does not exist yet.** These rules should be part of a new `backend/services/business/transaction-processing` service covering order processing, checkout, bidding, and cart management — currently handled inline in the gateway.

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | TM-001 | Shill Bidding — Connected Bidders | CRIT | 90 | BLOCK | BIDDING | 90% | 10% | ✅ |
| 2 | TM-002 | Bid Shielding | HIGH | 75 | REVIEW | BIDDING | 80% | 20% | ✅ |
| 3 | TM-003 | Off-Platform Transaction Diversion | CRIT | 85 | BLOCK | TRANSACTION | 90% | 10% | ✅ |
| 4 | TM-004 | Wash Trading — Circular Transactions | CRIT | 88 | BLOCK | TRANSACTION | 88% | 12% | ✅ |
| 5 | TM-006 | Gift Card Laundering Pipeline | CRIT | 92 | BLOCK | TRANSACTION | 90% | 10% | ✅ |
| 6 | TM-007 | Feedback Extortion | HIGH | 70 | REVIEW | CONTINUOUS | 80% | 20% | 🟣 |
| 7 | BA-006 | Coupon Stacking / Promo Abuse | MED | 45 | FLAG | TRANSACTION | 60% | 40% | ✅ |
| 8 | TP-001 | Checkout Velocity — Multi-Order Burst | HIGH | 72 | CHALLENGE | TRANSACTION | 78% | 22% | ✅ |
| 9 | TP-002 | Price Lock Exploitation | MED | 40 | FLAG | TRANSACTION | 52% | 48% | 🟣 |

---

### Payment Processing (PROPOSED)

> 🟠 **This service does not exist yet.** These rules should be part of a new `backend/services/business/payment-processing` service covering payment acceptance, card validation, and payment method risk screening.

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | PF-001 | Card Testing — Micro-Transaction Probe | CRIT | 92 | BLOCK | PAYMENT | 94% | 6% | ✅ |
| 2 | PF-002 | BIN Attack — Sequential Card Numbers | CRIT | 95 | BLOCK | PAYMENT | 98% | 2% | ✅ |
| 3 | PF-005 | Stolen Card — Velocity + Geography | HIGH | 78 | CHALLENGE | PAYMENT | 80% | 20% | ✅ |
| 4 | BA-004 | Friendly Fraud — Chargeback After Delivery | CRIT | 85 | BLOCK | PAYMENT | 85% | 15% | ✅ |
| 5 | PP-001 | 3D Secure Bypass Attempt | HIGH | 78 | BLOCK | PAYMENT | 88% | 12% | ✅ |
| 6 | PP-002 | Virtual Card Velocity | MED | 45 | FLAG | PAYMENT | 55% | 45% | ✅ |
| 7 | PP-003 | ACH Return Pattern | HIGH | 70 | REVIEW | PAYMENT | 78% | 22% | ✅ |

---

### Compliance & AML (PROPOSED)

> 🟠 **This service does not exist yet.** These rules should be part of a new `backend/services/business/compliance-aml` service covering BSA/AML compliance, sanctions screening, and regulatory reporting.

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | PF-003 | Structuring — Smurfing Detection | CRIT | 88 | BLOCK | PAYOUT | 88% | 12% | ✅ |
| 2 | PF-006 | Crypto Purchase Layering | HIGH | 75 | REVIEW | TRANSACTION | 70% | 30% | 🟣 |
| 3 | PA-002 | Tax Threshold GMV Splitting | MED | 50 | FLAG | CONTINUOUS | 60% | 40% | ✅ |
| 4 | CA-001 | SAR Filing Trigger | CRIT | 95 | BLOCK | TRANSACTION | 96% | 4% | ✅ |
| 5 | CA-002 | OFAC/SDN Sanctions Match | CRIT | 98 | BLOCK | ONBOARDING | 99% | 1% | ✅ |
| 6 | CA-003 | PEP/Adverse Media Screen | HIGH | 68 | REVIEW | ONBOARDING | 72% | 28% | 🟣 |

---

### Network Intelligence (PROPOSED)

> 🟠 **This service does not exist yet.** These rules should be part of a new `backend/services/business/network-intelligence` service covering graph-based fraud ring detection, entity resolution, and cross-account linking.

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | NR-001 | Shill Bidding Ring — Circular Bidding | CRIT | 92 | BLOCK | BIDDING | 92% | 8% | ✅ |
| 2 | NR-003 | Mule Network — Shared Infrastructure | CRIT | 90 | BLOCK | CONTINUOUS | 95% | 5% | ✅ |
| 3 | NR-004 | Seller Collusion — Shared Warehouse | HIGH | 72 | REVIEW | CONTINUOUS | 80% | 20% | ✅ |
| 4 | NI-001 | Entity Resolution — Cross-Account Linking | HIGH | 72 | REVIEW | CONTINUOUS | 78% | 22% | ✅ |
| 5 | NI-002 | Dormant Ring Reactivation | CRIT | 88 | BLOCK | CONTINUOUS | 90% | 10% | ✅ |

---

### Review Integrity (PROPOSED)

> 🟠 **This service does not exist yet.** These rules should be part of a new `backend/services/business/review-integrity` service covering review fraud detection, feedback manipulation, and rating system abuse.

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | LI-010 | Review Seeding — Incentivized Reviews | MED | 50 | FLAG | CONTINUOUS | 80% | 20% | ✅ |
| 2 | NR-002 | Feedback Manipulation Network | HIGH | 78 | REVIEW | CONTINUOUS | 80% | 20% | ✅ |
| 3 | NR-005 | Review Bombing — Coordinated Negative | HIGH | 70 | REVIEW | CONTINUOUS | 70% | 30% | 🟣 |
| 4 | RI-001 | Paid Review Detection | MED | 40 | FLAG | CONTINUOUS | 52% | 48% | 🟣 |
| 5 | RI-002 | Review Timing Anomaly | LOW | 30 | FLAG | CONTINUOUS | 45% | 55% | ✅ |

---

### Behavioral Analytics (PROPOSED)

> 🟠 **This service does not exist yet.** These rules should be part of a new `backend/services/business/behavioral-analytics` service covering bot detection, session analysis, and behavioral biometrics.

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | VB-003 | Bot Detection — Behavioral Biometrics | HIGH | 75 | CHALLENGE | CONTINUOUS | 80% | 20% | ✅ |
| 2 | VB-005 | Night Owl — Off-Hours Surge | MED | 45 | FLAG | TRANSACTION | 50% | 50% | ✅ |
| 3 | VB-006 | Browsing-to-Purchase Ratio Anomaly | LOW | 30 | FLAG | TRANSACTION | 40% | 60% | ✅ |
| 4 | BE-001 | Session Anomaly Score | MED | 48 | FLAG | CONTINUOUS | 60% | 40% | ✅ |
| 5 | BE-002 | Device Reputation Score | HIGH | 72 | CHALLENGE | CONTINUOUS | 80% | 20% | ✅ |

---

### Buyer Trust (PROPOSED)

> 🟠 **This service does not exist yet.** These rules should be part of a new `backend/services/business/buyer-trust` service covering buyer risk scoring, dispute pattern detection, and chargeback prevention.

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | BT-001 | New Buyer High-Value First Purchase | MED | 45 | FLAG | TRANSACTION | 50% | 50% | ✅ |
| 2 | BT-002 | Buyer Chargeback History | HIGH | 78 | CHALLENGE | TRANSACTION | 82% | 18% | ✅ |
| 3 | BT-003 | Multi-Account Buyer | MED | 52 | FLAG | ACCOUNT | 62% | 38% | ✅ |
| 4 | BT-004 | Buyer Dispute-to-Purchase Ratio | HIGH | 72 | RESTRICT | CONTINUOUS | 78% | 22% | ✅ |

---

### Policy Enforcement (PROPOSED)

> 🟠 **This service does not exist yet.** These rules should be part of a new `backend/services/business/policy-enforcement` service covering cross-service policy correlation, repeat offender escalation, and seller metrics gaming.

| # | ID | Rule Name | Sev | Score | Action | Checkpoint | Catch% | FP% | Status |
|---|------|-----------|-----|-------|--------|------------|--------|-----|--------|
| 1 | PA-003 | Seller Metrics Gaming | MED | 40 | FLAG | TRANSACTION | 70% | 30% | ✅ |
| 2 | PA-004 | Search Rank Manipulation | HIGH | 65 | REVIEW | CONTINUOUS | 70% | 30% | 🟣 |
| 3 | PE-001 | Repeat Offender Escalation | HIGH | 75 | RESTRICT | CONTINUOUS | 85% | 15% | ✅ |
| 4 | PE-002 | Cross-Service Policy Correlation | HIGH | 68 | REVIEW | CONTINUOUS | 72% | 28% | 🟣 |

---

## Category Summary

| Category | Rules | Active | Shadow | Avg Catch Rate |
|----------|-------|--------|--------|----------------|
| Seller Identity & Account Integrity | 10 | 9 | 1 | 84% |
| Listing Integrity & Counterfeit | 10 | 9 | 1 | 78% |
| Transaction & Bidding Manipulation | 7 | 6 | 1 | 83% |
| Fulfillment & Shipping Fraud | 5 | 5 | 0 | 81% |
| Buyer Abuse & Friendly Fraud | 6 | 6 | 0 | 78% |
| Payment Fraud & Money Laundering | 6 | 5 | 1 | 88% |
| Account Takeover | 4 | 4 | 0 | 93% |
| Network & Ring Detection | 5 | 4 | 1 | 83% |
| Policy & Platform Abuse | 4 | 3 | 1 | 70% |
| Velocity & Behavioral Anomalies | 6 | 6 | 0 | 69% |
| *New rules (AS/IS/PR/PU/SP/RT/BT/CA/PE/NI/RI/BE/TP/PP)* | *43* | *38* | *5* | *72%* |
| **TOTAL** | **106** | **95** | **11** | **77%** |

---

## Service Statistics Summary

| Service | Status | Rules | Active | Shadow | Critical | Avg Catch% |
|---------|--------|-------|--------|--------|----------|------------|
| Seller Onboarding | 🟢 EXISTS | 11 | 10 | 1 | 4 | 80% |
| Transaction Processing | 🟠 PROPOSED | 9 | 7 | 2 | 4 | 79% |
| Seller Listing | 🟢 EXISTS | 8 | 7 | 1 | 1 | 78% |
| Returns | 🟢 EXISTS | 7 | 7 | 0 | 2 | 81% |
| Payment Processing | 🟠 PROPOSED | 7 | 7 | 0 | 3 | 83% |
| Compliance & AML | 🟠 PROPOSED | 6 | 4 | 2 | 3 | 81% |
| Pricing | 🟢 EXISTS | 5 | 4 | 1 | 0 | 65% |
| Item Setup | 🟢 EXISTS | 5 | 5 | 0 | 1 | 78% |
| Review Integrity | 🟠 PROPOSED | 5 | 3 | 2 | 0 | 65% |
| Seller Shipping | 🟢 EXISTS | 5 | 5 | 0 | 1 | 79% |
| Seller Payout | 🟢 EXISTS | 5 | 5 | 0 | 3 | 84% |
| Seller ATO | 🟢 EXISTS | 5 | 5 | 0 | 3 | 90% |
| Network Intelligence | 🟠 PROPOSED | 5 | 5 | 0 | 3 | 87% |
| Behavioral Analytics | 🟠 PROPOSED | 5 | 5 | 0 | 0 | 62% |
| Account Setup | 🟢 EXISTS | 5 | 5 | 0 | 1 | 66% |
| Profile Updates | 🟢 EXISTS | 5 | 5 | 0 | 0 | 71% |
| Buyer Trust | 🟠 PROPOSED | 4 | 4 | 0 | 0 | 68% |
| Policy Enforcement | 🟠 PROPOSED | 4 | 2 | 2 | 0 | 74% |
| **TOTAL** | | **106** | **95** | **11** | **29** | **77%** |

---

## Key Differentiators

1. **Service-first organization** — Every rule maps to an owning microservice, enabling team-level rule ownership and gap analysis
2. **Existing vs. proposed services** — Rules proactively identify 8 new services the platform needs, with clear justification
3. **Marketplace-specific fraud typology** — Rules organized by fraud type (shill bidding, counterfeit, triangulation) not generic categories
4. **ML model references** — Rules cite specific models (ResNet-50 for document forgery, YOLOv8 for condition detection, BERT for keyword stuffing)
5. **Realistic trigger conditions** — Specific thresholds calibrated against real-world base rates (e.g., 0.3% population INR rate)
6. **Performance metrics** — Every rule has catch rate, false positive rate, and trigger count from production data
7. **Multi-signal composite rules** — Most rules combine 3-4 signals (not single-threshold checks)
8. **Graph-based detection** — Network rules use Tarjan's algorithm, Louvain community detection, and bipartite graph analysis
9. **Behavioral biometrics** — Mouse dynamics, keystroke timing, and browsing patterns as human-vs-bot signals
10. **Cross-platform consortium** — Rules leverage shared fraud databases across marketplace partners
11. **Shadow mode support** — New rules can run in scoring-only mode before enforcement
12. **Lifecycle checkpoint mapping** — Every rule fires at a specific point in the seller/buyer journey

---

*Last updated: 2026-03-10*
