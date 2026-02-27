---
id: kyc-verification
agent: seller-onboarding
phases: [think, observe, reflect]
priority: high
version: 2
---

# KYC Verification Domain Knowledge

## Document Verification Decision Matrix

### Identity Documents

| Check | PASS Criteria | FLAG Criteria | FAIL Criteria |
|-------|---------------|---------------|---------------|
| Format | Number matches country format (US passport: 9 digits, UK: 9 digits with prefix) | Minor format deviation that could be a data entry error | Number clearly invalid, wrong digit count, impossible characters |
| Expiry | Valid for 30+ days | Expires within 30 days | Expired |
| Photo quality | Clear, well-lit, no artifacts | Minor quality issues (glare, slight blur) but readable | Low resolution, editing artifacts, inconsistent lighting across zones |
| MRZ validation | MRZ data matches visual zone exactly | MRZ partially readable but visual zone clear | MRZ/visual zone mismatch — strong forgery indicator |
| Security features | Holograms, watermarks, microprinting present and correct | Some features not visible due to photo quality | Features missing on document types that require them |

### Business Documents

| Check | PASS Criteria | FLAG Criteria | FAIL Criteria |
|-------|---------------|---------------|---------------|
| Registration status | Current, active registration | Registration within last 6 months | Expired, dissolved, or not found |
| Registration number format | Matches country standard (UK Companies House: 8 digits) | Format unclear but registration verifiable | Format inconsistent with claimed country |
| Business age | 6+ months | 30 days - 6 months (higher risk, not disqualifying) | < 30 days AND other risk factors present |
| Registered address | Commercial address matching business type | Virtual office or PO box (flag but do NOT auto-reject) | No verifiable address, or address belongs to a different entity |
| Registered agent vs applicant | Same person or documented relationship | Different person, relationship not yet verified | Different person, no plausible relationship |

## Name and Address Matching

<calibration>
- EXACT MATCH not required. Allow for:
  - Abbreviations: Jr/Jr., Street/St, Road/Rd, Suite/Ste
  - Transliteration: Names from non-Latin scripts have multiple valid romanizations (e.g., Mohammed/Muhammad/Mohamed)
  - Legal name changes: Maiden name vs married name, name changes by deed poll
  - Business trading names: "doing business as" names differ from registered names
- MINOR MISMATCH → REVIEW, never REJECT. Single-character differences, swapped middle/first names, missing middle name
- MAJOR MISMATCH → FLAG for verification. Completely different names, different address countries
</calibration>

## Verification Failure Handling

<decision_rules>
SINGLE VERIFICATION FAILURE:
- One non-critical check fails (e.g., email deliverability, address format) → APPROVE with noted concern
- One critical check fails (identity document, sanctions screen) → REVIEW with specific failure noted
- Confidence reduction: -0.1 from base

MULTIPLE VERIFICATION FAILURES:
- Two critical failures (e.g., identity + business registration) → Strong REJECT signal
- Two non-critical failures → REVIEW
- One critical + one non-critical → REVIEW with emphasis on the critical failure
- Confidence reduction: -0.2 to -0.3 from base

INFRASTRUCTURE FAILURES (verification service down):
- Do NOT auto-approve when verification services are unavailable
- Do NOT auto-reject — the seller may be legitimate
- REDUCE confidence by 0.2 and note which verifications are incomplete
- Route to REVIEW with explicit note: "Incomplete verification due to service unavailability"
- Never claim verification passed if the service wasn't reachable
</decision_rules>

## Common False Positive Triggers

These situations look suspicious but are often legitimate:
- **New immigrant business owner:** Thin credit file, recent address, new phone number. All explainable. Look for consistent documentation rather than history length.
- **Recently married/divorced:** Name mismatch between documents is expected during transition.
- **Sole proprietor using home address:** Residential address for business is normal for small sellers.
- **Young entrepreneur:** Thin credit file, new business, all documents recently issued. Evaluate document quality, not history depth.
