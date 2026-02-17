# Agentic Brain Upgrade — Phase 1 Design

**Goal:** Transform the fraud detection platform from a rule-engine-with-optional-LLM into a genuinely agentic system where agents reason autonomously, learn from experience, and operate within safety guardrails.

**Phase:** 1 of 2 — "Making Agents Genuinely Intelligent"
**Phase 2 (future):** Multi-agent coordination upgrades, rule-suggestion chatbot, advanced React UI

**Approach:** Layered Intelligence Upgrade — build bottom-up in 5 testable layers.

---

## Layer 1: Enhanced LLM Reasoning Core

**What changes:** Rewrite `think()`, `plan()`, and `observe()` in `base-agent.js` to send structured, rich prompts to Claude. Replace hardcoded investigation templates with LLM-driven tool selection.

**Current flow:**
```
think() → shallow prompt → "Analyzing: [input slice]"
plan() → template lookup → [{type: 'check_velocity'}, {type: 'verify_device'}]
```

**New flow:**
```
think() → rich prompt with memory + knowledge + evidence → structured analysis
plan() → LLM sees available tools with descriptions → selects tools with reasoning
act()  → executes LLM-selected tools (fallback to templates if LLM fails)
```

**Key changes to `base-agent.js`:**
- `think()` sends: system role, task details, recent memory (last 5 entries), relevant knowledge (top 3 matches), available tools with descriptions, and pattern matches. LLM returns structured JSON with `{understanding, key_risks, confidence, suggested_approach}`.
- `plan()` sends: think output + full tool catalog with input schemas. LLM returns `{goal, reasoning, actions: [{tool, params, rationale}]}`. Fallback: if LLM fails, use existing `investigationTemplates`.
- `observe()` sends: action results + original task. LLM synthesizes findings into risk assessment. Fallback: existing rule-based scoring.

**Key changes to specialized agents:**
- `fraud-investigation-agent.js`: Keep `investigationTemplates` as fallback only. Remove hardcoded template selection in `plan()`. Keep `analyzeEvidence()` rule-based scoring as a validation layer (LLM proposes, rules validate).
- `seller-onboarding-agent.js`: Same pattern. LLM decides verification tools, rules validate the final decision.

**New file: `backend/agents/core/prompt-templates.js`**
Centralized prompt templates for each reasoning phase. Structured prompts with clear output schemas so LLM responses are parseable. Includes tool catalog formatter that converts registered tools into LLM-readable descriptions.

---

## Layer 2: Active Memory Integration

**What changes:** Wire all three memory systems into the reasoning pipeline so agents consult past experience before making decisions.

**Short-term memory (session, 24h):**
- Currently: Written after decisions via `updateMemory()`, never read during reasoning.
- New: `think()` retrieves last 5 short-term entries for current session before sending to LLM. Injected as "Recent activity in this session" section of the prompt. Gives agents conversational continuity — "I just evaluated 3 electronics sellers from NG, all were high risk."

**Long-term memory (permanent, scored):**
- Currently: `queryLongTerm()` exists but nothing calls it during reasoning.
- New: `plan()` queries long-term memory with the current task as search query. Top 3 results injected as "Lessons from past experience" in the prompt. Example: "Previously, sellers with disposable emails AND high-risk geography had 85% fraud rate."
- Write path: After every decision, save a structured insight to long-term memory with the outcome. Importance score based on how unusual the case was (high-risk approved = high importance, routine approval = low importance).

**Pattern memory (in-memory, indexed):**
- Currently: `checkPatterns()` runs in `reason()` but results don't affect tool selection or risk scoring.
- New: Pattern matches injected into `think()` prompt as "Similar patterns from history." If match confidence > 0.8, included as strong advisory. LLM decides weight.
- `provideFeedback()` finally gets called — after outcome simulation runs (Layer 4), it feeds back correct/incorrect signals to update pattern success rates.

**Memory consolidation upgrade:**
- Current consolidation promotes repeated short-term patterns to long-term after 3 occurrences.
- New: Also consolidate from pattern memory — patterns with > 10 occurrences and > 70% success rate get promoted to long-term memory as "validated institutional knowledge."

**No new files.** Changes to: `base-agent.js` (reading memory in think/plan), `memory-store.js` (new consolidation logic), `pattern-memory.js` (feedback integration).

