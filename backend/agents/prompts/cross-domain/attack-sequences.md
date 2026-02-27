---
id: attack-sequences
agent: cross-domain
phases: [think, observe, reflect]
priority: high
version: 1
---

# Cross-Domain Attack Sequences

## Multi-Step Attack Patterns

Sophisticated fraudsters operate across multiple domains in sequence. Each step builds on the previous one. The goal is to detect the sequence early — ideally after step 1-2 — before the financial damage occurs at step 3-4.

### Pattern: Account Takeover → Payout Drain
1. **Profile mutation** — Change email, phone, or bank details on an established account
2. **Listing manipulation** — Modify prices or create new high-value listings
3. **Transaction burst** — Generate or accept transactions at unusual velocity
4. **Payout acceleration** — Request immediate payout of accumulated funds

**Detection window:** Steps 1-2. Once payouts are initiated, recovery is expensive.

### Pattern: Synthetic Identity → Scale-Up
1. **Onboarding** — Register with synthetic identity (fabricated but valid-looking documents)
2. **Trust building** — Small, legitimate-looking transactions for 30-60 days
3. **Category expansion** — Move from low-value to high-value product categories
4. **Bust-out** — High-volume transactions with no intent to fulfill, then disappear

**Detection window:** Step 1 (document anomalies) or step 3 (sudden category shift).

### Pattern: Return Fraud Ring
1. **Multi-account creation** — Several accounts created from related IPs/devices
2. **Cross-account purchasing** — Accounts buy from each other to generate transaction history
3. **Return cycling** — Systematic returns to extract refunds or replacement goods
4. **Resale** — Unreturned items resold through separate channels

**Detection window:** Step 1-2 via graph analysis of account relationships.

## Domain Progression Signatures

| From Domain | To Domain | Signal | Risk Level |
|-------------|-----------|--------|------------|
| Onboarding | Listing | Category mismatch (registered as books, listing electronics) | MEDIUM |
| Profile | Transaction | Bank detail change followed by large transaction within 24h | HIGH |
| Transaction | Payout | Payout request within 1h of transaction completion | HIGH |
| Listing | Transaction | Price drop >50% followed by sudden sales volume | MEDIUM |
| Returns | Profile | Return spike followed by address change | HIGH |

## Timing Analysis

- **Normal progression:** 7-30 days between domain transitions
- **Suspicious acceleration:** < 48 hours between steps in a known attack pattern
- **Delayed attack:** > 60 days between onboarding and first suspicious activity (trust building phase)

When analyzing timing:
- Short gaps (< 24h) between profile changes and financial actions are highest risk
- Weekend/holiday timing is common for fraud (reduced monitoring coverage)
- Batch operations (multiple changes at exact same timestamp) suggest automation
