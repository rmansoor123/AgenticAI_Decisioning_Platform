---
name: add-rule
description: How to add a fraud detection rule covering rules-repository, policy-engine, and documentation
triggers:
  - add rule
  - new rule
  - fraud rule
  - detection rule
  - add policy
  - create rule
  - rule repository
---

# Add a Fraud Detection Rule

This project has **two separate rule systems**. Choose the right one:

| System | When to Use | Enforcement |
|--------|------------|-------------|
| **Rules Repository** | Business rules with lifecycle (test → shadow → active) | On-demand evaluation via API or agent tools |
| **Policy Engine** | Safety guardrails that ALWAYS run | Automatic in every agent's reason() loop at Step 5.25 |

## System 1: Rules Repository

### Files
- **Rules service:** `backend/services/decision-engine/rules/index.js`
- **Documentation:** `docs/RISK_DECISION_RULES_REPOSITORY.md`

### Adding a Rule via REST API

```http
POST /api/rules
Content-Type: application/json

{
  "name": "High Velocity New Seller",
  "conditions": [
    { "field": "listingCount", "operator": "GT", "value": 100 },
    { "field": "accountAge", "operator": "LT", "value": 30 }
  ],
  "action": "REVIEW",
  "checkpoint": "onboarding",
  "severity": "HIGH",
  "priority": 10,
  "type": "velocity",
  "tags": ["velocity", "new-seller"]
}
```

Rules start with `status: 'TESTING'` automatically.

### Rule Schema

```js
{
  ruleId: "RULE-ABC123",           // auto-generated
  name: "...",                      // required, human-readable
  conditions: [                     // required, all conditions ANDed
    {
      field: "riskScore",           // dot-path supported (e.g. "address.country")
      operator: "GT|LT|EQ|NE|IN|GTE|LTE",
      value: 60                     // number, string, or array (for IN)
    }
  ],
  action: "BLOCK|REVIEW|FLAG",     // what happens when triggered
  checkpoint: "onboarding|ato|payout|listing|shipping|transaction",
  severity: "CRITICAL|HIGH|MED|LOW",
  priority: 1-100,                  // lower number = higher priority
  status: "TESTING",                // lifecycle state
  type: "velocity|identity|geographic|financial|behavioral|watchlist",
  tags: [],                         // searchable labels
  performance: {                    // auto-tracked
    triggered: 0,
    truePositives: 0,
    falsePositives: 0,
    catchRate: 0,
    falsePositiveRate: 0
  }
}
```

### Condition Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `EQ` | Equals | `{ "field": "country", "operator": "EQ", "value": "US" }` |
| `NE` | Not equals | `{ "field": "status", "operator": "NE", "value": "verified" }` |
| `GT` | Greater than | `{ "field": "riskScore", "operator": "GT", "value": 70 }` |
| `GTE` | Greater or equal | `{ "field": "amount", "operator": "GTE", "value": 10000 }` |
| `LT` | Less than | `{ "field": "accountAge", "operator": "LT", "value": 7 }` |
| `LTE` | Less or equal | `{ "field": "velocity", "operator": "LTE", "value": 5 }` |
| `IN` | In list | `{ "field": "country", "operator": "IN", "value": ["IR","KP","SY"] }` |

Dot-path fields are supported: `"address.country"`, `"seller.verification.status"`.

### Rule Lifecycle

```
TESTING → SHADOW → ACTIVE
                 → DISABLED
```

1. **TESTING** — rule created, test against sample data only
2. **SHADOW** — rule evaluates live traffic but does NOT block/flag (metrics collected)
3. **ACTIVE** — rule enforced on live traffic
4. **DISABLED** — rule deactivated (preserved for audit)

### Lifecycle Commands

```http
# Test against sample data
POST /api/rules/:ruleId/test
{ "testData": { "riskScore": 75, "accountAge": 15 } }
# Returns: { triggered: true, action: "REVIEW", evaluatedConditions: [...] }

# Promote to shadow mode
PATCH /api/rules/:ruleId/status
{ "status": "SHADOW", "reason": "Testing in shadow for 7 days" }

# Activate
PATCH /api/rules/:ruleId/status
{ "status": "ACTIVE", "reason": "Validated: 85% catch rate, <5% FP rate after 7d shadow" }

# Disable
PATCH /api/rules/:ruleId/status
{ "status": "DISABLED", "reason": "Too many false positives" }
```

