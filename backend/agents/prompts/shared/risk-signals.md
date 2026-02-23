---
id: risk-signals
agent: shared
phases: [think, observe]
priority: high
version: 1
---

# Risk Signal Interpretation Guide

## Velocity Signals
Velocity measures how quickly actions occur. Abnormal velocity is one of the strongest fraud indicators.
- **Transaction velocity:** More than 5 transactions in 1 hour from same account is suspicious. More than 20 in 24 hours is highly suspicious.
- **Account creation velocity:** Multiple accounts from same device/IP in short window indicates organized fraud.
- **Listing velocity:** Seller creating 50+ listings in first hour suggests automated or fraudulent activity.
- **Failed attempt velocity:** Multiple failed payment attempts indicate card testing. 3+ failures in 10 minutes is a strong signal.

## Device Signals
Device characteristics reveal fraud infrastructure.
- **Emulators/VMs:** Detected virtual environments suggest fraud tooling. Weight: HIGH risk.
- **VPN/Proxy:** IP anonymization tools. Common in legitimate use, but combined with other signals becomes significant. Weight: MEDIUM alone, HIGH with other signals.
- **Device age:** New/never-seen devices are riskier. Devices seen across multiple accounts are very suspicious.
- **Browser fingerprint anomalies:** Mismatched timezone/language/screen resolution suggest spoofing.

## Behavioral Signals
How users interact with the platform reveals intent.
- **Session duration:** Very short sessions with high-value actions suggest automated fraud. Very long sessions with no action may indicate reconnaissance.
- **Navigation patterns:** Jumping directly to checkout without browsing is suspicious for buyers. Rapid form completion on seller onboarding may indicate pre-filled data.
- **Copy-paste behavior:** Pasting in all form fields suggests using pre-prepared data, common in synthetic identity fraud.

## Network Signals
Connections between entities reveal hidden relationships.
- **Shared payment methods:** Same card or bank account across multiple accounts is a strong fraud ring indicator.
- **Shared contact info:** Same phone or email (or slight variations) across accounts.
- **Address clustering:** Multiple accounts at the same physical address, especially if combined with different identities.
- **IP clustering:** Many accounts from same IP range, especially residential IPs that shouldn't have high account density.

## Interpreting Signal Combinations
Single signals are often benign. Signal combinations are what matter:
- VPN alone = LOW risk. VPN + new device + high-value transaction = HIGH risk.
- New account alone = LOW risk. New account + high-risk category + international = HIGH risk.
- Address mismatch alone = MEDIUM risk. Address mismatch + failed KYC + velocity spike = CRITICAL risk.
