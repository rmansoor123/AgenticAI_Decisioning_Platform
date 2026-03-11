---
name: debug-agent
description: How to diagnose wrong decisions, errors, latency, and memory problems in agents
triggers:
  - debug agent
  - agent error
  - agent wrong decision
  - agent slow
  - agent latency
  - agent failing
  - agent not working
  - troubleshoot agent
  - diagnose agent
  - why did agent
---

# Debug an Agent

This skill covers diagnosing wrong decisions, errors, latency issues, and memory problems using the four observability modules.

## The Four Observability Tools

| Module | Singleton | What It Captures | Storage |
|--------|-----------|-----------------|---------|
| ChainOfThought | `createChainOfThought()` | Step-by-step reasoning trace | In-memory, attached to `thought.chainOfThought` |
| TraceCollector | `getTraceCollector()` | Span-based timing (OpenTelemetry-like) | SQLite `agent_traces` |
| DecisionLogger | `getDecisionLogger()` | Audit log of every decision | SQLite `agent_decisions` |
| MetricsCollector | `getMetricsCollector()` | Per-agent/tool success rates, p95 latency | SQLite `agent_metrics` |

### Files

```
backend/agents/core/chain-of-thought.js     — reasoning traces
backend/agents/core/trace-collector.js       — span timing
backend/agents/core/decision-logger.js       — decision audit trail
backend/agents/core/metrics-collector.js     — performance counters
backend/agents/core/prompt-templates.js      — LLM prompts (check what LLM sees)
backend/gateway/websocket/event-bus.js       — real-time event stream
```

---

## Problem: "Why Did the Agent Decide X?"

### Step 1: Check the Chain of Thought

The chain of thought is returned in every agent result:

```js
const thought = await agent.reason(input, context);

// The full reasoning trace
thought.chainOfThought.steps.forEach(step => {
  console.log(`[${step.type}] ${step.content} (confidence: ${step.confidence})`);
});

// Step types: OBSERVATION, HYPOTHESIS, ANALYSIS, EVIDENCE, INFERENCE, CONCLUSION, ACTION, VALIDATION
```

Look for:
- **HYPOTHESIS** steps — what the agent suspected before evidence
- **EVIDENCE** steps — what the tools returned
- **CONCLUSION** steps — how the agent interpreted evidence

### Step 2: Check for Policy Override

```js
if (thought.result.policyOverride) {
  console.log('POLICY OVERRODE THE AGENT DECISION');
  console.log('Original:', thought.result.originalDecision);
  console.log('Overridden to:', thought.result.recommendation.action);
  console.log('Policy:', thought.result.policyViolations);
}
```

Policy overrides happen at Step 5.25 — the agent may have wanted to APPROVE but a hard policy forced REVIEW.

### Step 3: Check Reflection Concerns

```js
if (thought.reflection?.shouldRevise) {
  console.log('REFLECTION REVISED THE DECISION');
  console.log('Concerns:', thought.reflection.concerns);
  console.log('Revised to:', thought.reflection.revisedAction);
}
```

### Step 4: Check Agent Judge Review

For REJECT/BLOCK decisions, a cross-agent judge reviews:

```js
if (thought.result._judgeReview) {
  console.log('JUDGE REVIEW:', thought.result._judgeReview);
  // { verdict: 'UPHELD|OVERTURNED', reason, confidence }
}
```

### Step 5: Check Risk Factors

```js
thought.result.riskFactors.forEach(f => {
  console.log(`${f.severity}: ${f.factor} (score: ${f.score})`);
});
console.log('Overall risk:', thought.result.overallRisk.score);
```

### Step 6: Review What the LLM Was Told

Check `backend/agents/core/prompt-templates.js` for:
- `buildThinkPrompt()` — what the LLM sees at the THINK step
- `buildPlanPrompt()` — what it sees when selecting tools
- `buildObservePrompt()` — what it sees when synthesizing results
- `buildReflectPrompt()` — what it sees during self-critique

The `llmEnhanced` flag on each step tells you if LLM or fallback logic was used:
```js
thought.chainOfThought.steps.forEach(s => {
  if (s.llmEnhanced === false) console.warn(`[${s.type}] Used FALLBACK, not LLM`);
});
```

---

## Problem: "The Agent Is Slow"

### Step 1: Check Overall Latency

