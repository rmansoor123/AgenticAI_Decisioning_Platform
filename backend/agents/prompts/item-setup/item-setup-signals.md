---
id: item-setup-signals
agent: item-setup
phases: [think, observe, reflect]
priority: medium
version: 1
---

# Item Setup Risk Signals

## Catalog Integrity Checks

### High-Risk Indicators
- **Brand name squatting:** Item title contains luxury brand name but seller is not an authorized reseller
- **Category mismatch:** Item listed in wrong category to avoid category-specific fraud checks
- **Image theft:** Product images match known stolen image database or reverse image search hits
- **Description padding:** Excessive keyword stuffing or irrelevant terms in description (SEO manipulation)
- **Prohibited items:** Item matches prohibited item keywords or regulated goods list

### Normal Item Behavior (for calibration)
- Legitimate sellers list items with consistent categories matching their business type
- Product images are original or licensed stock photos
- Descriptions are accurate and proportional to item complexity

## Pricing Anomaly at Setup

| Signal | Threshold | Risk Level |
|--------|-----------|------------|
| Price > 5x category median | Significant deviation | HIGH |
| Price < 30% of category median | Suspiciously low | HIGH |
| Round-number pricing ($100, $500, $1000) | Pattern across listings | MEDIUM |
| Price identical across unrelated items | > 5 items same price | MEDIUM |
| Price changed > 3 times within first hour of listing | Rapid changes | MEDIUM |

## Listing Velocity at Setup

- **Bulk listing:** 50+ items listed within 1 hour (bot behavior)
- **Template listings:** Multiple items with identical descriptions differing only in title
- **Category sprawl:** Items across 10+ unrelated categories (unusual for legitimate specialist sellers)

## Decision Guidance

- Brand name in title alone is not sufficient for rejection — check authorized reseller status
- Image theft detection should trigger REVIEW, not immediate REJECT
- Bulk listing velocity should be calibrated per seller tier (established sellers may legitimately bulk-list)
- Category mismatch combined with pricing anomaly is a strong compound signal
