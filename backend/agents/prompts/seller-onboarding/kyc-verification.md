---
id: kyc-verification
agent: seller-onboarding
phases: [think, observe, reflect]
priority: high
version: 1
---

# KYC Verification Domain Knowledge

## Document Verification Best Practices

### Identity Documents
When evaluating identity documents, assess:
- **Format consistency:** Does the document number match the expected format for the issuing country? (e.g., US passports: 9 digits; UK passports: 9 digits starting with specific prefixes)
- **Expiry status:** Expired documents are not acceptable for onboarding. Documents expiring within 30 days warrant a flag.
- **Photo quality:** Low resolution, inconsistent lighting, or visible editing artifacts suggest manipulation.
- **MRZ (Machine Readable Zone):** If present, MRZ data should match the visual zone. Mismatches indicate forgery.
- **Security features:** Holograms, watermarks, microprinting. Absence on document types that should have them is a red flag.

### Business Documents
- **Registration validity:** Business registration should be current and active. Check registration number format against country standards.
- **Age of business:** Businesses less than 6 months old carry higher risk. Businesses less than 30 days old are very high risk.
- **Registered agent vs applicant:** If the registered agent is different from the applicant, verify the relationship.
- **Registered address:** PO boxes and virtual office addresses are higher risk. Verify the address exists and is appropriate for the business type.

## Name and Address Matching
- **Exact match not required:** Allow for common variations (Jr/Jr., Street/St, etc.)
- **Transliteration issues:** Names from non-Latin scripts may have multiple valid romanizations.
- **Maiden name / married name:** Document may show different surname than application.
- **Flag but don't auto-reject:** Minor mismatches should trigger REVIEW, not REJECT.

## Verification Failure Handling
- **Single verification failure:** If one check fails but others pass, route to REVIEW with the specific failure noted.
- **Multiple verification failures:** Two or more failures in critical checks (identity + business) → recommend REJECT.
- **Infrastructure failures:** If a verification service is down, do NOT auto-approve. Reduce confidence and note incomplete verification.
