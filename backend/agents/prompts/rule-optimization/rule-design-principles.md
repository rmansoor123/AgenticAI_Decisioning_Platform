---
id: rule-design-principles
agent: rule-optimization
phases: [think, observe, reflect]
priority: high
version: 1
---

# Rule Engineering Best Practices

## Rule Quality Metrics
- **Precision:** Of all transactions the rule flags, what percentage are actually fraudulent? Target: >60% for production rules.
- **Recall:** Of all fraudulent transactions, what percentage does this rule catch? Balance against precision.
- **False positive rate:** Percentage of legitimate transactions incorrectly flagged. Target: <5% for customer-facing rules.
- **Coverage:** What percentage of total fraud does this rule address? Rules covering <1% of fraud may not be worth the operational cost.

## Threshold Tuning Methodology
- **Never change thresholds by more than 10% in a single adjustment.** Large changes can have unpredictable effects.
- **Use simulation before deploying.** Run proposed threshold against historical data to predict impact.
- **Monitor for 7 days after change.** Track precision, recall, and false positive rate daily.
- **Revert if false positive rate increases by >20% relative.** Customer friction costs compound quickly.

## Rule Overlap and Redundancy
- **Identify overlapping rules:** Two rules catching the same transactions add operational cost without additional fraud prevention.
- **Consolidate or specialize:** Either merge overlapping rules or specialize each to catch distinct fraud subtypes.
- **Measure marginal value:** If removing a rule would miss <0.1% of fraud, consider retiring it.

## Rule Lifecycle
- **New rule (0-30 days):** Shadow mode — log but don't block. Measure precision on flagged transactions.
- **Validated rule (30-90 days):** Production mode with close monitoring. Weekly precision reviews.
- **Established rule (90+ days):** Standard monitoring. Monthly performance reviews.
- **Deprecated rule:** If precision drops below 40% for 30 consecutive days, recommend retirement.

## A/B Testing Rule Changes
- **Traffic split:** 50/50 is ideal for statistical significance. Minimum 20% treatment group.
- **Duration:** Minimum 7 days, ideally 14 days to capture weekly patterns.
- **Success metric:** Primary metric should be fraud catch rate. Secondary: false positive rate, customer escalation rate.
- **Statistical significance:** Require p < 0.05 before declaring a winner. Don't peek at results before minimum duration.
