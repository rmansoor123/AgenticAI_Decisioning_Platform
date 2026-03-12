---
id: account-setup-signals
agent: account-setup
phases: [think, observe, reflect]
priority: medium
version: 1
---

# Account Setup Risk Signals

## Bank Account Verification

### High-Risk Indicators
- **Country mismatch:** Bank account country differs from business registration country
- **Prepaid card:** Payment method is a prepaid or virtual card rather than established bank account
- **Rapid bank changes:** Bank account changed more than twice in first 30 days
- **Shared bank account:** Same bank account number linked to multiple seller accounts
- **Micro-deposit failure:** Failed micro-deposit verification (account may not belong to seller)

### Normal Setup Behavior (for calibration)
- Legitimate sellers provide one bank account that matches their business location
- Tax ID cross-references match business name and address
- Setup is completed in 1-3 sessions over 1-7 days

## Tax ID Cross-Reference

| Signal | Risk Level | Action |
|--------|------------|--------|
| Tax ID matches business name and address | LOW | APPROVE |
| Tax ID exists but name mismatch | MEDIUM | REVIEW |
| Tax ID not found in registry | HIGH | HOLD |
| Tax ID associated with dissolved/suspended entity | CRITICAL | REJECT |
| Same Tax ID used by another active seller | HIGH | INVESTIGATE |

## Identity Consistency Checks

- Business registration date vs. account creation date — new registrations (< 30 days) are higher risk
- Owner name on bank account vs. business owner name
- Business phone number: VoIP vs. landline (VoIP = slightly elevated risk)
- Business address: virtual office vs. physical location

## Decision Guidance

- Bank country mismatch is a strong signal but not definitive — cross-border businesses exist
- Prepaid cards are common for legitimate micro-businesses in some markets
- Always require at least 2 correlated signals before HOLD/REJECT decisions
- Tax ID validation is the strongest single signal for legitimacy
