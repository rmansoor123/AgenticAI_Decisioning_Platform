---
id: review-signals
agent: review-integrity
phases: [think, observe, reflect]
priority: medium
version: 1
---

# Review Integrity Signals

## Fake Review Detection

### High-Risk Patterns
- **Review velocity spike:** Sudden burst of positive reviews after period of low activity
- **Template reviews:** Multiple reviews with similar language patterns or structure
- **Incentivized reviews:** Language suggesting compensation ("received free product", "in exchange for")
- **Review-purchase mismatch:** Review posted without verified purchase
- **Timing anomaly:** Reviews posted within minutes of each other from different accounts

### Normal Review Behavior (for calibration)
- Organic reviews accumulate gradually proportional to sales volume
- Review sentiment distribution follows natural curve (mostly positive, some negative)
- Review length and detail vary naturally between reviewers

## Reviewer Account Signals

| Signal | Threshold | Risk Level |
|--------|-----------|------------|
| New account + immediate reviews | < 7 days old, > 5 reviews | HIGH |
| Single-seller reviewer | 100% reviews for one seller | HIGH |
| Review-only account | No purchases, only reviews | MEDIUM |
| Burst reviewer | > 10 reviews in 24 hours | HIGH |
| Geographic mismatch | Reviewer location vs. product availability | MEDIUM |

## Review Manipulation Tactics

- **Vote brigading:** Coordinated upvoting of positive reviews / downvoting of negative
- **Competitor sabotage:** Fake negative reviews targeting competitor products
- **Review swapping:** Positive review posted on wrong product to boost ratings
- **Review hijacking:** Changing review content after initial positive review approval

## Decision Guidance

- Template detection should use similarity scoring, not exact matching (paraphrasing is common)
- Incentivized reviews may be legitimate if properly disclosed — check platform policy
- Single-seller reviewers are suspicious but not conclusive — some buyers are loyal
- Always consider review content quality alongside behavioral signals
- Suppressing legitimate reviews has high reputational cost — err toward MONITOR over REMOVE