```js
import { getMetricsCollector } from './agents/core/metrics-collector.js';
const metrics = getMetricsCollector().getMetrics('SELLER_ONBOARDING');

console.log('Avg duration:', metrics.avgDuration, 'ms');
console.log('P95 duration:', metrics.p95Duration, 'ms');
console.log('Total executions:', metrics.executions);
```

### Step 2: Find the Slow Tool

```js
Object.entries(metrics.toolUsage).forEach(([tool, stats]) => {
  const avgMs = stats.totalDuration / stats.calls;
  console.log(`${tool}: ${avgMs.toFixed(0)}ms avg, ${stats.calls} calls, ${stats.failures} failures`);
});
```

### Step 3: Check Trace Spans

```js
import { getTraceCollector } from './agents/core/trace-collector.js';
const traces = getTraceCollector().getRecentTraces(5, 'SELLER_ONBOARDING');

traces.forEach(trace => {
  console.log(`\nTrace ${trace.traceId}: ${trace.duration}ms total`);
  trace.spans.sort((a, b) => b.duration - a.duration).forEach(span => {
    console.log(`  ${span.spanName}: ${span.duration}ms`);
  });
});
```

### TPAOR Phase Breakdown

Each phase of the reasoning loop has a named span:

| Span Name | What's Slow | Fix |
|-----------|------------|-----|
| `think` | LLM call | Check LLM provider latency, switch to Ollama local |
| `plan` | LLM call | Simplify prompt, reduce tool descriptions |
| `action:tool_name` | External API | Check API timeout, consider caching |
| `observe` | LLM call | Reduce evidence passed to LLM (truncate tool results) |
| `reflect` | LLM call | Consider disabling reflection for low-risk cases |
| `policy_check` | Usually fast | Check if custom policies have expensive conditions |
| `knowledge_writeback` | Vector DB write | Check Qdrant/Pinecone connection |
| `eval` | Python service | This is fire-and-forget, should not block |

### Common Latency Causes

1. **Ollama in Docker (CPU-only):** 60-90s per LLM call. Fix: install Ollama natively (`brew install ollama`)
2. **LLM calls per agent:** 4-5 calls per evaluation (think + plan + observe + reflect). Each is sequential.
3. **Tool timeout:** Default API timeout may be too high. External APIs can hang.
4. **Re-planning:** If >50% of tools fail, the agent re-plans and re-executes (doubles tool time).
5. **Multi-turn:** If confidence < threshold, agent does follow-up tool calls (max 2 rounds).

---

## Problem: "The Agent Keeps Failing"

### Step 1: Check Success Rate

```js
const metrics = getMetricsCollector().getMetrics('SELLER_ONBOARDING');
console.log('Success rate:', metrics.successRate);
console.log('Failures:', metrics.failures, '/', metrics.executions);
```

### Step 2: Check Which Tools Fail

```js
Object.entries(metrics.toolUsage).forEach(([tool, stats]) => {
  if (stats.failures > 0) {
    const failRate = (stats.failures / stats.calls * 100).toFixed(1);
    console.log(`${tool}: ${failRate}% failure rate (${stats.failures}/${stats.calls})`);
  }
});
```

### Step 3: Check Recent Decisions

```js
import { getDecisionLogger } from './agents/core/decision-logger.js';
const decisions = getDecisionLogger().getDecisionsByAgent('SELLER_ONBOARDING', 20);
decisions.forEach(d => {
  console.log(`${d.decision_id}: ${d.decision} | ${d.reasoning?.slice(0, 100)}`);
});
```

### Step 4: Watch EventBus in Real-Time

```js
import { getEventBus } from '../gateway/websocket/event-bus.js';
const bus = getEventBus();

// Watch all agent events
bus.subscribe('agent:*', (event) => {
  console.log(`[${event.type}]`, JSON.stringify(event.data, null, 2));
});
```

Key error events to watch:
```
agent:injection:blocked    — input rejected as prompt injection
agent:reflection:revision  — LLM critique changed the decision
agent:policy:override      — policy engine overrode LLM decision
agent:judge:overturn       — cross-agent judge overturned REJECT/BLOCK
agent:citation:downgrade   — decision downgraded due to weak citations
agent:eval:regression      — eval scores dropped >15%
agent:online:alert         — live monitoring alert
```

### Step 5: Check LLM Client Status

```js
import { getLLMClient } from './agents/core/llm-client.js';
const stats = getLLMClient().getStats();
console.log(stats);
// { provider, model, enabled, totalCalls, totalTokens, errors, ollamaBaseURL }
```

