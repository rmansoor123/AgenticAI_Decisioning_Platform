# Agentic AI Platform Design

**Goal:** Transform the fraud detection platform into a state-of-the-art agentic AI system with RAG/Vector DB, persistent memory, observability, context engineering, advanced orchestration, multi-agent coordination, and autonomous onboarding.

**Approach:** Build all 7 layers simultaneously as an integrated platform upgrade. All layers share common infrastructure (SQLite for persistence, Pinecone for vector search, event bus for communication).

**Build order:** Knowledge Layer (foundation) → Memory Layer → Context Engine → Orchestration → Multi-Agent → Observability → Autonomous Onboarding (capstone that uses all layers).

---

## Section 1: Knowledge Layer (Pinecone Vector DB)

**Purpose:** Semantic retrieval of historical cases, patterns, and decisions via RAG.

**Pinecone index:** `fraud-knowledge-base` using `multilingual-e5-large` embedding model, field map `text`.

**What gets embedded:**
- Transaction fraud cases (transaction details, fraud signals, outcomes)
- Seller onboarding applications (business info, verification results, risk flags)
- Agent decisions with reasoning chains (what was decided, why, outcome)
- Risk events and patterns (domain, event type, scores, seller context)
- Rule effectiveness data (rule name, trigger rates, false positive rates)

**Namespace strategy:** One namespace per data type — `transactions`, `onboarding`, `decisions`, `risk-events`, `rules`.

**Record schema (consistent across namespaces):**
```json
{
  "_id": "unique-id",
  "text": "semantic content for embedding",
  "category": "transaction|onboarding|decision|risk-event|rule",
  "sellerId": "SELLER-xxx",
  "domain": "onboarding|ato|payout|listing|shipping|transaction",
  "outcome": "fraud|legitimate|pending",
  "riskScore": 75,
  "timestamp": "2026-02-13T00:00:00Z",
  "source": "agent-name|service-name"
}
```

**Backend components:**
- `backend/agents/core/knowledge-base.js` — Singleton wrapping Pinecone operations (upsert, search, search-with-rerank). Provides `addKnowledge(namespace, records)` and `searchKnowledge(namespace, query, filters, topK)`.
- Integration in services: After fraud decisions, onboarding completions, and risk events, relevant data is upserted to the knowledge base.

**Reranking:** Use `pinecone-rerank-v0` for all searches to improve relevance. Search with topK=20, rerank to topN=5.

---

## Section 2: Memory Layer (Persistent Memory)

**Purpose:** Give agents persistent short-term and long-term memory so they learn across sessions and remember recent context.

**Short-term memory (conversation/session scope):**
- Stored in SQLite table `agent_short_term_memory`
- Schema: `agent_id`, `session_id`, `entries` (JSON array of recent observations/actions/results)
- TTL: 24 hours, auto-cleaned on startup
- Max 50 entries per session, FIFO eviction
- Replaces the current in-memory array in BaseAgent

**Long-term memory (permanent, cross-session):**
- Stored in SQLite table `agent_long_term_memory`
- Schema: `agent_id`, `memory_type` (pattern|insight|preference|correction), `content` (JSON), `importance_score`, `access_count`, `last_accessed`, `created_at`
- No TTL — persists forever, importance-weighted retrieval
- Consolidation: When short-term patterns repeat 3+ times, auto-promote to long-term
- Agents write: learned patterns, successful strategies, mistake corrections, domain insights

**Retrieval strategy:**
- Short-term: Direct lookup by agent_id + session_id, most recent first
- Long-term: Keyword match + importance score weighting, boosted by recency of last access
- Both are fed into the context engine (Section 3) for prompt assembly

**Backend components:**
- `backend/agents/core/memory-store.js` — Unified memory interface. Methods: `saveShortTerm(agentId, sessionId, entry)`, `getShortTerm(agentId, sessionId)`, `saveLongTerm(agentId, type, content, importance)`, `queryLongTerm(agentId, query, limit)`, `consolidate(agentId, sessionId)`, `cleanup()`.
- Migration `004-agent-memory.js` — Creates `agent_short_term_memory` and `agent_long_term_memory` tables.
- BaseAgent integration: Constructor initializes memory store, TPAO loop reads/writes short-term, end-of-session triggers consolidation.

---

## Section 3: Context Engineering Layer

**Purpose:** Intelligent prompt construction that assembles the right context from memory, RAG, and current state within token budgets.

**Context assembly pipeline:**
```
Request → Gather Sources → Score & Rank → Budget Allocation → Prompt Assembly → Final Prompt
```

**Sources (in priority order):**
1. System instructions (always included, ~200 tokens)
2. Current task/request (always included, variable)
3. Short-term memory — recent observations and actions (~500 tokens)
4. RAG results — semantically similar historical cases (~800 tokens)
5. Long-term memory — learned patterns and insights (~400 tokens)
6. Domain context — current seller profile, recent events (~300 tokens)

