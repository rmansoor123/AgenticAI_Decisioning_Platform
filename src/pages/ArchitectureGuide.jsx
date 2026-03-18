import { useState } from 'react'
import {
  Brain, Zap, Cpu, Radio, Layers, Shield,
  ChevronDown, ChevronRight, AlertTriangle, BookOpen,
  GitBranch, Database, Server, Lock, Eye, Network,
  Box, Workflow, FileCode, Clock, Target, BarChart3,
  CheckCircle2, XCircle, ArrowRight
} from 'lucide-react'

// ─── Section Data ───────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: 'agentic-ai',
    title: 'Agentic AI Systems',
    subtitle: 'Autonomous reasoning, multi-agent orchestration, and tool-use patterns',
    icon: Brain,
    accentColor: 'emerald',
    accentClasses: {
      gradient: 'from-emerald-500 to-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      text: 'text-emerald-400',
      badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      stageBg: 'bg-emerald-900/40',
      stageBorder: 'border-emerald-500/40',
    },
    overview: [
      'Agentic AI systems represent a paradigm shift from simple prompt-response interactions to autonomous, multi-step reasoning agents capable of planning, executing tools, and self-correcting. At the core is the TPAOR reasoning loop (Think-Plan-Act-Observe-Reflect), which gives agents structured decision-making capabilities far beyond single-shot LLM calls. Each agent maintains its own memory architecture, tool registry, and policy constraints.',
      'Multi-agent orchestration adds a coordination layer where specialized agents collaborate, debate, and reach consensus on complex decisions. A fraud detection platform exemplifies this pattern: an onboarding agent assesses identity risk, a transaction agent evaluates payment patterns, and a cross-domain agent correlates signals across all domains. The orchestrator manages agent selection, parallel execution, result aggregation, and escalation workflows.',
      'The memory architecture spans four tiers: short-term (current session context), long-term (cross-session learned patterns), episodic (specific past experiences recalled by similarity), and pattern memory (statistical fraud pattern recognition). This mirrors cognitive architectures in AI research and enables agents to learn from outcomes, adapt thresholds, and avoid repeating mistakes.',
    ],
    architectureStages: [
      { label: 'Input', desc: 'Event received' },
      { label: 'THINK', desc: 'LLM analyzes context' },
      { label: 'PLAN', desc: 'Select tools' },
      { label: 'ACT', desc: 'Execute tools' },
      { label: 'RE-PLAN', desc: 'Handle failures' },
      { label: 'OBSERVE', desc: 'Synthesize results' },
      { label: 'REFLECT', desc: 'Self-critique' },
      { label: 'POLICY', desc: 'Hard/soft rules' },
      { label: 'JUDGE', desc: 'Cross-agent review' },
      { label: 'EMIT', desc: 'Decision + audit' },
    ],
    projectFiles: [
      { path: 'backend/agents/core/base-agent.js', desc: 'Base agent with TPAOR reasoning loop, tool registry, memory integration' },
      { path: 'backend/agents/core/llm-client.js', desc: 'Multi-provider LLM client (OpenAI, Anthropic, Ollama) with retry + caching' },
      { path: 'backend/agents/core/agent-orchestrator.js', desc: 'Multi-agent workflows, consensus, parallel execution, escalation' },
      { path: 'backend/agents/core/policy-engine.js', desc: 'Hard/soft policy enforcement, always runs last, overrides LLM' },
      { path: 'backend/agents/core/pattern-memory.js', desc: 'Statistical pattern recognition with Redis-backed storage' },
      { path: 'backend/agents/core/knowledge-base.js', desc: 'TF-IDF knowledge retrieval with recency boost' },
      { path: 'backend/agents/core/self-correction.js', desc: 'Outcome feedback loops and correction cycles' },
      { path: 'backend/agents/specialized/', desc: '23 specialized agents covering the full seller lifecycle' },
    ],
    industryAlternatives: [
      { name: 'LangChain / LangGraph', category: 'Framework' },
      { name: 'CrewAI', category: 'Multi-Agent' },
      { name: 'AutoGen', category: 'Multi-Agent' },
      { name: 'Semantic Kernel', category: 'Enterprise' },
      { name: 'Haystack', category: 'Pipeline' },
      { name: 'Anthropic MCP', category: 'Tool Protocol' },
      { name: 'OpenAI Assistants API', category: 'Managed' },
      { name: 'DSPy', category: 'Optimization' },
    ],
    deepDive: {
      title: 'Deep Dive: Agent Architecture Internals',
      sections: [
        {
          title: 'ReAct vs TPAOR: Why Extended Reasoning Matters',
          content: 'ReAct (Reasoning + Acting) interleaves thought and action in a simple loop: Thought -> Action -> Observation. TPAOR extends this with explicit planning, re-planning on failure, self-reflection, policy enforcement, and cross-agent judgment. The key insight is that fraud decisions require structured critique: an LLM might approve a seller, but the policy engine catches that the seller\'s country is sanctioned. The REFLECT phase catches 12-15% of errors that would otherwise pass through. The JUDGE phase adds cross-agent review for high-stakes decisions (REJECT/BLOCK), reducing false positives by 8-20%.',
        },
        {
          title: 'Tool Registry Design',
          content: 'Each agent registers tools in its constructor via this.registerTool(name, description, handler). Tools are deterministic functions (no LLM calls) that fetch data, call APIs, or compute scores. The PLAN phase selects which tools to call based on the input context. The ACT phase executes them in parallel where possible. If >50% of tools fail, RE-PLAN generates an alternative strategy. This separation ensures that tool execution is auditable and reproducible regardless of LLM non-determinism.',
        },
        {
          title: 'Memory Architecture: Four Tiers',
          content: 'Short-term memory: Current session context, input data, tool results. Cleared after each decision. Long-term memory: Cross-session patterns learned from outcomes (e.g., "sellers from region X with <30 days account age have 3x fraud rate"). Stored in Mem0/Letta or SQLite. Episodic memory: Specific past cases recalled by semantic similarity using vector search (Pinecone/Qdrant). Enables "have we seen this pattern before?" reasoning. Pattern memory: Statistical fraud patterns with decay (30-day half-life). Redis-backed circular buffers track frequency, recency, and severity of observed patterns.',
        },
        {
          title: 'Multi-Agent Consensus',
          content: 'The consensus engine supports three strategies: majority vote (simple), weighted vote (by agent confidence), and deliberation (agents see each other\'s reasoning and can revise). For fraud detection, weighted deliberation works best: the domain-specific agent has highest weight, but cross-domain and behavioral agents can override if they detect patterns invisible to the primary agent. Consensus is mandatory for BLOCK decisions, optional for APPROVE/HOLD.',
        },
        {
          title: 'Prompt Engineering Patterns',
          content: 'Structured prompts use the prompt-templates.js module with role/context/task/constraints/output-format sections. Each TPAOR phase has its own prompt template. Key patterns: (1) Few-shot examples from pattern memory, (2) Chain-of-thought enforcement via JSON output schemas, (3) Citation requirements linking claims to specific tool evidence, (4) Confidence calibration instructions ("score 0.7-0.8 means likely but not certain"), (5) Anti-hallucination guardrails ("only reference data from the provided tool results").',
        },
        {
          title: 'Cost Optimization',
          content: 'LLM costs are managed through: (1) Response caching in Redis with TTL-based invalidation, (2) Model routing: simple decisions use gpt-4o-mini, complex ones escalate to gpt-4o, (3) Token budgets per agent per decision, (4) Batch processing for non-urgent evaluations, (5) Fallback to hardcoded heuristics when LLM is unavailable or budget exceeded. The budget warning system triggers at 80% of daily spend limit.',
        },
      ],
      antiPatterns: [
        { title: 'God Agent', desc: 'A single agent handling all domains. Leads to prompt bloat, confused reasoning, and inability to scale. Use specialized agents with clear domain boundaries.' },
        { title: 'Unbounded Tool Calls', desc: 'Letting the LLM call unlimited tools without a plan phase. Leads to runaway costs and latency. Always cap tool calls per phase and use RE-PLAN for failures.' },
        { title: 'Trusting LLM Decisions Directly', desc: 'Skipping policy enforcement and human review for high-stakes decisions. The policy engine must always run last and override LLM when rules are violated.' },
        { title: 'Stateless Agents', desc: 'Not persisting learned patterns across sessions. Each decision starts from zero knowledge. Memory architecture (long-term + pattern) is essential for improving over time.' },
      ],
    },
  },
  {
    id: 'realtime-decisioning',
    title: 'Real-Time Decisioning Systems',
    subtitle: 'Sub-50ms fraud decisions with rules, ML, and policy override',
    icon: Zap,
    accentColor: 'cyan',
    accentClasses: {
      gradient: 'from-cyan-500 to-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/30',
      text: 'text-cyan-400',
      badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
      stageBg: 'bg-cyan-900/40',
      stageBorder: 'border-cyan-500/40',
    },
    overview: [
      'Real-time decisioning systems must balance speed, accuracy, and explainability. A fraud detection engine receives an event (transaction, login, payout request), enriches it with features from multiple data sources, scores it through ML models and rules, applies experimentation overlays, and emits a decision -- all within a strict latency budget. The target: 50ms p95 for inline decisions, 500ms for async agent evaluations.',
      'The architecture follows a layered approach: the feature store provides pre-computed features (online) and batch-computed aggregates (offline). The ML model produces a probability score. The rules engine applies deterministic logic (velocity limits, sanction lists, threshold checks). The experimentation layer routes a percentage of traffic through challenger models. Finally, the policy engine applies hard overrides that cannot be bypassed regardless of model or rule output.',
      'Audit trails are non-negotiable in financial systems. Every decision records: the input features, model scores, rules triggered, policy overrides applied, the final action, and a human-readable explanation. This enables regulatory compliance (SAR filing), model monitoring (drift detection), and analyst review (case queue). The chain-of-thought module captures the full reasoning path from input to decision.',
    ],
    architectureStages: [
      { label: 'Event', desc: 'Transaction/action' },
      { label: 'Feature Store', desc: 'Enrich features' },
      { label: 'ML Model', desc: 'Risk scoring' },
      { label: 'Rules Engine', desc: 'Deterministic checks' },
      { label: 'Experimentation', desc: 'A/B routing' },
      { label: 'Policy', desc: 'Hard overrides' },
      { label: 'Decision', desc: 'APPROVE/HOLD/BLOCK' },
      { label: 'Audit Trail', desc: 'Full trace logged' },
    ],
    projectFiles: [
      { path: 'backend/services/platform/platform-integrator.js', desc: 'Unified platform integration layer connecting all decisioning components' },
      { path: 'backend/services/platform/decision-engine/', desc: 'Rules execution, scoring, and decision routing' },
      { path: 'backend/services/platform/feature-store.js', desc: 'Online feature serving with Redis cache + offline batch computation' },
      { path: 'backend/services/platform/ml-platform/onboarding-risk-model.js', desc: 'Neural network risk model with TensorFlow.js' },
      { path: 'backend/agents/core/policy-engine.js', desc: 'Policy override layer -- always executes last' },
      { path: 'backend/agents/core/decision-logger.js', desc: 'Immutable decision audit trail with full reasoning capture' },
      { path: 'backend/risk-profile/emit-event.js', desc: 'Risk event emission and aggregate profile recalculation' },
    ],
    industryAlternatives: [
      { name: 'FICO Falcon', category: 'Enterprise' },
      { name: 'Featurespace ARIC', category: 'Enterprise' },
      { name: 'AWS Fraud Detector', category: 'Cloud' },
      { name: 'Stripe Radar', category: 'Payments' },
      { name: 'Sardine', category: 'Fintech' },
      { name: 'Feedzai', category: 'Enterprise' },
      { name: 'Sift', category: 'Digital Trust' },
      { name: 'Kount (Equifax)', category: 'Enterprise' },
    ],
    deepDive: {
      title: 'Deep Dive: Decisioning Internals',
      sections: [
        {
          title: 'Latency Budget Allocation',
          content: 'A 50ms budget for inline decisions requires careful allocation: Feature lookup (10ms) -> ML inference (15ms) -> Rules evaluation (10ms) -> Policy check (5ms) -> Logging (10ms async). The key optimization is pre-computing features in the online feature store (Redis) so that enrichment is a cache lookup, not a database query. ML inference uses TensorFlow.js with warm model caching. Rules are compiled into a decision tree at startup, not interpreted at runtime.',
        },
        {
          title: 'Feature Store: Online vs Offline',
          content: 'Online features are computed in real-time or near-real-time and served from Redis: current session velocity, device fingerprint trust score, time since last action. Offline features are batch-computed: 30-day transaction volume, historical dispute rate, network centrality score. The feature store unifies both behind a single API. Feature freshness SLAs: online < 1s, offline < 1h. Stale features trigger alerts but never block decisions.',
        },
        {
          title: 'Rules Lifecycle: TESTING -> SHADOW -> ACTIVE -> DEPRECATED',
          content: 'New rules start in TESTING (only evaluated in unit tests). They graduate to SHADOW (evaluated on live traffic, logged, but not enforced). After validation, they become ACTIVE (enforced). Deprecated rules are soft-deleted. The rule_performance table tracks per-rule trigger rate, false positive rate, and latency. The RuleOptimizationAgent autonomously proposes threshold adjustments based on this data.',
        },
        {
          title: 'Champion/Challenger Testing',
          content: 'The experimentation layer supports champion/challenger model testing. Traffic is split (e.g., 90/10) between the production model (champion) and a candidate model (challenger). Both models score every event, but only the champion\'s score is enforced. Statistical significance is measured using chi-square tests and Monte Carlo bootstrap. A challenger must show >2% improvement in precision with <0.5% degradation in recall to graduate.',
        },
        {
          title: 'Score Decay Mathematics',
          content: 'Risk scores decay over time using a 30-day half-life: score(t) = score(0) * 0.5^(t/30). This means a risk signal loses half its weight every 30 days without reinforcement. Multiple signals from different domains compound: aggregate_score = 1 - product(1 - domain_score_i * weight_i). De-escalation has a 48-hour cooldown to prevent rapid oscillation between risk tiers.',
        },
      ],
      antiPatterns: [
        { title: 'Synchronous Everything', desc: 'Making every enrichment call synchronous in the hot path. Use pre-computed features and async logging. Only the decision itself must be synchronous.' },
        { title: 'Rules Without Lifecycle', desc: 'Deploying rules directly to production without shadow mode. A single bad rule can block legitimate users at scale. Always shadow-test first.' },
        { title: 'Missing Audit Trail', desc: 'Not recording why a decision was made. Regulators require explainability. Every decision must capture input features, model scores, rules triggered, and the final reasoning.' },
      ],
    },
  },
  {
    id: 'ml-platform',
    title: 'ML Platform Architecture',
    subtitle: 'End-to-end ML lifecycle from feature engineering to model monitoring',
    icon: Cpu,
    accentColor: 'indigo',
    accentClasses: {
      gradient: 'from-indigo-500 to-indigo-400',
      bg: 'bg-indigo-500/10',
      border: 'border-indigo-500/30',
      text: 'text-indigo-400',
      badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
      stageBg: 'bg-indigo-900/40',
      stageBorder: 'border-indigo-500/40',
    },
    overview: [
      'A production ML platform manages the full lifecycle: data ingestion, feature engineering, model training, registry, deployment (shadow -> canary -> production), serving, monitoring, and retraining. In fraud detection, models must balance precision (catching real fraud) with recall (not blocking legitimate users). A 1% false positive rate on millions of transactions means thousands of wrongly blocked customers per day.',
      'Feature engineering is where domain expertise meets data science. Raw signals (IP address, device fingerprint, transaction amount) are transformed into predictive features (velocity ratios, geographic anomaly scores, behavioral deviation metrics). The feature extractor module handles both real-time feature computation and batch aggregation, feeding both the ML models and the rules engine.',
      'Model governance ensures that deployed models are auditable, explainable, and performing within acceptable bounds. The model registry tracks versions, training data lineage, evaluation metrics, and deployment status. Drift detection monitors input feature distributions (PSI) and prediction distributions over time. When drift exceeds thresholds, automated retraining pipelines trigger with human approval gates.',
    ],
    architectureStages: [
      { label: 'Raw Data', desc: 'Events & features' },
      { label: 'Feature Eng.', desc: 'Transform & enrich' },
      { label: 'Training', desc: 'Model fitting' },
      { label: 'Registry', desc: 'Version control' },
      { label: 'Shadow', desc: 'Score but don\'t act' },
      { label: 'Canary', desc: '5% traffic' },
      { label: 'Production', desc: 'Full traffic' },
      { label: 'Monitoring', desc: 'Drift & perf' },
      { label: 'Retrain', desc: 'Feedback loop' },
    ],
    projectFiles: [
      { path: 'backend/services/platform/ml-platform/onboarding-feature-extractor.js', desc: 'Feature engineering pipeline: raw signals to predictive features' },
      { path: 'backend/services/platform/ml-platform/onboarding-risk-model.js', desc: 'TensorFlow.js neural network: 15-feature input, calibrated probability output' },
      { path: 'backend/services/platform/ml-platform/model-loader.js', desc: 'Model version management, warm loading, and fallback handling' },
      { path: 'backend/services/platform/ml-platform/prediction-cache-redis.js', desc: 'Redis-backed prediction cache with TTL invalidation' },
      { path: 'backend/services/platform/ml-platform/ml-monitoring/', desc: 'PSI drift detection, confusion matrix, prediction distribution tracking' },
      { path: 'backend/services/platform/ml-platform/ml-governance/', desc: 'Model registry, approval workflows, audit trail' },
    ],
    industryAlternatives: [
      { name: 'MLflow', category: 'Lifecycle' },
      { name: 'Kubeflow', category: 'Orchestration' },
      { name: 'Seldon Core', category: 'Serving' },
      { name: 'BentoML', category: 'Serving' },
      { name: 'TF Serving', category: 'Serving' },
      { name: 'Weights & Biases', category: 'Experiment Tracking' },
      { name: 'Feast', category: 'Feature Store' },
      { name: 'Tecton', category: 'Feature Store' },
      { name: 'Vertex AI', category: 'Cloud Platform' },
      { name: 'SageMaker', category: 'Cloud Platform' },
    ],
    deepDive: {
      title: 'Deep Dive: ML Engineering Details',
      sections: [
        {
          title: 'Neural Network Architecture Choices',
          content: 'Fraud detection models typically use shallow neural networks (2-4 hidden layers) rather than deep architectures. The onboarding risk model uses a 15-feature input layer, two hidden layers (64 and 32 neurons with ReLU activation), dropout (0.3) for regularization, and a sigmoid output for calibrated probability. Tree-based models (XGBoost, LightGBM) often outperform neural nets on tabular fraud data but lack the online learning capabilities needed for real-time adaptation.',
        },
        {
          title: 'SHAP Explainability',
          content: 'Every prediction must be explainable for regulatory compliance and analyst review. SHAP (SHapley Additive exPlanations) values decompose each prediction into per-feature contributions. For a risk score of 0.85: "velocity_ratio contributed +0.25, geographic_anomaly contributed +0.20, account_age contributed +0.15." This enables analysts to understand why a decision was made and provides evidence for SAR filings.',
        },
        {
          title: 'Model A/B Testing',
          content: 'The experimentation platform supports model A/B testing with statistical rigor. Traffic is split between models using consistent hashing (same seller always sees same model). Metrics tracked: precision, recall, F1, latency p50/p95/p99, and business metrics (fraud loss rate, false positive rate). Minimum sample size is calculated using power analysis. Results are validated with chi-square significance testing and bootstrap confidence intervals.',
        },
        {
          title: 'Drift Detection with PSI',
          content: 'Population Stability Index (PSI) measures how much a feature distribution has shifted since training. PSI < 0.1: no significant change. PSI 0.1-0.25: moderate shift, monitor closely. PSI > 0.25: significant shift, trigger retraining. The ML monitoring module computes PSI for all input features on a rolling 24h window and alerts when thresholds are breached.',
        },
        {
          title: 'Online vs Batch Learning',
          content: 'Batch learning retrains models periodically (daily/weekly) on accumulated labeled data. Online learning updates model weights incrementally as new labeled examples arrive. Fraud detection benefits from online learning because fraud patterns evolve rapidly (adversarial adaptation). However, online learning risks catastrophic forgetting and adversarial poisoning. The recommended approach: batch retraining as the baseline with online fine-tuning for high-confidence labeled examples.',
        },
      ],
      antiPatterns: [
        { title: 'Training-Serving Skew', desc: 'Using different feature computation code in training vs serving. Always use the same feature extraction pipeline for both to prevent silent accuracy degradation.' },
        { title: 'No Shadow Deployment', desc: 'Deploying new models directly to production. Always run in shadow mode first, comparing predictions against the champion model before routing live traffic.' },
        { title: 'Ignoring Label Delay', desc: 'Fraud labels arrive days/weeks after the event. Training on only immediately-labeled data biases the model toward easily-detected fraud. Use delayed labeling windows and semi-supervised techniques.' },
      ],
    },
  },
  {
    id: 'streaming-data',
    title: 'Streaming & Data Platform',
    subtitle: 'Kafka backbone, stream processing, data catalog, and data governance',
    icon: Radio,
    accentColor: 'purple',
    accentClasses: {
      gradient: 'from-purple-500 to-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/30',
      text: 'text-purple-400',
      badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      stageBg: 'bg-purple-900/40',
      stageBorder: 'border-purple-500/40',
    },
    overview: [
      'Modern fraud detection platforms are event-driven architectures built on streaming infrastructure. Apache Kafka serves as the central nervous system: every transaction, login, profile change, and agent decision flows through Kafka topics. This enables real-time processing, event replay for investigation, and decoupled microservices that can evolve independently.',
      'Stream processing transforms raw events into actionable signals. Windowed aggregations compute velocity metrics (transactions per hour), sessionization groups related events, and complex event processing (CEP) detects multi-step fraud patterns. The streaming factory pattern allows swapping between Kafka (production) and an in-memory event bus (development) without changing application code.',
      'Data governance encompasses schema management, data quality monitoring, lineage tracking, and access controls. The data catalog provides discovery and documentation of all data assets. A dead-letter queue captures events that fail processing, enabling debugging and replay. Schema evolution (adding fields, deprecating old ones) must be backward-compatible to avoid breaking downstream consumers.',
    ],
    architectureStages: [
      { label: 'Producers', desc: 'Services emit events' },
      { label: 'Kafka Topics', desc: '14 event streams' },
      { label: 'Processors', desc: 'Transform & enrich' },
      { label: 'Consumers', desc: 'Agents & services' },
      { label: 'DLQ', desc: 'Failed events' },
      { label: 'Data Catalog', desc: 'Schema registry' },
    ],
    projectFiles: [
      { path: 'backend/services/platform/data-platform/kafka-stream-engine.js', desc: 'KafkaJS-based producer/consumer with topic management' },
      { path: 'backend/services/platform/data-platform/stream-engine.js', desc: 'In-memory event bus for development (Kafka fallback)' },
      { path: 'backend/services/platform/data-platform/streaming-factory.js', desc: 'Factory pattern: selects Kafka or in-memory based on STREAMING_BACKEND env var' },
      { path: 'backend/services/platform/data-platform/onboarding-pipeline.js', desc: 'End-to-end streaming pipeline for seller onboarding events' },
      { path: 'backend/services/platform/data-platform/stream-processors.js', desc: 'Windowed aggregations, sessionization, and CEP rules' },
      { path: 'backend/services/platform/feature-store.js', desc: 'Feature store consuming from streaming pipeline' },
    ],
    industryAlternatives: [
      { name: 'Apache Flink', category: 'Stream Processing' },
      { name: 'Spark Streaming', category: 'Micro-Batch' },
      { name: 'Kafka Streams', category: 'Library' },
      { name: 'Apache Pulsar', category: 'Messaging' },
      { name: 'Debezium', category: 'CDC' },
      { name: 'Apache Beam', category: 'Unified' },
      { name: 'Materialize', category: 'Streaming SQL' },
      { name: 'RisingWave', category: 'Streaming DB' },
    ],
    deepDive: {
      title: 'Deep Dive: Streaming Architecture',
      sections: [
        {
          title: 'Partition Strategies for Fraud Detection',
          content: 'Kafka topic partitioning determines parallelism and ordering guarantees. For fraud detection, partition by seller_id to ensure all events for a seller are processed in order by the same consumer. This enables stateful processing (velocity tracking) without external coordination. For cross-seller analysis (fraud ring detection), use a separate topic partitioned by network_id or a global aggregation consumer group.',
        },
        {
          title: 'Exactly-Once Semantics',
          content: 'Financial systems require exactly-once processing: a transaction must not be scored twice or missed. Kafka supports exactly-once via idempotent producers (enable.idempotence=true) and transactional consumers (read_committed isolation). The application layer adds deduplication using transaction IDs in Redis with short TTLs. For the agent evaluation pipeline, at-least-once with idempotent handlers is sufficient since agent decisions are deterministic given the same input.',
        },
        {
          title: 'Windowing Strategies',
          content: 'Tumbling windows: fixed-size, non-overlapping (e.g., 1-hour transaction count). Sliding windows: overlapping, continuous (e.g., transactions in the last 60 minutes, updated every minute). Session windows: dynamic, gap-based (e.g., group all events with <30min gaps into a session). For fraud velocity detection, sliding windows provide the most accurate signal but consume more memory. Tumbling windows are used for aggregate reporting.',
        },
        {
          title: 'Backpressure and Flow Control',
          content: 'When consumers can\'t keep up with producers, backpressure management prevents data loss and memory exhaustion. Strategies: (1) Consumer lag monitoring with alerts at >10k messages, (2) Auto-scaling consumer groups based on lag, (3) Priority queues for high-risk events, (4) Graceful degradation: switch to sampling mode under extreme load, (5) Dead-letter queue for events that fail after max retries.',
        },
        {
          title: 'Schema Evolution',
          content: 'Event schemas evolve over time. Backward-compatible changes (adding optional fields) are safe. Breaking changes (removing fields, changing types) require versioned topics or a migration period. The schema registry enforces compatibility checks before allowing new schema versions. Consumer code must handle missing fields gracefully using default values.',
        },
      ],
      antiPatterns: [
        { title: 'Unbounded State', desc: 'Keeping all historical state in stream processors. Use windowed state with TTLs and offload historical data to cold storage (S3/data warehouse).' },
        { title: 'Synchronous Kafka', desc: 'Waiting for Kafka acknowledgment in the HTTP request hot path. Use fire-and-forget for non-critical events and async confirmation for critical ones.' },
        { title: 'Single Topic for Everything', desc: 'Mixing all event types in one topic. Different event types have different partitioning, retention, and consumer requirements. Use dedicated topics per domain.' },
      ],
    },
  },
  {
    id: 'platform-patterns',
    title: 'Platform-as-a-Service Patterns',
    subtitle: 'Pluggable backends via factory pattern, graceful degradation, and multi-tenancy',
    icon: Layers,
    accentColor: 'amber',
    accentClasses: {
      gradient: 'from-amber-500 to-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      text: 'text-amber-400',
      badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      stageBg: 'bg-amber-900/40',
      stageBorder: 'border-amber-500/40',
    },
    overview: [
      'Platform engineering transforms infrastructure complexity into developer-friendly abstractions. The factory pattern is the cornerstone: application code imports a factory function that reads an environment variable and returns the appropriate backend implementation. The application never knows whether it is talking to PostgreSQL or SQLite, Redis or in-memory cache, Kafka or an event bus. This enables zero-Docker local development, gradual production migration, and multi-cloud portability.',
      'Graceful degradation ensures the platform remains operational when individual services fail. If Redis is down, the cache factory returns an in-memory cache. If Kafka is unavailable, the streaming factory returns a local event bus. If the LLM provider is unreachable, agents fall back to hardcoded heuristic decisions. Each factory implements a health check and reports degraded status without crashing the application.',
      'This architecture follows 12-factor app principles: configuration via environment variables, stateless processes, port binding, disposable containers, dev/prod parity, and treat logs as event streams. The result is a platform that runs identically on a developer laptop (zero dependencies) and in production (12 Docker services), with the same application code.',
    ],
    architectureStages: [
      { label: 'App Code', desc: 'Business logic' },
      { label: 'Factory', desc: 'Read env var' },
      { label: 'Production', desc: 'Postgres/Redis/Kafka' },
      { label: 'Fallback', desc: 'SQLite/Memory/EventBus' },
      { label: 'Same Interface', desc: 'Identical API' },
    ],
    projectFiles: [
      { path: 'backend/shared/common/database-factory.js', desc: 'DB_BACKEND: postgres | sqlite -- returns identical db_ops interface' },
      { path: 'backend/services/platform/data-platform/streaming-factory.js', desc: 'STREAMING_BACKEND: kafka | memory -- returns identical stream interface' },
      { path: 'backend/services/platform/feature-store-factory.js', desc: 'Feature store backend selection with fallback' },
      { path: 'backend/agents/core/cache-factory.js', desc: 'CACHE_BACKEND: redis | memory -- returns identical cache interface' },
      { path: 'backend/graph/graph-factory.js', desc: 'GRAPH_BACKEND: neo4j | memory -- returns identical graph interface' },
      { path: 'backend/agents/core/observability-factory.js', desc: 'OBSERVABILITY_BACKEND: langfuse | phoenix | sqlite -- traces, metrics, decisions' },
      { path: 'backend/agents/core/analytics-factory.js', desc: 'ANALYTICS_BACKEND: pinot | sqlite -- OLAP analytics' },
      { path: 'backend/agents/core/memory-factory.js', desc: 'MEMORY_BACKEND: letta | mem0 | sqlite -- agent memory' },
    ],
    industryAlternatives: [
      { name: 'Kubernetes', category: 'Orchestration' },
      { name: 'Helm', category: 'Package Mgmt' },
      { name: 'Terraform', category: 'IaC' },
      { name: 'Istio', category: 'Service Mesh' },
      { name: 'Dapr', category: 'Runtime' },
      { name: 'Backstage', category: 'Dev Portal' },
      { name: 'Crossplane', category: 'Control Plane' },
      { name: 'Pulumi', category: 'IaC' },
    ],
    deepDive: {
      title: 'Deep Dive: Platform Engineering',
      sections: [
        {
          title: 'Factory Implementation Pattern',
          content: 'Each factory follows the same structure: (1) Read environment variable with sensible default, (2) Lazy-initialize the backend on first call, (3) Return a cached singleton, (4) Handle initialization failure by falling back to the default backend, (5) Expose a health check method. The key constraint: all backends must implement the exact same interface. The database factory returns db_ops with insert/getById/getAll/update/query methods whether backed by Postgres or SQLite.',
        },
        {
          title: '12-Factor App Compliance',
          content: 'The codebase follows 12-factor principles: (I) Codebase: one repo, many deploys. (II) Dependencies: package.json declares everything. (III) Config: .env file, never hardcoded. (IV) Backing services: all treated as attached resources via factories. (V) Build/release/run: Vite build + Docker Compose. (VI) Processes: stateless Node.js processes. (VII) Port binding: Express on 3001. (VIII) Concurrency: scale via process count. (IX) Disposability: fast startup, graceful shutdown. (X) Dev/prod parity: same code, different env vars. (XI) Logs: console output, structured JSON. (XII) Admin processes: migration scripts.',
        },
        {
          title: 'Health Check Architecture',
          content: 'Each factory exposes a health check that reports: status (healthy/degraded/down), latency (ms), last successful operation timestamp, and backend type. The gateway aggregates all health checks into a single /health endpoint. Kubernetes liveness probes use /health for restart decisions. Readiness probes check that critical backends (database, cache) are available. Startup probes allow slow initialization (model loading, Kafka connection).',
        },
        {
          title: 'Configuration Management',
          content: 'Three levels of configuration: (1) Environment variables (.env file) for infrastructure selection, (2) Database-stored configuration for runtime-tunable parameters (risk thresholds, agent weights), (3) Code constants for immutable business logic (domain weights, tier boundaries). Changes to level 1 require restart. Level 2 changes are hot-reloaded. Level 3 changes require deployment. Never store secrets in code or config files -- use environment variables or a secrets manager.',
        },
        {
          title: 'Multi-Tenancy Patterns',
          content: 'For SaaS deployment, multi-tenancy can be implemented at three levels: (1) Database-level isolation: separate schemas per tenant (strongest isolation, highest cost), (2) Row-level isolation: tenant_id column on every table with RLS policies (moderate isolation, moderate cost), (3) Application-level isolation: tenant context in middleware, filtered queries (weakest isolation, lowest cost). The factory pattern makes this pluggable: a tenant-aware database factory wraps the base factory with RLS enforcement.',
        },
      ],
      antiPatterns: [
        { title: 'Leaky Abstractions', desc: 'Factory backends that expose backend-specific APIs. If code uses Postgres-specific SQL, it breaks when swapped to SQLite. Always use the common interface (db_ops) and test with both backends.' },
        { title: 'Config in Code', desc: 'Hardcoding connection strings, API keys, or feature flags in source code. Use environment variables for all configuration. Never commit .env files to version control.' },
        { title: 'No Fallback', desc: 'Crashing when a non-critical service is unavailable. Every factory must have a degraded fallback mode. The platform should function (with reduced capabilities) even if Redis, Kafka, and Neo4j are all down.' },
      ],
    },
  },
  {
    id: 'security-compliance',
    title: 'Security & Compliance Architecture',
    subtitle: 'Sanctions screening, KYC verification chains, audit trails, and regulatory frameworks',
    icon: Shield,
    accentColor: 'red',
    accentClasses: {
      gradient: 'from-red-500 to-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      text: 'text-red-400',
      badge: 'bg-red-500/15 text-red-300 border-red-500/30',
      stageBg: 'bg-red-900/40',
      stageBorder: 'border-red-500/40',
    },
    overview: [
      'Financial platforms operate under strict regulatory requirements: Know Your Customer (KYC), Anti-Money Laundering (AML), sanctions screening (OFAC/EU/UN), and Suspicious Activity Report (SAR) filing. Non-compliance carries severe penalties: fines up to $1M per violation, criminal liability for officers, and loss of banking relationships. The compliance architecture must be provably correct, auditable, and continuously monitored.',
      'Sanctions screening matches every entity (person, business, address) against government watchlists. OFAC\'s SDN (Specially Designated Nationals) list contains 18,000+ entries with names, aliases, addresses, and identification numbers. Fuzzy matching handles transliteration variants, name ordering differences, and typographical errors. The matching algorithm must balance sensitivity (catching sanctioned entities) with specificity (not flagging every "Mohamed" or "Smith").',
      'Audit trails form the backbone of compliance. Every decision, data access, and configuration change must be recorded immutably with timestamps, actor identity, and full context. The chain-of-thought module captures the complete reasoning path from input through each processing stage to the final decision. This audit data feeds regulatory reporting, supports SAR filing, and provides evidence in enforcement actions.',
    ],
    architectureStages: [
      { label: 'Action', desc: 'Entity event' },
      { label: 'KYC/KYB', desc: 'Identity verification' },
      { label: 'Sanctions', desc: 'OFAC/EU/UN screening' },
      { label: 'Risk Assessment', desc: 'Score & classify' },
      { label: 'Decision + Audit', desc: 'Immutable record' },
      { label: 'Reporting', desc: 'SAR/CTR filing' },
      { label: 'Retention', desc: '5-7 year archive' },
    ],
    projectFiles: [
      { path: 'backend/services/business/seller-onboarding/ofac-screening.js', desc: '18,712 SDN entries with fuzzy name matching, alias resolution, and confidence scoring' },
      { path: 'backend/services/business/seller-onboarding/real-apis.js', desc: 'Production API integrations: identity verification, business registry, phone/email validation' },
      { path: 'backend/services/business/seller-onboarding/free-apis.js', desc: 'Free API tier: IP geolocation, email verification, phone validation' },
      { path: 'backend/agents/core/decision-logger.js', desc: 'Immutable decision audit trail with full chain-of-thought capture' },
      { path: 'backend/agents/core/chain-of-thought.js', desc: 'Structured reasoning traces for explainability and compliance' },
      { path: 'backend/shared/common/database-factory.js', desc: '28 database tables including agent_decisions, agent_traces, risk_events' },
    ],
    industryAlternatives: [
      { name: 'ComplyAdvantage', category: 'AML/KYC' },
      { name: 'Chainalysis', category: 'Crypto Compliance' },
      { name: 'Jumio', category: 'Identity' },
      { name: 'Onfido', category: 'Identity' },
      { name: 'Socure', category: 'Identity' },
      { name: 'Elliptic', category: 'Crypto AML' },
      { name: 'NICE Actimize', category: 'Enterprise AML' },
      { name: 'Alloy', category: 'Orchestration' },
    ],
    deepDive: {
      title: 'Deep Dive: Compliance Engineering',
      sections: [
        {
          title: 'OFAC Fuzzy Matching Algorithm',
          content: 'Name matching against the SDN list uses a multi-stage pipeline: (1) Normalization: lowercase, remove diacritics, standardize transliterations (Mohammed/Muhammad/Mohamed). (2) Tokenization: split into name components, handle name ordering variants. (3) Similarity scoring: Levenshtein distance for typos, Jaro-Winkler for prefix similarity, Soundex/Metaphone for phonetic matching. (4) Composite scoring: weighted combination of exact match (0.4), fuzzy match (0.3), phonetic match (0.2), alias match (0.1). Threshold: >0.85 = block and review, 0.70-0.85 = flag for manual review, <0.70 = pass.',
        },
        {
          title: 'KYC Verification Chains',
          content: 'KYC verification follows a cascading chain: (1) Document verification: OCR extraction + liveness detection, (2) Identity cross-reference: name/DOB/address against credit bureaus, (3) Phone verification: carrier lookup + OTP, (4) Email verification: domain age + deliverability + history, (5) Device verification: fingerprint + trust score + geolocation consistency, (6) Business verification (KYB): registry lookup + UBO identification + sanctions screening on all officers. Each step produces a confidence score. The aggregate KYC score weights steps by reliability: document (0.30) > identity (0.25) > business (0.20) > device (0.15) > phone (0.05) > email (0.05).',
        },
        {
          title: 'Immutable Audit Trails',
          content: 'Audit records are append-only: no UPDATE or DELETE operations allowed on audit tables. Each record contains: timestamp, actor (agent ID or user ID), action, entity, before/after state, reasoning, and a hash chain linking to the previous record. This provides tamper-evidence similar to a blockchain but without the distributed consensus overhead. Audit data is replicated to a separate database for disaster recovery and has a 7-year retention policy per BSA/AML requirements.',
        },
        {
          title: 'PII Handling and Data Protection',
          content: 'Personally Identifiable Information (PII) requires special handling: (1) Encryption at rest: AES-256 for database fields containing SSN, DOB, bank accounts. (2) Encryption in transit: TLS 1.3 for all API communication. (3) Tokenization: replace raw PII with reversible tokens for processing. (4) Access controls: role-based access with audit logging for every PII access. (5) Data minimization: only collect PII necessary for the specific compliance requirement. (6) Right to deletion: GDPR/CCPA compliance requires soft-delete with data anonymization after retention period.',
        },
        {
          title: 'SAR Automation',
          content: 'Suspicious Activity Reports (SARs) must be filed within 30 days of detection for transactions >$5,000 with suspected illegal activity. The platform automates SAR preparation: (1) Auto-detection of reportable patterns (structuring, layering, unusual activity), (2) Evidence assembly from agent decisions, tool results, and audit trails, (3) Narrative generation using LLM with structured templates, (4) Human review and approval workflow, (5) Electronic filing via BSA E-Filing. Currency Transaction Reports (CTRs) are auto-filed for transactions >$10,000.',
        },
        {
          title: 'Regulatory Frameworks',
          content: 'Key regulations: Bank Secrecy Act (BSA): AML program, SAR filing, CTR reporting. USA PATRIOT Act: Enhanced due diligence for high-risk customers. OFAC: Sanctions screening against SDN, sectoral sanctions, country programs. PCI DSS: Payment card data security. GDPR: EU data protection and privacy. CCPA: California consumer privacy. SOX: Financial reporting controls. The compliance agent evaluates every decision against applicable regulatory requirements and flags potential violations for human review.',
        },
      ],
      antiPatterns: [
        { title: 'Mutable Audit Logs', desc: 'Allowing UPDATE or DELETE on audit tables. Audit records must be immutable and append-only. Use separate tables with INSERT-only permissions and hash chains for tamper evidence.' },
        { title: 'Hardcoded Sanctions List', desc: 'Embedding the SDN list in code and updating with deployments. OFAC updates the list multiple times per month. Use automated daily downloads with delta processing and version tracking.' },
        { title: 'PII in Logs', desc: 'Logging raw PII (SSN, bank account, full name) in application logs. Always tokenize or mask PII before logging. Use structured logging with PII-aware formatters that redact sensitive fields.' },
      ],
    },
  },
]

