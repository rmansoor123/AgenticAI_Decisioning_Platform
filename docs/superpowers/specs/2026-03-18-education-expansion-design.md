# Education Section Expansion — Architecture Guide & Platform Roadmap

**Date:** 2026-03-18
**Status:** Approved
**Scope:** Convert Education to dropdown with 3 sub-pages: Technology Reference (existing), Architecture Guide (new), Platform Roadmap (new)

---

## Problem

The Education section is a single page with a technology catalog. An AI architect exploring this platform has no guide to understand how the systems are orchestrated, what industry standards exist, or what the path to state-of-the-art looks like.

## Goals

1. Convert Education to a sidebar dropdown with 3 sub-pages
2. Create an Architecture Guide for AI architects covering agentic systems, real-time decisioning, ML platforms, streaming, PaaS patterns, and security
3. Create a Platform Roadmap showing a 4-level maturity model from current state to state-of-the-art

## Audience

Layered: accessible overview for engineers exploring the platform, with deep-dive sections for senior AI/ML architects who design systems for a living.

---

## 1. Sidebar Navigation

Convert Education from a simple link to a dropdown matching the existing pattern (Seller Lifecycle, Risk Operations, Platform).

**Layout.jsx change:**
```javascript
{
  name: 'Education',
  href: '/education',
  icon: BookOpen,
  color: 'text-emerald-400',
  children: [
    { name: 'Technology Reference', href: '/education' },
    { name: 'Architecture Guide', href: '/education/architecture' },
    { name: 'Platform Roadmap', href: '/education/roadmap' }
  ]
}
```

**App.jsx routes:**
```javascript
<Route path="/education" element={<Education />} />
<Route path="/education/architecture" element={<ArchitectureGuide />} />
<Route path="/education/roadmap" element={<PlatformRoadmap />} />
```

---

## 2. Architecture Guide (`/education/architecture`)

### Page Structure

A single-page reference with 6 collapsible sections. Each section follows the same template:
- **Overview** (2-3 paragraphs, accessible to any engineer)
- **Architecture Pattern** (visual diagram built with CSS/HTML — not images)
- **How This Project Implements It** (specific files, patterns, code references)
- **Industry Alternatives** (other tools/frameworks that solve the same problem)
- **Deep Dive** (expandable, for architects — technical details, trade-offs, anti-patterns)

### Section 1: Agentic AI Systems

**Overview:** How autonomous AI agents reason, plan, and act. The TPAOR pattern as a general framework for building agents that can make complex decisions with tool use, self-reflection, and multi-agent collaboration.

**Architecture Pattern:**
```
Input → THINK (LLM analyzes) → PLAN (select tools) → ACT (execute tools)
  → RE-PLAN (if failures) → OBSERVE (synthesize evidence) → REFLECT (self-critique)
  → POLICY (hard rules override) → JUDGE (cross-agent review) → EMIT (decision)
```

**How This Project Implements It:**
- `base-agent.js` — TPAOR loop (14 phases)
- `llm-client.js` — LLM provider abstraction (OpenAI, Ollama, Anthropic)
- `agent-orchestrator.js` — multi-agent workflows, consensus, escalation
- `policy-engine.js` — hard/soft policy enforcement
- `pattern-memory.js` — learned fraud pattern recall
- `knowledge-base.js` — TF-IDF retrieval with recency boost
- `self-correction.js` — outcome feedback loops
- 23 specialized agents, each extending BaseAgent

**Industry Alternatives:**
- LangChain/LangGraph — agent orchestration framework
- CrewAI — multi-agent collaboration
- AutoGen (Microsoft) — conversational agent patterns
- Semantic Kernel — enterprise agent SDK
- Haystack — retrieval-augmented agents

**Deep Dive (expandable):**
- ReAct pattern vs TPAOR — how our loop extends ReAct with reflection, policy, and judge
- Tool registry design — dynamic tool discovery vs static registration
- Memory architecture — short-term (session), long-term (persistent), episodic (temporal), pattern (learned)
- Multi-agent consensus — voting mechanisms, escalation thresholds
- Prompt engineering — structured prompts for think/plan/observe/reflect phases
- Cost optimization — LLM caching, fallback to hardcoded logic, model selection per task
- Anti-patterns: infinite reasoning loops, tool thrashing, hallucinated tool calls

