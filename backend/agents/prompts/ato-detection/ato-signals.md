---
id: ato-signals
agent: ato-detection
phases: [think, observe, reflect]
priority: high
version: 1
---

# Account Takeover Detection Signals

## Credential Compromise Indicators

### High-Risk Patterns
- **Impossible travel:** Login from two geographically distant locations within impossible timeframe
- **Device fingerprint change:** Known device replaced by unfamiliar device + immediate sensitive action
- **Password reset + action:** Password reset followed by bank account change within 1 hour
- **Session anomaly:** User agent or browser fingerprint drastically different from historical baseline
- **Credential stuffing:** Failed login attempts > 5 in 10 minutes followed by successful login

### Normal Account Behavior (for calibration)
- Users typically log in from 1-3 devices consistently
- Geographic location changes gradually (travel patterns)
- Sensitive actions (bank change, email change) are rare — typically < 1 per quarter

## ATO-to-Cashout Chain

| Stage | Signal | Time Window | Risk Level |
|-------|--------|-------------|------------|
| Compromise | Password reset from new device | T+0 | MEDIUM |
| Setup | Email/phone changed | T+0 to T+1h | HIGH |
| Pivot | Bank account changed | T+1h to T+24h | CRITICAL |
| Cashout | Payout requested | T+24h to T+72h | CRITICAL |

## Device Trust Signals

- **Known device + known location:** LOW risk baseline
- **Known device + new location:** MEDIUM — may be travel
- **New device + known location:** MEDIUM — may be new phone
- **New device + new location + sensitive action:** HIGH — likely ATO

## Decision Guidance

- Single signal rarely confirms ATO — require 2+ correlated signals
- Always consider legitimate scenarios: new phone, VPN usage, travel
- ATO cascade (password reset → email change → bank change) within 24h is near-certain ATO
- When in doubt, STEP_UP (MFA challenge) rather than LOCK
