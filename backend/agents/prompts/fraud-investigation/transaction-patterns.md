---
id: transaction-patterns
agent: fraud-investigation
phases: [think, observe, reflect]
priority: high
version: 2
---

# Transaction Analysis Domain Knowledge

## Velocity Analysis

<signal_reference>
| Pattern | Normal Range | Suspicious Threshold | Critical Threshold |
|---------|-------------|---------------------|--------------------|
| Transactions per hour | 0-5 | 6-15 (3x baseline) | 16+ (investigate immediately) |
| Transactions per day | 1-20 | 21-60 (3x baseline) | 61+ |
| Failed payment attempts in 10 min | 0-1 | 2-3 (monitor) | 4+ (card testing signature) |
| Unique cards used per day | 1-2 | 3-5 | 6+ (stolen card batch) |
| Transaction value growth rate | Gradual over weeks | 2x in 24h | 5x+ in 24h (bust-out) |
</signal_reference>

### Key Velocity Patterns
- **Card testing:** Many small transactions ($0.50-$5.00) in rapid succession (< 2 min apart). The fraudster tests stolen cards before making large purchases. HIGH confidence signal.
- **Bust-out escalation:** Gradually increasing amounts over hours/days. Starts at $10-50 to build trust, then one large transaction ($500+) before disappearing. MEDIUM-HIGH signal — requires amount trend analysis.
- **Holiday/sale spikes:** Legitimate sellers also spike during promotions. Before flagging velocity, check: is there an active sale? Is the category seasonal? Is the seller's history consistent with promotional spikes?

## Amount Analysis

<signal_reference>
| Pattern | Signal Strength | False Positive Risk |
|---------|----------------|-------------------|
| Round numbers at high values ($500.00, $1000.00) | MEDIUM | MODERATE — some business invoicing uses round numbers |
| Just-below-threshold clustering ($499, $999) | HIGH | LOW — strong evidence of threshold awareness |
| Amount inconsistent with business type | HIGH | LOW — book seller processing $5000 is clear anomaly |
| Transaction amount > 10x seller's average | HIGH | MODERATE — could be legitimate large order |
| Negative amount (refund) > original transaction | CRITICAL | LOW — refund fraud signature |
</signal_reference>

## Geographic Analysis

<detection_rules>
IMPOSSIBLE TRAVEL:
- Two transactions from locations requiring travel time exceeding elapsed time between transactions.
- Formula: distance(location1, location2) / elapsed_time > maximum_travel_speed
- Threshold: > 900 km/h (faster than commercial air travel)
- Note: VPN usage can cause false positives. If one location matches the account's historical pattern, the OTHER location is likely the anomaly.

SHIPPING/BILLING MISMATCH:
- Different countries for shipping and billing → HIGH signal
- Same country, different regions → LOW signal (gifts, second homes are common)
- Combine with: first-time buyer, high-value item, high-risk category → escalate

HIGH-RISK ORIGIN + HIGH VALUE:
- Transaction from FATF grey-list country + amount in top 10% for category → REVIEW
- This alone is NOT grounds for BLOCK. Country of origin is a risk factor, not evidence.
</detection_rules>

## Device and Session Analysis

- **Device switching:** Same account, 3+ devices in 1 hour → HIGH signal. 2 devices across a day → NORMAL (phone + computer).
- **Session speed:** Login to checkout in < 60 seconds for high-value item → SUSPICIOUS. Normal checkout takes 2-10 minutes.
- **Fingerprint spoofing:** Browser reports one OS but behavioral timing patterns match another. Indicates fraud tooling.

## ML Model Signal Interpretation

<calibration>
When integrating ML fraud scores with rule-based signals:
- Score 0-30 (LOW): Approve unless 2+ strong rule-based signals contradict.
- Score 31-60 (MEDIUM): Weight equally with rule-based signals. Neither dominates.
- Score 61-85 (HIGH): Strong investigation trigger. Override only with clear evidence of legitimacy.
- Score 86-100 (CRITICAL): Near-certain fraud. Require explicit human approval to override.
- MODEL CONFIDENCE MATTERS: A score of 70 with high confidence is more actionable than 85 with low confidence. Always check the confidence interval.
- MODEL FRESHNESS: If the model hasn't been retrained in 90+ days, reduce its weight by 20% — fraud patterns drift.
</calibration>
