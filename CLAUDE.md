# Fraud Shield — Agentic AI Decisioning Platform

## What This Is
eCommerce fraud decisioning platform. Every seller lifecycle event passes through
an AI agent → structured risk decision → enforced by the service → feeds back
to improve future decisions.

---

## Quick Navigation
| Question | Section |
|---|---|
| How does the platform work? | [Architecture](#architecture) |
| Which agents exist + status? | [Agents](#agents) |
| Full seller journey + what's wired? | [Seller Journey](#seller-journey) |
| API routes + data shapes? | [Services](#services) |
| Wire agent to service? | `.claude/skills/wire-agent/SKILL.md` |
| Create a new agent? | `.claude/skills/new-agent/SKILL.md` |
| Add a fraud rule? | `.claude/skills/add-rule/SKILL.md` |
| Run / interpret evals? | `.claude/skills/run-eval/SKILL.md` |
| Agent making wrong decisions? | `.claude/skills/debug-agent/SKILL.md` |
| Fraud rules (106 rules)? | `docs/RISK_DECISION_RULES_REPOSITORY.md` |

---

## Architecture

### Stack
**Frontend**: React 19 + Vite + Tailwind + Recharts + react-force-graph-2d — `src/` (34 routes)
**Backend**: Node.js ES modules + Express — `backend/`
**Gateway**: `backend/gateway/server.js` — single entry point, port 3001
**Frontend dev**: port 5173
**Eval service**: Python FastAPI — `backend/evaluation/`, port 8000
**AI/ML**: TensorFlow.js, MCP SDK

### Pluggable Backends (factory pattern — all have graceful fallback)
Every backend swapped via env var. Default config works with zero Docker.

| Layer | Env Var | Default | Production Options |
|---|---|---|---|
| Database | `DB_BACKEND` | `sqlite` | `postgres` (pgvector) |
| Memory | `MEMORY_BACKEND` | `sqlite` | `letta`, `mem0` |
| Cache | `CACHE_BACKEND` | `memory` | `redis` |
| Vector | `VECTOR_BACKEND` | `pinecone` | `qdrant`, `chromadb`, `weaviate` |
| Graph | `GRAPH_BACKEND` | `memory` | `neo4j` |
| Observability | `OBSERVABILITY_BACKEND` | `sqlite` | `langfuse`, `phoenix` |
| Temporal Memory | `TEMPORAL_BACKEND` | `none` | `zep`, `memory` |
| LLM | `LLM_PROVIDER` | `ollama` | `openai`, `anthropic` |

**Import pattern — always use factories, never import backends directly:**
```js
import { getDbOps, initializeDb } from '../shared/common/database-factory.js';
import { getMemoryBackend } from '../agents/core/memory-factory.js';
import { getCacheBackend } from '../agents/core/cache-factory.js';
import { getGraphBackend } from '../graph/graph-factory.js';
import { getObservabilityTraceCollector, getObservabilityMetricsCollector, getObservabilityDecisionLogger } from '../agents/core/observability-factory.js';
```

### LLM Providers
Three providers via `LLM_PROVIDER` env var. All agents work without LLM via hardcoded fallback.

| Provider | Default Model | Cost | Setup |
|---|---|---|---|
| **Ollama** (default) | `qwen2.5:7b` | Free, local | `brew install ollama` (native, fast) or `docker-compose up ollama -d` |
| OpenAI | `gpt-4o-mini` | Paid API | `LLM_PROVIDER=openai` + `OPENAI_API_KEY` |
| Anthropic | `claude-haiku-4-5-20251001` | Paid API | `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` |

Ollama uses the OpenAI SDK via its OpenAI-compatible API at `http://localhost:11434/v1`.
Native Ollama: ~1s per call (Apple Silicon). Docker Ollama: ~90s per call (CPU-only).

### Docker Services
| Service | Image | Port | Purpose |
|---|---|---|---|
| postgres | pgvector/pgvector:pg16 | 5432 | Production DB + vector search |
| redis | redis:7-alpine | 6380 | Cache + pattern memory |
| qdrant | qdrant/qdrant:latest | 6333 | Vector DB (alt to Pinecone) |
| neo4j | neo4j:5-community | 7474/7687 | Fraud ring graph analysis |
| langfuse | langfuse/langfuse:2 | 3100 | LLM observability + traces |
| zep | ghcr.io/getzep/zep:latest | 8200 | Temporal / episodic memory |
| letta | letta/letta:latest | 8283 | Long-term agent memory |
| chromadb | chromadb/chroma:latest | 8100 | Vector DB (alt) |
| weaviate | semitechnologies/weaviate:latest | 8081 | Vector DB (alt) |
| ollama | ollama/ollama:latest | 11434 | Local LLM (qwen2.5:7b default) |
| phoenix | arizephoenix/phoenix:latest | 6006 | Arize eval observability |

### Agent Reasoning Loop (TPAOR)
Every agent in `base-agent.js` follows this exact sequence:
```
PATTERN MATCH → THINK → PLAN → ACT → RE-PLAN → OBSERVE → REFLECT → MULTI-TURN → POLICY → JUDGE → KB WRITE → LEARN → EMIT → EVAL
```
- **THINK**: LLM analyzes context + recalled patterns → risk signals
- **PLAN**: LLM selects tools to call
- **ACT**: Deterministic tool execution (no LLM)
- **RE-PLAN**: If >50% tools failed, LLM generates revised plan
- **OBSERVE**: LLM synthesizes tool results → preliminary decision
- **REFLECT**: LLM critiques own decision → may revise
- **MULTI-TURN**: If uncertain, follow-up tools (max 2 rounds)
- **POLICY**: Hard/soft policy rules → may override LLM
- **JUDGE**: Cross-agent review for REJECT/BLOCK decisions
- **LEARN**: Pattern memory + long-term memory updated
- **EMIT**: Decision logged, risk event emitted, eval triggered async

### Database Tables (28 tables — SQLite / Postgres)
| Table | Key Column | What It Stores |
|---|---|---|
| sellers | seller_id | Seller profiles + risk scores |
| transactions | transaction_id | Transaction records |
| listings | listing_id | Item listings |
| payouts | payout_id | Payout requests + decisions |
| ato_events | event_id | Account takeover signals |
| shipments | shipment_id | Shipping records |
| ml_models | — | ML model registry |
| rules | — | Fraud rules |
| experiments | — | A/B experiments |
| datasets | — | Training datasets |
| metrics_history | — | Historical metrics |
| pipeline_runs | — | Pipeline execution logs |
| alerts | — | Alert queue |
| investigations | — | Investigation records |
| schema_migrations | — | Migration tracking |
| seller_images | — | Seller uploaded images |
| seller_risk_profiles | seller_id | Cross-domain risk scores |
| risk_events | event_id | Per-domain risk signal history |
| knowledge_entries | — | TF-IDF knowledge base |
| agent_short_term_memory | — | Session-scoped agent memory |
| agent_long_term_memory | — | Persistent cross-session memory |
| workflow_checkpoints | — | Agent workflow state persistence |
| agent_metrics | — | Per-agent performance metrics |
| agent_traces | — | TPAOR span traces |
| agent_decisions | decision_id | Full agent decision audit trail |
| cases | case_id | Human review queue |
| agent_feedback | — | Human analyst corrections |
| agent_events | — | Agent event log |

**DB access pattern — never use raw SQL:**
```js
db_ops.insert('table', 'primary_key_col', keyValue, dataObject);
db_ops.getById('table', 'primary_key_col', keyValue);
db_ops.getAll('table', limit, offset);
db_ops.update('table', id, updates);
db_ops.query('table', filters);
```

### Risk Scoring
```
Domain weights (emit-event.js — do not change):
  onboarding:0.12  ato:0.14  payout:0.12  listing:0.07
  shipping:0.10  transaction:0.08  account_setup:0.08  item_setup:0.07
  pricing:0.08  profile_updates:0.07  returns:0.07

Risk tiers:
  CRITICAL ≥86 → seller_suspended + transactions_blocked + payouts_held
  HIGH     ≥61 → listings_suspended + payouts_held + large_txn_review
  MEDIUM   ≥31 → large_payouts_held + flagged_for_review
  LOW      <31 → normal operations

Score decay: 30-day half-life. Signals fade without reinforcement.
De-escalation cooldown: 48 hours.
```

### Risk Event Emission
```js
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
emitRiskEvent({ sellerId, domain, eventType, riskScore, metadata });
// Inserts risk_events record, then recalculates seller aggregate profile
```

### ID Conventions
```
Sellers:      SLR-{ts36}                e.g. SLR-LX1ABC
Decisions:    DEC-{AGENT_ID}-{ts36}     e.g. DEC-SELLER_O-LX1ABC
Cases:        CASE-{8-char-uuid-upper}  e.g. CASE-A1B2C3D4
Transactions: TXN-{ts36}
Payouts:      PAY-{ts36}
Risk Events:  RE-{timestamp}-{6-char}
```

### Non-Negotiable Rules
1. Agent errors → `HOLD`, never `APPROVE`
2. Policy engine runs last, always overrides LLM
3. `USE_LLM=false` must work everywhere — hardcoded fallback required in every agent
4. Every decision → `decision-logger.js` + `emitRiskEvent()`
5. Always use factory imports — never import backends directly
6. New fraud rules start as `SHADOW`, not `ACTIVE`
7. DB access only via `db_ops` — never raw SQL
8. Agents are singletons — always `getXxx()` factory, never `new Xxx()`
9. ES modules only — `import/export`, no CommonJS
10. Conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`

### Run Commands
```bash
# Minimal (no Docker needed)
USE_LLM=false node backend/gateway/server.js

# With local LLM (recommended — fast on Apple Silicon)
brew install ollama && ollama serve &
ollama pull qwen2.5:7b
USE_LLM=true LLM_PROVIDER=ollama node backend/gateway/server.js

# With Docker LLM (slow, CPU-only)
docker-compose up ollama -d && bash scripts/setup-ollama.sh
node backend/gateway/server.js

# Full stack
docker-compose up -d
node backend/gateway/server.js
npm run dev                                   # frontend :5173

# Eval service
cd backend/evaluation && uvicorn main:app --port 8000
```

---

## Agents

### Agent Contract (base-agent.js)
Every agent MUST:
- Extend `BaseAgent` (or `AutonomousAgent` for scheduled agents)
- Export a singleton via `getXxx()` factory or direct instance
- Implement `think()`, `plan()`, `observe()` (optionally `reflect()`)
- Have hardcoded fallback that works without LLM (`if (!this.llmClient?.enabled)`)
- Default to `HOLD` on any error, never `APPROVE`
- Call `emitRiskEvent()` after every decision
- Register tools in constructor via `this.registerTool(name, description, handler)`

### Decision Object Shape (all agents return this from reason())
```js
{
  result: {
    recommendation: { action, confidence, reason },
    overallRisk: { score, level, criticalFactors, highFactors },
    riskFactors: [{ factor, severity, score }],
    evidence: [{ source, data, success, timestamp }],
    reasoning: 'Human-readable explanation',
    policyOverride: boolean,
    policyViolations: [],
    _judgeReview: { verdict, reason, confidence }
  },
  chainOfThought: { chainId, steps: [], summary, primaryConclusion },
  reflection: { shouldRevise, revisedAction, concerns },
  actions: [{ action, result }],
  latencyMs: number
}
```

### Specialized Agents (10 total)

**SellerOnboardingAgent** ✅ WIRED
- File: `backend/agents/specialized/seller-onboarding-agent.js`
- Extends: `BaseAgent` | ID: `SELLER_ONBOARDING`
- Decisions: `APPROVE` / `REVIEW` / `REJECT`
- Route: `POST /api/onboarding/sellers`
- Tools: verify_identity, verify_email, check_business, screen_watchlist, check_geographic, check_velocity, check_device, check_consortium
- Status: **Reference implementation — most complete agent in codebase**

**FraudInvestigationAgent**
- File: `backend/agents/specialized/fraud-investigation-agent.js`
- Extends: `BaseAgent` | ID: `FRAUD_INVESTIGATOR`
- Decisions: `BLOCK` / `REVIEW` / `MONITOR` / `APPROVE`
- Use: Deep-dive investigation triggered by other agents or analysts

**AlertTriageAgent** ❌ NOT WIRED
- File: `backend/agents/specialized/alert-triage-agent.js`
- Extends: `BaseAgent` | ID: `ALERT_TRIAGE`
- Role: Prioritize + route cases from all agents to analysts
- Critical: Wiring this closes the human feedback loop for the entire platform

**RuleOptimizationAgent** ❌ NOT WIRED
- File: `backend/agents/specialized/rule-optimization-agent.js`
- Extends: `BaseAgent` | ID: `RULE_OPTIMIZER`
- Role: Analyze rule performance, propose threshold changes autonomously

**PayoutRiskAgent** ❌ NOT WIRED
- File: `backend/agents/specialized/payout-risk-agent.js`
- Extends: `AutonomousAgent` | ID: `PAYOUT_RISK`
- Decisions: `APPROVE` / `HOLD` / `REJECT`
- Route: `POST /api/payout/payouts` (service exists, agent not connected)
- Key signals: payout velocity, bank change recency, dispute ratio, first payout flag
- Priority: HIGH — money leaves platform here

**ListingIntelligenceAgent** ❌ NOT WIRED
- File: `backend/agents/specialized/listing-intelligence-agent.js`
- Extends: `AutonomousAgent` | ID: `LISTING_INTELLIGENCE`
- Decisions: `APPROVE` / `FLAG` / `REJECT`
- Route: `POST /api/listing/listings` (service exists, agent not connected)
- Key signals: counterfeit detection, listing velocity, price anomaly, prohibited items

**ReturnsAbuseAgent** ❌ NOT WIRED
- File: `backend/agents/specialized/returns-abuse-agent.js`
- Extends: `AutonomousAgent` | ID: `RETURNS_ABUSE`
- Decisions: `APPROVE` / `INVESTIGATE` / `DENY`
- Route: `POST /api/returns` (service exists, agent not connected)
- Key signals: return rate vs baseline, timing patterns, buyer-seller collusion

**ProfileMutationAgent** ❌ NOT WIRED
- File: `backend/agents/specialized/profile-mutation-agent.js`
- Extends: `AutonomousAgent` | ID: `PROFILE_MUTATION`
- Decisions: `ALLOW` / `STEP_UP` / `LOCK`
- Route: `POST /api/profile-updates` (service exists, agent not connected)
- Key signals: multi-field change, device fingerprint change, bank change + payout within 72h
- ATO signal: bank change + payout request within 72h

**CrossDomainCorrelationAgent** ❌ NOT SCHEDULED
- File: `backend/agents/specialized/cross-domain-agent.js`
- Extends: `AutonomousAgent` | ID: `CROSS_DOMAIN_CORRELATION`
- Role: Fraud ring detection, seller network analysis, aggregate risk scoring
- Uses: Neo4j graph (GRAPH_BACKEND=neo4j) or in-memory graph (default)
- Runs on-demand today — needs autonomous scheduling every 6h

**PolicyEvolutionAgent** ❌ NOT WIRED
- File: `backend/agents/specialized/policy-evolution-agent.js`
- Extends: `AutonomousAgent` | ID: `POLICY_EVOLUTION`
- Role: Monitor policy effectiveness, propose policy updates

### Core Agent Modules
| Module | Import From | Use For |
|---|---|---|
| LLM client | `../core/llm-client.js` | LLM calls with retry + usage tracking |
| Prompt templates | `../core/prompt-templates.js` | Structured prompts for think/plan/observe/reflect |
| Memory store | `../core/memory-store.js` | Short-term + long-term memory |
| Memory factory | `../core/memory-factory.js` | Pluggable memory backend |
| Cache factory | `../core/cache-factory.js` | LLM cache + pattern memory cache |
| Pattern memory | `../core/pattern-memory.js` | Learn + recall fraud patterns |
| Policy engine | `../core/policy-engine.js` | Hard/soft policy enforcement |
| Chain of thought | `../core/chain-of-thought.js` | Reasoning traces for auditability |
| Decision logger | `../core/decision-logger.js` | Persist decisions to DB |
| Eval tracker | `../core/eval-tracker.js` | Trigger async eval + regression detection |
| Metrics collector | `../core/metrics-collector.js` | Per-agent performance counters |
| Trace collector | `../core/trace-collector.js` | Span-based timing traces |
| Observability factory | `../core/observability-factory.js` | Pluggable trace/metrics/decision backends |
| Circuit breaker | `../core/circuit-breaker.js` | Fault tolerance for failing agents |
| Knowledge base | `../core/knowledge-base.js` | TF-IDF search with recency boost |
| Context engine | `../core/context-engine.js` | Context assembly from multiple sources |
| Self-correction | `../core/self-correction.js` | Outcome feedback + correction cycles |
| Threshold manager | `../core/threshold-manager.js` | Adaptive risk thresholds |
| Outcome simulator | `../core/outcome-simulator.js` | Simulated outcomes for closed-loop learning |
| Agent orchestrator | `../core/agent-orchestrator.js` | Multi-agent workflows, consensus, escalation |
| Agent messenger | `../core/agent-messenger.js` | Inter-agent communication + help requests |
| Consensus engine | `../core/consensus-engine.js` | Multi-agent voting |

### Evaluation Stack
Python FastAPI at `backend/evaluation/`, port 8000.

| Evaluator | Use For |
|---|---|
| TruLens | Groundedness, answer relevance, context relevance, coherence — all LLM agents |
| RAGAS | Faithfulness, answer relevancy, context precision/recall — **retrieval agents ONLY** |
| DeepEval | Custom fraud metrics |
| BrainTrust | Golden dataset regression |
| Phoenix | Arize trace observability |

**RAGAS only applies to retrieval agents**: SellerOnboardingAgent,
FraudInvestigationAgent, CrossDomainCorrelationAgent. Never apply to PayoutRiskAgent,
AlertTriageAgent, or RuleOptimizationAgent — they don't do retrieval.

**Eval service routers** (10 files in `backend/evaluation/routers/`):
`evaluate`, `dashboard`, `ingest`, `search`, `vector_search`, `retrieval_eval`, `memory`, `letta_memory`, `phoenix`, `braintrust`

---

## Seller Journey

### The 9-Stage Lifecycle
Every seller passes through these stages. At each stage: service handles the
transaction → agent evaluates risk → decision enforced → risk profile updated
→ case created if flagged → agent learns from outcome.
```
ONBOARD → SETUP → LIST → PRICE → TRANSACT → SHIP → PAYOUT → RETURN → PROFILE
  ✅         ❌      ❌      ❌       ❌          ❌      ❌        ❌       ❌
```

**Stage 1 — Onboarding** ✅ COMPLETE
- Service: `backend/services/business/seller-onboarding/`
- Agent: SellerOnboardingAgent | Route: `POST /api/onboarding/sellers`
- Evaluates: KYC/KYB, synthetic identity, IP/email/phone, fraud consortium,
  sanctions/OFAC, shell company detection
- Decision: APPROVE → activated | REVIEW → manual KYC | REJECT → blocked
- Risk weight: 0.12

**Stage 2 — Account Setup** ❌ NEEDS AGENT
- Service: `backend/services/business/account-setup/`
- Wire to SellerOnboardingAgent (same agent, different checkpoint)
- Key signals: bank account country mismatch, prepaid card detection, tax ID cross-ref

**Stage 3 — Listing** ❌ NEEDS WIRING
- Service: `backend/services/business/seller-listing/`
- Agent: ListingIntelligenceAgent (exists, not wired)
- Key signals: counterfeit (luxury brand + new seller + price 60% below market),
  listing velocity (500 in 24h), price anomaly (10x market = money laundering),
  prohibited items, stolen product images
- Decision: APPROVE / FLAG / REJECT | Risk weight: 0.07

**Stage 4 — Transaction** ❌ NEEDS NEW SERVICE + AGENT
- Service: `transaction-processing/` (to build)
- Agent: TransactionRiskAgent (to build)
- Architecture: two-tier — rule engine <10ms for clear signals, agent <500ms for ambiguous
- Key signals: velocity, device/IP/account triangle, card testing, cross-merchant patterns

**Stage 5 — Shipping** ❌ NEEDS AGENT
- Service: `backend/services/business/seller-shipping/`
- Key signals: address mismatch, freight forwarding, empty box pattern, velocity spike

**Stage 6 — Payout** ❌ NEEDS WIRING
- Service: `backend/services/business/seller-payout/`
- Agent: PayoutRiskAgent (exists, not wired) | Route: `POST /api/payout/payouts`
- Key signals: payout velocity, bank change recency (<7 days = high risk),
  dispute ratio, first payout flag (4x higher fraud risk), payout vs account age
- Decision: APPROVE / HOLD / REJECT | Risk weight: 0.12
- HOLD → case created | REJECT → blocked, review required

**Stage 7 — Returns** ❌ NEEDS WIRING
- Service: `backend/services/business/returns/`
- Agent: ReturnsAbuseAgent (exists, not wired)
- Key signals: return rate 3x category baseline, day-29 timing pattern,
  buyer-seller collusion, wardrobing, empty box claims
- Decision: APPROVE / INVESTIGATE / DENY | Risk weight: 0.07

**Stage 8 — Profile Updates** ❌ NEEDS WIRING
- Service: `backend/services/business/profile-updates/`
- Agent: ProfileMutationAgent (exists, not wired)
- Key signals: 2+ critical fields changed in one session, device fingerprint change,
  geographic impossibility, bank change + payout within 72h (ATO-to-cashout)
- Decision: ALLOW / STEP_UP / LOCK | Risk weight: 0.07
- STEP_UP → MFA challenge | LOCK → account frozen, ATO case created

**Stage 9 — Escalation (cross-cutting)**
- Service: `backend/services/case-queue/`
- Agent: AlertTriageAgent (not wired)
- Receives HOLD/REJECT cases from all other stages
- Prioritizes, routes to analysts, recommends resolution, learns from corrections

### How the Cross-Domain Risk Profile Works
Every agent decision calls `emitRiskEvent()` which updates the seller's
aggregate risk score. `GET /api/risk-profile/:sellerId/timeline` returns
the full event history. CrossDomainCorrelationAgent monitors trends across all domains.

### Build Priority for Full Journey Coverage
```
Sprint 1 — Wire existing agents (pure execution, no new design):
  Wire PayoutRiskAgent → seller-payout
  Wire ListingIntelligenceAgent → seller-listing
  Wire ReturnsAbuseAgent → returns
  Wire ProfileMutationAgent → profile-updates
  Use: .claude/skills/wire-agent/SKILL.md

Sprint 2 — New high-value services:
  Build TransactionRiskAgent + transaction-processing (two-tier architecture)
  Build NetworkIntelligenceAgent + network-intelligence (Neo4j graph)

Sprint 3 — Close feedback loop:
  Wire AlertTriageAgent → case-queue
  Schedule CrossDomainCorrelationAgent autonomously (every 6h)

Sprint 4 — Journey monitoring:
  Add journeyStage field to sellers table
  Build seller timeline UI (API already exists)
```

---

## Services

### Base URL: http://localhost:3001

**Seller Onboarding** ✅ AGENT WIRED — `/api/onboarding`
```
GET  /sellers                       list sellers (limit, offset, status, riskTier, country)
GET  /sellers/:sellerId             get seller
POST /sellers                       create seller + triggers SellerOnboardingAgent
PUT  /sellers/:sellerId             update seller
PATCH /sellers/:sellerId/status     update status only
GET  /sellers/:sellerId/kyc         KYC verification status
GET  /sellers/:sellerId/agent-evaluation  last agent evaluation
POST /id-verification               OCR document scan
GET  /stats
```

**Seller Payout** ❌ — `/api/payout`
```
GET  /payouts
GET  /payouts/:payoutId
POST /payouts                       WIRE PayoutRiskAgent here
PATCH /payouts/:payoutId/status
POST /payouts/:payoutId/release     release a held payout
GET  /stats
```

**Seller Listing** ❌ — `/api/listing`
```
GET  /listings
GET  /listings/:listingId
POST /listings                      WIRE ListingIntelligenceAgent here
PUT  /listings/:listingId
PATCH /listings/:listingId/status
GET  /sellers/:sellerId/listings
GET  /flagged
GET  /stats
```

**Returns** ❌ — `/api/returns`
```
GET  /    GET /:id    POST /          WIRE ReturnsAbuseAgent to POST
PATCH /:id/status    GET /stats
```

**Profile Updates** ❌ — `/api/profile-updates`
```
GET  /    GET /:id    POST /          WIRE ProfileMutationAgent to POST
PATCH /:id/status    GET /stats
```

**Seller ATO** ❌ — `/api/ato`
```
GET  /events
GET  /events/:eventId
POST /evaluate                      needs agent wiring
GET  /sellers/:sellerId/events
GET  /stats
GET  /device/:fingerprint/trust
```

**Seller Shipping** ❌ — `/api/shipping` — standard CRUD
**Account Setup** ❌ — `/api/account-setup` — standard CRUD
**Item Setup** ❌ — `/api/item-setup` — standard CRUD
**Pricing** ❌ — `/api/pricing` — standard CRUD
```
GET /    GET /stats    GET /:id    POST /    PATCH /:id/status
```

**Risk Profile** — `/api/risk-profile`
```
GET  /high-risk                     all sellers above HIGH threshold
GET  /stats
POST /event                         emit risk event (called by all agents)
GET  /:sellerId                     full risk profile
GET  /:sellerId/events              risk event history
GET  /:sellerId/history             score history over time
GET  /:sellerId/timeline            full seller activity timeline ← KEY ENDPOINT
PATCH /:sellerId/override           manual risk override (analysts)
```

**Case Queue** — `/api/cases`
```
GET  /                              list cases (status, priority, checkpoint filters)
GET  /stats
GET  /:caseId
PATCH /:caseId/status               OPEN → IN_REVIEW → RESOLVED
PATCH /:caseId/assign               assign to analyst
POST /:caseId/notes                 add investigation note
```

**Case object shape:**
```js
{
  caseId,        // CASE-{8-char-uuid-upper}
  checkpoint,    // e.g. PAYOUT_RISK, LISTING_REVIEW
  priority,      // CRITICAL | HIGH | MEDIUM | LOW
  status,        // OPEN | IN_REVIEW | RESOLVED | CLOSED
  sellerId, entityId, entityType,
  decision, riskScore, reasoning, agentId,
  createdAt, resolvedAt, assignedTo
}
```

**Autonomous Agent Status Routes**
```
GET  /api/agents/cross-domain/status
POST /api/agents/cross-domain/scan
GET  /api/agents/payout-risk/status
GET  /api/agents/listing-intelligence/status
GET  /api/agents/returns-abuse/status
GET  /api/agents/profile-mutation/status
GET  /api/agents/policy-evolution/status
```

**Other Platform APIs** (34 total route mounts in server.js)
```
/api/decisions          decision engine execution
/api/rules              fraud rules management (106 rules, lifecycle: TESTING→SHADOW→ACTIVE)
/api/experiments        A/B testing / champion-challenger
/api/simulation         synthetic seller simulation
/api/feedback           analyst feedback on agent decisions
/api/graph              Neo4j graph queries
/api/ml/inference       ML model inference
/api/ml/governance      model governance
/api/ml/monitoring      model drift monitoring
/api/streaming          streaming pipeline status
/api/observability      agent traces + metrics
/api/agents             agent management
/api/prompts            prompt library
/api/data/ingestion     data pipeline ingestion
/api/data/catalog       data catalog
/api/data/query         query federation
```

### WebSocket Events (ws://localhost:3001)
```
transaction:received          real-time transaction received
transaction:scored            real-time transaction risk score
transaction:decided           final transaction decision
alert:created                 new case in queue
alert:assigned                case assigned to analyst
alert:resolved                case resolved
agent:action:start            agent evaluation started
agent:action:complete         agent evaluation completed
agent:thought                 agent reasoning step
agent:investigation:start     deep investigation started
agent:investigation:complete  deep investigation completed
decision:made                 any agent decision
rule:triggered                fraud rule fired
system:metrics                platform health
system:health                 system health check
model:prediction              ML model prediction
pipeline:stage                pipeline stage update
```

**Additional events emitted by base-agent.js (not in EVENT_TYPES constant):**
```
agent:step:start / agent:step:complete    per TPAOR phase
agent:decision:complete                   final decision with correlationId
agent:policy:override                     policy engine overrode LLM
agent:reflection:revision                 LLM critique changed decision
agent:injection:blocked                   input rejected as prompt injection
agent:judge:overturn                      cross-agent judge overturned decision
agent:citation:downgrade                  decision downgraded due to weak citations
agent:eval:regression                     eval scores dropped >15%
agent:online:alert                        live monitoring alert
agent:cost:budget_warning                 LLM cost alert
policy:violation                          hard policy triggered
```

---

## Code Conventions

### Patterns
- **Singleton pattern:** All core modules export `getXxx()` factory (e.g., `getEvalTracker()`, `getMetricsCollector()`)
- **LLM-first with fallback:** Every LLM method checks `this.llmClient?.enabled`, tries LLM, catches and falls back
- **Three-tier API mode:** Tools check `API_MODE`: `real` (external API) → `free` (free APIs) → `simulation` (synthetic)
- **Event bus integration:** Optional import via top-level `await import()` in try/catch
- **Circular buffers:** In-memory arrays with `maxRecent` limits + DB persistence
- **Fire-and-forget:** Agent calls from services use `.then().catch()`, never `await`

### Testing
- Integration tests in `__tests__/` directories
- Run: `node backend/agents/core/__tests__/reflect-and-eval.test.js`
- No test framework — standalone Node.js scripts with simple assert functions

### Known Issues
- **Mem0 async/await bug:** `base-agent.js` calls memory methods synchronously but Mem0 backend is async — Promises never awaited, silently falls back to SQLite

---

## Roadmap Priorities
1. Wire 4 existing agents — payout, listing, returns, profile-updates
2. Build TransactionRiskAgent + transaction-processing (two-tier: rules <10ms, agent <500ms)
3. Build NetworkIntelligenceAgent + network-intelligence (Neo4j fraud rings)
4. Wire AlertTriageAgent → case-queue (closes human feedback loop)
5. Schedule CrossDomainCorrelationAgent autonomously every 6h
6. Seller journey timeline UI (`GET /api/risk-profile/:id/timeline` already exists)
7. Self-improving rule loop — RuleOptimizationAgent running nightly autonomously
8. Fix Mem0 async/await mismatch in base-agent.js
9. Citation-grounded reasoning: every claim linked to specific tool evidence
10. Golden test suite: 100+ labeled cases for regression testing

## Documentation
- Design docs: `docs/plans/YYYY-MM-DD-<topic>-{design|plan}.md`
- Rules: `docs/RISK_DECISION_RULES_REPOSITORY.md` (106 rules, 18 services)
- Skills: `.claude/skills/` (wire-agent, new-agent, add-rule, run-eval, debug-agent)
