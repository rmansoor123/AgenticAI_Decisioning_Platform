# Fraud Shield — Agentic AI Fraud Detection Platform

## Vision

This project aims to be the most state-of-the-art agentic AI implementation for fraud detection and seller risk decisioning. Every enhancement should push toward production-grade autonomous agents with full explainability, continuous learning, and rigorous evaluation.

Reference architectures from **LangGraph/LangChain** should be studied and adapted — particularly state graphs, checkpointing, human-in-the-loop patterns, and tool orchestration. The goal is not to import these frameworks but to learn from their design patterns and build equivalent or superior capabilities natively.

**Priority capability target:** Advanced RAG + Grounding — citation-grounded reasoning, retrieval quality, hybrid search, and evidence-linked decision explanations.

## Project Overview

Full-stack eCommerce fraud detection platform with autonomous AI agents that evaluate sellers, investigate transactions, triage alerts, and optimize fraud rules.

- **Frontend:** React 19 + Vite 7 + Tailwind CSS 4 + Recharts + react-force-graph-2d
- **Backend:** Node.js (ES modules) + Express 4 + WebSocket (ws)
- **Database:** SQLite (better-sqlite3) with in-memory Map fallback
- **AI/ML:** Anthropic Claude SDK (claude-sonnet-4-20250514), TensorFlow.js, MCP SDK
- **Eval Service:** Python FastAPI microservice with TruLens + RAGAS (port 8000)

## Architecture

```
frontend/src/          → React app (28 pages, dashboard, onboarding, agents)
backend/
  agents/
    core/              → Agent framework (24 modules, ~6000 lines)
    specialized/       → 4 domain agents
    tools/             → External API integrations (mock + real)
  services/            → 11 business service domains
  gateway/server.js    → Express + WebSocket gateway (~34k lines)
  shared/common/       → Database, migrations, synthetic data
  evaluation/          → Python eval service (TruLens + RAGAS)
  mcp/                 → MCP server exposing agent tools
```

## Agent Framework

### Core Reasoning Loop (base-agent.js)

Every agent follows Think-Plan-Act-Observe-Reflect:

```
Step 1:    PATTERN MATCHING    → Check memory for similar past cases
Step 2:    THINK               → LLM-enhanced analysis (with fallback)
Step 3:    PLAN                → LLM selects tools (with fallback)
Step 4:    ACT                 → Execute tools (deterministic dispatch)
Step 5:    OBSERVE             → LLM synthesizes findings (with fallback)
Step 5.1:  REFLECT             → LLM critiques decision (with fallback)
Step 5.25: POLICY CHECK        → Hard/soft policy enforcement
Step 5.5:  KNOWLEDGE WRITE-BACK → Persist to KB + Pinecone
Step 6:    CONCLUDE            → Chain of thought finalization
Step 7:    LEARN               → Pattern memory + long-term memory
Step 7.5:  OUTCOME SIMULATION  → Schedule feedback for learning
Step 8:    EMIT + LOG          → Events, metrics, traces, decisions
Step 9:    EVALUATE            → Async eval via TruLens/RAGAS
```

### Specialized Agents

| Agent | File | Role | Decision |
|-------|------|------|----------|
| SellerOnboardingAgent | seller-onboarding-agent.js | KYC + risk evaluation | APPROVE/REVIEW/REJECT |
| FraudInvestigationAgent | fraud-investigation-agent.js | Transaction deep-dive | BLOCK/REVIEW/MONITOR/APPROVE |
| AlertTriageAgent | alert-triage-agent.js | Alert prioritization + routing | Assignment decisions |
| RuleOptimizationAgent | rule-optimization-agent.js | Rule performance analysis | Optimization recommendations |

### Core Modules

| Module | Purpose |
|--------|---------|
| llm-client.js | Anthropic SDK singleton, retry, usage tracking |
| prompt-templates.js | Structured prompts for think/plan/observe/reflect |
| pattern-memory.js | Learn + recall fraud patterns with reinforcement |
| memory-store.js | Short-term (session) + long-term (persistent) memory |
| chain-of-thought.js | Explicit reasoning traces for auditability |
| policy-engine.js | 8 hard/soft policies, LLM guardrails |
| eval-tracker.js | Persistent eval scores, regression detection |
| threshold-manager.js | Adaptive risk thresholds from accuracy feedback |
| self-correction.js | Outcome feedback + correction cycles |
| outcome-simulator.js | Simulated outcomes for closed-loop learning |
| agent-orchestrator.js | Multi-agent workflows, consensus, escalation |
| agent-messenger.js | Inter-agent communication + help requests |
| context-engine.js | Context assembly from multiple sources |
| knowledge-base.js | TF-IDF search with recency boost |
| consensus-engine.js | Multi-agent voting (majority/unanimous/weighted) |
| circuit-breaker.js | Fault tolerance for failing agents |
| trace-collector.js | Span-based distributed tracing |
| decision-logger.js | Decision audit trail |
| metrics-collector.js | Per-agent/tool success rates, p95 latency |