If `enabled: false`, all agents are using fallback logic (no LLM).

---

## Problem: "Memory Isn't Working"

### Known Bug: Async/Await Mismatch

`base-agent.js` calls memory methods synchronously but Mem0's implementation is async. This means:

```js
// In base-agent.js — these calls return unresolved Promises:
memoryStore.queryLongTerm(input)     // ← not awaited
memoryStore.saveLongTerm(pattern)    // ← not awaited
```

**Result:** Mem0 calls silently fail, and the agent falls back to SQLite memory.

**How to verify:**
```js
import { getMemoryStore } from './agents/core/memory-store.js';
const store = getMemoryStore();
console.log('Backend:', store.constructor.name);
// 'Mem0MemoryStore' = Mem0 configured (but may not be working)
// 'MemoryStore' = SQLite fallback

// Test async:
const result = await store.queryLongTerm('test query');
console.log('Result:', result);  // If empty when it shouldn't be, async issue confirmed
```

### Checking Pattern Memory

```js
import { getPatternMemory } from './agents/core/pattern-memory.js';
const pm = getPatternMemory();

// Check stored patterns
const patterns = pm.getPatterns('SELLER_ONBOARDING');
console.log(`${patterns.length} patterns stored`);
patterns.forEach(p => {
  console.log(`  ${p.pattern}: reinforcement=${p.reinforcementScore}, lastSeen=${p.lastSeen}`);
});
```

### Checking Knowledge Base

```js
import { getKnowledgeBase } from './agents/core/knowledge-base.js';
const kb = getKnowledgeBase();

const results = kb.search('high risk seller identity');
console.log(`${results.length} KB entries found`);
results.forEach(r => {
  console.log(`  [${r.score.toFixed(2)}] ${r.entry.title || r.entry.id}`);
});
```

---

## Quick Diagnostic Script

Create and run `backend/debug-agent.mjs`:

```js
import { getLLMClient } from './agents/core/llm-client.js';
import { getMetricsCollector } from './agents/core/metrics-collector.js';
import { getTraceCollector } from './agents/core/trace-collector.js';
import { getDecisionLogger } from './agents/core/decision-logger.js';
import { getEvalTracker } from './agents/core/eval-tracker.js';

const agentId = process.argv[2] || 'SELLER_ONBOARDING';

console.log('=== LLM Status ===');
const llm = getLLMClient();
console.log(llm.getStats());

console.log('\n=== Agent Metrics ===');
const metrics = getMetricsCollector().getMetrics(agentId);
if (metrics) {
  console.log(`Executions: ${metrics.executions}, Success: ${(metrics.successRate * 100).toFixed(1)}%`);
  console.log(`Avg: ${metrics.avgDuration}ms, P95: ${metrics.p95Duration}ms`);
  console.log('Tool usage:');
  Object.entries(metrics.toolUsage || {}).forEach(([tool, s]) => {
    console.log(`  ${tool}: ${s.calls} calls, ${s.failures} failures, ${(s.totalDuration/s.calls).toFixed(0)}ms avg`);
  });
} else {
  console.log('No metrics yet');
}

console.log('\n=== Recent Traces ===');
const traces = getTraceCollector().getRecentTraces(3, agentId);
traces.forEach(t => {
  console.log(`${t.traceId}: ${t.duration}ms, ${t.spans.length} spans`);
});

console.log('\n=== Recent Decisions ===');
const decisions = getDecisionLogger().getDecisionsByAgent(agentId, 5);
decisions.forEach(d => {
  console.log(`${d.decision_id}: ${d.decision} (${d.timestamp})`);
});

console.log('\n=== Eval Stats ===');
const evalStats = getEvalTracker().getAgentEvalStats(agentId);
console.log(evalStats);
```

Run: `node backend/debug-agent.mjs SELLER_ONBOARDING`

## Checklist

- [ ] **Wrong decision?** Check chain-of-thought → policy override → reflection → judge review
- [ ] **Slow?** Check metrics p95 → tool usage durations → trace spans → LLM provider
- [ ] **Failing?** Check success rate → tool failure rates → LLM enabled status
- [ ] **Memory issues?** Check memory store backend → async/await bug → pattern memory count
- [ ] **Eval regression?** Check `getAgentEvalStats()` → `regressionAlert` → last 50 eval scores
- [ ] **LLM not working?** Check `getLLMClient().getStats().enabled` → provider → model → Ollama running
