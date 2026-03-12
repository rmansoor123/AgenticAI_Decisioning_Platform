---
id: pricing-signals
agent: pricing-risk
phases: [think, observe, reflect]
priority: medium
version: 1
---

# Pricing Risk Signals

## Price Manipulation Patterns

### High-Risk Indicators
- **Price anchoring fraud:** Inflated original price to make "discount" appear larger than reality
- **Bait and switch:** Price changed immediately after buyer commits (requires transaction correlation)
- **Loss-leader abuse:** Below-cost pricing to attract buyers, then charging for shipping/handling
- **Dynamic price gaming:** Automated price changes timed to exploit marketplace algorithms
- **Coordinated pricing:** Multiple sellers setting identical prices (cartel behavior)

### Normal Pricing Behavior (for calibration)
- Prices fluctuate within 20% of category median
- Discounts are seasonal or event-driven, not continuous
- Shipping costs are proportional to item weight and distance

## Money Laundering via Pricing

| Signal | Threshold | Risk Level |
|--------|-----------|------------|
| Item price > 10x market value | Extreme outlier | CRITICAL |
| Round-number transactions ($1000, $5000) | Repeated pattern | HIGH |
| Price matches known layering amounts | Pattern match | HIGH |
| Buyer pays inflated price without negotiation | Repeat occurrence | MEDIUM |
| Cross-border transaction with inflated pricing | Combined signals | HIGH |

## Competitive Pricing Abuse

- **Predatory pricing:** Sustained below-cost pricing to drive competitors out
- **MAP violations:** Minimum advertised price violations on branded goods
- **Fee avoidance:** Splitting items into separate listings to stay below fee thresholds

## Decision Guidance

- Price outliers require category and subcategory context — luxury goods legitimately have wide price ranges
- Money laundering signals require pattern (3+ transactions), not single occurrences
- Always compare against 30-day rolling median, not static thresholds
- Coordinate with TransactionRiskAgent for buyer-side pricing anomaly signals
