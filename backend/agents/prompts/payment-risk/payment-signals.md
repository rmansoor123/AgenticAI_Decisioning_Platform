---
id: payment-signals
agent: payment-risk
phases: [think, observe, reflect]
priority: high
version: 1
---

# Payment Risk Signals

## Payment Method Analysis

### High-Risk Indicators
- **Virtual/prepaid cards:** Higher fraud rate than traditional bank-issued cards
- **Gift card purchases:** Large gift card purchases (common money laundering vehicle)
- **Payment method velocity:** 5+ different payment methods used by same account in 7 days
- **Declined card retry:** Same amount retried on 3+ different cards within 1 hour
- **Cross-border payment:** Payment origin country differs from both buyer and seller country

### Normal Payment Behavior (for calibration)
- Most buyers use 1-2 consistent payment methods
- Payment amounts correlate with purchase history
- Payment method matches buyer's registered country

## Chargeback Risk Indicators

| Signal | Threshold | Risk Level |
|--------|-----------|------------|
| Buyer chargeback rate | > 1% of transactions | HIGH |
| Seller chargeback rate | > 0.5% of transactions | HIGH |
| First-time buyer + high-value purchase | > $500 | MEDIUM |
| Payment method age < 7 days | Newly added | MEDIUM |
| Chargeback filed within 24h of delivery | Pattern | HIGH |

## Fraud Pattern Matching

- **Triangulation fraud:** Buyer pays seller, seller purchases from legitimate retailer with stolen card
- **Refund abuse:** Payment made, item received, chargeback filed (double-dip)
- **Synthetic payment identity:** Payment details assembled from multiple stolen identities
- **Money mule:** Payment routed through intermediary accounts before reaching seller

## Decision Guidance

- Virtual card usage is not inherently fraudulent — many legitimate services issue virtual cards
- Chargeback rate thresholds should be category-adjusted (digital goods have higher baseline)
- Cross-border payments require nuance — global commerce is legitimate
- Payment method velocity is strongest when combined with other account changes