**Token budget:** 4000 tokens total context window for agent prompts. Each source gets a max allocation. If a source doesn't use its full allocation, remaining tokens redistribute to lower-priority sources.

**Relevance scoring:** Each retrieved item gets a relevance score (0-1) based on:
- Semantic similarity (from Pinecone search score)
- Temporal recency (exponential decay, half-life 7 days)
- Historical usefulness (was this context used in a successful decision?)

**Context quality tracking:** After each agent decision, log which context items were included and whether the decision was correct. Over time, learn which sources are most valuable per agent per task type.

**Backend components:**
- `backend/agents/core/context-engine.js` — Main class. Methods: `assembleContext(agentId, task, options)` returns structured prompt with sources attributed. Handles budget allocation, relevance scoring, and source selection.
- `backend/agents/core/prompt-builder.js` — Template-based prompt construction. Takes assembled context and formats into agent-specific prompts with clear section markers.

---

## Section 4: Advanced Orchestration Layer

**Purpose:** Replace the current basic sequential/parallel execution with conditional branching, retry with backoff, dynamic routing, and circuit breakers.

**Upgrades to existing `agent-orchestrator.js`:**

**Conditional branching:**
```javascript
{
  type: 'conditional',
  evaluate: (context) => context.riskScore > 80 ? 'high_risk' : 'standard',
  branches: {
    high_risk: [deepInvestigationStep, manualReviewStep],
    standard: [quickCheckStep, autoApproveStep]
  }
}
```

**Retry with exponential backoff:**
- Configurable per step: `maxRetries`, `backoffMs`, `backoffMultiplier`
- Default: 3 retries, 1000ms initial, 2x multiplier
- Retry only on transient failures (timeouts, rate limits), not on logic errors

**Dynamic routing:**
- Route tasks to agents based on current load, specialization match, and past performance
- `AgentRouter` maintains a capability registry and performance scores
- Selects best available agent for each task type

**Circuit breaker:**
- Per-agent circuit breaker: CLOSED → OPEN (after 5 failures in 60s) → HALF-OPEN (test after 30s)
- When open, tasks route to fallback agent or queue for retry
- Prevents cascade failures when an agent's underlying service is down

**Workflow checkpointing:**
- Save workflow state to SQLite after each step completes
- On crash recovery, resume from last checkpoint instead of restarting
- Table: `workflow_checkpoints` with workflow_id, step_index, state (JSON), status

**Backend components:**
- `backend/agents/core/agent-orchestrator.js` — Enhanced with conditional branching, retry logic, checkpointing (extends existing file)
- `backend/agents/core/agent-router.js` — Dynamic routing with capability matching and load balancing
- `backend/agents/core/circuit-breaker.js` — Circuit breaker pattern implementation
- Migration `005-orchestration.js` — Creates `workflow_checkpoints` table

---

## Section 5: Multi-Agent Coordination

**Purpose:** Enable agents to work together on complex investigations through parallel execution, structured delegation, and consensus mechanisms.

**Parallel execution:**
- Orchestrator dispatches independent subtasks to multiple agents simultaneously
- `Promise.allSettled` — partial results are still useful if some agents fail
- Results are aggregated by a coordinator agent that synthesizes findings

**Structured delegation:**
- Lead agent (e.g., Fraud Investigation) can delegate subtasks:
  ```javascript
  await this.delegate('alert-triage-agent', {
    task: 'analyze_transaction_velocity',
    sellerId: 'SELLER-xxx',
    timeWindow: '24h'
  });
  ```
- Delegation tracked in memory — lead agent sees all delegated results
- Timeout per delegation (default 30s), fallback to lead agent's own analysis

**Consensus mechanism:**
- For high-stakes decisions (CRITICAL risk tier actions), require agreement from 2+ agents
- Consensus strategies:
  - `majority` — >50% of agents agree
  - `unanimous` — all agents agree
  - `weighted` — agents vote with confidence scores, weighted by past accuracy
- If no consensus reached, escalate to human reviewer with all agent opinions

**Conflict resolution:**
- When agents disagree, the system logs the disagreement with each agent's reasoning
- A meta-analysis compares the reasoning chains and identifies the key point of divergence
- Result stored in long-term memory so agents learn from disagreements

**Enhanced messaging:**
- Upgrade `agent-messenger.js` with structured message types: `TASK_DELEGATION`, `RESULT_REPORT`, `CONSENSUS_REQUEST`, `CONSENSUS_VOTE`, `CONFLICT_ESCALATION`
- Message correlation IDs for tracking multi-step conversations between agents
- Priority queue: consensus votes and escalations get processed before routine messages