### Section 2: Real-Time Decisioning Systems

**Overview:** How to build systems that make fraud decisions in under 50ms. The interplay between rules engines, ML models, and experimentation layers. Why policy must always override ML.

**Architecture Pattern:**
```
Event → Feature Store (sub-ms lookup) → ML Model (score) → Rules Engine (evaluate)
  → Experimentation Layer (A/B variant) → Policy Override (compliance) → Decision
  → Audit Trail + Risk Profile Update + Case Queue (if flagged)
```

**How This Project Implements It:**
- `platform-integrator.js` — bridges ML + rules + experimentation
- `decision-engine/` — rule evaluation with THRESHOLD, VELOCITY, ML_SCORE, COMPOSITE types
- `feature-store.js` / `feature-store-redis.js` — online feature serving
- `onboarding-risk-model.js` — TF.js neural network for real-time scoring
- `policy-engine.js` — hard rules that override any ML decision
- `decision-logger.js` — immutable audit trail
- `emit-event.js` — risk profile aggregation with domain weights and score decay

**Industry Alternatives:**
- FICO Falcon — legacy fraud decisioning (rules + models)
- Featurespace ARIC — adaptive behavioral analytics
- AWS Fraud Detector — managed fraud detection service
- Stripe Radar — payment fraud ML
- Sardine — device intelligence + behavioral biometrics
- Feedzai — real-time AI for financial crime

**Deep Dive:**
- Decision latency budget breakdown (feature lookup: 1ms, ML inference: 5ms, rules: 2ms, policy: 1ms)
- Feature store design: online (Redis/in-memory) vs offline (data warehouse) vs streaming (Flink)
- Rules lifecycle: TESTING → SHADOW → ACTIVE → DEPRECATED
- Champion/challenger experimentation with statistical significance
- Score decay mathematics (30-day half-life, exponential decay)
- Anti-patterns: score inflation, rule explosion, model staleness

### Section 3: ML Platform Architecture

**Overview:** End-to-end ML lifecycle for fraud detection. From feature engineering through model serving, monitoring, and retraining. How models go from development to production safely.

**Architecture Pattern:**
```
Raw Data → Feature Engineering (25 features) → Training Pipeline
  → Model Registry (version, metadata, lineage)
  → Deployment: Shadow → Canary → Production
  → Monitoring: Drift Detection (PSI) + Performance (precision/recall)
  → Retraining Trigger → loop back
```

**How This Project Implements It:**
- `onboarding-feature-extractor.js` — 25 engineered features with normalization
- `onboarding-risk-model.js` — TF.js neural network (25→128→64→32→1)
- `model-loader.js` — model registry and lazy loading
- `prediction-cache-redis.js` — SHA-256 keyed inference cache
- `ml-monitoring/` — PSI drift detection, confusion matrix
- `ml-governance/` — model approval workflows
- Platform integrator routes to domain-specific models

**Industry Alternatives:**
- MLflow — experiment tracking, model registry, deployment
- Kubeflow — Kubernetes-native ML pipelines
- Seldon Core — model serving on Kubernetes
- BentoML — model packaging and serving
- TFServing / TorchServe — framework-specific serving
- Weights & Biases — experiment tracking
- Feast — feature store (open source)
- Tecton — managed feature platform

**Deep Dive:**
- Neural network architecture choices for fraud (why sigmoid output, why dropout, why L2)
- SHAP-like explainability implementation (feature contribution calculation)
- Model A/B testing with chi-square significance
- Feature importance drift vs prediction drift
- Online learning vs batch retraining trade-offs
- Anti-patterns: training-serving skew, label leakage, concept drift ignorance

### Section 4: Streaming & Data Platform

**Overview:** How data flows through the system in real-time. Kafka as the backbone, stream processing for enrichment and transformation, data catalog for governance.

**Architecture Pattern:**
```
Producers (services, agents) → Kafka Topics (partitioned, replicated)
  → Stream Processors (enrich, transform, aggregate)
  → Consumers (ML models, rules engine, feature store, analytics)
  → Dead Letter Queue (failed events)
  → Data Catalog (schema, lineage, quality)
```

