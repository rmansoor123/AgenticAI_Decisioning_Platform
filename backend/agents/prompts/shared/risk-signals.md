---
id: risk-signals
agent: shared
phases: [think, observe]
priority: high
version: 2
---

# Risk Signal Interpretation Guide

## Velocity Signals

Abnormal velocity is one of the strongest fraud indicators. Always compare against the entity's own baseline, not just absolute thresholds.

<signal_reference>
| Signal | Normal | Suspicious | Critical | False Positive Risk |
|--------|--------|-----------|----------|-------------------|
| Transaction velocity | 1-20/day | 3x entity baseline | 5x+ entity baseline | LOW — velocity is distinctive |
| Account creation (same device/IP) | 1 | 2-3 in 24h | 4+ in 24h | LOW |
| Listing creation velocity | 1-10/day | 50+ in first hour | 100+ in first day | MEDIUM — bulk importers are legitimate |
| Failed payment attempts | 0-1/day | 3+ in 10 minutes | 5+ in 10 minutes (card testing) | LOW |
| Profile changes | 1-2/month | 3+ in 24h | 5+ in 1 hour (scripted ATO) | LOW |
| Payout requests | 1-2/week | 3+ in 1 day | Multiple to different bank accounts | LOW |
</signal_reference>

## Device Signals

<signal_reference>
| Signal | Risk Weight Alone | Risk Weight Combined | Notes |
|--------|-------------------|---------------------|-------|
| Emulator/VM detected | HIGH | CRITICAL | Few legitimate reasons to use emulators for commerce |
| VPN/Proxy | LOW | HIGH (with other signals) | Very common legitimate use (privacy, corporate networks) |
| Device never seen before | LOW | MEDIUM | Everyone has a first time. Only significant with other new-account signals. |
| Device linked to multiple identities | HIGH | CRITICAL | Shared household devices exist, but 5+ identities → fraud operation |
| Browser fingerprint anomalies (timezone ≠ claimed location, spoofed UA) | MEDIUM | HIGH | Indicates deliberate concealment. Some privacy tools cause this legitimately. |
| Device age < 24h (just set up) | LOW | MEDIUM | Factory resets happen, new devices are common. Only significant with velocity. |
</signal_reference>

## Behavioral Signals

<detection_guide>
SESSION PATTERNS:
- Very short sessions (< 60s) + high-value action → SUSPICIOUS. Automated or pre-planned.
- Very long sessions (> 2h) with no action → LOW concern. Could be idle tab.
- Normal session: 2-15 minutes with browsing → checkout flow.

NAVIGATION PATTERNS:
- Direct to checkout without browsing (buyer) → MEDIUM. Could be repeat purchase or saved item.
- Direct to high-value listing creation without exploring platform (seller) → MEDIUM. Experienced seller or pre-prepared fraud.
- Rapid form completion (seller onboarding < 2 minutes) → MEDIUM. Pre-filled data suggests preparation. Legitimate for tech-savvy applicants.

COPY-PASTE BEHAVIOR:
- All form fields filled via paste → MEDIUM. Common in synthetic identity fraud (data prepared in advance).
- But also common for legitimate users who keep their info in a password manager. Weight only with other signals.
</detection_guide>

## Network / Graph Signals

<signal_reference>
| Signal | Threshold | Risk Level | Investigation Action |
|--------|-----------|-----------|---------------------|
| Shared payment method across accounts | 2 accounts | MEDIUM | Check if accounts are from same business |
| Shared payment method across accounts | 3+ accounts | HIGH | Likely fraud ring — investigate all connected accounts |
| Shared contact info (phone/email variants) | 2 accounts | LOW | Could be family |
| Shared contact info (phone/email variants) | 3+ accounts | HIGH | john1@/john2@/john3@ pattern = ring |
| Same physical address, different identities | 2 accounts | LOW | Roommates, family |
| Same physical address, different identities | 4+ accounts | HIGH | Exceeds normal household density |
| IP cluster (many accounts from narrow IP range) | 5+ accounts from /24 range | MEDIUM | Could be corporate/university network |
| IP cluster + device cluster + similar creation times | 3+ matching | CRITICAL | Strong fraud ring signature |
</signal_reference>

## Signal Combination Rules

<calibration>
Single signals are often benign. Combinations are what distinguish fraud from noise.

COMBINATION ESCALATION:
- 1 signal → Base risk level of that signal
- 2 correlated signals → Escalate one tier (e.g., LOW+LOW → MEDIUM)
- 3+ correlated signals → Escalate two tiers (e.g., MEDIUM+MEDIUM+LOW → CRITICAL)

EXAMPLES:
- VPN alone = LOW. VPN + new device + high-value transaction = HIGH.
- New account alone = LOW. New account + high-risk category + international = HIGH.
- Address mismatch alone = MEDIUM. Address mismatch + failed KYC + velocity spike = CRITICAL.
- Thin credit file alone = LOW. Thin credit + VOIP phone + new email = HIGH (synthetic identity signature).

ANTI-ESCALATION (signals that REDUCE concern):
- Established account (> 1 year active) with consistent patterns → reduce all other signals by one tier
- Previously successful verification → reduce identity-related signals by one tier
- Transaction consistent with seller's historical pattern → reduce velocity/amount signals by one tier
</calibration>