---

## Layer 3: Knowledge Base + Vector Search in Reasoning

**What changes:** Agents actively query both TF-IDF knowledge base and Pinecone vector search during reasoning, and write back decisions as new knowledge.

**Read path — dual retrieval during `think()`:**
- Step 1: Query Pinecone via eval service (`/search`) with the task as natural language query. Namespace auto-selected by domain mapping (onboarding → onboarding-knowledge, transaction → fraud-cases, etc.). Returns semantically similar cases.
- Step 2: Query local TF-IDF knowledge base with same query. Returns keyword-matched cases.
- Step 3: Merge and deduplicate results. Pinecone results get a "vector" source tag, TF-IDF gets "tfidf" tag. Top 5 combined results injected into LLM prompt as "Relevant institutional knowledge."

This is similar to what we already built in the context engine upgrade (Task 10), but now it happens at the agent level during `think()`, not just at context assembly. The difference: context engine retrieves broadly for the prompt budget; agent-level retrieval is targeted for the specific decision.

**Write path — knowledge capture after every decision:**
- After `observe()` completes, agent calls `knowledgeBase.addKnowledge()` with:
  - namespace: mapped from domain
  - text: structured summary of the case + decision + reasoning
  - metadata: category, sellerId, outcome, riskScore, agentId
- Also upserts to Pinecone via eval service `/ingest` endpoint so future vector searches find this case.

**Advanced RAG in `search/investigate` endpoint:**
- Query decomposition: For complex investigation queries, break into sub-queries (e.g., "electronics seller from Nigeria with velocity anomaly" → separate queries for geography risk + velocity patterns + category risk).
- Add to `routers/search.py`: new `/search/advanced` endpoint that decomposes query, searches multiple namespaces, and reranks combined results using `pinecone-rerank-v0`.

**Changes to:** `base-agent.js` (dual retrieval in think, knowledge write in observe), `routers/search.py` (advanced RAG endpoint). **New file:** `backend/evaluation/services/query_decomposer.py` — breaks complex queries into sub-queries using Claude.

---

## Layer 4: Feedback & Adaptive Learning

**What changes:** Close the learning loop. Agents receive outcome signals, pattern memory gets updated, and risk thresholds self-adjust based on accuracy.

**Outcome simulation engine:**
- New file: `backend/agents/core/outcome-simulator.js`
- After every agent decision, schedules a simulated outcome (delayed by 0-5 seconds to mimic real-world lag). Outcomes are probabilistic but weighted by decision quality:
  - Agent said REJECT + risk > 80 → 85% chance outcome is "confirmed_fraud"
  - Agent said APPROVE + risk < 30 → 90% chance outcome is "legitimate"
  - Agent said REVIEW + risk 40-70 → 50/50 split, simulating genuine uncertainty
  - Edge cases (APPROVE + risk > 60) → higher chance of "false_negative" to teach agents caution
- Outcome types: `confirmed_fraud`, `legitimate`, `false_positive`, `false_negative`, `inconclusive`
- Emits `agent:outcome:received` event with the original decision + actual outcome

**Feedback pipeline:**
- `base-agent.js` listens for `agent:outcome:received` events.
- On receipt: calls `patternMemory.provideFeedback(patternId, wasCorrect)` — this method exists but was never called. Now it updates pattern success rates and confidence scores.
- Saves outcome to long-term memory as a "correction" type entry with high importance (0.8) if the decision was wrong, or "insight" type with medium importance (0.5) if correct.
- Writes outcome back to knowledge base so future searches include "this case turned out to be X."
- Upserts updated record to Pinecone with outcome field populated.

**Adaptive thresholds:**
- New file: `backend/agents/core/threshold-manager.js`
- Tracks rolling window (last 100 decisions) of false positive rate and false negative rate per agent.
- Current thresholds are hardcoded: `AUTO_APPROVE_MAX_RISK: 30`, `AUTO_REJECT_MIN_RISK: 80`.
- Threshold manager adjusts these dynamically:
  - If false negative rate > 15% → lower the auto-approve threshold (more cautious)
  - If false positive rate > 25% → raise the auto-reject threshold (less aggressive)
  - Adjustments capped at +/- 15 points from baseline to prevent runaway drift
  - Changes logged to observability for auditability