**How This Project Implements It:**
- `kafka-stream-engine.js` — KafkaJS wrapper (production)
- `stream-engine.js` — in-process fallback (development)
- `streaming-factory.js` — backend selection
- `onboarding-pipeline.js` — 6-stage pipeline (Ingest→Enrich→Feature→Score→Decide→Emit)
- `stream-processors.js` — transaction pipeline processors
- `feature-store.js` / `feature-store-redis.js` — materialized features
- 14 Kafka topics (8 transaction + 6 onboarding)
- Event bus bridge — Kafka → WebSocket for real-time UI

**Industry Alternatives:**
- Apache Flink — stateful stream processing (windows, joins, CEP)
- Apache Spark Streaming — micro-batch processing
- Kafka Streams — lightweight stream processing library
- Apache Pulsar — alternative to Kafka (multi-tenancy, geo-replication)
- Debezium — change data capture from databases
- Apache Beam — unified batch + stream API
- Materialize — streaming SQL
- RisingWave — streaming database

**Deep Dive:**
- Kafka partition strategies (key-based routing for seller affinity)
- Exactly-once semantics (idempotent producers, transactional consumers)
- Stream processing windows (tumbling, sliding, session)
- Backpressure handling and consumer lag monitoring
- Schema evolution (Avro, Protobuf, JSON Schema Registry)
- Data quality monitoring (completeness, freshness, accuracy)
- Anti-patterns: topic explosion, consumer group sprawl, unbounded state

### Section 5: Platform-as-a-Service Patterns

**Overview:** How to build a platform that's pluggable, resilient, and multi-tenant. The factory pattern as a universal abstraction for swappable backends. Graceful degradation as a first-class concern.

**Architecture Pattern:**
```
Application Code → Factory (env var selection)
  → Production Backend (Postgres, Redis, Kafka, Neo4j, Langfuse)
  → OR Fallback Backend (SQLite, in-memory, in-process)
  → Same interface, same behavior, different performance characteristics
```

**How This Project Implements It:**
- `database-factory.js` — Postgres ↔ SQLite
- `streaming-factory.js` — Kafka ↔ in-process
- `feature-store-factory.js` — Redis ↔ in-memory
- `cache-factory.js` — Redis ↔ in-memory
- `graph-factory.js` — Neo4j ↔ in-memory
- `observability-factory.js` — Langfuse ↔ SQLite
- `analytics-factory.js` — Pinot ↔ SQLite
- `memory-factory.js` — Mem0/Letta ↔ SQLite
- 9 pluggable backends, all controlled by env vars
- Zero Docker required for development (all fallbacks work)

**Industry Alternatives:**
- Kubernetes + Helm — container orchestration and package management
- Terraform — infrastructure as code
- Istio/Linkerd — service mesh (mTLS, traffic management)
- Dapr — distributed application runtime (sidecar pattern)
- Backstage (Spotify) — developer portal and service catalog
- Platform Engineering (Team Topologies model)

**Deep Dive:**
- Factory pattern implementation (lazy init, singleton caching, error fallback)
- 12-factor app principles applied to this platform
- Health check patterns (liveness, readiness, startup probes)
- Configuration management (env vars, secrets, feature flags)
- Multi-tenancy strategies (shared infra vs dedicated vs hybrid)
- Anti-patterns: God factory, leaky abstractions, fallback divergence

### Section 6: Security & Compliance Architecture

**Overview:** Regulatory requirements that shape fraud platform design. Sanctions screening, KYC verification chains, audit trails, and data privacy. Why compliance is a feature, not an afterthought.

**Architecture Pattern:**
```
User Action → Identity Verification (KYC/KYB)
  → Sanctions Screening (OFAC, PEP, adverse media)
  → Risk Assessment (ML + rules)
  → Decision with Audit Trail (immutable log)
  → Regulatory Reporting (SAR, CTR)
  → Data Retention/Deletion (GDPR, CCPA)
```

**How This Project Implements It:**
- `ofac-screening.js` — 18,712 real SDN entries from US Treasury, Jaro-Winkler matching
- `real-apis.js` — Onfido identity, Hunter.io email, MaxMind IP
- `free-apis.js` — ip-api.com, Nominatim, stopforumspam
- `decision-logger.js` — every agent decision persisted with full reasoning
- `chain-of-thought.js` — auditable reasoning traces
- `agent-traces` table — span-based timing for every TPAOR phase
- 28 database tables covering full audit trail

