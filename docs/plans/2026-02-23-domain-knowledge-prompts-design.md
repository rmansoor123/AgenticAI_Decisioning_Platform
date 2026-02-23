# Domain Knowledge Prompts Design

**Date:** 2026-02-23
**Status:** Approved

## Problem

Agent prompts are hardcoded inline in `prompt-templates.js`. The system prompt is a brief role description ("You are X, a Y agent") with no domain expertise. The LLM has no fraud-specific knowledge beyond its training data — it doesn't know what makes a crypto seller riskier than a clothing seller, what identity document red flags look like, or how to interpret consortium velocity data.

## Solution

Create a **prompt library** of markdown files containing rich fraud domain knowledge. A **PromptRegistry** singleton loads these files at startup and serves relevant knowledge to agents during each reasoning phase. The prompt templates inject domain knowledge as a new section in the system prompt.

## Directory Structure

```
backend/agents/prompts/
  shared/
    fraud-patterns.md
    risk-signals.md
    regional-risk-factors.md
  seller-onboarding/
    kyc-verification.md
    business-categories.md
    identity-red-flags.md
  fraud-investigation/
    transaction-patterns.md
    consortium-signals.md
  alert-triage/
    priority-guidelines.md
  rule-optimization/
    rule-design-principles.md
```

### File Format

Each markdown file has YAML frontmatter for metadata, followed by the domain knowledge content:

```markdown
---
id: kyc-verification
agent: seller-onboarding
phases: [think, observe, reflect]
priority: high
version: 1
---

# KYC Verification Domain Knowledge

## Document Verification Red Flags

When evaluating identity documents, watch for:
- Document number format inconsistencies...
- Photo quality anomalies suggesting manipulation...
...
```

**Frontmatter fields:**
- `id` — unique identifier for the prompt
- `agent` — which agent uses it (`seller-onboarding`, `fraud-investigation`, `alert-triage`, `rule-optimization`, `shared`)
- `phases` — which reasoning phases inject this knowledge (`think`, `plan`, `observe`, `reflect`)
- `priority` — loading priority when token budget is limited (`high`, `medium`, `low`)
- `version` — for tracking prompt evolution

### Shared vs Agent-Specific

- `shared/` prompts are available to ALL agents (loaded when `agent: shared`)
- Agent-specific directories contain knowledge only that agent needs
- At prompt build time: shared prompts + agent-specific prompts are merged

## PromptRegistry Module

New file: `backend/agents/core/prompt-registry.js`

```javascript
class PromptRegistry {
  constructor()

  // Load all .md files from prompts/ directory at startup
  loadPrompts()

  // Get prompts for a specific agent + phase combination
  getPrompts(agentId, phase)  // Returns concatenated markdown string

  // Get a specific prompt by ID
  getPromptById(id)

  // Reload prompts from disk (hot-reload support)
  reload()

  // Stats
  getStats()  // { totalPrompts, byAgent, byPhase }
}
```

**Loading logic:**
1. Scan `backend/agents/prompts/` recursively for `.md` files
2. Parse YAML frontmatter from each file
3. Store in a Map keyed by `id`
4. Index by `agent` and `phase` for fast lookup

**Query logic (`getPrompts(agentId, phase)`):**
1. Find all prompts where `agent === agentId || agent === 'shared'`
2. Filter to those whose `phases` array includes the requested phase
3. Sort by priority (high first)
4. Concatenate markdown content with `---` separators
5. Truncate to token budget (4000 tokens default for domain knowledge)

## Integration with Prompt Templates

Each `buildXxxPrompt()` function receives an optional `domainKnowledge` string parameter and injects it into the system prompt:

**Before (buildThinkPrompt):**
```
system: "You are {agentName}, a {agentRole} agent in a fraud detection platform.
Your job is to analyze the input..."
```

**After:**
```
system: "You are {agentName}, a {agentRole} agent in a fraud detection platform.

## Domain Expertise
{domainKnowledge}

Your job is to analyze the input..."
```

The `domainKnowledge` section is injected into all 4 prompt builders: think, plan, observe, reflect.

## Integration with BaseAgent

In `base-agent.js`, the agent queries the registry before each LLM call:

```javascript
// In think():
const domainKnowledge = this.promptRegistry.getPrompts(this.agentId, 'think');
const { system, user } = buildThinkPrompt({ ..., domainKnowledge });
```

The `promptRegistry` is added to the BaseAgent constructor as another singleton, and the agent ID is mapped to a prompt directory name via a simple mapping.

## Agent ID to Prompt Directory Mapping

