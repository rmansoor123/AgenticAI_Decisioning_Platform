---
name: run-eval
description: How to run and interpret agent evaluations using TruLens, RAGAS, and the eval tracker
triggers:
  - run eval
  - run evaluation
  - evaluate agent
  - agent eval
  - eval scores
  - ragas eval
  - trulens eval
  - check eval
  - eval regression
---

# Run and Interpret Agent Evaluations

## Architecture

```
Agent.reason() completes
  → EvalTracker.evaluateDecision()  [fire-and-forget, non-blocking]
    → POST /evaluate to Python FastAPI (port 8000)
      → TruLens: answer_relevance, context_relevance, groundedness, coherence
      → RAGAS: faithfulness, answer_relevancy, context_precision, context_recall
    → Scores persisted to SQLite (agent_evaluations)
    → Regression detection (>15% drop triggers alert)
```

## Key Files

| File | Purpose |
|------|---------|
| `backend/agents/core/eval-tracker.js` | JS bridge — sends eval requests, tracks scores, detects regressions |
| `backend/evaluation/main.py` | Python FastAPI service entry point |
| `backend/evaluation/routers/evaluate.py` | `/evaluate` endpoint |
| `backend/evaluation/services/trulens_evaluator.py` | TruLens feedback functions |
| `backend/evaluation/services/ragas_evaluator.py` | RAGAS metrics |

## When to Use Evals

**RAGAS is for retrieval-based agents only** — agents that use RAG (vector search + knowledge base) to make decisions. It measures how well the retrieved context supports the answer.

| Agent Type | Use RAGAS? | Why |
|-----------|-----------|-----|
| Seller Onboarding | Yes | Uses tool evidence as retrieved context |
| Fraud Investigation | Yes | Retrieves transaction patterns, knowledge base entries |
| Alert Triage | No | Routes alerts based on rules, no retrieval |
| Rule Optimization | No | Analyzes rule metrics, no retrieval step |
| Payout agents | No | Policy-driven, no RAG component |

**TruLens metrics apply to all agents** that use LLM reasoning (coherence, answer relevance).

## Starting the Eval Service

```bash
cd backend/evaluation
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload
```

Verify:
```bash
curl http://localhost:8000/health
curl http://localhost:8000/vector/health  # Qdrant connection
```

## Running an Eval Manually

### Via curl

```bash
curl -X POST http://localhost:8000/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Evaluate seller: TechGadgets LLC",
    "retrieved_contexts": [
      "[verify_identity] {\"verified\": true, \"confidence\": 0.92}",
      "[screen_watchlist] {\"matches\": [], \"cleared\": true}",
      "[check_business] {\"registered\": true, \"yearsActive\": 5}"
    ],
    "agent_response": "Decision: APPROVE. Risk Score: 18. Confidence: 0.92. Low-risk seller with verified identity, clean watchlist, and established business.",
    "ground_truth": null,
    "use_case": "onboarding_decision",
    "agent_id": "seller-onboarding-agent"
  }'
```

### Via Node.js (programmatic)

```js
import { getEvalTracker } from './agents/core/eval-tracker.js';

const tracker = getEvalTracker();
await tracker.evaluateDecision(
  'SELLER_ONBOARDING',
  'DEC-SELLER_O-test123',
  { businessName: 'TechGadgets LLC', type: 'onboarding' },
  [{ action: 'verify_identity', result: { success: true, data: { verified: true } } }],
  { recommendation: { action: 'APPROVE', confidence: 0.92 }, overallRisk: { score: 18 } },
  [{ type: 'CONCLUSION', content: 'Low risk seller' }]
);
```

## Interpreting Eval Scores

### TruLens Metrics

| Metric | What It Measures | Good Score | Red Flag |
|--------|-----------------|-----------|----------|
| `answer_relevance` | Is the decision relevant to the input query? | > 0.8 | < 0.5 — agent may be ignoring input |
| `context_relevance` | Are the tool results relevant to the decision? | > 0.7 | < 0.4 — wrong tools being selected |
| `groundedness` | Is the decision grounded in tool evidence? | > 0.8 | < 0.5 — agent is hallucinating |
| `coherence` | Is the reasoning logically consistent? | > 0.8 | < 0.6 — contradictory reasoning |

### RAGAS Metrics