**Industry Alternatives:**
- ComplyAdvantage — real-time sanctions and PEP screening
- Chainalysis — blockchain transaction monitoring
- Jumio — AI-powered identity verification
- Onfido — document and biometric verification
- Socure — digital identity verification
- Elliptic — crypto compliance
- NICE Actimize — financial crime management

**Deep Dive:**
- OFAC screening implementation (fuzzy matching thresholds, SDN list updates)
- KYC verification chain design (multi-provider fallback)
- Immutable audit trail patterns (append-only, hash-chained)
- PII data handling (masking, tokenization, encryption)
- SAR filing automation
- Regulatory frameworks: BSA/AML, PSD2 SCA, GDPR Article 22 (automated decisions)
- Anti-patterns: screening gaps, stale watchlists, incomplete audit trails

---

## 3. Platform Roadmap (`/education/roadmap`)

### Page Structure

A maturity model with 4 levels. Each level shows:
- **Summary** — what this level means
- **Technologies** — tools to add (with category badges)
- **Products** — what they enable
- **Architecture Changes** — what needs to change structurally
- **Effort** — S/M/L/XL per item

### Level 1 — Foundation (Current State)

**Summary:** Production-grade agentic fraud decisioning with real infrastructure. All core patterns established.

**Technologies (Implemented):**
| Category | Technology | Status |
|---|---|---|
| Database | PostgreSQL (pgvector) | Implemented |
| Streaming | Apache Kafka + Zookeeper | Implemented |
| Cache | Redis 7 | Implemented |
| ML | TensorFlow.js (2 neural networks) | Implemented |
| LLM | OpenAI gpt-4o-mini / Ollama | Implemented |
| Graph | Neo4j 5 | Implemented |
| Observability | Langfuse | Implemented |
| Vector DB | Qdrant / Pinecone / ChromaDB / Weaviate | Implemented |
| Memory | Mem0 / Letta / Zep | Implemented |
| Analytics | Apache Pinot | Implemented |
| Screening | OFAC SDN (US Treasury) | Implemented |
| Infra | Docker Compose (14 services) | Implemented |
| CI/CD | GitHub Actions | Implemented |

**Products:**
- Seller onboarding decisioning (23 agents, TPAOR loop)
- 9-stage seller lifecycle (onboarding → payout)
- Real-time ML inference (25-feature onboarding model)
- 6-stage streaming pipeline
- Case queue with agent triage
- 122 decision rules
- Cross-domain risk profiling
- Education & technology reference

### Level 2 — Advanced (Next Quarter)

**Summary:** Complex event processing, proper ML lifecycle management, and external integrations.

**Technologies to Add:**
| Technology | Category | What It Enables | Effort |
|---|---|---|---|
| Apache Flink | Stream Processing | Windowed aggregations, sessionization, complex event patterns | L |
| MLflow | ML Lifecycle | Experiment tracking, model registry, deployment pipelines | M |
| Feast | Feature Store | Production feature store with offline/online sync | M |
| Apache Airflow | Orchestration | Scheduled training pipelines, data quality checks | M |
| Grafana + Prometheus | Monitoring | Real-time infrastructure dashboards, alerting | M |
| Stripe/Plaid webhooks | Integrations | Real payment data, real bank verification | S |
| Twilio Verify | Identity | Real phone/SMS verification | S |
| Great Expectations | Data Quality | Automated data validation and profiling | S |
| dbt | Data Transform | SQL-based data transformation pipelines | M |

**Products Enabled:**
- Real-time transaction scoring with velocity windows (Flink)
- Merchant risk scoring (aggregate seller behavior)
- Automated dispute resolution (agent + payment data)
- Model performance dashboards (MLflow + Grafana)
- Data quality monitoring pipeline

### Level 3 — Enterprise (6 Months)

**Summary:** Kubernetes-native, multi-region, with advanced ML techniques and self-optimizing systems.