```javascript
const AGENT_PROMPT_MAP = {
  'SELLER_ONBOARDING': 'seller-onboarding',
  'FRAUD_INVESTIGATOR': 'fraud-investigation',
  'ALERT_TRIAGE': 'alert-triage',
  'RULE_OPTIMIZER': 'rule-optimization'
};
```

## Prompt Content

### shared/fraud-patterns.md

Common fraud typologies that all agents should know:
- First-party fraud (friendly fraud, chargeback abuse)
- Third-party fraud (stolen identity, synthetic identity)
- Account takeover patterns
- Collusion and fraud rings
- Money laundering indicators

### shared/risk-signals.md

How to interpret and weigh risk signals:
- Velocity signals (too many actions in short time)
- Device signals (emulators, VPNs, known fraud devices)
- Behavioral signals (unusual browsing patterns, copy-paste behavior)
- Network signals (shared attributes with known fraudsters)

### shared/regional-risk-factors.md

Country and region-specific risk context:
- High-risk jurisdictions for financial fraud
- Sanctioned countries and implications
- Regional fraud patterns (e.g., card-not-present fraud prevalence by region)
- Currency and cross-border risk factors

### seller-onboarding/kyc-verification.md

KYC best practices and document red flags:
- Document type reliability by country
- Common document forgery techniques
- Name/address mismatch patterns
- Business registration verification approaches
- Beneficial ownership red flags

### seller-onboarding/business-categories.md

Risk profiles by business category:
- High-risk categories (crypto, adult, gambling, pharmaceuticals, dropshipping)
- Medium-risk categories (electronics, luxury goods, tickets)
- Category-specific fraud patterns
- Seasonal risk variations

### seller-onboarding/identity-red-flags.md

Identity fraud indicators:
- Synthetic identity patterns (new credit file, inconsistent history)
- Stolen identity indicators (address/phone mismatch with credit bureau)
- Identity farming and document mills
- Email and phone disposability signals

### fraud-investigation/transaction-patterns.md

Transaction analysis expertise:
- Normal vs abnormal transaction velocity
- Amount distribution analysis (round numbers, just-below-threshold)
- Time-of-day patterns
- Geographic impossibility (two transactions far apart in short time)
- Card testing patterns

### fraud-investigation/consortium-signals.md

Consortium and shared intelligence:
- How to interpret consortium velocity data
- Shared negative data (chargebacks, fraud confirmations)
- Cross-merchant fraud ring detection
- Consortium confidence levels and freshness

### alert-triage/priority-guidelines.md

Alert prioritization expertise:
- Financial impact-based priority
- Time sensitivity by alert type
- Analyst skill matching
- Alert fatigue management
- Escalation criteria

### rule-optimization/rule-design-principles.md

Rule engineering best practices:
- Precision vs recall trade-offs
- Rule overlap detection and resolution
- Threshold tuning methodology
- A/B testing rule changes
- Rule lifecycle management

## Token Budget

Domain knowledge is injected into the system prompt. To avoid exceeding token limits:
- Default budget: 4000 tokens (~16,000 chars) for domain knowledge section
- High-priority prompts loaded first
- Remaining budget fills medium, then low priority
- `PromptBuilder.truncateToTokenBudget()` already exists for this

## Files to Create

| File | Purpose |
|------|---------|
| `backend/agents/core/prompt-registry.js` | Registry singleton — loads, indexes, serves prompts |
| `backend/agents/prompts/shared/fraud-patterns.md` | Common fraud typologies |
| `backend/agents/prompts/shared/risk-signals.md` | Risk signal interpretation |
| `backend/agents/prompts/shared/regional-risk-factors.md` | Regional risk context |
| `backend/agents/prompts/seller-onboarding/kyc-verification.md` | KYC domain knowledge |
| `backend/agents/prompts/seller-onboarding/business-categories.md` | Category risk profiles |
| `backend/agents/prompts/seller-onboarding/identity-red-flags.md` | Identity fraud indicators |
| `backend/agents/prompts/fraud-investigation/transaction-patterns.md` | Transaction analysis |
| `backend/agents/prompts/fraud-investigation/consortium-signals.md` | Consortium data interpretation |
| `backend/agents/prompts/alert-triage/priority-guidelines.md` | Alert prioritization |
| `backend/agents/prompts/rule-optimization/rule-design-principles.md` | Rule engineering |

## Files to Modify

| File | Change |
|------|--------|
| `backend/agents/core/prompt-templates.js` | Add `domainKnowledge` parameter to all 4 prompt builders |
| `backend/agents/core/base-agent.js` | Import registry, query per phase, pass to prompt builders |

## Non-Goals

- No API for CRUD on prompts (edit files directly, git-tracked)
- No per-request prompt customization (prompts are per-deployment)
- No prompt versioning system beyond the `version` frontmatter field
- No frontend prompt editor
