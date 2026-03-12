---
id: buyer-trust-signals
agent: buyer-trust
phases: [think, observe, reflect]
priority: medium
version: 1
---

# Buyer Trust Signals

## First-Purchase Risk Assessment

### High-Risk Indicators
- **New account + high value:** First purchase > $500 on account < 7 days old
- **No browsing history:** Direct purchase without prior browsing/search activity
- **Mismatched shipping:** Shipping address differs from billing and account address
- **Gift card payment:** First purchase made entirely with gift cards
- **Express shipping:** Expedited shipping on first purchase (urgency = higher fraud rate)

### Normal First-Purchase Behavior (for calibration)
- First purchases are typically lower value (< $100)
- New buyers browse for 2-7 days before first purchase
- Shipping and billing addresses usually match for first purchase

## Chargeback History Analysis

| Signal | Threshold | Risk Level |
|--------|-----------|------------|
| Historical chargeback rate | > 1% | HIGH |
| Chargebacks in last 30 days | > 0 | MEDIUM |
| Chargeback reason: "not received" | > 2 in 90 days | HIGH |
| Chargeback reason: "unauthorized" | > 1 | CRITICAL |
| Chargeback + re-purchase pattern | Repeat cycle | HIGH |

## Multi-Account Detection

- **Email pattern:** Sequential email addresses (user1@, user2@, user3@)
- **Device sharing:** Same device fingerprint across multiple buyer accounts
- **Address overlap:** Different accounts with same shipping address
- **Behavioral similarity:** Identical browsing and purchasing patterns

## Purchase Velocity Tracking

- **Rapid purchases:** 10+ orders in 1 hour from same buyer
- **Category spread:** Purchases across 5+ unrelated categories in single session
- **Amount escalation:** Purchase amounts increasing rapidly (testing limits)
- **Repeat purchase:** Same item purchased 5+ times (potential reselling or arbitrage)

## Decision Guidance

- First-purchase risk should be calibrated by category — electronics have 3x baseline fraud
- Chargeback history is the strongest predictor of future fraud behavior
- Multi-account detection should trigger investigation, not immediate blocking
- Purchase velocity thresholds should scale with buyer trust score (established buyers get more latitude)
- RESTRICT is preferred over outright blocking — limit purchase amounts until trust is established
