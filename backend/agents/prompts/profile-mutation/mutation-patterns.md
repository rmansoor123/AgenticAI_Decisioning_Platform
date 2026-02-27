---
id: mutation-patterns
agent: profile-mutation
phases: [think, observe, reflect]
priority: high
version: 1
---

# Profile Mutation Patterns

## Suspicious Change Patterns

### High-Risk Mutations
- **Bank account change + immediate payout request:** The most common ATO cashout pattern
- **Email + phone changed simultaneously:** Legitimate users rarely change both contact methods at once
- **Name change on established account:** Legal name changes happen but are rare; verify with documentation
- **Address change to different country:** Cross-border address changes require additional verification
- **Business name change:** Indicates potential business transfer or identity pivot

### Mutation Velocity Signals
| Change Type | Normal Frequency | Suspicious Threshold |
|-------------|-----------------|---------------------|
| Bank account | 1-2 per year | > 2 in 30 days |
| Email address | 1-2 per year | > 1 in 30 days |
| Phone number | 1-2 per year | > 1 in 30 days |
| Shipping address | Varies | > 5 in 7 days |
| Business category | Rare | > 1 in 90 days |

### Change Clustering
- **Coordinated changes:** Multiple fields changed in a single session (within 5 minutes) suggest scripted ATO
- **Sequential changes:** Gradual changes over 24-48 hours suggest careful ATO with reconnaissance
- **Reverting changes:** Changing a field and then changing it back within 24h is unusual

## Account Takeover (ATO) Indicators

### Device and Session Signals
- Profile changes from a new device/IP not previously associated with the account
- Changes made during unusual hours for the account's historical activity pattern
- Session initiated from a different geographic region than the account's normal activity
- Multiple failed login attempts preceding the session where changes were made

### Behavioral Signals
- First activity after extended dormancy (>90 days of inactivity followed by profile changes)
- Access pattern change: mobile-only user suddenly making changes from desktop
- Language/locale settings changed in the same session as profile changes

## Identity Pivot Signals

Identity pivot occurs when a fraudster takes over a legitimate account and gradually transforms it:

1. **Phase 1 — Access:** Gain control via credential stuffing, phishing, or social engineering
2. **Phase 2 — Persistence:** Change email/phone to lock out original owner
3. **Phase 3 — Transformation:** Change business details to match new fraudulent identity
4. **Phase 4 — Exploitation:** Use the account's established trust score for fraudulent transactions

**Detection focus:** Phase 2 is the critical intervention point. Once Phase 3 completes, the account looks legitimate under the new identity.

## Decision Guidance

- Do NOT auto-block on profile changes alone — legitimate users update their information regularly
- Always check whether the change was preceded by successful authentication from a known device
- High-risk changes (bank, email) on accounts with high trust scores or high balances warrant immediate REVIEW
- Low-risk changes (shipping address, display name) on verified accounts can be allowed with monitoring