// ─── Sub-Components ─────────────────────────────────────────────────────────────

function ArchitectureDiagram({ stages, accentClasses }) {
  return (
    <div className="mt-6 mb-4">
      <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Architecture Pattern</h4>
      <div className="flex flex-wrap items-center gap-2">
        {stages.map((stage, i) => (
          <div key={stage.label} className="flex items-center gap-2">
            <div className={`${accentClasses.stageBg} border ${accentClasses.stageBorder} rounded-lg px-3 py-2 min-w-[100px] text-center`}>
              <div className={`text-sm font-semibold ${accentClasses.text}`}>{stage.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stage.desc}</div>
            </div>
            {i < stages.length - 1 && (
              <ArrowRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ProjectFilesList({ files }) {
  return (
    <div className="mt-6">
      <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">How This Project Implements It</h4>
      <div className="space-y-2">
        {files.map((f) => (
          <div key={f.path} className="flex items-start gap-3 group">
            <FileCode className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0" />
            <div>
              <code className="text-sm text-gray-400 font-mono">{f.path}</code>
              <p className="text-xs text-gray-600 mt-0.5">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IndustryAlternatives({ alternatives, accentClasses }) {
  return (
    <div className="mt-6">
      <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Industry Alternatives</h4>
      <div className="flex flex-wrap gap-2">
        {alternatives.map((alt) => (
          <span
            key={alt.name}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${accentClasses.badge}`}
          >
            <span>{alt.name}</span>
            <span className="text-gray-500">({alt.category})</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function DeepDiveSection({ deepDive, accentClasses }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mt-6 border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0e0e16] hover:bg-[#111119] transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className={`w-4 h-4 ${accentClasses.text}`} />
          <span className="text-sm font-semibold text-gray-300">{deepDive.title}</span>
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-800">
          {deepDive.sections.map((section) => (
            <div key={section.title} className="mt-4 ml-2">
              <h5 className={`text-sm font-semibold ${accentClasses.text} mb-2`}>{section.title}</h5>
              <p className="text-sm text-gray-400 leading-relaxed">{section.content}</p>
            </div>
          ))}

          {deepDive.antiPatterns && deepDive.antiPatterns.length > 0 && (
            <div className="mt-6 ml-2">
              <h5 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Anti-Patterns to Avoid
              </h5>
              <div className="space-y-3">
                {deepDive.antiPatterns.map((ap) => (
                  <div key={ap.title} className="bg-red-950/30 border border-red-900/40 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-sm font-semibold text-red-300">{ap.title}</span>
                    </div>
                    <p className="text-xs text-red-400/80 leading-relaxed ml-5.5">{ap.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function ArchitectureGuide() {
  const [expandedSections, setExpandedSections] = useState({ 'agentic-ai': true })

  const toggleSection = (id) => {
    setExpandedSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const expandAll = () => {
    const all = {}
    SECTIONS.forEach((s) => { all[s.id] = true })
    setExpandedSections(all)
  }

  const collapseAll = () => {
    setExpandedSections({})
  }

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-[#0e0e16]">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
              <GitBranch className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-400 bg-clip-text text-transparent">
                Architecture Reference Guide
              </h1>
              <p className="text-gray-400 mt-2 max-w-3xl">
                A comprehensive reference for AI architects covering agentic systems, real-time decisioning,
                ML platforms, streaming infrastructure, platform engineering, and security/compliance patterns.
                Each section maps architectural concepts to this project's implementation.
              </p>
              <div className="flex items-center gap-4 mt-4">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Box className="w-3.5 h-3.5" />
                  <span>6 architectural domains</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <FileCode className="w-3.5 h-3.5" />
                  <span>40+ referenced files</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Target className="w-3.5 h-3.5" />
                  <span>Production patterns & anti-patterns</span>
                </div>
              </div>
            </div>
          </div>

          {/* Expand/Collapse controls */}
          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={expandAll}
              className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-3 py-1.5 rounded-md border border-gray-700 hover:border-gray-600"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-3 py-1.5 rounded-md border border-gray-700 hover:border-gray-600"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-4">
        {SECTIONS.map((section, index) => {
          const Icon = section.icon
          const isExpanded = !!expandedSections[section.id]

          return (
            <div
              key={section.id}
              className={`bg-[#12121a] border rounded-xl overflow-hidden transition-colors ${
                isExpanded ? section.accentClasses.border : 'border-gray-800'
              }`}
            >
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#15151f] transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2.5 rounded-lg ${section.accentClasses.bg}`}>
                    <Icon className={`w-5 h-5 ${section.accentClasses.text}`} />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-gray-600">{String(index + 1).padStart(2, '0')}</span>
                      <h2 className="text-lg font-semibold text-gray-100">{section.title}</h2>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{section.subtitle}</p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronDown className={`w-5 h-5 ${section.accentClasses.text}`} />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                )}
              </button>

              {/* Section Content */}
              {isExpanded && (
                <div className="px-6 pb-6 border-t border-gray-800/50">
                  {/* Overview */}
                  <div className="mt-5">
                    <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Overview</h4>
                    <div className="space-y-3">
                      {section.overview.map((paragraph, i) => (
                        <p key={i} className="text-sm text-gray-400 leading-relaxed">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </div>

                  {/* Architecture Diagram */}
                  <ArchitectureDiagram
                    stages={section.architectureStages}
                    accentClasses={section.accentClasses}
                  />

                  {/* Project Files */}
                  <ProjectFilesList files={section.projectFiles} />

                  {/* Industry Alternatives */}
                  <IndustryAlternatives
                    alternatives={section.industryAlternatives}
                    accentClasses={section.accentClasses}
                  />

                  {/* Deep Dive */}
                  <DeepDiveSection
                    deepDive={section.deepDive}
                    accentClasses={section.accentClasses}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-800 bg-[#0e0e16]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>All patterns demonstrated with production implementations in this codebase</span>
            </div>
            <div className="text-xs text-gray-700">
              Fraud Shield -- Agentic AI Decisioning Platform
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
