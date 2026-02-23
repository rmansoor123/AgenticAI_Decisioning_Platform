---
id: transaction-patterns
agent: fraud-investigation
phases: [think, observe, reflect]
priority: high
version: 1
---

# Transaction Analysis Domain Knowledge

## Velocity Analysis
- **Normal velocity baseline:** Most legitimate sellers process 1-20 transactions per day. Spikes above 3x normal daily volume warrant investigation.
- **Micro-transaction patterns:** Many small transactions ($1-5) in rapid succession indicate card testing. The fraudster tests stolen cards before making large purchases.
- **Escalation pattern:** Gradually increasing transaction amounts over hours/days. Starts small to build trust, then one large fraudulent transaction.

## Amount Analysis
- **Round number transactions:** Legitimate purchases rarely end in .00 at high values. Multiple $500.00 or $1000.00 transactions are suspicious.
- **Just-below-threshold:** Transactions clustered just below review thresholds (e.g., multiple $499 transactions when $500 triggers review) indicate threshold knowledge.
- **Inconsistent with business type:** A book seller processing $5,000 transactions, or a luxury goods seller processing $5 transactions.

## Geographic Analysis
- **Impossible travel:** Two transactions from locations that are geographically impossible to travel between in the elapsed time. (e.g., New York and London 30 minutes apart)
- **Shipping/billing mismatch:** Especially significant when shipping address is in a different country than billing address.
- **High-risk origin + high-value:** Transaction originating from high-risk region with above-average value.

## Device and Session Analysis
- **Device switching:** Same account using multiple devices in short window. One device per session is normal; 3+ devices in an hour is suspicious.
- **Session anomalies:** Very short session with high-value purchase (under 60 seconds from login to checkout).
- **Fingerprint mismatch:** Browser reports one OS/device but behavioral signals suggest another.

## ML Model Signal Interpretation
When ML models provide a fraud score:
- **Score 0-30:** Low risk. Approve unless other strong signals present.
- **Score 31-60:** Medium risk. Combine with rule-based signals for final decision.
- **Score 61-85:** High risk. Should trigger investigation regardless of other signals.
- **Score 86-100:** Very high risk. Strong recommendation to block.
- **Model confidence matters:** A score of 70 with high model confidence is more actionable than 80 with low confidence.
