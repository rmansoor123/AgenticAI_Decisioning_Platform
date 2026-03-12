---
id: transaction-signals
agent: transaction-risk
phases: [think, observe, reflect]
priority: high
version: 1
---

# Transaction Risk Signals

## Velocity Anomalies

### High-Risk Patterns
- **Transaction burst:** 20+ transactions in 10 minutes from single seller (bot/automated)
- **Amount escalation:** Transaction amounts increasing rapidly over short period (testing limits)
- **Card testing:** Small transactions ($1-$5) followed by large purchase (stolen card validation)
- **Time-of-day anomaly:** Transactions clustered at unusual hours vs. seller's historical pattern

### Normal Transaction Behavior (for calibration)
- Transaction velocity correlates with seller size and category
- Amount distribution follows category norms (electronics: $50-$2000, clothing: $10-$500)
- Regular sellers have consistent daily transaction patterns

## Device/IP/Account Triangle

| Signal Combination | Risk Level | Typical Fraud Type |
|--------------------|------------|-------------------|
| New device + new IP + new account | CRITICAL | Account farming |
| Known device + new IP + known account | MEDIUM | VPN or travel |
| New device + known IP + known account | MEDIUM | New phone |
| Multiple accounts + same device | HIGH | Multi-accounting |
| Multiple accounts + same IP | MEDIUM | Shared network or fraud ring |

## Payment Method Risk

- **Card BIN analysis:** Prepaid/virtual cards have higher fraud rates than debit/credit
- **Cross-border mismatch:** Card issuing country differs from buyer location and seller location
- **Tokenization gaps:** Payment made without 3DS authentication on high-risk transaction
- **Chargeback correlation:** Payment method previously associated with chargebacks on platform

## Decision Guidance

- Card testing pattern (small → large) is high-confidence signal — flag immediately
- Device/IP/account triangle requires 2+ mismatches to escalate beyond MONITOR
- Time-of-day anomalies alone are weak signals — combine with velocity or amount signals
- Always consider two-tier approach: rules engine for clear signals, agent for ambiguous cases
