---
id: consortium-signals
agent: fraud-investigation
phases: [think, observe]
priority: medium
version: 2
---

# Consortium and Shared Intelligence

## What Consortium Data Is

Consortium data is shared fraud intelligence across multiple merchants and platforms. It provides signals you cannot generate from your own data alone — the collective view of an identity, payment method, or device across the entire ecosystem.

## Signal Interpretation Matrix

<signal_reference>
| Consortium Signal | Freshness: < 24h | Freshness: 1-7 days | Freshness: 7-30 days | Freshness: > 30 days |
|---|---|---|---|---|
| Confirmed fraud at another platform | CRITICAL — act immediately | HIGH — very relevant | MEDIUM — may be resolved | LOW — context only |
| High velocity across platforms | HIGH — active attack | HIGH — ongoing campaign | MEDIUM — may have stopped | LOW |
| Chargeback at another merchant | HIGH — pattern indicator | MEDIUM-HIGH | MEDIUM | LOW — single old chargeback is common |
| Account closure at another platform | MEDIUM — investigate reason | MEDIUM | LOW-MEDIUM | LOW |
| Consortium fraud score > 80 | CRITICAL | HIGH | MEDIUM-HIGH | MEDIUM |
| Consortium fraud score 50-79 | HIGH | MEDIUM | MEDIUM | LOW |
| Consortium fraud score < 50 | LOW | LOW | LOW | Ignore |
</signal_reference>

## Cross-Merchant Pattern Detection

<detection_rules>
SAME IDENTITY, MULTIPLE MERCHANTS:
- Same name + DOB + SSN at 3+ platforms within 30 days → CRITICAL. Synthetic identity or fraud ring.
- Same name at 2 platforms → LOW alone. People sell on multiple platforms legitimately.
- Key differentiator: timing. Simultaneous applications (same week) are suspicious. Staggered over months is normal.

SAME PAYMENT METHOD, DIFFERENT IDENTITIES:
- Same card/bank account used by 2+ different identities → HIGH. Shared fraudulent payment instruments.
- Exception: business accounts where multiple authorized users share a corporate card — check if identities are from the same business.

SAME DEVICE, DIFFERENT IDENTITIES:
- Same device fingerprint across 3+ identities → HIGH. Fraud operation using one machine.
- Same device across 2 identities → MEDIUM. Could be shared household device.
- Combined with same IP + same device + different identities → CRITICAL.

AGGREGATE VELOCITY:
- Individual merchant sees 2 transactions/day (normal). But consortium shows 40 transactions/day across 20 merchants → HIGH.
- Always check aggregate velocity. Low per-merchant activity can mask high ecosystem-wide activity.
</detection_rules>

## Decision Guidance for Consortium Signals

<decision_rules>
- Consortium data is HIGH-CONFIDENCE because it represents collective intelligence from multiple independent sources.
- However, consortium data can contain FALSE POSITIVES: a chargeback at another merchant may have been resolved in the customer's favor.
- ALWAYS check freshness before weighting consortium signals. Data > 30 days old should be context, not primary evidence.
- NEVER reject solely on consortium fraud score without your own investigation. Use consortium data to guide WHERE to investigate, not as the final answer.
- If consortium data contradicts your own evidence (e.g., consortium says high risk but your verification is clean), note the discrepancy explicitly and route to REVIEW.
</decision_rules>
