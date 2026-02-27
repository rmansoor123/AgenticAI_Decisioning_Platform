---
id: identity-red-flags
agent: seller-onboarding
phases: [think, observe, reflect]
priority: high
version: 2
---

# Identity Fraud Indicators

## Synthetic Identity Detection

Synthetic identities are fabricated by combining real and fake data elements. They are the hardest to detect because each individual data point may look legitimate.

<signal_matrix>
| Signal | Weight | Alone | Combined (2+) |
|--------|--------|-------|---------------|
| Thin credit file (< 2 years history) | MEDIUM | Monitor — legitimate for young adults, immigrants | HIGH if paired with VOIP phone or recent email |
| Credit file age ≠ claimed DOB | HIGH | Review — strong anomaly | CRITICAL — synthetic identity hallmark |
| No digital footprint | LOW | Ignore — some people are private | MEDIUM if paired with thin credit file |
| Authorized user credit building | MEDIUM | Review — could be legitimate credit building | HIGH if across unrelated accounts |
| SSN/Tax ID recently issued or deceased match | CRITICAL | Hard REJECT — no legitimate explanation | CRITICAL — immediate escalation |
</signal_matrix>

## Stolen Identity Detection

When a real person's identity is used without their consent.

<signal_matrix>
| Signal | Weight | Alone | Combined (2+) |
|--------|--------|-------|---------------|
| Address not in credit bureau history | MEDIUM | Common for recent movers | HIGH if paired with new device |
| VOIP/prepaid phone number | LOW | Many legitimate users have VOIP | MEDIUM if paired with other signals |
| Email created < 7 days before application | MEDIUM | Possible for privacy-conscious users | HIGH if paired with other new-account signals |
| Same identity at 3+ platforms (consortium) | HIGH | Strong signal of identity abuse | CRITICAL — fraud ring indicator |
| Device linked to other identities | HIGH | Could be shared/work device | CRITICAL if device linked to known fraud |
</signal_matrix>

## Document Fraud Techniques

<detection_guide>
TEMPLATE-BASED FORGERY:
- Created from downloadable templates. Consistent formatting errors across multiple fakes.
- Detection: Compare against known-good document templates. Check for pixel-level consistency that's TOO perfect (real documents have natural variation from scanning).

PHOTO SUBSTITUTION:
- Original document with replaced photo.
- Detection: Resolution mismatch between photo area and document background. Misaligned edges around photo cutout. EXIF data anomalies.

DATA ALTERATION:
- Legitimate document with modified fields (name, DOB, address).
- Detection: Font inconsistencies within the same document. Alignment shifts. Pixel artifacts around modified text (visible at zoom).

COMPLETE FABRICATION:
- Entirely fake document, no legitimate base.
- Detection: Format validation failures (wrong digit count, invalid check digits, impossible dates). Security features absent. Material/texture inconsistencies in physical documents.
</detection_guide>

## Escalation Decision Matrix

<decision_rules>
SINGLE RED FLAG:
- Note it, increase scrutiny, continue evaluation.
- Do NOT auto-reject. Many red flags have innocent explanations.
- Reduce confidence by 0.05-0.1.

TWO CORRELATED RED FLAGS:
- Route to REVIEW. Specify which flags and their correlation.
- Examples: thin credit + VOIP phone, new email + new device, address mismatch + phone mismatch.
- Reduce confidence by 0.15-0.2.

THREE OR MORE RED FLAGS:
- Strong REJECT recommendation.
- Example: thin credit + VOIP + recently created email + address mismatch → synthetic identity signature.
- Exception: if the seller provides additional documentation that explains the flags, downgrade to REVIEW.

HARD OVERRIDES (no exceptions):
- Sanctions/watchlist match → REJECT regardless of all other factors. Policy engine enforces this.
- SSN/Tax ID matched to deceased individual → REJECT.
- Confirmed fraud from consortium data (within 30 days) → REJECT.
</decision_rules>

## Base Rate Context

Before rejecting, consider: approximately 95-97% of onboarding applications are legitimate. If your analysis would reject more than 10% of a normal applicant pool, recalibrate — you are likely over-weighting weak signals.
