# Evaluation Tracking & Reflection Agent Design

**Date:** 2026-02-22
**Status:** Approved

## Problem

Two gaps in the agentic AI framework:

1. **Evaluation tracking is not persistent.** The Python eval service (TruLens/RAGAS) stores evaluations in-memory only. On restart, all evaluation history is lost. There is no way to track agent accuracy trends, detect regressions, or link evaluations back to specific decisions.

2. **No pre-decision reflection.** Self-correction exists but is post-hoc (after outcomes arrive). There is no step in the reasoning loop that critiques a proposed decision before it ships. Subtle reasoning errors (contradictions in evidence, unjustified confidence, weak counter-arguments) are not caught.

## Solution

### Feature 1: Persistent Evaluation Tracking

Persist evaluation scores in the Node.js backend alongside existing `agent_decisions` and `agent_traces` tables. Fire evaluations asynchronously after every decision so there is zero impact on decision latency.

#### Data Model

New table `agent_evaluations` (follows existing JSON-in-data-column pattern):

```
evaluation_id   TEXT PRIMARY KEY   -- "EVAL-{agentId}-{timestamp36}"
data            TEXT NOT NULL      -- JSON blob
created_at      TEXT
updated_at      TEXT
```

Data payload:
```json
{
  "evaluationId": "EVAL-SELLER_ONBOARDING-lx1abc",
  "decisionId": "DEC-SELLER_O-lx1abc",
  "agentId": "SELLER_ONBOARDING",
  "scores": {
    "answer_relevance": 0.85,
    "context_relevance": 0.78,
    "groundedness": 0.92,
    "coherence": 0.88,
    "faithfulness": 0.90,
    "answer_relevancy": 0.83,
    "context_precision": 0.75
  },
  "aggregateScore": 0.84,
  "evalSource": "combined",
  "input": "<truncated input>",
  "decision": "APPROVE",
  "riskScore": 28,
  "confidence": 0.92,
  "createdAt": "2026-02-22T12:34:56.789Z"
}
```

New table `agent_eval_history` for time-series aggregation:

```
history_id      TEXT PRIMARY KEY
data            TEXT NOT NULL
created_at      TEXT
updated_at      TEXT
```

Data payload:
```json
{
  "historyId": "EVALH-SELLER_ONBOARDING-2026022212",
  "agentId": "SELLER_ONBOARDING",
  "windowStart": "2026-02-22T12:00:00.000Z",
  "windowEnd": "2026-02-22T13:00:00.000Z",
  "avgScore": 0.84,
  "minScore": 0.62,
  "maxScore": 0.95,
  "evalCount": 15,
  "scoreTrend": "stable",
  "scoresByMetric": {
    "answer_relevance": { "avg": 0.85, "min": 0.70, "max": 0.95 },
    "groundedness": { "avg": 0.90, "min": 0.78, "max": 0.98 }
  }
}
```

#### New Module: `backend/agents/core/eval-tracker.js`

```javascript
class EvalTracker {
  constructor()

  // Core: evaluate a decision async
  async evaluateDecision(agentId, decisionId, input, evidence, result, chainOfThought)

  // Build eval payload from agent decision context
  _buildEvalPayload(agentId, decisionId, input, evidence, result, chainOfThought)

  // Call Python eval service and persist results
  async _callEvalService(payload)

  // Persist evaluation to SQLite
  _persistEvaluation(evaluation)

  // Update hourly time-series aggregation
  _updateHistory(agentId, evaluation)

  // Query APIs
  getEvalHistory(agentId, limit = 50)
  getEvalTrend(agentId, windowHours = 168)  // 7 days default
  getAgentEvalStats(agentId)

  // Regression detection: alerts if avg score drops >15% vs trailing 7-day avg
  checkForRegression(agentId)

  // Aggregate stats across all agents
  getSystemEvalStats()
}
```

Singleton export pattern matching existing modules:
```javascript
let instance = null;
export function getEvalTracker() {
  if (!instance) instance = new EvalTracker();
  return instance;
}
```

#### Integration in BaseAgent.reason()

After Step 8 (emit events & log metrics), fire evaluation asynchronously:

```javascript
// Step 9: EVALUATE (async, non-blocking)
const evalDecisionId = thought.result?.recommendation?.decisionId || decisionId;
this.evalTracker.evaluateDecision(
  this.agentId,
  evalDecisionId,
  input,
  thought.actions,
  thought.result,
  thought.chainOfThought
).catch(err => console.warn('[EvalTracker] Eval failed:', err.message));
```

This is fire-and-forget. Decision is already returned to the caller. Evaluation happens in the background.

#### Regression Detection

`checkForRegression(agentId)` compares the last 1-hour window average against the trailing 7-day average. If the drop exceeds 15%, it:
1. Emits an `agent:eval:regression` event via the event bus
2. Logs a warning
3. Saves a high-importance entry to long-term memory

Called automatically after each `_updateHistory()`.

---

### Feature 2: Reflection/Critique Step

Add a `reflect()` method to `BaseAgent` in the reasoning loop between OBSERVE (Step 5) and POLICY CHECK (Step 5.25). Follows the existing LLM-first-with-hardcoded-fallback pattern.

#### New Method: `BaseAgent.reflect()`