### Querying Rules

```http
GET /api/rules                              # all rules
GET /api/rules?checkpoint=onboarding        # by checkpoint
GET /api/rules?status=ACTIVE                # by status
GET /api/rules/:ruleId                      # single rule with performance
GET /api/rules/:ruleId/performance          # performance metrics only
```

---

## System 2: Policy Engine

### Files
- **Policy engine:** `backend/agents/core/policy-engine.js`

### Hard Policy (Overrides Agent Decision)

Hard policies **force the decision to REVIEW** and emit `agent:policy:override`. Use for safety-critical rules that must never be bypassed.

```js
// In policy-engine.js, add to HARD_POLICIES array:
{
  policyId: 'POL-009',
  name: 'unverified-identity-block',
  type: POLICY_TYPES.HARD,
  action: ACTIONS.BLOCK,
  message: 'Cannot approve: identity verification failed',
  condition: (decision, evidence, context) => {
    // Only check when agent wants to APPROVE
    if (decision.action !== 'APPROVE') return false;
    // Block if identity verification failed or missing
    const idCheck = evidence.find(e => e.source === 'verify_identity');
    return !idCheck || !idCheck.data?.verified;
  }
}
```

### Soft Policy (Flags Without Overriding)

Soft policies add a flag/warning but let the agent's decision stand.

```js
{
  policyId: 'POL-109',
  name: 'high-risk-country-flag',
  type: POLICY_TYPES.SOFT,
  action: ACTIONS.FLAG,
  message: 'Flagged: seller operates from high-risk jurisdiction',
  condition: (decision, evidence, context) => {
    const HIGH_RISK = ['IR', 'KP', 'SY', 'CU', 'VE'];
    const geoCheck = evidence.find(e => e.source === 'check_geographic');
    return geoCheck?.data?.countryCode && HIGH_RISK.includes(geoCheck.data.countryCode);
  }
}
```

### Policy Condition Parameters

The `condition` function receives three arguments:

| Parameter | Shape | Description |
|-----------|-------|-------------|
| `decision` | `{ action, confidence, reason }` | The agent's proposed decision |
| `evidence` | `[{ source, data, success }]` | Array of tool results |
| `context` | `{ riskScore, thresholds, patternRecommendation, criticalFactors }` | Evaluation context |

### Runtime Registration

```js
import { getPolicyEngine } from '../agents/core/policy-engine.js';

const engine = getPolicyEngine();
engine.addPolicy({
  policyId: 'POL-010',
  name: 'my-dynamic-policy',
  type: POLICY_TYPES.HARD,
  action: ACTIONS.BLOCK,
  message: 'Blocked by dynamic policy',
  condition: (decision, evidence, context) => { /* ... */ }
});
```

---

## Documentation

After adding a rule, update `docs/RISK_DECISION_RULES_REPOSITORY.md`:

```markdown
### [Service Name] Service

| # | Rule Name | Checkpoint | Severity | Action | Catch Rate | FP Rate |
|---|-----------|-----------|----------|--------|-----------|---------|
| XX | My New Rule | onboarding | HIGH | REVIEW | — | — |
```

For policy engine rules, they don't go in the rules repository doc — they are documented inline in `policy-engine.js` with comments.

## Checklist

- [ ] Chose correct system: Rules Repository (business rule) vs Policy Engine (safety guardrail)
- [ ] **Rules Repository:** POST to `/api/rules` with conditions, action, checkpoint, severity
- [ ] **Rules Repository:** Test with `/api/rules/:ruleId/test` before promoting
- [ ] **Rules Repository:** Shadow mode for 7+ days before activating
- [ ] **Policy Engine:** Added to HARD_POLICIES or SOFT_POLICIES array
- [ ] **Policy Engine:** Condition checks `decision.action` to avoid unnecessary evaluation
- [ ] Updated `docs/RISK_DECISION_RULES_REPOSITORY.md` (for repository rules)
- [ ] Rule has meaningful name and clear message/reason
