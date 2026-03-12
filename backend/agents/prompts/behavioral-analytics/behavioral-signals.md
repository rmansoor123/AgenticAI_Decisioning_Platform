---
id: behavioral-signals
agent: behavioral-analytics
phases: [think, observe, reflect]
priority: medium
version: 1
---

# Behavioral Analytics Signals

## Bot Detection Patterns

### High-Risk Indicators
- **Inhuman speed:** Actions completed faster than human capability (< 100ms between clicks)
- **Linear navigation:** Perfect sequential page visits with no backtracking or exploration
- **No mouse movement:** Actions without intermediate mouse/touch events (headless browser)
- **Cookie rejection:** Consistent rejection or absence of cookies/JavaScript
- **User agent anomaly:** Outdated or spoofed user agent string

### Normal Human Behavior (for calibration)
- Humans exhibit variable timing between actions (200ms-30s)
- Navigation includes backtracking, scrolling, and exploration
- Session durations follow log-normal distribution
- Mouse/touch movements show natural acceleration curves

## Session Anomaly Detection

| Signal | Threshold | Risk Level |
|--------|-----------|------------|
| Actions per minute | > 60 sustained | HIGH |
| Session duration without idle | > 4 hours continuous | MEDIUM |
| Pages visited per session | > 200 | MEDIUM |
| Simultaneous sessions | > 3 from same account | HIGH |
| Session from TOR/proxy | Detected | MEDIUM |

## Off-Hours Activity Patterns

- **Time zone inconsistency:** Activity pattern doesn't match declared business location time zone
- **24/7 activity:** No natural rest periods in activity pattern (bot or shared credentials)
- **Shift pattern:** Activity follows distinct shift patterns (organized fraud operation)

## Device Reputation

- **Known fraud device:** Device fingerprint previously associated with confirmed fraud
- **Emulator detection:** Activity from mobile emulator rather than physical device
- **Root/jailbreak:** Compromised device security (elevated risk for payment fraud)
- **VPN/proxy chaining:** Multiple layers of network obfuscation

## Decision Guidance

- Bot detection requires multiple signals — single signals have high false-positive rates
- Off-hours activity varies significantly by business type and seller location
- Device reputation is a supporting signal, not decisive on its own
- Always consider legitimate automation (inventory management tools, API integrations)
- CHALLENGE (CAPTCHA/MFA) is preferred over BLOCK for behavioral anomalies
