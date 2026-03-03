# Agentic AI Reference Guide

> A comprehensive mapping of agentic AI concepts to industry tooling and this project's implementation.
> Use this as a living reference when building, extending, or replicating this architecture.
>
> **Production Stack Upgrade Plan:** See [docs/plans/2026-03-03-production-stack-upgrade-design.md](docs/plans/2026-03-03-production-stack-upgrade-design.md) for the approved migration from SQLite to PostgreSQL + Redis + Qdrant + Neo4j + Langfuse + Mem0.

---

## Table of Contents

1. [Memory Systems](#1-memory-systems)
2. [Vector Databases & Embeddings](#2-vector-databases--embeddings)
3. [RAG Pipeline](#3-rag-pipeline)
4. [Agent Frameworks & Orchestration](#4-agent-frameworks--orchestration)
5. [Agent Communication](#5-agent-communication)
6. [Agent Reasoning](#6-agent-reasoning)
7. [Tool Use & Function Calling](#7-tool-use--function-calling)
8. [LLM Providers](#8-llm-providers)
9. [Evaluation & Observability](#9-evaluation--observability)
10. [Safety & Guardrails](#10-safety--guardrails)
11. [Reranking](#11-reranking)
12. [State Management & Persistence](#12-state-management--persistence)
13. [Graph Analysis & Network Detection](#13-graph-analysis--network-detection)
14. [Consensus & Multi-Agent Collaboration](#14-consensus--multi-agent-collaboration)
15. [Confidence Calibration](#15-confidence-calibration)
16. [Human-in-the-Loop](#16-human-in-the-loop)
17. [Policy Engine & Business Rules](#17-policy-engine--business-rules)
18. [Cost Management](#18-cost-management)
19. [Quick Decision Matrix](#19-quick-decision-matrix)
20. [Architecture Patterns Summary](#20-architecture-patterns-summary)

---

## 1. Memory Systems

### Concept Overview

Agent memory enables learning from past interactions, maintaining context across sessions, and building expertise over time. Production agents need multiple memory tiers — just like human cognition has working memory, short-term recall, and long-term knowledge.

### Industry Landscape

| Tool / Framework | Type | Self-Hosted | Best For |
|---|---|---|---|
| **Letta (MemGPT)** | OS-style virtual memory (core/recall/archival) | Yes + Cloud | Unlimited context agents, persistent agents |
| **Zep** | Auto-summarization + temporal awareness | Limited (CE) | Chat assistants, user-facing memory |
| **Mem0** | Auto-extraction + graph memory | Yes + Cloud | Multi-user personalization |
| **LangChain/LangGraph** | Checkpointing + buffer memory | Yes | Apps already in LangChain ecosystem |
| **Custom (SQLite/Redis)** | Roll your own | Yes | Full control, domain-specific needs |

### What This Project Uses

| Memory Type | Storage | File | TTL | Max Size | What's Stored |
|---|---|---|---|---|---|
| **Short-Term** | SQLite (`agent_short_term_memory`) | `memory-store.js` | 24h | 50/session (FIFO) | Recent reasoning results: timestamp, action type, summary, key facts, success/failure |
| **Long-Term** | SQLite (`agent_long_term_memory`) | `memory-store.js` | Permanent | 500/agent (pruned) | Decision insights, corrections, validated knowledge. Types: `pattern`, `insight`, `preference`, `correction`, `validated_knowledge` |
| **Working** | In-memory object | `base-agent.js` | Per-reasoning-session | Unbounded | Current task state (e.g., matched pattern IDs for feedback) |
| **Pattern** | In-memory Map (3 indexes) | `pattern-memory.js` | Permanent (in-process) | Unbounded | Learned fraud patterns: features, outcome, confidence, success rate. Self-reinforcing on repeated matches |
| **Episodic** | SQLite (`agent_episodes`) | `memory-store.js` | Permanent | Unbounded | Full investigation replays: input, decision, risk score, tool results, chain of thought, reflection |
| **Shared** | SQLite (`agent_shared_memory`) | `memory-store.js` | Permanent | Unbounded | Cross-agent knowledge by topic. Any agent writes, all agents query |

### How Memory Flows Through Reasoning

```
PATTERN MATCH  → query pattern memory for similar past cases
THINK          → context engine assembles: shortTerm + RAG + longTerm (token-budgeted)
ACT            → tools execute, results recorded
OBSERVE        → synthesize findings
LEARN          → save to shortTerm + longTerm + patternMemory + episodicMemory
FEEDBACK       → when outcome known: update patterns, thresholds, confidence calibration
```

### Key Implementation Details

**Long-term memory scoring formula:**
```
totalScore = (keywordScore * 0.5) + (importanceScore * 0.3) + (recencyScore * 0.2)
recencyScore = 0.5 ^ (daysSinceAccess / 7)    // 7-day half-life
```

**Pattern promotion to validated knowledge:**
- Trigger: `occurrences >= 10` AND `successRate >= 0.7`
- Creates `validated_knowledge` entry with importance: `min(0.5 + successRate * 0.3, 0.95)`

**Long-term pruning retention score:**
```
retentionScore = (importance * 0.35) + (accessScore * 0.25) + (recencyScore * 0.25) + (typeBoost * 0.15)
// validated_knowledge gets 0.3 boost, correction gets 0.2 boost
```

### Tradeoffs & Recommendations

| Decision | Option A | Option B | This Project |
|---|---|---|---|
| Memory backend | Managed (Zep, Mem0 Cloud) — zero ops | Self-managed (SQLite/Postgres) — full control | **SQLite** — zero-config, embedded, sufficient for single-node |
| Pattern storage | Vector DB (semantic similarity) | In-memory Map (exact feature matching) | **In-memory Map** — fast O(1) lookup, feature-index-based |
| Memory consolidation | Continuous (every interaction) | Threshold-based (after N occurrences) | **Threshold-based** — only promotes patterns with proven track record |
| Cross-agent memory | Shared vector namespace | Shared SQL table | **Shared SQL table** — simpler, keyword-scored |

---

## 2. Vector Databases & Embeddings

### Concept Overview

Vector databases store high-dimensional embeddings for semantic similarity search. They're the backbone of RAG systems — converting text into numerical representations and finding "similar" content based on meaning rather than keywords.

### Industry Landscape — Vector DBs

| Database | Managed | Open Source | Scale | Hybrid Search | Best For |
|---|---|---|---|---|---|
| **Pinecone** | Yes (only) | No | Billions | Yes (sparse+dense) | Zero-ops, fast start, integrated inference |
| **Weaviate** | Yes + self-host | BSD-3 | Billions | Yes (BM25+vector) | Multi-modal, GraphQL API |
| **Qdrant** | Yes + self-host | Apache 2.0 | Billions | Yes | Performance (Rust), cost-efficient self-hosted |
| **Milvus/Zilliz** | Yes (Zilliz) | Apache 2.0 | Billions+ | Yes | Massive scale, GPU-accelerated |
| **ChromaDB** | Early cloud | Apache 2.0 | Millions | Limited | Prototyping, simple projects |
| **pgvector** | Via Supabase/Neon | Yes (Postgres ext) | Millions | With BM25 plugins | Add vectors to existing Postgres |

### Industry Landscape — Embedding Models

| Model | Open Source | Dimensions | Multilingual | Self-Hostable | Best For |
|---|---|---|---|---|---|
| **OpenAI text-embedding-3** | No | 1536/3072 | Yes | No | General-purpose, highest quality |
| **Cohere Embed v3** | No | 1024 | Yes | No | Multilingual, quantization built-in |
| **Voyage AI** | No | Up to 1536 | Some | No | Code retrieval, domain-specific |
| **BGE-M3** | Yes | 1024 | Yes | Yes | Self-hosted, hybrid (dense+sparse+ColBERT) |
| **multilingual-e5-large** | Yes | 1024 | Yes | Yes | Multilingual, Pinecone-integrated |

### What This Project Uses

| Component | Tool | Details |
|---|---|---|
| **Vector DB** | Pinecone | Serverless, configured via `PINECONE_API_KEY` + `PINECONE_INDEX_NAME` env vars |
| **Embedding** | Pinecone integrated inference | `multilingual-e5-large` and `llama-text-embed-v2` via Python eval service |
| **Namespaces** | 3 namespaces | `onboarding-knowledge`, `fraud-cases`, `risk-patterns` |
| **Metadata fields** | 8 fields | `category`, `country`, `riskScore`, `riskLevel`, `status`, `sellerId`, `domain`, `outcome` |
| **Chunking** | Adaptive chunker | 256 token target, 512 max, 2-sentence overlap. Sentence-based with character fallback |
| **Integration file** | `pinecone_service.py` | Python FastAPI service handles embed + upsert + search |

### Tradeoffs & Recommendations

| Decision | Pinecone (this project) | Qdrant | pgvector |
|---|---|---|---|
| **Ops burden** | Zero | Medium (self-host) | Low (if Postgres exists) |
| **Cost at scale** | Higher (per-query pricing) | Lower (self-hosted compute) | Lowest (existing infra) |
| **Performance** | Excellent | Excellent (Rust) | Good (not purpose-built) |
| **Lock-in** | High (no self-host) | Low (open source) | Lowest (Postgres ecosystem) |
| **Integrated reranking** | Yes (built-in) | No (separate service) | No |
| **When to pick** | Fast start, zero ops | Cost-sensitive, need control | Already have Postgres |

---

## 3. RAG Pipeline

### Concept Overview

Retrieval-Augmented Generation (RAG) grounds LLM responses in factual data by retrieving relevant documents before generating answers. Production RAG goes far beyond naive "chunk → embed → retrieve → generate."

### Industry Landscape

| Component | Industry Tools | Purpose |
|---|---|---|
| **Document parsing** | LlamaParse, Unstructured, Docling | Extract text from PDFs, tables, images |
| **Chunking** | LangChain splitters, LlamaIndex nodes, semantic chunking | Break documents into retrievable units |
| **Retrieval** | LlamaIndex, LangChain, Haystack | Query vector stores and combine results |
| **Hybrid search** | Pinecone, Weaviate, Qdrant (all support) | Combine dense (semantic) + sparse (keyword) |
| **Reranking** | Cohere Rerank, Pinecone Rerank, BGE Reranker | Re-score retrieved results for relevance |
| **Self-query** | LangChain SelfQueryRetriever | Convert natural language to metadata filters |
| **Multi-query** | LangChain MultiQueryRetriever, RAG Fusion | Generate sub-queries for broader coverage |
| **Parent document** | LangChain ParentDocumentRetriever | Retrieve full context around matched chunks |
| **Evaluation** | RAGAS, TruLens, LangSmith | Measure retrieval quality (hit rate, MRR, NDCG) |

### What This Project Uses — Full 4-Stage Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    RAG PIPELINE (context-engine.js)          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Stage 1: SELF-QUERY (self-query.js)                        │
│  ├─ LLM converts natural language → Pinecone metadata       │
│  │  filters ($eq, $gt, $in, $nin, etc.)                     │
│  └─ Fallback: regex pattern extraction if LLM fails         │
│                                                              │
│  Stage 2: MULTI-QUERY (query-decomposer.js)                 │
│  └─ Complex queries decomposed into sub-queries              │
│                                                              │
│  Stage 3: HYBRID SEARCH                                     │
│  ├─ Dense: Pinecone vector search (eval service /search)     │
│  ├─ Sparse: TF-IDF keyword search (knowledge-base.js)       │
│  └─ Fusion: Reciprocal Rank Fusion (RRF, K=60)             │
│                                                              │
│  Stage 4: NEURAL RERANKING (neural-reranker.js)             │
│  ├─ LLM-based scoring (Claude)                              │
│  └─ Fallback: heuristic (keyword overlap + position bias)   │
│                                                              │
│  Stage 5: PARENT DOCUMENT ENRICHMENT                        │
│  └─ Fetch full context via parentDocumentId + chunkIndex     │
│                                                              │
│  Final: TOKEN-BUDGETED ASSEMBLY (context-ranker.js)         │
│  ├─ system: 200 tokens                                      │
│  ├─ task: 500 tokens                                        │
│  ├─ shortTermMemory: 500 tokens                             │
│  ├─ ragResults: 800 tokens                                  │
│  ├─ longTermMemory: 400 tokens                              │
│  └─ domainContext: 300 tokens                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|---|---|
| `context-engine.js` | Orchestrates full RAG assembly with token budgets |
| `self-query.js` | Natural language → metadata filters |
| `query-decomposer.js` | Query decomposition into sub-queries |
| `knowledge-base.js` | TF-IDF sparse search + knowledge storage |
| `neural-reranker.js` | LLM-based + heuristic reranking |
| `chunker.js` | Adaptive sentence-based chunking |
| `retrieval-evaluator.js` | Hit rate, MRR, NDCG@k metrics |

### Tradeoffs

| Approach | Latency | Quality | Cost | This Project |
|---|---|---|---|---|
| Naive RAG (embed → retrieve → generate) | Low | Baseline | Low | No |
| + Hybrid search (dense + sparse) | +50ms | +15-20% | +marginal | **Yes** |
| + Reranking | +100-200ms | +10-15% | +1 API call | **Yes** (LLM-based) |
| + Self-query (metadata filtering) | +200ms (LLM) | +5-10% | +1 LLM call | **Yes** |
| + Multi-query decomposition | +200ms (LLM) | +5-10% | +1 LLM call | **Yes** |
| + Parent document enrichment | +50ms | +5-10% | +marginal | **Yes** |

---

## 4. Agent Frameworks & Orchestration

### Industry Landscape

| Framework | Type | Multi-Model | Key Pattern | Best For |
|---|---|---|---|---|
| **LangGraph** | Graph-based orchestration | Yes | Stateful graphs, checkpoints, sub-graphs | Complex workflows, production agents |
| **CrewAI** | Role-based multi-agent | Yes | Crews with roles/goals/tasks | Business process automation, fast prototyping |
| **AutoGen** | Conversation-based | Yes | Multi-agent chat, debate | Research, code-generation workflows |
| **Semantic Kernel** | Plugin/skills SDK | Yes | Enterprise plugins, planners | .NET/Java enterprise shops |
| **Claude Agent SDK** | Agentic loop SDK | Claude only | Tool use loop, extended thinking | Claude-native agentic systems |
| **OpenAI Agents SDK** | Multi-agent handoff | OpenAI only | Agent handoffs, guardrails | OpenAI-native systems |
| **Bedrock Agents** | Managed service | Multi (AWS) | Knowledge bases + action groups | AWS-native, zero-ops |
| **Vertex AI Agent Builder** | Managed service | Gemini | Grounding, extensions | Google Cloud shops |
| **Temporal** | Durable execution | N/A | Guaranteed workflow completion | Mission-critical, long-running workflows |

### What This Project Uses — Custom Orchestration

This project implements a **custom orchestration engine** (closest to LangGraph concepts but fully hand-built):

| Component | File | Equivalent To |
|---|---|---|
| **AgentOrchestrator** | `agent-orchestrator.js` | LangGraph StateGraph + Checkpointer |
| **AgentRouter** | `agent-router.js` | CrewAI task delegation |
| **AgentCoordinator** | `agent-coordinator.js` | AutoGen group chat patterns |
| **ReasoningGraph** | `reasoning-graph.js` | LangGraph conditional edges |
| **CircuitBreaker** | `circuit-breaker.js` | Temporal retry policies |

**Orchestration features implemented:**
- Workflow definition & execution with checkpointing
- Dynamic agent spawning/despawning (10 agent types)
- Capability-based task routing with performance scoring
- Sequential, parallel, and consensus collaboration
- Circuit breaker (CLOSED → OPEN → HALF_OPEN after 5 failures/60s)
- Retry with exponential backoff (base 1s, multiplier 2x, max 3 retries)
- Human-in-the-loop escalation and resolution

### Tradeoffs: Custom vs. Framework

| Dimension | Custom (this project) | LangGraph | CrewAI |
|---|---|---|---|
| **Control** | Full | High | Medium |
| **Learning curve** | Know your own code | Moderate-High | Low |
| **Community support** | None | Large | Growing |
| **Dependency risk** | None | LangChain ecosystem churn | CrewAI API changes |
| **Feature velocity** | You build everything | Fast (active dev) | Fast (active dev) |
| **Production readiness** | You own reliability | Good (checkpointing, streaming) | Improving |
| **When to pick** | Need full control, domain-specific patterns | Standard agent workflows | Quick multi-agent prototyping |

---

## 5. Agent Communication

### Industry Landscape

| Pattern | Industry Tools | Characteristics |
|---|---|---|
| **Direct messaging** | AutoGen conversations, CrewAI delegation | Point-to-point, synchronous |
| **Message queues** | RabbitMQ, Redis Streams, Kafka, BullMQ | Async, durable, decoupled |
| **Event bus (pub/sub)** | Redis Pub/Sub, Kafka, NATS, EventEmitter | Broadcast, fan-out, decoupled |
| **Shared state** | LangGraph shared state, Redis, databases | Implicit communication via state |
| **A2A Protocol** | Google A2A (Agent-to-Agent) | Standardized inter-agent protocol |

### What This Project Uses

| System | File | Pattern | Details |
|---|---|---|---|
| **AgentMessenger** | `agent-messenger.js` | Direct messaging + help requests | 10 message types, priority levels, correlation IDs, 30s timeout |
| **EventBus** | `event-bus.js` | Pub/sub with wildcards | Agent events, transaction events, alerts. WebSocket broadcast to frontend |

**Message types supported:**
```
HELP_REQUEST, HELP_RESPONSE, INFORMATION_SHARE, TASK_DELEGATION,
TASK_RESULT, BROADCAST, ACKNOWLEDGEMENT, CONSENSUS_REQUEST,
CONSENSUS_VOTE, CONFLICT_ESCALATION, RESULT_REPORT
```

**Help request flow:**
```
Agent A → requestHelp({capability}) → Message Queue
   ↓ (100ms polling loop)
Orchestrator → findAgentByCapability() → Route to Agent B
   ↓
Agent B → handleMessage() → execute tool → respondToHelp()
   ↓
Agent A ← Promise resolves with result (or 30s timeout)
```

### Tradeoffs

| Approach | This Project | Production Alternative |
|---|---|---|
| **In-process messaging** | Yes (Map + polling) | Redis Streams or RabbitMQ for distributed |
| **100ms polling** | Simple, works for single-node | Event-driven (WebSocket/SSE) for lower latency |
| **No message persistence** | Messages lost on crash | Kafka/RabbitMQ for durability |
| **When current approach works** | Single-node, <100 agents | Needs distributed queues at scale |

---

## 6. Agent Reasoning

### Industry Landscape

| Pattern | Description | Used By |
|---|---|---|
| **ReAct** | Reason + Act loop (think → tool → observe) | LangChain, most agent frameworks |
| **Plan-and-Execute** | Generate full plan, then execute steps | LangGraph, BabyAGI |
| **Reflexion** | Self-critique after execution, learn from mistakes | Research (Shinn et al.) |
| **Tree of Thought** | Explore multiple reasoning branches | Research (Yao et al.) |
| **Chain of Thought** | Step-by-step reasoning before answer | Built into Claude, GPT-4, etc. |
| **LATS** | Language Agent Tree Search | Research |
| **Constitutional AI** | Critique outputs against principles | Anthropic |

### What This Project Uses — TPAOR+ Loop

This project implements a **10-phase reasoning loop** that extends ReAct with planning, reflection, and policy enforcement:

```
┌─────────────────────────────────────────────────────────────┐
│              TPAOR+ REASONING LOOP (base-agent.js)           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. PATTERN MATCH  → Query pattern memory for similar cases  │
│  2. THINK          → LLM analyzes input (or hardcoded logic) │
│  3. PLAN           → LLM selects tools + params              │
│  4. ACT            → Execute tools sequentially              │
│  4.5 RE-PLAN       → If >50% tools failed, LLM re-plans     │
│  5. OBSERVE        → LLM synthesizes results into decision   │
│  5.1 REFLECT       → LLM critiques its own decision          │
│  5.15 DEEPEN       → If low confidence, investigate further   │
│  5.25 POLICY CHECK → Hard/soft business rules enforced        │
│  5.5 WRITE-BACK    → Save to knowledge base + Pinecone       │
│  6. CONCLUDE       → Finalize chain of thought               │
│  7. LEARN          → Update short-term, long-term, patterns   │
│  7.5 OUTCOME SIM   → Schedule feedback for closed-loop       │
│  8. EMIT + LOG     → Events, metrics, decision audit          │
│  9. EVALUATE       → Async TruLens/RAGAS (fire-and-forget)   │
│                                                              │
│  Optional: ReasoningGraph (reasoning-graph.js)               │
│  └─ LangGraph-style state machine with conditional edges     │
│     Nodes: think → plan → act → observe → reflect → judge   │
│     Conditional: act → replan (if failures)                  │
│                  observe → deepen (if low confidence)        │
└─────────────────────────────────────────────────────────────┘
```

**Key files:**
- `base-agent.js` — 2.5K lines, full TPAOR+ implementation
- `reasoning-graph.js` — Optional state machine (opt-in via `useReasoningGraph = true`)
- `chain-of-thought.js` — Structured reasoning trace with step types: OBSERVATION, HYPOTHESIS, ANALYSIS, EVIDENCE, INFERENCE, CONCLUSION, VALIDATION

### Tradeoffs

| Feature | Simple ReAct | This Project's TPAOR+ | Impact |
|---|---|---|---|
| Pattern matching | No | Yes (pre-reasoning) | Faster decisions on known patterns |
| Re-planning | No | Yes (>50% failure trigger) | Fault tolerance |
| Reflection/critique | No | Yes (separate LLM call) | Higher accuracy, 2x cost on that step |
| Policy enforcement | No | Yes (hard + soft rules) | Compliance guarantees |
| Knowledge write-back | No | Yes (KB + Pinecone) | Continuous learning |
| LLM calls per decision | 1-3 | 4-6 | Higher cost, higher quality |

---

## 7. Tool Use & Function Calling

### Industry Landscape

| Protocol/Approach | Provider | Key Feature |
|---|---|---|
| **MCP (Model Context Protocol)** | Anthropic (open standard) | Standardized tool discovery + invocation, "USB-C for AI" |
| **OpenAI Function Calling** | OpenAI | JSON Schema tools, parallel calling, strict mode |
| **Anthropic Tool Use** | Anthropic | JSON Schema input, `tool_use` content blocks |
| **Google Function Calling** | Google | Gemini function declarations |
| **MCP adoption** | VS Code, Cursor, LangChain, LlamaIndex | Cross-ecosystem standard emerging |

### What This Project Uses

**Tool system:** Custom Map-based registry with deterministic dispatch.

| Component | File | Details |
|---|---|---|
| **Tool Registry** | `base-agent.js` | `Map<toolName, {name, description, handler}>` |
| **Tool Executor** | `tool-executor.js` | Retry (3 attempts, exponential backoff), LRU cache (200 entries, 5min TTL), tracing |
| **Tool Discovery** | `tool-discovery.js` | MCP-based dynamic discovery, 5min cache |
| **Graph Tools** | `graph-tools.js` | 5 shared graph analysis tools |
| **External APIs** | `external-apis.js` | IP reputation, email verification, device reputation, geolocation |
| **Fraud Databases** | `fraud-databases.js` | Fraud list, consortium data, consortium velocity |
| **Real APIs** | `real-apis.js` | Optional real external service integrations |

**Total tools: ~88 across 10 agents**

| Agent | # Tools | Key Tools |
|---|---|---|
| SellerOnboarding | 26 | verify_identity, screen_watchlist, verify_bank_account, graph tools |
| FraudInvestigation | 16 | check_velocity, verify_device, query_ml_model, search_similar_cases |
| PolicyEvolution | 10 | draft_rule, simulate_rule, deploy_shadow, promote_rule |
| RuleOptimization | 6 | simulate_threshold, analyze_rule_overlap, design_ab_test |
| CrossDomain | 6 | compare_seller_trajectories, predict_next_step |
| AlertTriage | 5 | get_pending_alerts, assign_alert |
| PayoutRisk | 5 | get_payout_velocity, check_bank_change_timing |
| ProfileMutation | 5 | get_change_velocity, compare_identity_documents |
| ListingIntelligence | 5 | check_listing_velocity, find_similar_listings |
| ReturnsAbuse | 4 | get_return_rate_stats, get_buyer_return_profile |

**Execution flow:**
```
LLM PLAN phase → generates { type: "tool_name", params: {...} }
ACT phase → tools.get(action.type).handler(action.params)
         → O(1) Map lookup, sequential execution, traced with spans
         → If >50% fail → RE-PLAN with LLM → execute revised plan
```

---

## 8. LLM Providers

### Industry Landscape

| Provider | Key Models | Context | Self-Hostable | Differentiator |
|---|---|---|---|---|
| **Anthropic** | Claude Opus 4, Sonnet 4, Haiku 3.5 | 200K | No (API) | Safety-first, extended thinking, MCP |
| **OpenAI** | GPT-4o, o1/o3, GPT-4o-mini | 128K | No (API) | Largest ecosystem, multimodal |
| **Google** | Gemini 2.5 Pro/Flash | Up to 2M | No (API) | Longest context, Google Search grounding |
| **Meta** | Llama 4, Llama 3.3 70B | 128K | Yes (open weights) | Free weights, self-hosting, fine-tunable |
| **Mistral** | Mistral Large, Codestral, Mixtral | 128K | Partial | European sovereignty, efficient MoE |

### What This Project Uses

| Component | Details |
|---|---|
| **Model** | `claude-sonnet-4-20250514` via `@anthropic-ai/sdk` |
| **Temperature** | 0.3 (deterministic) |
| **Max tokens** | 2048 per call |
| **Retry** | Exponential backoff: 1s base, 2x multiplier, max 3 retries |
| **Cache** | SHA-256 hash of prompt, 15min TTL, max 500 entries (`llm-cache.js`) |
| **Cost tracking** | Per-agent attribution, $3/$15 per M tokens, budget alerts (`cost-tracker.js`) |
| **Fallback** | All agents degrade to hardcoded decision logic if LLM unavailable |
| **File** | `llm-client.js` (singleton) |

### Tradeoffs

| Decision | API-only (Claude/GPT) | Self-hosted (Llama) | This Project |
|---|---|---|---|
| **Quality** | Highest | Good (70B+) | **Claude Sonnet 4** |
| **Latency** | Network dependent | Local inference | API with caching |
| **Cost at scale** | Per-token pricing | GPU compute only | LLM cache reduces repeat calls |
| **Data privacy** | Data leaves infra | Data stays local | API (acceptable for this use case) |
| **Reliability** | Dependent on provider | You own uptime | **Hardcoded fallback** ensures 100% uptime |

---

## 9. Evaluation & Observability

### Industry Landscape

| Tool | Type | Open Source | Key Metrics | Best For |
|---|---|---|---|---|
| **TruLens** | RAG evaluation | Yes | Groundedness, relevance, toxicity | RAG quality evaluation |
| **RAGAS** | RAG evaluation | Yes (Apache 2.0) | Faithfulness, context precision/recall | Offline RAG benchmarking |
| **LangSmith** | Full observability | No (SaaS) | Tracing, datasets, prompt management | LangChain ecosystem |
| **Arize Phoenix** | LLM observability | Yes | OpenTelemetry-based tracing, embedding viz | Vendor-agnostic observability |
| **Braintrust** | Eval + CI/CD | No (SaaS) | Scoring functions, A/B testing | Eval pipeline in CI/CD |
| **W&B Weave** | LLM tracking | No (SaaS) | Tracing, artifact tracking | Teams already using W&B |
| **OpenLLMetry** | Auto-instrumentation | Yes | OTel spans for LLM calls | Existing observability stacks |

### What This Project Uses

| Component | File | Details |
|---|---|---|
| **TruLens** | `trulens_evaluator.py` | RAG triad evaluation via Python FastAPI service |
| **RAGAS** | `ragas_evaluator.py` | Answer relevance, context relevance, faithfulness |
| **Eval Tracker** | `eval-tracker.js` | Fire-and-forget async eval. Calls `/evaluate` endpoint. SQLite persistence. Regression detection (hourly aggregates) |
| **Trace Collector** | `trace-collector.js` | Span-based distributed tracing. Start/end spans per tool + phase. SQLite storage. Optional OpenTelemetry export |
| **Metrics Collector** | `metrics-collector.js` | Per-agent: executions, successes, failures, duration (p95), tool usage. Flushes every 60s |
| **Decision Logger** | `decision-logger.js` | Every decision → SQLite `agent_decisions` table. Circular buffer of 200 |
| **Retrieval Evaluator** | `retrieval-evaluator.js` | Hit rate, MRR, NDCG@k for retrieval quality |
| **OTel Exporter** | `otel-exporter.js` | Optional export to OpenTelemetry-compatible backends |

### Tradeoffs

| Approach | Latency Impact | Cost | This Project |
|---|---|---|---|
| Synchronous eval | High (blocks response) | Per-eval LLM cost | No — **fire-and-forget async** |
| LLM-as-judge | 200-500ms per eval | 1 LLM call | Yes (via TruLens/RAGAS) |
| Heuristic eval | None | Zero | Yes (retrieval-evaluator.js for MRR/NDCG) |
| Full OpenTelemetry | Minimal (async export) | Backend costs | **Optional** (otel-exporter.js) |

---

## 10. Safety & Guardrails

### Industry Landscape

| Tool | Type | Key Feature |
|---|---|---|
| **Guardrails AI** | Output validation | Validator hub, RAIL spec, structural + semantic checks |
| **NeMo Guardrails** | Conversation control | Colang DSL, topical + safety rails |
| **Azure Prompt Shield** | Input screening | Prompt injection + jailbreak detection |
| **Anthropic Constitutional AI** | Model-level safety | Built into Claude training |
| **Lakera Guard** | Prompt injection API | Real-time injection detection |

### What This Project Uses

| Component | File | Details |
|---|---|---|
| **Input Sanitizer** | `input-sanitizer.js` | Regex-based prompt injection detection (ignore instructions, jailbreak, DAN patterns). Flags invisible/control characters, XML/HTML injection. 3 threat levels |
| **Policy Engine** | `policy-engine.js` | 5 hard policies (BLOCK/ESCALATE) + 3 soft policies (FLAG/LOG). Runs after REFLECT, before decision finalized |
| **Rate Limiter** | `agent-rate-limiter.js` | Per-agent throttling: 30 decisions/min, 500/hour |
| **Output Validator** | `output-validator.js` | Schema validation for tool outputs |
| **LLM Guardrails** | `base-agent.js` | MAX_TOOL_CALLS_PER_CYCLE=10, MAX_LLM_CALLS_PER_DECISION=5, MAX_TOKENS_PER_DECISION=8000 |

**Hard policies:**
1. Sanctions/watchlist match → BLOCK
2. KYC failure → BLOCK
3. Duplicate fraud account → BLOCK
4. Low confidence (<0.3) → ESCALATE
5. High-risk with APPROVE decision → BLOCK (override)

**Soft policies:**
1. Pattern memory override → FLAG
2. Many critical factors → FLAG
3. Uncertainty language in reasoning → LOG

---

## 11. Reranking

### Industry Landscape

| Reranker | Multi-Field | Multilingual | Self-Hostable | Integrated With |
|---|---|---|---|---|
| **Cohere Rerank 3.5** | Yes | Yes | No (API) | Pinecone, Weaviate, LangChain |
| **Pinecone Rerank v0** | No (single field) | Yes | No | Pinecone (zero-hop, built-in) |
| **BGE Reranker v2 M3** | No (single field) | Yes | Yes | Pinecone, general |
| **Jina Reranker v2** | No | Yes | Yes | General |

### What This Project Uses

| Component | File | Approach |
|---|---|---|
| **Neural Reranker** | `neural-reranker.js` | LLM-based scoring (Claude rates relevance 0-1) |
| **Heuristic fallback** | `neural-reranker.js` | Keyword overlap + position bias if LLM unavailable |
| **Pinecone reranking** | Available via Pinecone API | `cohere-rerank-3.5`, `bge-reranker-v2-m3`, `pinecone-rerank-v0` supported |

### Tradeoffs

| Approach | Quality | Latency | Cost | This Project |
|---|---|---|---|---|
| No reranking | Baseline | Lowest | None | No |
| API reranker (Cohere/Pinecone) | +10-15% | +50-100ms | Per-query | Available (Pinecone) |
| LLM-as-reranker | +10-20% | +200-500ms | LLM token cost | **Primary** |
| Self-hosted (BGE/Jina) | +10-15% | +20-50ms | GPU compute | Not used |

---

## 12. State Management & Persistence

### Industry Landscape

| Backend | Latency | Persistence | Distribution | Best For |
|---|---|---|---|---|
| **Redis** | Sub-ms | Optional | Yes | Session cache, real-time state |
| **SQLite** | <1ms | Full ACID | No (single-node) | Embedded, single-process agents |
| **PostgreSQL** | 1-5ms | Full ACID | Yes (replicas) | Production, multi-tenant |
| **DynamoDB** | <10ms | Full | Global | Serverless AWS |

### What This Project Uses

**Primary backend: SQLite** via `better-sqlite3` (through `db_ops` utility)

| Table | Purpose | TTL |
|---|---|---|
| `agent_short_term_memory` | Session-scoped recent context | 24h |
| `agent_long_term_memory` | Persistent learnings | Permanent (pruned at 500) |
| `agent_shared_memory` | Cross-agent knowledge | Permanent |
| `agent_episodes` | Full investigation replays | Permanent |
| `knowledge_entries` | TF-IDF searchable facts | Permanent |
| `reasoning_checkpoints` | TPAOR phase state for crash recovery | 24h |
| `workflow_checkpoints` | Multi-agent workflow state | 24h |
| `agent_decisions` | Decision audit log | Permanent (200 circular buffer) |
| `agent_traces` | Distributed tracing spans | Permanent |
| `agent_metrics` | Performance metrics | Permanent |
| `agent_evaluations` | TruLens/RAGAS eval results | Permanent (200 circular buffer) |
| `agent_calibration` | Confidence calibration buckets | Permanent |
| `agent_costs` | Per-agent LLM cost tracking | Permanent |

**When to migrate from SQLite:**
- Multiple processes/servers → PostgreSQL
- High write concurrency → PostgreSQL or Redis
- Global distribution → DynamoDB or CockroachDB
- Sub-millisecond reads → Redis

---

## 13. Graph Analysis & Network Detection

### Industry Landscape

| Tool | Type | Best For |
|---|---|---|
| **Neo4j** | Graph database | Complex relationship queries, Cypher language |
| **Amazon Neptune** | Managed graph DB | AWS-native, Gremlin/SPARQL |
| **TigerGraph** | Distributed graph DB | Massive scale, real-time analytics |
| **NetworkX** | Python library | Prototyping, small-scale analysis |
| **Custom in-memory** | Application code | Full control, specific algorithms |

### What This Project Uses

**Custom in-memory graph engine** with property indexing:

| Component | File | Details |
|---|---|---|
| **Graph Engine** | `graph-engine.js` | In-memory nodes/edges with bidirectional adjacency lists |
| **Graph Queries** | `graph-queries.js` | BFS traversal, risk propagation, community detection |
| **Graph Tools** | `graph-tools.js` | 5 agent-callable tools |

**Indexed properties:** email, phone, ipAddress, accountNumber, taxId, deviceFingerprint, address (normalized for matching).

**Tools:**
1. `graph_find_connections` — BFS neighbor lookup at configurable depth
2. `graph_risk_propagation` — Risk decay from fraud-flagged nodes
3. `graph_find_rings` — Cycle detection for fraud ring identification
4. `graph_community` — Cluster detection and aggregation
5. `graph_multi_hop_investigate` — Weighted edge traversal (up to 3 hops)

### Tradeoffs

| Approach | Scale | Query Speed | Ops Burden | This Project |
|---|---|---|---|---|
| Neo4j | Billions of edges | Excellent (Cypher optimized) | Medium | Not used |
| In-memory graph | Millions of nodes | Very fast (no I/O) | Zero | **Yes** |
| pgvector + SQL joins | Moderate | Good | Low | Not used |
| **When to migrate** | >10M nodes or need persistence across restarts | | | Consider Neo4j |

---

## 14. Consensus & Multi-Agent Collaboration

### Industry Landscape

| Pattern | Description | Cost Multiplier |
|---|---|---|
| **Multi-agent debate** | Agents argue, critique, converge | 3-5x |
| **Mixture of Agents (MoA)** | Multiple models + aggregator | 4-8x |
| **LLM-as-Judge** | One model evaluates another | 1.5-2x |
| **Constitutional AI (inference)** | Self-critique against principles | 2x |
| **Voting/consensus** | Multiple agents vote, apply strategy | Nx agents |

### What This Project Uses

| Component | File | Details |
|---|---|---|
| **Consensus Engine** | `consensus-engine.js` | 3 strategies: majority (>50%), unanimous (100%), weighted (by confidence) |
| **Agent Coordinator** | `agent-coordinator.js` | Parallel dispatch, delegation, consensus orchestration |
| **Agent Judge** | `agent-judge.js` | Cross-evaluation: FraudInvestigator judges SellerOnboarding and vice versa. LLM-based quality scoring (0-1) |
| **Collaboration modes** | `agent-orchestrator.js` | Sequential (chain context), parallel (independent), consensus (voting) |

**Collaboration strategies:**
```
Sequential:  Agent A → result feeds → Agent B → result feeds → Agent C
Parallel:    Agent A ┐
             Agent B ├─→ collect all results
             Agent C ┘
Consensus:   Agent A vote ┐
             Agent B vote ├─→ apply strategy (majority/unanimous/weighted)
             Agent C vote ┘
```

---

## 15. Confidence Calibration

### Concept Overview

Raw LLM confidence scores are often poorly calibrated (overconfident or underconfident). Calibration adjusts predicted confidence to match observed accuracy — if an agent says "80% confident," it should be correct ~80% of the time.

### What This Project Uses

| Component | File | Details |
|---|---|---|
| **Confidence Calibrator** | `confidence-calibrator.js` | 5 buckets (0.0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0). Tracks predictions vs outcomes per bucket |

**Calibration formula:**
```
adjustedConfidence = (rawConfidence * 0.7) + (observedAccuracyInBucket * 0.3)
calibrationError = average( |bucketMidpoint - actualAccuracy| ) across all buckets
```

**Persistence:** SQLite `agent_calibration` table, loaded on startup.

---

## 16. Human-in-the-Loop

### Concept Overview

Agents should escalate to humans when confidence is low, policies are violated, or stakes are high. This prevents autonomous agents from making critical errors.

### What This Project Uses

| Trigger | Action | File |
|---|---|---|
| Low confidence (<0.3) | ESCALATE to analyst | `policy-engine.js` |
| Hard policy violation | BLOCK + queue for review | `policy-engine.js` |
| Circuit breaker opens | Pause processing | `circuit-breaker.js` |
| Consensus failure | Escalate disagreement | `consensus-engine.js` |

**Resolution flow:**
```
Agent decision → marked for review → queued in humanEscalations[]
                 → WebSocket notification to analyst dashboard
                 → Analyst accepts/rejects/modifies
                 → Outcome event → feeds back to agent learning
```

**API endpoints:**
- `POST /api/decisions/{id}/review` — escalate
- `PUT /api/decisions/{id}/resolve` — analyst input
- Outcome feedback → updates patterns, thresholds, confidence calibration

---

## 17. Policy Engine & Business Rules

### Concept Overview

Policies are hard constraints that override LLM decisions. They ensure compliance regardless of what the model thinks.

### What This Project Uses

**File:** `policy-engine.js`

| Policy | Type | Condition | Action |
|---|---|---|---|
| Sanctions/watchlist match | Hard | `watchlistHit === true` | BLOCK |
| KYC verification failure | Hard | `kycFailed === true` | BLOCK |
| Known fraud duplicate | Hard | `duplicateFraud === true` | BLOCK |
| Low confidence | Hard | `confidence < 0.3` | ESCALATE |
| High-risk approve override | Hard | `riskScore > 80 && decision === APPROVE` | BLOCK |
| Pattern memory override | Soft | Pattern suggests different decision | FLAG |
| Many critical factors | Soft | `criticalFactors > 3` | FLAG |
| Uncertainty language | Soft | Hedging words in reasoning | LOG |

**Execution order:** Policies run AFTER the REFLECT phase, BEFORE the decision is finalized. Hard policies always override LLM decisions.

---

## 18. Cost Management

### Concept Overview

LLM costs can spiral with multi-agent systems (each agent makes 4-6 LLM calls per decision). Tracking and controlling costs is essential.

### What This Project Uses

| Component | File | Details |
|---|---|---|
| **Cost Tracker** | `cost-tracker.js` | Per-agent cost attribution. Pricing: Claude Sonnet 4 = $3/$15 per M tokens (input/output) |
| **LLM Cache** | `llm-cache.js` | SHA-256 prompt hashing, 15min TTL, 500 entry max. Avoids redundant LLM calls |
| **Guardrail limits** | `base-agent.js` | MAX_LLM_CALLS_PER_DECISION=5, MAX_TOKENS_PER_DECISION=8000 |
| **Budget alerts** | `cost-tracker.js` | Per-agent budget enforcement with alerts |

**Cost reduction strategies implemented:**
1. LLM response caching (15min window)
2. Hardcoded fallback when LLM is unnecessary
3. Per-decision LLM call limits
4. Tool result caching (5min, 200 entries)
5. Fire-and-forget evaluation (non-blocking)

---

## 19. Quick Decision Matrix

Use this when choosing tools for a new project or evaluating alternatives:

### "I need a vector database"

| If you need... | Use | Why |
|---|---|---|
| Zero ops, fast start | **Pinecone** | Serverless, integrated embeddings + reranking |
| Cost control at scale | **Qdrant** (self-hosted) | Open source Rust, excellent perf/cost |
| Already have Postgres | **pgvector** | No new infrastructure |
| Prototyping only | **ChromaDB** | Simplest API, embeds in Python process |

### "I need agent orchestration"

| If you need... | Use | Why |
|---|---|---|
| Complex stateful workflows | **LangGraph** | Graph-based, checkpointing, production-ready |
| Quick multi-agent prototype | **CrewAI** | Role-based, intuitive mental model |
| Full control, domain-specific | **Custom** (like this project) | No dependency risk, tailored to domain |
| Zero ops (AWS) | **Bedrock Agents** | Fully managed, multi-model |

### "I need memory"

| If you need... | Use | Why |
|---|---|---|
| Unlimited context | **Letta (MemGPT)** | OS-style memory paging |
| Chat memory with temporal awareness | **Zep** | Auto-summarization, time-aware |
| Simple persistence | **SQLite/Postgres** | Roll your own, full control |
| Multi-user personalization | **Mem0** | Auto-extraction, deduplication |

### "I need evaluation"

| If you need... | Use | Why |
|---|---|---|
| RAG quality metrics | **RAGAS** | Faithfulness, context precision/recall |
| Full observability + eval | **LangSmith** | Tracing + datasets + monitoring |
| Vendor-agnostic tracing | **Arize Phoenix** or **OpenLLMetry** | OpenTelemetry-based |
| RAG triad evaluation | **TruLens** | Groundedness, relevance, toxicity |

---

## 20. Architecture Patterns Summary

### Patterns Used in This Project

| Pattern | Implementation | Why It Matters |
|---|---|---|
| **Singleton services** | All core modules (messenger, router, memory, metrics) | Single source of truth, no state inconsistency |
| **LLM-first with fallback** | Every reasoning phase has hardcoded backup | 100% uptime even without LLM |
| **Token-budgeted context** | Context engine allocates tokens across sources | Prevents context window overflow |
| **Fire-and-forget evaluation** | Async eval doesn't block agent responses | Zero latency impact from evaluation |
| **Circuit breaker** | CLOSED→OPEN→HALF_OPEN (5 failures/60s) | Prevents cascade failures |
| **Exponential backoff** | 1s base, 2x multiplier, max 3 retries | Graceful retry without thundering herd |
| **Capability-based routing** | Router scores agents by success rate + load | Intelligent task distribution |
| **Correlation-based messaging** | UUID correlation IDs link requests to responses | Reliable async request/response |
| **Checkpoint-based recovery** | Each reasoning phase saved to SQLite | Crash recovery mid-investigation |
| **Hybrid retrieval with RRF** | Dense (Pinecone) + Sparse (TF-IDF) + RRF fusion | Best retrieval quality |

### Module Count

| Layer | Modules | Lines (approx) |
|---|---|---|
| Core agent framework | ~25 modules | ~8,000 |
| Specialized agents | 10 agents | ~5,000 |
| Shared tools | 4 tool modules | ~1,500 |
| Evaluation (Python) | 5 services | ~2,000 |
| Gateway/WebSocket | 3 modules | ~1,500 |
| Graph engine | 3 modules | ~1,000 |
| **Total** | **~50 modules** | **~19,000 lines** |

---

## Appendix: Key Files Reference

| Category | File | Purpose |
|---|---|---|
| **Orchestration** | `backend/agents/core/agent-orchestrator.js` | Central coordinator, workflows, spawning |
| **Routing** | `backend/agents/core/agent-router.js` | Capability-based task routing |
| **Coordination** | `backend/agents/core/agent-coordinator.js` | Parallel dispatch, consensus |
| **Messaging** | `backend/agents/core/agent-messenger.js` | Inter-agent communication |
| **Base Agent** | `backend/agents/core/base-agent.js` | TPAOR+ reasoning loop (~2.5K lines) |
| **Reasoning Graph** | `backend/agents/core/reasoning-graph.js` | Optional state machine |
| **Memory Store** | `backend/agents/core/memory-store.js` | Short/long/episodic/shared memory |
| **Pattern Memory** | `backend/agents/core/pattern-memory.js` | Pattern learning + reinforcement |
| **Knowledge Base** | `backend/agents/core/knowledge-base.js` | TF-IDF search + storage |
| **Context Engine** | `backend/agents/core/context-engine.js` | RAG assembly with token budgets |
| **Self-Query** | `backend/agents/core/self-query.js` | NL → metadata filters |
| **Neural Reranker** | `backend/agents/core/neural-reranker.js` | LLM-based reranking |
| **LLM Client** | `backend/agents/core/llm-client.js` | Anthropic SDK wrapper + retry |
| **LLM Cache** | `backend/agents/core/llm-cache.js` | SHA-256 prompt cache |
| **Policy Engine** | `backend/agents/core/policy-engine.js` | Hard/soft business rules |
| **Input Sanitizer** | `backend/agents/core/input-sanitizer.js` | Prompt injection detection |
| **Confidence Calibrator** | `backend/agents/core/confidence-calibrator.js` | Bucket-based calibration |
| **Eval Tracker** | `backend/agents/core/eval-tracker.js` | Async TruLens/RAGAS eval |
| **Trace Collector** | `backend/agents/core/trace-collector.js` | Span-based tracing |
| **Metrics Collector** | `backend/agents/core/metrics-collector.js` | Per-agent performance metrics |
| **Decision Logger** | `backend/agents/core/decision-logger.js` | Audit trail |
| **Cost Tracker** | `backend/agents/core/cost-tracker.js` | Per-agent LLM cost tracking |
| **Threshold Manager** | `backend/agents/core/threshold-manager.js` | Dynamic threshold adjustment |
| **Chain of Thought** | `backend/agents/core/chain-of-thought.js` | Structured reasoning trace |
| **Circuit Breaker** | `backend/agents/core/circuit-breaker.js` | Fault tolerance |
| **Consensus Engine** | `backend/agents/core/consensus-engine.js` | Multi-agent voting |
| **Agent Judge** | `backend/agents/core/agent-judge.js` | Cross-agent quality evaluation |
| **Event Bus** | `backend/gateway/websocket/event-bus.js` | Pub/sub event distribution |
| **Graph Engine** | `backend/graph/graph-engine.js` | Entity relationship graph |
| **Pinecone Service** | `backend/evaluation/services/pinecone_service.py` | Vector search + ingestion |
| **TruLens Eval** | `backend/evaluation/services/trulens_evaluator.py` | RAG quality evaluation |
| **RAGAS Eval** | `backend/evaluation/services/ragas_evaluator.py` | Retrieval metrics |

---

*Last updated: March 2026*
*Project: Fraud Detection Dashboard — Agentic AI Platform*