```javascript
async reflect(observation, actions, input, context) {
  // LLM-enhanced reflection
  if (this.llmClient?.enabled) {
    const { system, user } = buildReflectPrompt({
      agentId: this.agentId,
      agentName: this.name,
      input,
      evidence: actions,
      proposedDecision: observation.recommendation || { action: observation.decision },
      riskScore: observation.riskScore,
      confidence: observation.confidence,
      chainOfThought: this.currentChain?.generateTrace()
    });

    const llmResult = await this.llmClient.complete(system, user);
    const parsed = parseLLMJson(llmResult?.content, null);

    if (parsed) {
      return {
        shouldRevise: parsed.shouldRevise || false,
        revisedAction: parsed.revisedAction || null,
        revisedConfidence: parsed.revisedConfidence || null,
        concerns: parsed.concerns || [],
        contraArgument: parsed.contraArgument || '',
        reflectionConfidence: parsed.reflectionConfidence || 0.5,
        llmEnhanced: true
      };
    }
  }

  // Hardcoded fallback: mechanical contradiction checks
  return this._ruleBasedReflection(observation, actions);
}
```

#### Hardcoded Fallback: `_ruleBasedReflection()`

Mechanical checks that work without LLM:

1. **Evidence contradiction detection**: Count approve-signals vs reject-signals from tool results. If they conflict (>30% disagreement), flag concern.
2. **Confidence-evidence mismatch**: If confidence > 0.8 but fewer than 3 tools were executed, flag as potentially overconfident.
3. **Risk score vs decision alignment**: If risk > 60 and decision is APPROVE, or risk < 20 and decision is REJECT, flag misalignment.
4. **Tool failure impact**: If any tool failed and the decision relies on that tool's domain, flag incomplete evidence.

Returns `shouldRevise: true` only if 2+ concerns are raised.

#### New Prompt Template: `buildReflectPrompt()`

Added to `backend/agents/core/prompt-templates.js`:

```
System: You are a critical reviewer auditing a fraud detection agent's decision.
Your job is to find flaws, contradictions, and unjustified assumptions.
Be adversarial — actively argue against the proposed decision.

User: Given:
- Input: {input summary}
- Evidence collected: {tool results summary}
- Proposed decision: {action} at confidence {confidence} with risk score {riskScore}
- Reasoning chain: {chain of thought summary}

Evaluate:
1. Are there contradictions in the evidence?
2. Is the confidence level justified by the evidence strength?
3. What is the strongest argument AGAINST this decision?
4. Should the decision be revised? Only recommend revision if there is a clear error.

Return JSON:
{
  "shouldRevise": boolean,
  "revisedAction": "APPROVE|REVIEW|REJECT|null",
  "revisedConfidence": float or null,
  "concerns": ["string array of specific concerns"],
  "contraArgument": "strongest case against the current decision",
  "reflectionConfidence": float (your confidence in this reflection)
}
```

#### Integration in `reason()` Flow

Updated step numbering:

```
Step 1:    PATTERN MATCHING
Step 2:    THINK (LLM-optional)
Step 3:    PLAN (LLM-optional)
Step 4:    ACT (tool execution)
Step 5:    OBSERVE (LLM-optional)
Step 5.1:  REFLECT (LLM-optional)         ← NEW
Step 5.25: POLICY CHECK (hardcoded)
Step 5.5:  KNOWLEDGE WRITE-BACK
Step 6:    FORM CONCLUSION
Step 7:    LEARN (memory + patterns)
Step 7.5:  SCHEDULE OUTCOME SIMULATION
Step 8:    EMIT EVENTS & LOG METRICS
Step 9:    EVALUATE (async)                ← NEW
```

#### Revision Application

When `reflect()` returns `shouldRevise: true`:

```javascript
if (reflection.shouldRevise && reflection.revisedAction) {
  thought.result.recommendation = {
    ...thought.result.recommendation,
    action: reflection.revisedAction,
    originalAction: thought.result.recommendation?.action || thought.result.decision,
    revisedByReflection: true,
    reflectionConcerns: reflection.concerns
  };
  thought.result.decision = reflection.revisedAction;
  thought.result.confidence = reflection.revisedConfidence || thought.result.confidence * 0.8;
}
```

Confidence is reduced by 20% when a revision is applied (the system is less certain when it had to self-correct).

#### Tracing & Logging

- New span type: `reflection` in TraceCollector
- Chain of thought records reflection as step type `REFLECTION`
- Decision logger captures: `reflectionApplied`, `originalDecision`, `revisedDecision`, `reflectionConcerns`

## Files to Create

| File | Purpose |
|------|---------|
| `backend/agents/core/eval-tracker.js` | Evaluation tracking, persistence, regression detection |

## Files to Modify

| File | Change |
|------|--------|
| `backend/shared/common/database.js` | Add `agent_evaluations` and `agent_eval_history` tables |
| `backend/agents/core/base-agent.js` | Add `reflect()` method, integrate eval tracker, update `reason()` flow |
| `backend/agents/core/prompt-templates.js` | Add `buildReflectPrompt()` |
| `backend/agents/index.js` | Import and wire eval tracker |
| `backend/agents/core/trace-collector.js` | No change needed (span types are dynamic) |
| `backend/agents/core/chain-of-thought.js` | Add `REFLECTION` step type if not already flexible |
| `backend/gateway/server.js` | Add eval tracking API endpoints |

## Non-Goals

- No changes to the Python eval service (it stays as-is; Node.js backend is the persistence layer)
- No frontend changes in this iteration
- No golden test suite (separate future work)
- No changes to specialized agent overrides (they inherit reflect() from BaseAgent)
