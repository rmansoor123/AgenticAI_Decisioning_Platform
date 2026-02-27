---
id: payout-signals
agent: payout-risk
phases: [think, observe, reflect]
priority: high
version: 1
---

# Payout Risk Signals

## Payout Timing Anomalies

### High-Risk Timing Patterns
- **Accelerated payout request:** Payout requested within 1 hour of transaction completion (normal: 3-7 days)
- **Holiday/weekend rush:** Payout requests clustered on Friday evenings or before long weekends (exploiting reduced review staffing)
- **Batch timing:** Multiple payout requests at identical timestamps (automated/scripted behavior)
- **Post-change payout:** Payout requested within 24 hours of bank account or profile change

### Normal Payout Behavior (for calibration)
- Most legitimate sellers request payouts on regular schedules (weekly/biweekly)
- New sellers typically wait 7-14 days before first payout request
- Payout amounts should correlate with transaction volume over the payout period

## Velocity Patterns

| Signal | Threshold | Risk Level |
|--------|-----------|------------|
| Payout requests per day | > 3 | HIGH |
| Payout amount vs. 30-day average | > 300% | HIGH |
| Payout frequency change (from monthly to daily) | Sudden shift | MEDIUM |
| Cumulative payout in first 30 days | > $10,000 | MEDIUM |
| Multiple payouts to different bank accounts in 7 days | > 1 | HIGH |

## Shell Company Indicators

When assessing whether a seller may be a shell company used for money laundering:

- **Business age:** Registered < 90 days with immediate high-volume payouts
- **Transaction pattern:** All transactions are round numbers (e.g., $100, $500, $1000)
- **Counterparty concentration:** 80%+ of transactions from fewer than 3 buyers
- **Product-delivery mismatch:** High-value "digital goods" with no delivery tracking
- **Geographic mismatch:** Business registered in one country, bank account in another, IP from a third
- **Rapid bank changes:** Bank account changed more than twice in 30 days

## Decision Guidance

- A single payout timing anomaly is rarely sufficient for blocking — combine with other signals
- Shell company indicators require at least 3 concurrent signals before recommending BLOCK
- Always check if the seller has a legitimate explanation (e.g., seasonal business, product launch)
- New sellers with strong verification (fully KYC'd, verified bank) get higher tolerance for initial payout anomalies