- Agents query threshold manager for current thresholds instead of using hardcoded constants.
- Thresholds persist to SQLite so they survive restarts.

**No external dependencies.** Changes to: `base-agent.js` (feedback listener, outcome writes), `pattern-memory.js` (provideFeedback finally connected), specialized agents (use threshold manager instead of constants). New files: `outcome-simulator.js`, `threshold-manager.js`.

---

## Layer 5: Policy Engine & Guardrails

**What changes:** Wrap every agent decision in a policy enforcement layer. Hard rules that cannot be overridden, soft rules that flag for review, and safety boundaries on LLM behavior.

**Policy engine:**
- New file: `backend/agents/core/policy-engine.js`
- Runs after `observe()` produces a recommendation but before the decision is finalized.
- Two types of policies:

**Hard policies (block the decision):**
- Never auto-approve if sanctions/watchlist match found
- Never auto-approve risk score > configurable threshold (from threshold-manager)
- Never approve if KYC verification failed
- Never approve if duplicate account detected with prior fraud
- Block any decision where LLM confidence < 0.3 — force escalation to human
- Rate limit: no agent can make more than 50 decisions per minute (prevents runaway loops)

**Soft policies (flag but allow):**
- Flag if agent overrides pattern memory recommendation (e.g., pattern says REJECT but agent says APPROVE)
- Flag if decision disagrees with ML model prediction by > 30 points
- Flag if case has > 3 critical risk factors but decision is not REJECT
- Flag first-time combinations (new country + new category never seen before)
- Log warning if LLM reasoning contains uncertainty phrases ("I'm not sure", "possibly", "might be")

**Policy structure:**
```javascript
{
  policyId: "POL-001",
  name: "sanctions-hard-block",
  type: "hard" | "soft",
  condition: (decision, evidence, context) => boolean,
  action: "block" | "escalate" | "flag" | "log",
  message: "Cannot approve: sanctions match detected"
}
```

**Enforcement flow:**
```
observe() → proposed decision → policy-engine.enforce(decision, evidence)
  → hard violations? → block + escalate to human
  → soft violations? → flag in decision metadata + log to observability
  → clean? → proceed with decision
```

**Guardrails on LLM behavior:**
- Max tool calls per reasoning cycle: 10 (prevents infinite loops)
- Max LLM calls per decision: 5 (think + plan + observe + 2 retries)
- Prompt injection detection: reject LLM outputs containing tool calls to tools not in the agent's registry
- Output validation: LLM responses must parse as expected JSON schema. If not, fall back to rule-based decision.
- Token budget: cap total tokens per decision at 8000 (prevents runaway costs)

**Observability integration:**
- All policy evaluations logged with: policyId, result (pass/block/flag), decision context, timestamp.
- New metrics: policy violation rate by agent, most triggered policies, escalation rate.
- Exposed via existing `/observability` API.

**Changes to:** `base-agent.js` (insert policy check between observe and finalize). **New file:** `policy-engine.js` with default policy set. Policies are configurable — loaded from a policies array that can be extended.

---

## Summary

| Layer | Focus | New Files | Modified Files |
|-------|-------|-----------|----------------|
| 1 | LLM Reasoning Core | `prompt-templates.js` | `base-agent.js`, `fraud-investigation-agent.js`, `seller-onboarding-agent.js` |
| 2 | Active Memory | — | `base-agent.js`, `memory-store.js`, `pattern-memory.js` |
| 3 | Knowledge + Vector Search | `query_decomposer.py` | `base-agent.js`, `routers/search.py` |
| 4 | Feedback + Learning | `outcome-simulator.js`, `threshold-manager.js` | `base-agent.js`, `pattern-memory.js`, specialized agents |
| 5 | Policy + Guardrails | `policy-engine.js` | `base-agent.js` |

**Design decisions:**
- LLM-first with rule fallback for tool selection
- Memory is advisory context (LLM decides weight)
- Simulated outcomes for feedback loops (demo platform)
- Guardrails included in Phase 1 (safety net for smarter agents)
- Layered approach — each layer testable independently

**Phase 2 (future):**
- Multi-agent coordination upgrades (autonomous help requests, deliberative consensus)
- Rule-suggestion chatbot with RAG
- Advanced React dashboard for memory/learning visualization
- Real external API integration
