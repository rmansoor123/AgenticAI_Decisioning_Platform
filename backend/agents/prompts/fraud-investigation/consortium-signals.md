---
id: consortium-signals
agent: fraud-investigation
phases: [think, observe]
priority: medium
version: 1
---

# Consortium and Shared Intelligence

## What Consortium Data Means
Consortium data is shared fraud intelligence across multiple merchants/platforms. It provides signals you cannot generate from your own data alone.

## Interpreting Consortium Signals
- **Consortium velocity:** Number of applications or transactions across ALL participating platforms. High consortium velocity means the identity/payment method is being used aggressively across the ecosystem — strong fraud signal.
- **Shared negative data:** Chargebacks, fraud confirmations, account closures from other platforms. Any confirmed fraud at another platform is a strong signal but not definitive (false positives happen).
- **Consortium fraud score:** Aggregate risk score across platforms. Treat as HIGH confidence signal — it represents collective intelligence.

## Freshness and Confidence
- **Data within 24 hours:** Very high confidence. The signal is current and actionable.
- **Data 1-7 days old:** High confidence. Still very relevant.
- **Data 7-30 days old:** Medium confidence. May reflect resolved issues.
- **Data older than 30 days:** Low confidence. Use as context, not as primary decision factor.

## Cross-Merchant Pattern Detection
- **Same identity, multiple merchants:** If the same identity is onboarding at 3+ platforms simultaneously, this is a strong synthetic identity or fraud ring indicator.
- **Same payment method, different identities:** Different people using the same payment method across platforms — indicates shared fraudulent payment instruments.
- **Velocity across merchants:** Even if each merchant sees low individual velocity, the aggregate velocity across the consortium reveals the true activity level.