| Metric | What It Measures | Good Score | Red Flag |
|--------|-----------------|-----------|----------|
| `faithfulness` | Does the answer contain only info from context? | > 0.8 | < 0.5 — fabricating evidence |
| `answer_relevancy` | Does the answer address the original query? | > 0.7 | < 0.4 — off-topic response |
| `context_precision` | Are high-ranked contexts actually relevant? | > 0.7 | < 0.4 — retrieval returning noise |
| `context_recall` | Does context cover all aspects of ground truth? | > 0.7 | < 0.4 — missing key evidence |

**Note:** `context_recall` and `context_entity_recall` only available when `ground_truth` is provided.

## Checking Eval History

### Programmatic (Node.js)

```js
const tracker = getEvalTracker();

// Recent evals for one agent
const history = tracker.getEvalHistory('SELLER_ONBOARDING', 50);
// Returns: [{ evalId, decisionId, agentId, scores: {...}, timestamp }]

// Aggregate stats
const stats = tracker.getAgentEvalStats('SELLER_ONBOARDING');
// Returns: { avgScore, recentTrend, evalCount, regressionAlert }

// System-wide stats
const system = tracker.getSystemEvalStats();
// Returns: { agentStats: { SELLER_ONBOARDING: {...}, ... }, overallAvg }
```

### Via API

```bash
# Eval dashboard
curl http://localhost:8000/dashboard

# Agent-specific history
curl http://localhost:3001/api/agents/SELLER_ONBOARDING/evals

# Retrieval quality metrics
curl http://localhost:8000/retrieval-eval
```

## Regression Detection

The eval tracker automatically compares the last 5 scores against the trailing average. If the drop exceeds 15%, it emits an `agent:eval:regression` event.

```js
// Subscribe to regression alerts
import { getEventBus } from '../gateway/websocket/event-bus.js';
getEventBus().subscribe('agent:eval:regression', (event) => {
  console.error('REGRESSION:', event.data);
  // { agentId, metric, currentAvg, trailingAvg, dropPercent }
});
```

Check for active regressions:
```js
const stats = tracker.getAgentEvalStats('SELLER_ONBOARDING');
if (stats.regressionAlert) {
  console.log('Regression detected:', stats.regressionAlert);
}
```

## A/B Testing (Built-in)

Compare two strategies (e.g., LLM vs rule-based):

```js
const tracker = getEvalTracker();

// Register experiment
tracker.registerExperiment('llm-vs-rules', {
  name: 'LLM vs Rule-Based Decisions',
  controlStrategy: 'rules',
  treatmentStrategy: 'llm',
  splitRatio: 0.5
});

// During agent execution — assign to group
const group = tracker.assignGroup('llm-vs-rules', decisionId);
// Returns 'control' or 'treatment'

// After decision — record metric
tracker.recordExperimentMetric('llm-vs-rules', group, {
  score: evalScore,
  accuracy: wasCorrect ? 1 : 0
});

// Analyze results
const results = tracker.getExperimentResults('llm-vs-rules');
// { control: { count, avgScore }, treatment: { count, avgScore }, significant: true/false }
```

## Online Monitoring

The `OnlineEvaluator` in `eval-tracker.js` monitors live decision distributions:

```js
// Alerts auto-fire on EventBus when:
// - Decision shift: REJECT/BLOCK rate swings > 20% from baseline
// - Confidence drop: recent avg < 70% of baseline
// - Tool failure spike: > 30% failure rate in 5 minutes
```

Subscribe:
```js
getEventBus().subscribe('agent:online:alert', (event) => {
  console.warn('ONLINE ALERT:', event.data.alertType, event.data.message);
});
```

## Batch Evaluation

For backtesting against labeled datasets:

```bash
curl -X POST http://localhost:8000/evaluate/batch \
  -H "Content-Type: application/json" \
  -d '{
    "evaluations": [
      { "query": "...", "retrieved_contexts": [...], "agent_response": "...", "ground_truth": "..." },
      { "query": "...", "retrieved_contexts": [...], "agent_response": "...", "ground_truth": "..." }
    ],
    "use_case": "regression_test",
    "agent_id": "seller-onboarding-agent"
  }'
```

## Checklist

- [ ] Eval service running: `curl http://localhost:8000/health`
- [ ] Agent has `USE_LLM=true` (LLM-based evals need LLM for scoring)
- [ ] `EVAL_SERVICE_URL=http://localhost:8000` set in `.env`
- [ ] Check if agent type is retrieval-based before interpreting RAGAS scores
- [ ] Review `groundedness` first — most critical metric (hallucination detection)
- [ ] Monitor `agent:eval:regression` events for score drops
- [ ] For new agents: run 20+ evals before establishing baseline
