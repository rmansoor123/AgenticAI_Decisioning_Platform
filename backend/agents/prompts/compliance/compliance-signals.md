---
id: compliance-signals
agent: compliance
phases: [think, observe, reflect]
priority: high
version: 1
---

# Compliance & AML Signals

## Anti-Money Laundering (AML) Indicators

### High-Risk Patterns
- **Structuring:** Multiple transactions just below reporting thresholds ($9,900 instead of $10,000)
- **Layering:** Rapid movement of funds through multiple accounts or entities
- **Smurfing:** Large amounts broken into small transactions across multiple accounts
- **Round-trip transactions:** Funds sent out and returned through different channels
- **Shell entity transactions:** Transactions involving entities with no apparent business purpose

### Reporting Thresholds
- **CTR (Currency Transaction Report):** > $10,000 single transaction
- **SAR (Suspicious Activity Report):** Any pattern suggesting money laundering regardless of amount
- **Aggregation rule:** Multiple transactions totaling > $10,000 in 24 hours from same source

## Sanctions & Watchlist Screening

| Check | Source | Update Frequency |
|-------|--------|-----------------|
| OFAC SDN List | US Treasury | Daily |
| EU Sanctions | European Commission | Weekly |
| UN Sanctions | UN Security Council | As issued |
| PEP Lists | Various | Monthly |
| Adverse Media | News/regulatory feeds | Continuous |

## Know Your Customer (KYC) Compliance

- **Identity verification:** Government ID + proof of address + selfie match
- **Beneficial ownership:** UBO identified for entities with > 25% ownership
- **Enhanced due diligence (EDD):** Required for high-risk countries, PEPs, complex structures
- **Ongoing monitoring:** Re-verification triggered by material changes or risk escalation

## Decision Guidance

- Structuring is the highest-confidence AML signal — flag immediately for SAR consideration
- Sanctions matches require immediate BLOCK — no exceptions, no thresholds
- PEP status alone doesn't warrant blocking — apply enhanced monitoring
- Always document reasoning thoroughly for regulatory audit trail
- When in doubt, escalate to compliance team rather than auto-deciding