**Technologies to Add:**
| Technology | Category | What It Enables | Effort |
|---|---|---|---|
| Kubernetes (EKS/GKE) | Infrastructure | Auto-scaling, rolling deployments, resource isolation | XL |
| Helm Charts | Deployment | Reproducible deployments across environments | M |
| Kafka MirrorMaker 2 | Replication | Multi-region streaming, disaster recovery | L |
| Apache Superset | BI/Analytics | Self-service analytics for fraud analysts | M |
| Ray Serve | ML Serving | Distributed model serving with auto-batching | L |
| PyTorch | ML Framework | Graph neural networks, attention-based fraud detection | L |
| Label Studio | Annotation | Human-in-the-loop labeling for model training | M |
| Temporal.io | Workflows | Long-running agent workflows, durable execution | M |
| OpenTelemetry | Observability | Distributed tracing across microservices | M |
| Vault (HashiCorp) | Security | Secrets management, dynamic credentials | M |

**Products Enabled:**
- Cross-merchant fraud intelligence network (shared signals, privacy-preserving)
- Regulatory reporting automation (SAR generation, CTR filing)
- Self-optimizing rules engine (agent-driven threshold tuning)
- Fraud analyst workbench (investigation tools, case collaboration)
- Merchant onboarding risk API (external-facing product)

### Level 4 — State-of-the-Art (Vision)

**Summary:** The frontier. Autonomous systems that prevent fraud before it happens, using the most advanced AI and distributed computing techniques.

**Technologies to Explore:**
| Technology | Category | What It Enables | Effort |
|---|---|---|---|
| LLM Agents (Claude/GPT-4) | Autonomous AI | Multi-turn investigation, natural language case summaries | L |
| Reinforcement Learning | ML | Dynamic threshold optimization from outcome feedback | XL |
| Causal Inference (DoWhy) | ML | Counterfactual analysis — "what would have happened if..." | L |
| GANs / Diffusion Models | Synthetic Data | Generate realistic fraud patterns for training | L |
| Graph Neural Networks | ML | Fraud ring detection beyond traversal (message passing) | XL |
| Digital Twin Simulation | Testing | Simulate entire payment ecosystem for stress testing | XL |
| Federated Learning | ML | Train models across merchants without sharing raw data | XL |
| Blockchain (Hyperledger) | Audit | Immutable, cryptographically verifiable audit trails | L |
| Neuromorphic Computing | Hardware | Sub-millisecond pattern detection for high-frequency fraud | XL |
| Confidential Computing | Security | Process sensitive data in encrypted memory (SGX/SEV) | L |

**Products Enabled:**
- Predictive fraud prevention (stop fraud before it happens)
- Autonomous compliance officer (agent that monitors regulatory changes and adapts)
- Merchant trust marketplace (sellers earn trust scores, visible to buyers)
- Industry-wide fraud intelligence sharing (federated, privacy-preserving)
- Real-time fraud simulation engine (test new rules against synthetic attack scenarios)
- Natural language investigation ("tell me about the fraud pattern involving seller X")

---

## 4. UI Design

### Common Patterns

All three pages use the same dark theme as existing pages:
- `bg-[#0a0a12]` body, `bg-[#12121a]` cards, `border-gray-800` borders
- lucide-react icons
- Collapsible sections with ChevronDown/ChevronRight
- Category badges: `px-2 py-0.5 rounded-full text-xs`
- Status indicators: green (implemented), amber (planned), gray (future)

### Architecture Guide Specific

- Each of the 6 sections is a collapsible card
- Architecture diagrams are CSS-based flow visualizations (not images)
- "How This Project Implements It" links to actual file paths in the codebase
- "Industry Alternatives" shows technology logos/icons with brief descriptions
- "Deep Dive" is a nested collapsible within each section

### Platform Roadmap Specific

- 4 maturity levels displayed as a vertical progression
- Current level highlighted with a "You are here" indicator
- Each technology has: name, category badge, description, effort badge (S/M/L/XL)
- Products section uses cards with icons
- Overall progress bar showing Level 1 completion

---

## 5. File Inventory

### New Files (2)

| File | Purpose |
|---|---|
| `src/pages/ArchitectureGuide.jsx` | Architecture reference page (~800-1000 lines) |
| `src/pages/PlatformRoadmap.jsx` | Platform roadmap page (~600-800 lines) |

### Modified Files (3)

| File | Changes |
|---|---|
| `src/components/Layout.jsx` | Convert Education to dropdown with 3 children |
| `src/App.jsx` | Add routes for /education/architecture and /education/roadmap |
| `src/pages/Education.jsx` | No changes (stays as Technology Reference) |
