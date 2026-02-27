---
id: listing-signals
agent: listing-intelligence
phases: [think, observe, reflect]
priority: high
version: 1
---

# Listing Intelligence Signals

## Counterfeit Indicators

### Text-Based Signals
- **Brand name misspelling:** Intentional typos to evade brand keyword filters (e.g., "Niike", "Addidas")
- **"Inspired by" / "style" qualifiers:** Language suggesting knockoffs ("designer-inspired", "luxury style")
- **Missing model numbers:** Authentic branded products typically include specific model/SKU numbers
- **Generic descriptions:** Copy-pasted descriptions that don't match specific product variants
- **Unrealistic claims:** "100% authentic" combined with pricing 70%+ below retail

### Image-Based Signals
- **Stock photo usage:** Identical images appearing across multiple unrelated sellers
- **Watermark removal artifacts:** Blurred corners or inconsistent backgrounds from watermark removal
- **Resolution inconsistency:** Mixing high-res product shots with low-res lifestyle images
- **Background consistency:** Professional sellers use consistent backgrounds; counterfeiters mix sources
- **Missing detail shots:** Authentic listings show stitching, labels, serial numbers; counterfeits avoid close-ups

## Price Anomaly Patterns

| Pattern | Description | Risk Level |
|---------|-------------|------------|
| Below-cost pricing | Listed price < wholesale cost for category | HIGH |
| Anchoring manipulation | Inflated "original price" with deep discount (>80% off) | MEDIUM |
| Price oscillation | Rapid price changes (>5 changes in 24h) to game search ranking | MEDIUM |
| Category price outlier | Price > 3 standard deviations from category median | HIGH |
| Free shipping on heavy items | Offering free shipping on items where shipping cost > 30% of price | LOW |

## Listing Manipulation Patterns

- **SEO stuffing:** Title or description packed with unrelated keywords for search visibility
- **Category misplacement:** Listing placed in wrong category to avoid category-specific fraud rules
- **Phantom inventory:** Listing shows high quantity but seller has no verified warehouse
- **Clone listings:** Multiple near-identical listings with minor variations to dominate search results
- **Review manipulation:** New listing with suspiciously high review count or 5-star reviews from new accounts

## Analysis Guidance

- Counterfeit assessment requires combining multiple signals. A single indicator (e.g., low price) is insufficient.
- Price anomalies in categories like electronics, luxury goods, and branded apparel carry higher weight.
- Image analysis signals are strongest when combined with text signals — either alone has higher false positive rates.
- Compare listings against the seller's own history: sudden category switches or quality changes are suspicious.
