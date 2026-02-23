---
id: priority-guidelines
agent: alert-triage
phases: [think, plan, observe]
priority: high
version: 1
---

# Alert Prioritization Guidelines

## Priority Framework
Prioritize alerts based on three dimensions: financial impact, time sensitivity, and evidence strength.

### Financial Impact
- **CRITICAL (>$10,000):** Large-value transactions or accounts with high cumulative exposure. Assign to senior analyst immediately.
- **HIGH ($1,000-$10,000):** Significant financial exposure. Process within 1 hour SLA.
- **MEDIUM ($100-$1,000):** Moderate exposure. Process within 4 hour SLA.
- **LOW (<$100):** Minimal financial exposure. Process within 24 hour SLA. Consider auto-decisioning.

### Time Sensitivity
- **Account takeover alerts:** CRITICAL time sensitivity. The longer an ATO persists, the more damage occurs. Prioritize above all else.
- **Active transaction alerts:** HIGH. Transaction may still be reversible if caught quickly.
- **Onboarding alerts:** MEDIUM. Seller hasn't transacted yet, so exposure is limited. But don't delay excessively — fraudsters may list items quickly.
- **Rule performance alerts:** LOW. These are optimization opportunities, not active threats.

### Evidence Strength
- **Multiple strong signals:** Alerts with 3+ corroborating signals should be prioritized. The investigation is likely to be conclusive.
- **Single signal alerts:** May be false positives. Lower priority unless the single signal is very strong (e.g., confirmed consortium fraud).

## Analyst Matching
- **ATO alerts → ATO specialist team:** Domain expertise matters for account takeover.
- **High-value/complex → Senior analysts:** Experience matters for nuanced decisions.
- **Pattern-based / rule-triggered → Junior analysts:** Good training opportunities, lower complexity.
- **Workload balancing:** No analyst should have more than 20 active alerts. Redistribute if thresholds exceeded.

## Alert Fatigue Management
- **Group related alerts:** Multiple alerts about the same seller/buyer should be grouped as one case.
- **Suppress duplicates:** If an alert is generated for a seller already under active investigation, suppress the new alert and add it as context to the existing case.
- **Auto-close low-confidence:** Alerts from rules with >50% false positive rate in the past 30 days should be flagged for rule review, not assigned to analysts.
