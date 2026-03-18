import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

// ─── Collapsible Section ────────────────────────────────────────────────────────

function Section({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-[#12121a] rounded-lg border border-gray-800 p-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {open ? (
          <ChevronDown className="w-5 h-5 text-gray-500 shrink-0" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-500 shrink-0" />
        )}
      </button>
      {open && <div className="mt-6 space-y-6">{children}</div>}
    </div>
  )
}

// ─── Reusable Content Blocks ────────────────────────────────────────────────────

function SubHeading({ children }) {
  return <h3 className="text-lg font-medium text-white">{children}</h3>
}

function Paragraph({ children }) {
  return <p className="text-gray-300 leading-relaxed">{children}</p>
}

function FileRef({ children }) {
  return <span className="text-emerald-400 font-mono text-sm">{children}</span>
}

function FileList({ files }) {
  return (
    <ul className="space-y-1">
      {files.map((f, i) => (
        <li key={i} className="text-gray-300 text-sm">
          <FileRef>{f.name}</FileRef>
          {f.desc && <span className="text-gray-500"> — {f.desc}</span>}
        </li>
      ))}
    </ul>
  )
}

function AntiPatterns({ items }) {
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-sm">
          <span className="text-red-400 font-medium">{item.name}</span>
          <span className="text-gray-500"> — {item.desc}</span>
        </li>
      ))}
    </ul>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function ArchitectureGuide() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Architecture Guide</h1>
          <p className="text-gray-500">
            Six architectural patterns that power the fraud decisioning platform.
            Each section covers how it works, key design decisions, project files, industry alternatives, and anti-patterns.
          </p>
        </div>

        {/* ── 1. Agentic AI Systems ──────────────────────────────────────────── */}
        <Section title="1. Agentic AI Systems" defaultOpen={true}>
          <div>
            <SubHeading>The Pattern</SubHeading>
            <Paragraph>
              Autonomous agents that reason, plan, act, and learn. Instead of simple prompt-response interactions,
              each agent runs a structured multi-phase loop that gives it planning, tool use, self-critique,
              and memory capabilities.
            </Paragraph>
          </div>

          <div>
            <SubHeading>How It Works</SubHeading>
            <Paragraph>
              The TPAOR loop defines the agent reasoning cycle. Every agent inherits this from BaseAgent:
            </Paragraph>
            <p className="text-gray-300 text-sm mt-3 font-mono leading-loose">
              THINK (LLM analyzes context) → PLAN (select tools) → ACT (execute tools deterministically) →
              RE-PLAN (if &gt;50% tools fail) → OBSERVE (synthesize evidence) → REFLECT (self-critique, may revise) →
              MULTI-TURN (follow-up if uncertain, max 2 rounds) → POLICY (hard rules override LLM) →
              JUDGE (cross-agent review for REJECT/BLOCK) → KB WRITE (store learned patterns) →
              LEARN (update memory) → EMIT (log decision, emit risk event) → EVAL (trigger async evaluation)
            </p>
          </div>

          <div>
            <SubHeading>Key Design Decisions</SubHeading>
            <ul className="text-gray-300 text-sm space-y-2 list-disc list-inside">
              <li>Every agent extends BaseAgent — the 14-phase loop is inherited, not reimplemented</li>
              <li>LLM-first with hardcoded fallback — works without LLM via USE_LLM=false</li>
              <li>Tools are registered in the constructor, executed deterministically (no LLM in ACT phase)</li>
              <li>Policy engine runs LAST, always overrides LLM — compliance &gt; intelligence</li>
              <li>Judge review only for REJECT/BLOCK decisions — don't slow down APPROVEs</li>
              <li>Pattern memory uses circular buffers + DB persistence — bounded memory, infinite recall</li>
            </ul>
          </div>

          <div>
            <SubHeading>Project Files</SubHeading>
            <FileList files={[
              { name: 'base-agent.js', desc: 'TPAOR loop, tool execution, event emission' },
              { name: 'llm-client.js', desc: 'OpenAI/Ollama/Anthropic abstraction with retry + caching' },
              { name: 'agent-orchestrator.js', desc: 'multi-agent workflows, consensus voting, escalation' },
              { name: 'policy-engine.js', desc: '8 hard policies, always wins vs LLM' },
              { name: 'pattern-memory.js', desc: 'learned fraud patterns with similarity matching' },
              { name: 'knowledge-base.js', desc: 'TF-IDF search with recency boost' },
              { name: 'self-correction.js', desc: 'outcome feedback loops' },
              { name: '23 specialized agents', desc: 'seller-onboarding-agent.js, payout-risk-agent.js, etc.' },
            ]} />
          </div>

          <div>
            <SubHeading>Industry Alternatives</SubHeading>
            <p className="text-gray-300 text-sm">
              LangChain/LangGraph (graph-based agent workflows),
              CrewAI (multi-agent with role-based delegation),
              AutoGen by Microsoft (conversational multi-agent),
              Semantic Kernel by Microsoft (enterprise SDK with planners),
              Haystack (retrieval-augmented pipelines),
              DSPy by Stanford (programmatic LLM optimization)
            </p>
          </div>

          <div>
            <SubHeading>Anti-Patterns</SubHeading>
            <AntiPatterns items={[
              { name: 'Infinite reasoning loops', desc: 'always cap LLM calls (we use max 2 multi-turn rounds)' },
              { name: 'Tool thrashing', desc: 'agent calls same tool repeatedly with different params' },
              { name: 'Hallucinated tool calls', desc: 'LLM invents tools that don\'t exist' },
              { name: 'No fallback', desc: 'system dies when LLM provider is down' },
              { name: 'Monolithic agents', desc: 'one agent does everything instead of specialized agents' },
            ]} />
          </div>
        </Section>

        {/* ── 2. Real-Time Decisioning Systems ───────────────────────────────── */}
        <Section title="2. Real-Time Decisioning Systems">
          <div>
            <SubHeading>The Pattern</SubHeading>
            <Paragraph>
              Make fraud decisions in under 50ms by layering rules, ML, and experimentation.
              The hot path is designed to avoid async blocking — feature lookups are synchronous,
              ML and rules run in parallel, and policy is the final arbiter.
            </Paragraph>
          </div>

          <div>
            <SubHeading>How It Works</SubHeading>
            <p className="text-gray-300 text-sm font-mono leading-loose">
              Event arrives → Feature Store lookup (sub-ms, Redis/in-memory) → ML Model inference (TF.js, ~5ms) →
              Rules Engine evaluation (threshold, velocity, ML-score rules) → Experimentation layer (A/B variant selection) →
              Policy override (compliance hard rules) → Decision emitted → Audit trail persisted → Risk profile updated
            </p>
          </div>

          <div>
            <SubHeading>Key Design Decisions</SubHeading>
            <ul className="text-gray-300 text-sm space-y-2 list-disc list-inside">
              <li>Feature store is synchronous read (in-memory Map or Redis GET) — no async blocking in hot path</li>
              <li>ML and rules run in parallel via platform integrator, results merged</li>
              <li>Policy engine is the LAST layer — it can override any ML or rule decision</li>
              <li>Every decision persisted to decision_logger + prediction_history tables</li>
              <li>Risk scores decay over time (30-day half-life) — old signals fade without reinforcement</li>
              <li>Domain weights control how each lifecycle stage impacts overall seller risk</li>
            </ul>
          </div>

          <div>
            <SubHeading>Project Files</SubHeading>
            <FileList files={[
              { name: 'platform-integrator.js', desc: 'bridges ML + rules + experimentation into single enrichment' },
              { name: 'feature-store.js / feature-store-redis.js', desc: 'online feature serving with TTL' },
              { name: 'onboarding-risk-model.js', desc: 'TF.js neural network (25 -> 128 -> 64 -> 32 -> 1)' },
              { name: 'decision-logger.js', desc: 'immutable audit trail' },
              { name: 'emit-event.js', desc: 'risk profile aggregation with domain weights' },
            ]} />
          </div>

          <div>
            <SubHeading>Industry References</SubHeading>
            <p className="text-gray-300 text-sm">
              FICO Falcon (the original rules+models fraud system, processes billions of transactions),
              Featurespace ARIC (adaptive behavioral analytics for major banks),
              AWS Fraud Detector (managed service using AutoML),
              Stripe Radar (ML-based payment fraud at scale),
              Sardine (device intelligence + behavioral biometrics),
              Feedzai (real-time AI for financial crime, used by top 5 US banks)
            </p>
          </div>

          <div>
            <SubHeading>Anti-Patterns</SubHeading>
            <AntiPatterns items={[
              { name: 'Score inflation', desc: 'risk scores only go up, never decay' },
              { name: 'Rule explosion', desc: 'hundreds of overlapping rules with no lifecycle management' },
              { name: 'Model staleness', desc: 'deploying a model and never monitoring it' },
              { name: 'Missing policy layer', desc: 'ML makes final decision with no compliance override' },
              { name: 'No audit trail', desc: 'can\'t explain why a decision was made' },
            ]} />
          </div>
        </Section>

        {/* ── 3. ML Platform Architecture ────────────────────────────────────── */}
        <Section title="3. ML Platform Architecture">
          <div>
            <SubHeading>The Pattern</SubHeading>
            <Paragraph>
              End-to-end ML lifecycle from feature engineering to production monitoring. The platform handles
              feature extraction, model training, versioned deployment, drift detection, prediction caching,
              and post-hoc explainability — all in-process with TensorFlow.js.
            </Paragraph>
          </div>

          <div>
            <SubHeading>How It Works</SubHeading>
            <p className="text-gray-300 text-sm font-mono leading-loose">
              Raw seller data → Feature extraction (25 normalized features) → Model training (TF.js sequential neural network) →
              Model registry (version, metadata, lineage) → Deployment: shadow → canary → production →
              Monitoring: drift detection (PSI), performance metrics → Prediction caching (Redis, SHA-256 key, 5min TTL) →
              Explainability (SHAP-like feature contributions)
            </p>
          </div>

          <div>
            <SubHeading>Key Design Decisions</SubHeading>
            <ul className="text-gray-300 text-sm space-y-2 list-disc list-inside">
              <li>TensorFlow.js for in-process inference — no separate model server needed</li>
              <li>Deterministic weight initialization for consistent predictions (sin/cos seeded)</li>
              <li>25 features cover 5 risk dimensions: identity, financial, compliance, behavioral, network</li>
              <li>SHAP-like contributions calculated post-prediction for every inference</li>
              <li>Prediction cache prevents redundant inference for identical feature vectors</li>
              <li>Two-layer thresholds: pipeline (0.45/0.75) and rules (0.55/0.80)</li>
            </ul>
          </div>

          <div>
            <SubHeading>Project Files</SubHeading>
            <FileList files={[
              { name: 'onboarding-feature-extractor.js', desc: '25 feature definitions with min/max normalization' },
              { name: 'onboarding-risk-model.js', desc: 'TF.js neural network, buildModel(), predict(), predictBatch()' },
              { name: 'model-loader.js', desc: 'lazy loading, preloading, model registry' },
              { name: 'prediction-cache-redis.js', desc: 'SHA-256 keyed Redis cache' },
              { name: 'ml-monitoring/', desc: 'PSI drift detection, confusion matrix' },
            ]} />
          </div>

          <div>
            <SubHeading>Industry Alternatives</SubHeading>
            <p className="text-gray-300 text-sm">
              MLflow (experiment tracking + model registry + deployment),
              Kubeflow (Kubernetes-native ML pipelines),
              Seldon Core (model serving with A/B testing on K8s),
              BentoML (model packaging and serving),
              TFServing / TorchServe (framework-specific high-performance serving),
              Feast (open source feature store),
              Tecton (managed feature platform),
              Weights & Biases (experiment tracking and visualization)
            </p>
          </div>

          <div>
            <SubHeading>Anti-Patterns</SubHeading>
            <AntiPatterns items={[
              { name: 'Training-serving skew', desc: 'features computed differently in training vs inference' },
              { name: 'Label leakage', desc: 'using future information as a feature' },
              { name: 'No drift monitoring', desc: 'model degrades silently over months' },
              { name: 'Single model', desc: 'one model for all fraud types instead of specialized models' },
              { name: 'No explainability', desc: 'black box decisions that can\'t be audited' },
            ]} />
          </div>
        </Section>

        {/* ── 4. Streaming & Data Platform ───────────────────────────────────── */}
        <Section title="4. Streaming & Data Platform">
          <div>
            <SubHeading>The Pattern</SubHeading>
            <Paragraph>
              Event-driven architecture with Kafka as the backbone. Every state change flows through
              topics, gets enriched, scored, and decided on — then emitted to the UI via WebSocket bridge.
              A factory pattern provides an in-process engine when Kafka isn't available.
            </Paragraph>
          </div>

          <div>
            <SubHeading>How It Works</SubHeading>
            <p className="text-gray-300 text-sm font-mono leading-loose">
              Producers (services, agents) → Kafka topics (partitioned, replicated) → Stream processors (enrich, transform, score) →
              Consumers (ML models, rules engine, feature store, analytics) → Dead letter queue (failed events) →
              Data catalog (schema, lineage, quality profiles)
            </p>
            <p className="text-gray-400 text-sm mt-3">
              Our 6-stage onboarding pipeline: Ingest → Enrich (country/category risk) → Feature Extract (25 ML features) →
              Score (TF.js inference) → Decide (APPROVE/REVIEW/REJECT) → Emit (risk event to WebSocket)
            </p>
          </div>

          <div>
            <SubHeading>Key Design Decisions</SubHeading>
            <ul className="text-gray-300 text-sm space-y-2 list-disc list-inside">
              <li>Factory pattern: Kafka when Docker is up, in-process engine as fallback — same API</li>
              <li>14 topics: 8 for transactions, 6 for onboarding — each with 4 partitions</li>
              <li>Event bus bridge: Kafka messages are bridged to WebSocket for real-time UI updates</li>
              <li>Consumer groups with offset tracking — enables replay and exactly-once processing</li>
              <li>Pipeline processors use poll-based consumption with 1-second intervals</li>
            </ul>
          </div>

          <div>
            <SubHeading>Project Files</SubHeading>
            <FileList files={[
              { name: 'kafka-stream-engine.js', desc: 'KafkaJS wrapper matching StreamEngine interface' },
              { name: 'stream-engine.js', desc: 'in-process Kafka-like engine (fallback)' },
              { name: 'streaming-factory.js', desc: 'STREAMING_BACKEND=kafka|memory selection' },
              { name: 'onboarding-pipeline.js', desc: '6 processor classes, each consuming from one topic and producing to the next' },
              { name: 'stream-processors.js', desc: 'transaction pipeline processors' },
            ]} />
          </div>

          <div>
            <SubHeading>Industry Alternatives</SubHeading>
            <p className="text-gray-300 text-sm">
              Apache Flink (stateful stream processing, the gold standard),
              Kafka Streams (lightweight library within Kafka),
              Apache Spark Streaming (micro-batch processing at scale),
              Apache Pulsar (multi-tenancy and geo-replication),
              Debezium (change data capture from databases into Kafka),
              Apache Beam (unified batch + stream programming model),
              Materialize / RisingWave (streaming SQL databases)
            </p>
          </div>

          <div>
            <SubHeading>Anti-Patterns</SubHeading>
            <AntiPatterns items={[
              { name: 'Topic explosion', desc: 'creating a topic per entity instead of per event type' },
              { name: 'Consumer group sprawl', desc: 'too many consumer groups causing coordination overhead' },
              { name: 'Unbounded state', desc: 'stream processors that accumulate state without eviction' },
              { name: 'No dead letter queue', desc: 'failed events silently dropped' },
              { name: 'Schema evolution chaos', desc: 'changing message format without versioning' },
            ]} />
          </div>
        </Section>

        {/* ── 5. Platform-as-a-Service Patterns ──────────────────────────────── */}
        <Section title="5. Platform-as-a-Service Patterns">
          <div>
            <SubHeading>The Pattern</SubHeading>
            <Paragraph>
              Pluggable backends via factory pattern with graceful degradation. Application code never
              imports a backend directly — it calls a factory function that reads an env var, tries the
              production backend, and falls back to a development backend. Same interface regardless of backend.
              Zero Docker required for development.
            </Paragraph>
          </div>

          <div>
            <SubHeading>How It Works</SubHeading>
            <p className="text-gray-300 text-sm font-mono leading-loose">
              Application code calls factory (e.g., getStreamingBackend()) → Factory reads env var (STREAMING_BACKEND=kafka) →
              Tries production backend (KafkaStreamEngine) → If fails, falls back to dev backend (in-process StreamEngine) →
              Returns same interface regardless of backend
            </p>
          </div>

          <div>
            <SubHeading>The 9 Factories</SubHeading>
            <div className="space-y-1 text-sm">
              <p className="text-gray-300"><FileRef>database-factory.js</FileRef> <span className="text-gray-500">— DB_BACKEND: postgres / sqlite</span></p>
              <p className="text-gray-300"><FileRef>streaming-factory.js</FileRef> <span className="text-gray-500">— STREAMING_BACKEND: kafka / in-process</span></p>
              <p className="text-gray-300"><FileRef>feature-store-factory.js</FileRef> <span className="text-gray-500">— FEATURE_STORE_BACKEND: redis / in-memory</span></p>
              <p className="text-gray-300"><FileRef>cache-factory.js</FileRef> <span className="text-gray-500">— CACHE_BACKEND: redis / in-memory</span></p>
              <p className="text-gray-300"><FileRef>graph-factory.js</FileRef> <span className="text-gray-500">— GRAPH_BACKEND: neo4j / in-memory</span></p>
              <p className="text-gray-300"><FileRef>observability-factory.js</FileRef> <span className="text-gray-500">— OBSERVABILITY_BACKEND: langfuse / sqlite</span></p>
              <p className="text-gray-300"><FileRef>analytics-factory.js</FileRef> <span className="text-gray-500">— ANALYTICS_BACKEND: pinot / sqlite</span></p>
              <p className="text-gray-300"><FileRef>memory-factory.js</FileRef> <span className="text-gray-500">— MEMORY_BACKEND: mem0/letta / sqlite</span></p>
              <p className="text-gray-300"><FileRef>temporal-factory.js</FileRef> <span className="text-gray-500">— TEMPORAL_BACKEND: zep / in-memory</span></p>
            </div>
          </div>

          <div>
            <SubHeading>Factory Implementation Pattern</SubHeading>
            <pre className="text-gray-300 text-sm font-mono bg-[#0a0a0f] border border-gray-800 rounded p-4 overflow-x-auto">
{`let resolved = null;
export async function getBackend() {
  if (resolved) return resolved;  // singleton cache
  if (env === 'production') {
    try { resolved = await connectProduction(); return resolved; }
    catch { console.warn('Falling back...'); }
  }
  resolved = getFallback();
  return resolved;
}`}
            </pre>
          </div>

          <div>
            <SubHeading>Industry Alternatives</SubHeading>
            <p className="text-gray-300 text-sm">
              Kubernetes + Helm (container orchestration and reproducible deployments),
              Terraform (infrastructure as code for cloud provisioning),
              Dapr (distributed application runtime, sidecar pattern),
              Backstage by Spotify (developer portal and service catalog),
              Istio/Linkerd (service mesh for mTLS and traffic management)
            </p>
          </div>

          <div>
            <SubHeading>Anti-Patterns</SubHeading>
            <AntiPatterns items={[
              { name: 'God factory', desc: 'one factory that manages everything' },
              { name: 'Leaky abstractions', desc: 'fallback behavior differs from production' },
              { name: 'No health checks', desc: 'can\'t tell which backend is active' },
              { name: 'Hard-coded backends', desc: 'importing Redis directly instead of through factory' },
              { name: 'Fallback divergence', desc: 'in-memory store behaves differently from Redis store' },
            ]} />
          </div>
        </Section>

        {/* ── 6. Security & Compliance ───────────────────────────────────────── */}
        <Section title="6. Security & Compliance">
          <div>
            <SubHeading>The Pattern</SubHeading>
            <Paragraph>
              Compliance as a feature, not an afterthought. Every decision is auditable, every screening
              uses real data, and the policy engine can block any decision regardless of ML output.
              The system is designed to satisfy regulatory requirements (BSA/AML, OFAC, GDPR, CCPA)
              from day one.
            </Paragraph>
          </div>

          <div>
            <SubHeading>How It Works</SubHeading>
            <p className="text-gray-300 text-sm font-mono leading-loose">
              User action → Identity verification (KYC/KYB — document OCR, face match) →
              Sanctions screening (OFAC SDN list, PEP databases) → Risk assessment (ML score + rule evaluation) →
              Decision with full audit trail (reasoning, evidence, confidence) →
              Regulatory reporting (SAR, CTR) → Data retention/deletion (GDPR, CCPA)
            </p>
          </div>

          <div>
            <SubHeading>Key Design Decisions</SubHeading>
            <ul className="text-gray-300 text-sm space-y-2 list-disc list-inside">
              <li>OFAC screening uses real US Treasury SDN data (18,712 entries), refreshed every 24 hours</li>
              <li>Jaro-Winkler fuzzy matching for name screening (handles typos, transliterations)</li>
              <li>Three-tier API mode: real (Onfido, Hunter.io), free (ip-api.com, Nominatim), simulation</li>
              <li>Every agent decision persisted with full chain of thought — immutable audit trail</li>
              <li>28 database tables cover the full compliance surface</li>
              <li>Policy engine can block any decision regardless of ML output</li>
            </ul>
          </div>

          <div>
            <SubHeading>Project Files</SubHeading>
            <FileList files={[
              { name: 'ofac-screening.js', desc: '18,712 SDN entries, Jaro-Winkler matching, 24h refresh' },
              { name: 'real-apis.js', desc: 'Onfido identity, Hunter.io email, MaxMind IP' },
              { name: 'free-apis.js', desc: 'ip-api.com, Nominatim geocoding, stopforumspam' },
              { name: 'decision-logger.js', desc: 'persists every decision with reasoning' },
              { name: 'chain-of-thought.js', desc: 'auditable reasoning traces with confidence levels' },
            ]} />
          </div>

          <div>
            <SubHeading>Industry Alternatives</SubHeading>
            <p className="text-gray-300 text-sm">
              ComplyAdvantage (real-time sanctions and PEP screening),
              Chainalysis (blockchain transaction monitoring and compliance),
              Jumio (AI-powered identity verification, 500M+ verifications),
              Onfido (document and biometric verification),
              NICE Actimize (financial crime management platform),
              Socure (digital identity verification and fraud prevention)
            </p>
          </div>

          <div>
            <SubHeading>Anti-Patterns</SubHeading>
            <AntiPatterns items={[
              { name: 'Stale watchlists', desc: 'not refreshing sanctions data regularly' },
              { name: 'Screening gaps', desc: 'checking names but not businesses or aliases' },
              { name: 'Incomplete audit trails', desc: 'can\'t reconstruct why a decision was made' },
              { name: 'PII in logs', desc: 'sensitive data in application logs without masking' },
              { name: 'No regulatory awareness', desc: 'building in US without considering EU (GDPR) requirements' },
            ]} />
          </div>
        </Section>
      </div>
    </div>
  )
}
