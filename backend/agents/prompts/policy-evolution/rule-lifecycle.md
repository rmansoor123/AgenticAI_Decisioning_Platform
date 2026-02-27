---
id: rule-lifecycle
agent: policy-evolution
phases: [think, observe, reflect]
priority: high
version: 1
---

# Rule Lifecycle Management

## Rule Creation Criteria

A new rule should be created when:
- A cluster of 5+ similar fraud events is detected that no existing rule catches
- A known attack pattern emerges with a clear, automatable signature
- Manual analyst reviews repeatedly flag the same pattern

A new rule should NOT be created when:
- The pattern is too narrow (would only catch 1-2 historical cases)
- The pattern relies on features that change frequently (e.g., specific IP ranges)
- An existing rule can be tuned to cover the gap with a threshold adjustment

## Rule States

| State | Description | Transition Criteria |
|-------|-------------|---------------------|
| DRAFT | Proposed, not enforced | Created by agent or analyst |
| SHADOW | Active but non-blocking, logging only | After review approval |
| ACTIVE | Fully enforced, blocking/flagging | After shadow period proves effectiveness |
| DEGRADED | Still active but performance declining | Precision < 70% or recall < 50% |
| RETIRED | Disabled, no longer enforced | After deprecation review |

## Graduation Thresholds

### SHADOW → ACTIVE
- Minimum 14-day shadow period
- Minimum 30 triggers during shadow period
- Precision >= 75% (based on analyst feedback on shadow alerts)
- False positive rate < 20%

### ACTIVE → DEGRADED
- Precision drops below 70% for 7 consecutive days
- False positive rate exceeds 25%
- No true positive triggers in 30 days (rule may be obsolete)

### DEGRADED → RETIRED
- Performance does not recover within 14 days of entering DEGRADED state
- OR analyst review confirms the fraud pattern no longer exists
- OR rule is superseded by a more effective rule

## Retirement Conditions

Before retiring a rule, verify:
1. No active fraud campaigns rely on this rule as the sole detection mechanism
2. At least one other rule or detection method covers the same attack vector
3. The retirement is logged with the reason and approver

## Rule Design Principles

- **Specificity over sensitivity:** A rule that fires accurately on 80% of a pattern is better than one that fires on 95% but generates 40% false positives
- **Composability:** Rules should be independent units that can be combined, not monolithic checks
- **Explainability:** Every rule must have a human-readable description of what it detects and why
- **Reversibility:** Rules can be disabled instantly. Design for safe rollback.