## Code Conventions

### Patterns to Follow

- **Singleton pattern:** All core modules export a `getXxx()` factory function (e.g., `getEvalTracker()`, `getMetricsCollector()`)
- **LLM-first with fallback:** Every LLM-powered method checks `this.llmClient?.enabled`, tries LLM, falls back to hardcoded logic
- **Event bus integration:** Optional event bus import via top-level `await import()` in try/catch
- **Database access:** Use `db_ops.insert/getById/getAll/query/update/delete` from `shared/common/database.js`
- **ID format:** `PREFIX-{agentId|context}-{timestamp.toString(36)}` (e.g., `DEC-SELLER_O-lx1abc`, `EVAL-FRAUD_INV-m2xyz`)
- **Circular buffers:** In-memory arrays with `maxRecent` limits + DB persistence for durability
- **ES modules:** All files use `import/export`, no CommonJS

### Testing

- Integration tests in `__tests__/` directories using simple assert functions
- Run tests with: `node backend/agents/core/__tests__/reflect-and-eval.test.js`
- No test framework dependency — standalone Node.js scripts

### Commits

- Follow conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`
- Each commit should be atomic — one logical change per commit

## Key Design Decisions

1. **LLM is optional, never required.** Agents must work fully without LLM via hardcoded decision rules.
2. **Policy engine overrides LLM.** Hard policies (sanctions, KYC failure) always take precedence over LLM recommendations.
3. **Reflection catches errors pre-decision.** The reflect step runs BEFORE policy enforcement so both LLM critique and business rules act as independent safety layers.
4. **Eval is fire-and-forget.** Evaluation tracking never blocks the decision path.
5. **Synthetic data for development.** All data is Faker-generated. Real API integrations are optional via env vars.
6. **Single LLM provider.** Only Anthropic Claude via `@anthropic-ai/sdk`. Temperature 0.3 for deterministic outputs.

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...     # Claude API key
USE_LLM=true                     # Enable LLM-enhanced reasoning
EVAL_SERVICE_URL=http://localhost:8000  # Python eval service
DB_PATH=./data/fraud_detection.db      # SQLite database path
PORT=3001                         # Express server port
```

## Running the Project

```bash
# Backend
cd backend && npm install && node gateway/server.js

# Frontend
npm install && npm run dev

# Eval service (Python)
cd backend/evaluation && pip install -r requirements.txt && uvicorn main:app --port 8000

# MCP server
cd backend && npm run mcp
```

## Reference Architectures to Study

### LangGraph / LangChain

Study these patterns and adapt to our native framework:
- **State graphs:** How LangGraph models agent state transitions — compare with our TPAO+R loop
- **Checkpointing:** LangGraph's persistence layer — compare with our workflow_checkpoints
- **Human-in-the-loop:** LangGraph's interrupt/resume patterns — compare with our orchestrator escalation
- **Tool orchestration:** LangChain's tool calling patterns — compare with our tool registry
- **Retrieval chains:** LangChain's RAG patterns — enhance our dual retrieval (vector + TF-IDF)
- **Structured output:** LangChain's output parsers — compare with our parseLLMJson

When reviewing LangGraph/LangChain code, focus on what we can learn about:
1. More sophisticated state management across agent steps
2. Better retrieval strategies (parent document retriever, self-query, multi-query)
3. Evaluation patterns (LangSmith traces, online evaluation)
4. Graph-based agent routing and conditional edges

## Roadmap — State of the Art Targets

### Advanced RAG + Grounding (Priority)
- [ ] Citation-grounded reasoning: every claim linked to specific tool evidence
- [ ] Hybrid search: combine dense (Pinecone) + sparse (BM25/TF-IDF) with learned reranking
- [ ] Chunk strategies: adaptive chunking for knowledge base entries
- [ ] Multi-query retrieval: decompose complex queries into sub-queries
- [ ] Self-query: agent generates metadata filters for vector search
- [ ] Parent document retrieval: store full documents, retrieve relevant chunks
- [ ] Retrieval evaluation: measure retrieval quality separately from generation quality

### Agent Intelligence
- [ ] Dynamic tool discovery via MCP: agents find and use new tools at runtime
- [ ] Agent-as-Judge: agents evaluating other agents' decisions
- [ ] Complex task decomposition and re-planning on failure
- [ ] Confidence calibration: predicted confidence vs actual accuracy alignment
- [ ] Adversarial testing / red-teaming of agent decisions
- [ ] Multi-turn investigation: follow-up rounds based on initial findings

### Production Readiness
- [ ] Golden test suite: 100+ labeled cases for regression testing
- [ ] OpenTelemetry export for distributed tracing
- [ ] Human feedback collection UI for analyst corrections
- [ ] Tool output schema validation with Zod
- [ ] Structured output parsing with LLM retry on parse failure
- [ ] Performance profiling dashboard

## Documentation

Design documents and plans live in `docs/plans/` with format `YYYY-MM-DD-<topic>-{design|plan}.md`. Root-level markdown files contain architecture overviews and integration guides.
