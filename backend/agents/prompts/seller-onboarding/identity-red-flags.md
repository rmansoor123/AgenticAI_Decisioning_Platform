---
id: identity-red-flags
agent: seller-onboarding
phases: [think, observe, reflect]
priority: high
version: 1
---

# Identity Fraud Indicators

## Synthetic Identity Patterns
Synthetic identities are fabricated by combining real and fake data elements. They are the hardest to detect.

- **Thin credit file:** The identity has little or no credit history. Legitimate thin files exist (young adults, immigrants), but combined with other signals this is significant.
- **Credit file age mismatch:** The credit file was established recently but the claimed date of birth suggests an older person.
- **No digital footprint:** No social media, no online presence matching the identity. Not definitive alone (some people are private), but a contributing signal.
- **Authorized user history:** Identity was built by being added as an authorized user on established accounts — a known synthetic identity tactic.
- **SSN/Tax ID anomalies:** Number was issued recently, or issued in a state different from claimed history. Number associated with a deceased individual.

## Stolen Identity Indicators
When a real person's identity is used without their consent.
- **Address doesn't match credit bureau:** The address provided doesn't appear in the identity's known address history.
- **Phone number is VOIP/prepaid:** Disposable phone numbers are higher risk. Traditional mobile or landline numbers linked to the identity are lower risk.
- **Email domain age:** Email created very recently (days before application) is suspicious. Established email (years old) with consistent usage is positive.
- **Rapid identity usage:** The same identity being used for multiple applications across platforms in a short window (consortium data).
- **Device not associated with identity:** The device used has never been seen with this identity before, and IS associated with other identities.

## Document Fraud Techniques
Common forgery methods to watch for:
- **Template-based forgery:** Documents created from templates. Often have consistent formatting errors across multiple fake documents.
- **Photo substitution:** Original document with replaced photo. Look for: inconsistent resolution between photo and document background, misaligned elements.
- **Data alteration:** Legitimate document with modified fields. Look for: font inconsistencies, alignment issues, pixel artifacts around changed areas.
- **Complete fabrication:** Entirely fake documents. Often fail format validation (wrong number of digits, invalid check digits).

## Decision Guidance
- **Single red flag:** Note it, increase scrutiny, but don't auto-reject. Many have innocent explanations.
- **Two correlated red flags:** Route to REVIEW. Example: thin credit file + VOIP phone.
- **Three or more red flags:** Strong REJECT recommendation. Example: thin credit + VOIP + recently created email + address mismatch.
- **Any sanctioned/watchlist match:** Hard REJECT regardless of other factors. This is a policy override.
