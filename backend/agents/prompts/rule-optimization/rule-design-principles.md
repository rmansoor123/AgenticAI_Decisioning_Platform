---
id: rule-design-principles
agent: rule-optimization
phases: [think, observe, reflect]
priority: high
version: 2
---

# Rule Engineering Best Practices

## Rule Quality Metrics — Target Thresholds

<signal_reference>
| Metric | Definition | Production Target | Warning Threshold | Retirement Threshold |
|--------|-----------|-------------------|-------------------|---------------------|
| Precision | Flagged transactions that are actually fraud | > 60% | < 50% | < 40% for 30 days |
| Recall | Fraud transactions caught by this rule | > 30% for any single rule | < 20% | < 10% |
| False positive rate | Legitimate transactions incorrectly flagged | < 5% for customer-facing | > 8% | > 15% |
| Coverage | % of total fraud this rule addresses | > 1% | < 0.5% | < 0.1% (not worth operational cost) |
| Alert-to-action ratio | Alerts that result in analyst action | > 40% | < 25% | < 15% (alert fatigue generator) |
</signal_reference>

## Threshold Tuning Methodology

<decision_rules>
ADJUSTMENT LIMITS:
- Never change a threshold by more than 10% in a single adjustment. Large changes cause unpredictable cascading effects.
- Maximum 2 threshold changes per rule per week. Allow time for impact measurement.

PRE-DEPLOYMENT VALIDATION:
1. Run proposed threshold against 30 days of historical data
2. Calculate projected precision, recall, and false positive rate
3. Compare with current performance: improvement must exceed 5% in primary metric
4. If false positive rate increases by > 20% relative, reject the change regardless of other improvements

POST-DEPLOYMENT MONITORING:
- Day 1-3: Check hourly for anomalies (volume spikes, precision crashes)
- Day 4-7: Check daily, compare with pre-change baseline
- Day 8-14: Weekly review, declare success or revert
- Revert immediately if false positive rate increases > 20% relative OR precision drops below retirement threshold
</decision_rules>

## Rule Overlap and Redundancy Analysis

<detection_guide>
IDENTIFYING OVERLAP:
- Two rules flagging > 70% of the same transactions → significant overlap
- Calculate: overlap_rate = |flagged_by_both| / |flagged_by_either|
- overlap_rate > 0.7 → consolidate or specialize
- overlap_rate 0.3-0.7 → review for specialization opportunity
- overlap_rate < 0.3 → independent rules, no action needed

RESOLUTION OPTIONS:
1. CONSOLIDATE: Merge into single rule with combined logic (when both catch same fraud subtype)
2. SPECIALIZE: Narrow each rule to catch distinct fraud subtypes (when overlap is accidental)
3. RETIRE ONE: If one rule strictly dominates (higher precision AND recall), retire the other
4. KEEP BOTH: If they catch different edge cases despite overlap, the redundancy may be valuable as defense-in-depth

MEASURING MARGINAL VALUE:
- Simulate removing the rule: how many fraud cases would be missed?
- If removing a rule misses < 0.1% of fraud AND another rule covers 90%+ of the same cases → retire
- If removing a rule misses > 1% of fraud → keep regardless of overlap
</detection_guide>

## Rule Lifecycle States

| State | Duration | Actions | Graduation Criteria |
|-------|----------|---------|-------------------|
| SHADOW (new) | 14-30 days | Log only, no blocking | Precision > 60%, 30+ triggers, FP rate < 15% |
| PRODUCTION (validated) | 30-90 days | Active blocking + close monitoring | Weekly precision reviews, stable metrics |
| ESTABLISHED (mature) | 90+ days | Active + standard monitoring | Monthly performance reviews |
| DEGRADED (declining) | Max 14 days | Active + daily monitoring | Must recover or retire |
| RETIRED (end of life) | Permanent | Disabled, logged | Review before reactivation |

## A/B Testing Rule Changes

<calibration>
EXPERIMENT DESIGN:
- Traffic split: 50/50 for statistical power. Minimum 20% treatment.
- Duration: Minimum 7 days, ideal 14 days (capture weekly patterns).
- Sample size: Minimum 100 rule triggers in each arm before analysis.

SUCCESS METRICS (in priority order):
1. Primary: Fraud catch rate (recall)
2. Secondary: False positive rate
3. Tertiary: Customer escalation rate, analyst time per alert

STATISTICAL RIGOR:
- Require p < 0.05 before declaring a winner.
- Do NOT peek at results before minimum duration — early stopping inflates false discovery rate.
- If results are inconclusive after 14 days, extend to 21 days. If still inconclusive, the difference is likely not meaningful — keep the simpler rule.
</calibration>
