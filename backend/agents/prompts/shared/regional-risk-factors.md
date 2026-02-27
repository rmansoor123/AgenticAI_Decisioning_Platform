---
id: regional-risk-factors
agent: shared
phases: [think, observe]
priority: medium
version: 2
---

# Regional Risk Factors

## Jurisdiction Risk Tiers

<signal_reference>
| Tier | Jurisdictions | Verification Level | Additional Requirements |
|------|--------------|-------------------|----------------------|
| Tier 1 (Standard) | US, UK, EU, Canada, Australia, Japan, Singapore, South Korea | Standard verification | None — strong document databases and regulatory frameworks |
| Tier 2 (Enhanced) | Brazil, India, Mexico, South Africa, UAE, Turkey, Thailand | Standard + additional document | May need video KYC or utility bill verification. Document databases may be incomplete. |
| Tier 3 (High Diligence) | Countries with less standardized document systems | Enhanced due diligence required | Video KYC, multiple document cross-checks, higher minimum confidence threshold (+0.1) |
| Sanctioned | OFAC, EU, UN sanctioned jurisdictions | N/A — hard block | Any match is an immediate REJECT. No override possible. Check current sanctions lists — they change frequently. |
| FATF Grey List | Check current FATF list | Enhanced monitoring | Not a block, but requires additional AML checks and ongoing transaction monitoring |
</signal_reference>

<important>
CRITICAL: Region alone is NEVER sufficient for rejection. A seller from a Tier 3 country with clean verification is as trustworthy as a seller from a Tier 1 country with clean verification. Region affects scrutiny level, not the decision.
</important>

## Cross-Border Risk Signals

<signal_reference>
| Signal | Risk Level | Context |
|--------|-----------|---------|
| Currency mismatch: seller in Country A, pricing in Country B's currency | MEDIUM | Legitimate for international businesses. Check if business has stated international operations. |
| Shipping origin ≠ seller country | MEDIUM | Could be dropshipping (legal) or triangulation fraud. Check if seller disclosed third-party fulfillment. |
| Time zone inconsistency: activity pattern doesn't match claimed location | LOW alone, HIGH combined | VPN users show this legitimately. Combined with other geo-anomalies → investigate. |
| IP geolocation ≠ claimed country AND ≠ any known address | MEDIUM | Business travelers, expats, VPN users all cause this. Only significant with 2+ other signals. |
| Bank account country ≠ seller country ≠ IP country (three-way mismatch) | HIGH | Three-way geographic mismatch is unusual. Legitimate cases exist (international businesses) but rare. |
</signal_reference>

## Document Verification Adjustments by Region

<calibration>
TIER 1 COUNTRIES:
- Electronic verification databases are comprehensive. Trust automated verification results at face value.
- Confidence in automated verification: 0.85-0.95

TIER 2 COUNTRIES:
- Databases may be incomplete. Automated verification returning "not found" does NOT mean the document is fake.
- If automated verification fails, attempt manual verification before concluding fraud.
- Confidence in automated verification: 0.65-0.80
- Recommended: supplement with video KYC for sellers in high-value categories.

TIER 3 COUNTRIES:
- Automated verification may be unreliable. "Not found" is expected for many legitimate documents.
- Always require secondary verification (utility bill, bank statement, video KYC).
- Do NOT reduce confidence based on verification system limitations — reduce based on actual evidence.
- Confidence in automated verification alone: 0.45-0.60
</calibration>

## Regulatory Compliance Context

| Region | Key Requirements | Impact on Decision |
|--------|-----------------|-------------------|
| EU/UK | GDPR (data handling), PSD2 (strong authentication), 6AMLD (AML) | Ensure data minimization. SCA required for transactions > €30. Enhanced monitoring for AML. |
| US | BSA/AML, state money transmitter laws, FCRA (credit data) | KYC must meet BSA standards. Credit data usage requires FCRA compliance. State-by-state licensing for payments. |
| APAC | Singapore: strict AML. India: RBI KYC norms. Japan: FATF-aligned. Others: varied. | Apply the strictest applicable standard. When in doubt, apply Tier 1 standards. |

## Anti-Bias Guidance

When reflecting on decisions involving regional factors:
- Ask: "Would this decision change if the seller were from a Tier 1 country with identical verification results?" If yes, you may be over-weighting region.
- Region is a RISK FACTOR that determines scrutiny level, NOT evidence of fraud.
- Base rates differ by region, but so do legitimate business patterns. A seller from a Tier 2 country is not 2x more likely to be fraudulent — the base rate difference is typically 1-3%.
