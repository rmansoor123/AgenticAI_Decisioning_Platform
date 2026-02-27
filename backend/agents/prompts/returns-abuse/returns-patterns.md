---
id: returns-patterns
agent: returns-abuse
phases: [think, observe, reflect]
priority: high
version: 1
---

# Returns Abuse Patterns

## Wardrobing (Wear and Return)

### Description
Buyer purchases items, uses them briefly (e.g., wears clothing to an event), then returns them as "unused."

### Detection Signals
- Return initiated within 24-72 hours of delivery (too fast for legitimate dissatisfaction, too slow for wrong-item)
- Repeated pattern: same buyer returns 30%+ of purchases in high-value categories (apparel, electronics)
- Return reason is always vague: "changed my mind," "didn't like it," "not as expected"
- Items returned show signs of use but buyer claims "never opened"

### Risk Thresholds
- Return rate 20-30%: Monitor
- Return rate 30-50%: Review — request photos/evidence
- Return rate > 50%: Restrict return privileges pending investigation

## Return Fraud Rings

### Description
Coordinated groups using multiple accounts to abuse return policies at scale.

### Detection Signals
- Multiple accounts returning to the same seller within a tight time window
- Accounts share device fingerprints, IP ranges, or shipping addresses
- Return patterns are synchronized (all return on the same day or cycle)
- New accounts with no purchase history suddenly making high-value returns (receipt fraud)

### Graph Signals
- Cluster of buyer accounts with shared attributes (email domain, phone prefix, creation date)
- Returns all processed through the same refund method (gift cards, store credit)
- Cross-referencing buyer account creation dates with return initiation dates

## Refund Cycling

### Description
Buyer exploits refund process to receive both the product and the refund.

### Patterns
- **Empty box:** Buyer claims item was not in the package upon delivery
- **FTID (Fake Tracking ID):** Buyer provides a tracking number for an empty or different return
- **DNA (Did Not Arrive):** Buyer claims package never arrived despite delivery confirmation
- **Partial return:** Buyer returns a cheaper substitute item instead of the purchased item

### Detection Signals
| Pattern | Signal | Evidence |
|---------|--------|----------|
| Empty box | Weight discrepancy between shipped and returned package | Carrier weight data |
| FTID | Tracking shows delivery to a different address | Tracking verification |
| DNA | Multiple DNA claims from same buyer/address | Claim history |
| Partial return | Item returned doesn't match item sold (serial number, SKU) | Warehouse inspection |

## Decision Guidance

- Individual return anomalies should trigger MONITOR, not immediate action
- Pattern of 3+ suspicious returns from same buyer within 90 days warrants REVIEW
- Ring detection (multiple coordinated accounts) warrants immediate BLOCK of all associated accounts
- Always verify: some high return rates are legitimate (sizing issues in clothing, defective batches)
- Seasonal adjustment: return rates naturally increase post-holiday (Dec 26 - Jan 31). Raise thresholds by 10-15% during this period.
