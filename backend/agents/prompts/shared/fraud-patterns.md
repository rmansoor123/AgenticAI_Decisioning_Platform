---
id: fraud-patterns
agent: shared
phases: [think, observe, reflect]
priority: high
version: 2
---

# Common Fraud Typologies

## First-Party Fraud

The seller or buyer themselves commit fraud — not an external attacker.

<signal_reference>
| Type | Signals | Confidence if Signals Match | Common False Positives |
|------|---------|---------------------------|----------------------|
| Friendly fraud / chargeback abuse | Repeat dispute history (3+ in 90 days), disputes after delivery confirmation, disputes on digital goods | HIGH (pattern is distinctive) | Legitimate disputes on defective products, shipping damage |
| Return fraud | Return rate > 30%, items returned differ from items ordered, wardrobing pattern (return within 48h of delivery) | MEDIUM-HIGH | Sizing issues in clothing, defective product batches |
| Promotion abuse | Shared device fingerprints across accounts, similar email patterns (john1@, john2@, john3@), same payment method | HIGH (technical signals are strong) | Family members sharing a device, corporate accounts |
</signal_reference>

## Third-Party Fraud

An external actor uses stolen or fabricated credentials.

<signal_reference>
| Type | Signals | Detection Window | Key Differentiator |
|------|---------|-----------------|-------------------|
| Stolen identity | Address mismatch with credit bureau, unusual login location, sudden behavior change on established account | Hours to days | Established account with sudden behavioral shift |
| Synthetic identity | Thin credit file + no digital footprint + SSN anomaly + recent authorization history | Onboarding (best) or first 90 days | Pristine credit history with no normal usage patterns — too clean |
| Account takeover (ATO) | Password reset → new device → new shipping address → high-value transaction (within 24h) | Minutes to hours — fastest fraud type | Sequence and timing are key: password reset followed by immediate financial action |
</signal_reference>

## Organized Fraud

Coordinated fraud involving multiple actors or accounts.

<detection_guide>
FRAUD RINGS:
- Multiple accounts with shared attributes: IP ranges, device fingerprints, physical addresses, phone number blocks
- Coordinated timing: activity bursts at the same times across accounts
- Similar listing patterns: same product photos, descriptions, pricing strategies
- Graph analysis is the strongest tool: look for clusters in the entity relationship graph
- Minimum 3 connected accounts to classify as a ring (2 could be coincidence)

MONEY LAUNDERING:
- Rapid buy-sell cycles with minimal margin (selling at 95-100% of purchase price)
- Transactions with no economic rationale (buying and reselling identical items)
- High volume from high-risk jurisdictions with no clear business purpose
- Round-number transactions clustered just below reporting thresholds
- IMPORTANT: money laundering detection has regulatory implications. Flag for compliance team review, do not auto-block without compliance sign-off.

COLLUSION (buyer-seller):
- Reciprocal transactions: A buys from B, then B buys from A
- Artificially inflated prices with agreed returns/chargebacks
- No genuine shipping activity (tracking numbers are fake or recycled)
- Both accounts created around the same time with similar attributes
</detection_guide>

## Platform-Specific Fraud

<signal_reference>
| Type | Signals | Risk Level | Action |
|------|---------|-----------|--------|
| Dropship fraud | Shipping origin ≠ seller address, tracking from retail stores (Amazon, Walmart), long fulfillment times (7+ days) | MEDIUM | Monitor, flag if complaints arise |
| Counterfeit goods | Price 40%+ below market, generic/stolen product photos, no authenticity documentation, seller location far from brand supply chain | HIGH | Review, request authenticity proof |
| Review manipulation | Burst of 5+ positive reviews in 24h, reviewer accounts < 30 days old, identical review language/structure | MEDIUM | Flag for content team, do not block seller |
| Listing SEO abuse | Keyword stuffing in titles, category misplacement, duplicate listings with minor variations | LOW | Automated delisting, warn seller |
</signal_reference>

## Cross-Typology Awareness

Fraudsters often combine multiple typologies. When you identify one type, check for indicators of related types:
- Synthetic identity at onboarding → often followed by counterfeit listings → then money laundering via rapid transactions
- Account takeover → often followed by payout fraud → using changed bank details
- Return fraud → often part of a fraud ring → check for connected accounts