**Backend components:**
- `backend/agents/core/agent-coordinator.js` — Parallel dispatch, result aggregation, consensus evaluation
- `backend/agents/core/agent-messenger.js` — Enhanced with structured message types and correlation tracking (extends existing file)
- `backend/agents/core/consensus-engine.js` — Voting, weighted consensus, conflict detection

---

## Section 6: Observability Layer

**Purpose:** Full visibility into agent behavior, decision quality, and system health through metrics, tracing, and decision audit trails.

**Three pillars:**

**1. Metrics Collection:**
- Agent execution count, duration (p50/p95/p99), success/failure rates
- Tool usage frequency and latency per agent
- Memory hit/miss rates (how often retrieved context was useful)
- RAG retrieval relevance scores
- Decision confidence distribution
- Token usage per agent per reasoning cycle

**2. Distributed Tracing:**
- Each agent invocation gets a trace ID that follows the full execution path
- `TraceCollector` wraps every TPAO cycle, tool call, memory lookup, and RAG query
- Traces capture: input → context assembly → reasoning steps → actions taken → outcome
- Parent-child spans for multi-agent workflows (orchestrator → child agents)
- Stored in SQLite with TTL-based cleanup (7 days default)

**3. Decision Audit Trail:**
- Every agent decision logged with: context available, reasoning applied, action taken, outcome
- Counterfactual logging: what would have happened with different context
- Structured for compliance and debugging

**Backend components:**
- `backend/agents/core/metrics-collector.js` — Singleton that collects and aggregates metrics in-memory with periodic SQLite flush
- `backend/agents/core/trace-collector.js` — Span-based tracing with nested context propagation
- `backend/agents/core/decision-logger.js` — Structured decision logging with before/after snapshots
- `backend/services/observability/index.js` — Express router exposing metrics/traces/decisions via API
- Migration `006-observability.js` — Creates `agent_metrics`, `agent_traces`, `agent_decisions` tables

**API endpoints:**
- `GET /api/observability/metrics` — Current metrics (filterable by agent, time range)
- `GET /api/observability/traces` — Recent traces with span details
- `GET /api/observability/traces/:traceId` — Full trace waterfall
- `GET /api/observability/decisions` — Decision audit log
- `GET /api/observability/health` — Agent health dashboard data

**Frontend — Dedicated Observability Page (`/observability`):**
- Agent Health Overview — Cards per agent showing status, success rate, avg latency, last active
- Metrics Dashboard — Recharts line/bar charts for execution trends, error rates, latency percentiles
- Trace Explorer — Searchable list of traces, click to expand waterfall view
- Decision Log — Filterable table of agent decisions with expandable reasoning
- Memory & RAG Stats — Hit rates, retrieval quality scores, index utilization

---

## Section 7: Autonomous Onboarding Agent

**Purpose:** Upgrade the onboarding agent from scripted decision trees to genuine autonomy with tool use, evidence gathering, and self-correction.

**Autonomy model — Supervised:**
- Low/Medium risk (score < 60): Fully autonomous — agent approves/rejects without human intervention
- High/Critical risk (score >= 60): Agent prepares recommendation with full reasoning, routes to human reviewer

**Tool use — The agent gets real tools it can invoke:**
- `verifyIdentity(sellerId)` — Run KYC/identity verification checks
- `checkBusinessRegistry(businessName, country)` — Validate business registration
- `searchVectorDB(query)` — Semantic search for similar past cases via Pinecone
- `checkVelocity(email, ip, deviceId)` — Check application velocity patterns
- `queryRiskProfile(sellerId)` — Get current risk profile if seller exists
- `retrieveMemory(context)` — Pull relevant long-term memory
- `flagForReview(sellerId, reason, evidence)` — Escalate to human with structured context

**Self-correction loop:**
- After each decision, agent logs prediction (approve/reject/escalate) and confidence
- Background process compares predictions against actual outcomes after 30/60/90 days
- When accuracy drops below threshold, agent:
  1. Retrieves incorrect decisions from memory
  2. Analyzes patterns in errors
  3. Updates reasoning weights in long-term memory
  4. Logs correction cycle as trace for observability

**Enhanced TPAO loop:**
```
Think → What do I know about this seller? What's suspicious? What's normal?
Plan  → Which tools should I use? What evidence do I need?
Act   → Execute tool calls, gather evidence, run checks
Observe → Did evidence match hypothesis? Should I dig deeper?
(loop until confident or max iterations reached)
Decide → Approve / Reject / Escalate with full reasoning chain
```

**Backend components:**
- `backend/agents/specialized/seller-onboarding-agent.js` — Upgraded with tool definitions, autonomous decision-making, confidence thresholds
- `backend/agents/core/tool-executor.js` — Generic tool execution framework usable by any agent
- `backend/agents/core/self-correction.js` — Outcome tracking and reasoning adjustment

**Integration:** Agent decisions traced via observability, uses memory for pattern learning, uses RAG for similar cases, self-correction feeds back into long-term memory.
