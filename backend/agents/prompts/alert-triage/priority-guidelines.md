---
id: priority-guidelines
agent: alert-triage
phases: [think, plan, observe]
priority: high
version: 2
---

# Alert Prioritization Guidelines

## Priority Scoring Framework

Compute priority from three independent dimensions. Final priority = highest individual dimension score.

### Dimension 1: Financial Impact

| Tier | Exposure | SLA | Auto-Decision Eligible? |
|------|----------|-----|------------------------|
| CRITICAL | > $10,000 or 100+ affected accounts | 15 minutes — assign to senior analyst immediately | No — always human review |
| HIGH | $1,000 - $10,000 | 1 hour | No |
| MEDIUM | $100 - $1,000 | 4 hours | Yes, if confidence > 0.85 |
| LOW | < $100 | 24 hours | Yes, if confidence > 0.7 |

### Dimension 2: Time Sensitivity

| Alert Type | Time Class | Rationale |
|-----------|-----------|-----------|
| Account takeover (ATO) | CRITICAL | Every minute increases damage. Password reset + high-value action = immediate. |
| Active transaction in progress | HIGH | Transaction may still be reversible. Block window is short. |
| Payout request pending | HIGH | Once payout executes, recovery requires external processes. |
| Seller onboarding flagged | MEDIUM | Seller hasn't transacted yet, but may list items quickly. |
| Listing anomaly detected | MEDIUM | No financial damage yet, but counterfeit listings damage trust. |
| Rule performance degradation | LOW | Optimization opportunity, not active threat. Batch process. |
| Historical pattern match | LOW | Informational. No immediate action needed. |

### Dimension 3: Evidence Strength

<calibration>
- 3+ corroborating signals from independent sources → BOOST priority by one tier. Investigation will likely be conclusive.
- 2 corroborating signals → No adjustment.
- Single signal → REDUCE priority by one tier unless the signal is CRITICAL (e.g., confirmed consortium fraud, sanctions match).
- ML model + rule-based signal agree → Treat as 2 corroborating signals.
- ML model + rule-based signal disagree → Route to senior analyst regardless of other factors.
</calibration>

## Analyst Matching Rules

<routing_rules>
EXPERTISE MATCHING (primary):
- ATO alerts → ATO specialist team (domain expertise critical for rapid response)
- Financial fraud / money laundering → Financial crime team
- Counterfeit / listing fraud → Content integrity team
- High-value / complex → Senior analysts (experience matters for nuanced decisions)
- Pattern-based / rule-triggered → Junior analysts (good training, lower complexity)

LOAD BALANCING (secondary):
- No analyst should exceed 80% of max_load. At 80%+, route to next-best expertise match.
- If ALL analysts in a team exceed 80%, escalate to team lead with overflow flag.

CONTEXT CONTINUITY (tertiary):
- If analyst is already investigating the same seller/buyer → route to them (continuity value).
- If analyst handled a related case in last 7 days → prefer them (context is fresh).
- Override continuity if the analyst is at capacity.
</routing_rules>

## Alert Fatigue Prevention

<decision_rules>
GROUP RELATED ALERTS:
- Multiple alerts about the same seller within 1 hour → merge into single case.
- Alerts from the same rule about the same entity → deduplicate, keep highest-priority instance.

SUPPRESS DUPLICATES:
- If seller is already under active investigation → suppress new alert, add as context to existing case.
- If same alert fired < 24h ago for same entity → suppress unless new evidence is present.

AUTO-CLOSE LOW-VALUE:
- Alerts from rules with > 50% false positive rate in past 30 days → flag rule for review, do not assign to analyst.
- Single LOW-priority alerts with no corroborating signals and ML score < 30 → auto-close with logging.

ESCALATION TRIGGERS:
- Alert has been open > 2x its SLA without assignment → auto-escalate to team lead.
- Alert involves a seller with 3+ previous investigations → flag as repeat offender, assign to senior.
</decision_rules>
