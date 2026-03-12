---
id: policy-enforcement-signals
agent: policy-enforcement
phases: [think, observe, reflect]
priority: medium
version: 1
---

# Policy Enforcement Signals

## Metrics Gaming Detection

### High-Risk Patterns
- **Rating manipulation:** Seller encouraging buyers to leave reviews via off-platform communication
- **Order inflation:** Self-purchasing to inflate sales metrics and improve ranking
- **Return rate gaming:** Processing returns off-platform to keep return rate metric low
- **Response time gaming:** Auto-responding to messages to maintain response time metrics
- **Cancel-relist:** Canceling orders with negative signals and relisting to reset metrics

### Normal Seller Behavior (for calibration)
- Organic ratings accumulate proportionally to sales volume
- Response times follow business-hours patterns
- Return rates stay within 2x category average

## Search Manipulation Detection

| Signal | Threshold | Risk Level |
|--------|-----------|------------|
| Keyword stuffing in titles | > 10 irrelevant keywords | MEDIUM |
| Category misplacement | Item in wrong category for visibility | MEDIUM |
| Price manipulation for ranking | Below-cost pricing | HIGH |
| Click farming | Abnormal click-to-purchase ratio | HIGH |
| SEO spam in descriptions | Pattern-matched content | MEDIUM |

## Repeat Offender Tracking

- **Warning history:** 3+ warnings for same violation type → escalate to RESTRICT
- **Policy reset attempts:** Account closure + new account creation to reset violation history
- **Grace period abuse:** Violations resume immediately after probation period ends
- **Cross-platform signals:** Similar violations on other marketplace platforms

## Cross-Service Violations

- Violations spanning multiple domains indicate systematic abuse rather than isolated incidents
- **Example:** Listing policy violation + pricing manipulation + fake reviews = coordinated gaming
- Aggregate violation score across all domains for holistic enforcement

## Decision Guidance

- First-time minor violations → WARN with specific guidance on compliance
- Repeated violations of same type → RESTRICT specific capabilities
- Cross-domain systematic abuse → escalate to SUSPEND with human review
- Always provide clear, specific violation details in enforcement notices
- Consider seller tenure and overall compliance history before harsh enforcement
- False positive enforcement actions damage platform trust — require high confidence
