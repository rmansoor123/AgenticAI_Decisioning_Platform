import { useState, useMemo } from 'react'
import {
  Database, Server, Cpu, Brain, Eye, GitBranch, Radio, BarChart3,
  Search, Shield, Layers, Box, Workflow, MessageSquare, Gauge, Lock,
  Cloud, HardDrive, Zap, Network, ArrowUpDown, BookOpen, CheckCircle2,
  XCircle, Clock, ChevronDown, ChevronRight, ExternalLink, Sparkles,
  Container, Cog, FileCode, MonitorDot, Bug, Scale, Filter
} from 'lucide-react'

// ─── Technology Catalog ──────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: 'databases',
    name: 'Databases',
    icon: Database,
    accent: 'from-blue-500 to-cyan-400',
    accentBg: 'bg-blue-500/10',
    accentText: 'text-blue-400',
    accentBorder: 'border-blue-500/20',
    description: 'Persistent storage for transactional, analytical, and document workloads',
    technologies: [
      { name: 'PostgreSQL', type: 'Relational (SQL)', status: 'implemented', projectUse: 'Primary database — stores all 30+ tables (sellers, transactions, rules, agent decisions, risk events). Uses pgvector extension for vector similarity search.', icon: '🐘' },
      { name: 'SQLite', type: 'Embedded Relational', status: 'implemented', projectUse: 'Fallback database when Docker/Postgres unavailable. Zero-config local development. Same db_ops interface via factory pattern.', icon: '🪶' },
      { name: 'MySQL', type: 'Relational (SQL)', status: 'not-implemented', projectUse: 'Could replace PostgreSQL for teams with MySQL expertise. Common in e-commerce platforms for transaction processing.', icon: '🐬' },
      { name: 'MongoDB', type: 'Document (NoSQL)', status: 'not-implemented', projectUse: 'Could store agent reasoning traces, unstructured investigation notes, and flexible schema documents where JSONB is insufficient.', icon: '🍃' },
      { name: 'DynamoDB', type: 'Key-Value (NoSQL)', status: 'not-implemented', projectUse: 'AWS-native option for high-throughput session data, device fingerprint lookups, and real-time feature serving at massive scale.', icon: '⚡' },
      { name: 'Cassandra', type: 'Wide-Column (NoSQL)', status: 'not-implemented', projectUse: 'High-write-throughput storage for event streams, audit logs, and time-series risk signals across distributed clusters.', icon: '👁' },
      { name: 'CockroachDB', type: 'Distributed SQL', status: 'not-implemented', projectUse: 'Globally-distributed SQL for multi-region fraud detection with strong consistency guarantees and automatic sharding.', icon: '🪳' },
      { name: 'TiDB', type: 'Distributed SQL', status: 'not-implemented', projectUse: 'MySQL-compatible distributed database for hybrid OLTP/OLAP workloads — real-time fraud queries on historical data.', icon: '🔷' },
    ]
  },
  {
    id: 'realtime-streaming',
    name: 'Real-Time Data Streaming',
    icon: Radio,
    accent: 'from-orange-500 to-amber-400',
    accentBg: 'bg-orange-500/10',
    accentText: 'text-orange-400',
    accentBorder: 'border-orange-500/20',
    description: 'Event streaming, message queues, and real-time data pipelines',
    technologies: [
      { name: 'In-Memory Event Bus', type: 'Pub/Sub', status: 'implemented', projectUse: 'Custom event bus with wildcard subscriptions — routes agent:*, risk:*, transaction:* events between 23 agents and services in real-time.', icon: '📡' },
      { name: 'WebSocket Server', type: 'Real-Time Push', status: 'implemented', projectUse: 'Pushes live agent reasoning steps, decisions, and risk events to the frontend dashboard for real-time visualization.', icon: '🔌' },
      { name: 'Apache Kafka', type: 'Distributed Streaming', status: 'not-implemented', projectUse: 'Production event backbone — transaction streams, agent decision events, risk signal propagation. Enables replay, exactly-once semantics, and multi-consumer patterns.', icon: '📊' },
      { name: 'Apache Pulsar', type: 'Distributed Messaging', status: 'not-implemented', projectUse: 'Alternative to Kafka with built-in multi-tenancy, geo-replication, and tiered storage — useful for multi-region fraud detection.', icon: '💫' },
      { name: 'RabbitMQ', type: 'Message Broker', status: 'not-implemented', projectUse: 'Task queue for async agent evaluations, retry logic for failed tool calls, and dead-letter routing for investigation.', icon: '🐰' },
      { name: 'Amazon Kinesis', type: 'Cloud Streaming', status: 'not-implemented', projectUse: 'AWS-native alternative to Kafka for ingesting transaction streams and feeding real-time ML inference pipelines.', icon: '🌊' },
      { name: 'Redis Streams', type: 'Lightweight Streaming', status: 'partial', projectUse: 'Redis is deployed for caching. Streams capability could power lightweight event sourcing for agent decision audit trails.', icon: '🔴' },
      { name: 'Apache Flink', type: 'Stream Processing', status: 'not-implemented', projectUse: 'Complex event processing — detect velocity anomalies, session windowing, and multi-hop fraud patterns in real-time streams.', icon: '🔄' },
      { name: 'Apache Spark Streaming', type: 'Micro-Batch Processing', status: 'not-implemented', projectUse: 'Near-real-time aggregations — hourly risk score recalculations, batch feature engineering, model training pipelines.', icon: '✨' },
    ]
  },
  {
    id: 'realtime-analytics',
    name: 'Real-Time Analytics (OLAP)',
    icon: BarChart3,
    accent: 'from-green-500 to-emerald-400',
    accentBg: 'bg-green-500/10',
    accentText: 'text-green-400',
    accentBorder: 'border-green-500/20',
    description: 'Online analytical processing for sub-second queries on streaming data',
    technologies: [
      { name: 'Apache Pinot', type: 'Real-Time OLAP', status: 'implemented', projectUse: 'Docker service on port 9000. Designed for risk event trend analysis, agent performance dashboards, and real-time aggregations over streaming data.', icon: '🍷' },
      { name: 'Apache Druid', type: 'Real-Time OLAP', status: 'not-implemented', projectUse: 'Alternative to Pinot for time-series analytics — sub-second OLAP queries on risk events, transaction volumes, and agent latency histograms.', icon: '🐉' },
      { name: 'ClickHouse', type: 'Column-Store OLAP', status: 'not-implemented', projectUse: 'Extremely fast columnar analytics for fraud pattern mining, historical risk score analysis, and ad-hoc investigation queries.', icon: '🏠' },
      { name: 'Apache StarRocks', type: 'Real-Time OLAP', status: 'not-implemented', projectUse: 'MySQL-compatible OLAP for unified real-time and batch analytics — single engine for both streaming and historical fraud analysis.', icon: '⭐' },
      { name: 'DuckDB', type: 'Embedded OLAP', status: 'not-implemented', projectUse: 'In-process analytical engine for local data exploration, agent decision analysis, and ad-hoc SQL on Parquet/CSV exports.', icon: '🦆' },
      { name: 'Elasticsearch', type: 'Search & Analytics', status: 'not-implemented', projectUse: 'Full-text search across agent reasoning traces, investigation notes, and risk event metadata. Powers the investigation search UI.', icon: '🔍' },
    ]
  },
  {
    id: 'vector-databases',
    name: 'Vector Databases',
    icon: Box,
    accent: 'from-violet-500 to-purple-400',
    accentBg: 'bg-violet-500/10',
    accentText: 'text-violet-400',
    accentBorder: 'border-violet-500/20',
    description: 'Similarity search for embeddings, semantic retrieval, and RAG pipelines',
    technologies: [
      { name: 'Pinecone', type: 'Managed Vector DB', status: 'implemented', projectUse: 'Default vector backend for semantic search over fraud patterns, similar case retrieval, and RAG-grounded agent reasoning.', icon: '🌲' },
      { name: 'Qdrant', type: 'Open-Source Vector DB', status: 'implemented', projectUse: 'Docker service on port 6333. Alternative vector backend — open-source, self-hosted. Supports filtering with payload metadata.', icon: '🔷' },
      { name: 'ChromaDB', type: 'Open-Source Vector DB', status: 'implemented', projectUse: 'Docker service on port 8100. Lightweight vector DB for development and testing. Python-native with JS client.', icon: '🎨' },
      { name: 'Weaviate', type: 'Open-Source Vector DB', status: 'implemented', projectUse: 'Docker service on port 8081. GraphQL-native vector DB with built-in vectorization modules and hybrid search.', icon: '🕸' },
      { name: 'pgvector', type: 'Postgres Extension', status: 'implemented', projectUse: 'Vector similarity search inside PostgreSQL — no separate service needed. Used for embedding-based fraud pattern matching.', icon: '🐘' },
      { name: 'Milvus', type: 'Open-Source Vector DB', status: 'not-implemented', projectUse: 'High-performance vector DB for billion-scale similarity search — fraud ring detection across massive seller/buyer embeddings.', icon: '🌀' },
      { name: 'FAISS', type: 'Vector Library', status: 'not-implemented', projectUse: 'Facebook\'s in-memory vector search library. Ultra-fast nearest neighbor for real-time fraud pattern matching at inference time.', icon: '⚡' },
      { name: 'LanceDB', type: 'Serverless Vector DB', status: 'not-implemented', projectUse: 'Embedded vector DB with native multi-modal support — could store and search seller document images alongside text embeddings.', icon: '🗡' },
    ]
  },
  {
    id: 'graph-databases',
    name: 'Graph Databases',
    icon: Network,
    accent: 'from-cyan-500 to-teal-400',
    accentBg: 'bg-cyan-500/10',
    accentText: 'text-cyan-400',
    accentBorder: 'border-cyan-500/20',
    description: 'Relationship analysis, fraud ring detection, and network intelligence',
    technologies: [
      { name: 'Neo4j', type: 'Native Graph DB', status: 'implemented', projectUse: 'Docker service on port 7687. Powers fraud ring detection — seller-to-seller relationships via shared bank accounts, IP addresses, devices, and email domains.', icon: '🕸' },
      { name: 'In-Memory Graph', type: 'Custom Graph Engine', status: 'implemented', projectUse: 'Fallback graph engine when Neo4j unavailable. Supports node/edge operations, BFS traversal, and connected component detection.', icon: '🧠' },
      { name: 'Amazon Neptune', type: 'Managed Graph DB', status: 'not-implemented', projectUse: 'AWS-managed graph for production fraud ring analysis with automatic scaling and SPARQL/Gremlin query support.', icon: '🔱' },
      { name: 'TigerGraph', type: 'Distributed Graph', status: 'not-implemented', projectUse: 'Deep-link analytics for multi-hop fraud patterns — "friend of a friend" collusion detection across millions of entities.', icon: '🐯' },
      { name: 'ArangoDB', type: 'Multi-Model', status: 'not-implemented', projectUse: 'Combined document + graph DB for storing seller profiles alongside their relationship networks in a single query language.', icon: '🥑' },
    ]
  },
  {
    id: 'caching',
    name: 'Caching & In-Memory',
    icon: Zap,
    accent: 'from-red-500 to-rose-400',
    accentBg: 'bg-red-500/10',
    accentText: 'text-red-400',
    accentBorder: 'border-red-500/20',
    description: 'Low-latency data access, session management, and feature serving',
    technologies: [
      { name: 'Redis', type: 'In-Memory Store', status: 'implemented', projectUse: 'Docker service on port 6380. LLM response caching, pattern memory cache, session storage, and real-time feature serving for agent tools.', icon: '🔴' },
      { name: 'Memcached', type: 'Distributed Cache', status: 'not-implemented', projectUse: 'Simple key-value caching for high-throughput read scenarios — API response caching, feature flag distribution.', icon: '💾' },
      { name: 'Valkey', type: 'Redis Fork', status: 'not-implemented', projectUse: 'Open-source Redis alternative (Linux Foundation). Drop-in replacement with community governance for cache and feature store.', icon: '🔑' },
      { name: 'Hazelcast', type: 'In-Memory Grid', status: 'not-implemented', projectUse: 'Distributed compute + caching for real-time fraud rule evaluation across a cluster of decision nodes.', icon: '🌐' },
    ]
  },
  {
    id: 'llm-providers',
    name: 'LLM Providers & Inference',
    icon: Brain,
    accent: 'from-pink-500 to-fuchsia-400',
    accentBg: 'bg-pink-500/10',
    accentText: 'text-pink-400',
    accentBorder: 'border-pink-500/20',
    description: 'Large language models for reasoning, analysis, and decision-making',
    technologies: [
      { name: 'OpenAI (GPT-4o-mini)', type: 'Cloud LLM', status: 'implemented', projectUse: 'Primary LLM for all 23 agents\' TPAOR loop — THINK, PLAN, OBSERVE, REFLECT phases. Risk analysis, decision reasoning, and self-critique.', icon: '🤖' },
      { name: 'Anthropic (Claude)', type: 'Cloud LLM', status: 'implemented', projectUse: 'Alternative LLM provider. Configurable via LLM_PROVIDER=anthropic. Claude Haiku for fast agent reasoning.', icon: '🧠' },
      { name: 'Ollama (Qwen 2.5)', type: 'Local LLM', status: 'implemented', projectUse: 'Docker service on port 11434. Free local inference for development. Qwen 2.5 7B runs agent loops without API costs.', icon: '🦙' },
      { name: 'vLLM', type: 'Inference Server', status: 'not-implemented', projectUse: 'High-throughput LLM serving with PagedAttention — batch agent evaluations, continuous batching for parallel seller reviews.', icon: '🚀' },
      { name: 'TensorRT-LLM', type: 'GPU-Optimized Inference', status: 'not-implemented', projectUse: 'NVIDIA-optimized LLM inference for sub-100ms agent reasoning on GPU clusters. Critical for real-time transaction decisions.', icon: '🟢' },
      { name: 'Groq', type: 'LPU Inference', status: 'not-implemented', projectUse: 'Ultra-low-latency LLM inference (<100ms). Could enable real-time TPAOR loops within transaction processing SLAs.', icon: '⚡' },
      { name: 'Google Gemini', type: 'Cloud LLM', status: 'not-implemented', projectUse: 'Multi-modal LLM — could analyze seller product images, ID documents, and text simultaneously in onboarding verification.', icon: '💎' },
      { name: 'Mistral', type: 'Open-Source LLM', status: 'not-implemented', projectUse: 'Efficient open-source models (Mixtral MoE) for self-hosted agent reasoning with strong multilingual support.', icon: '🌬' },
    ]
  },
  {
    id: 'agentic-ai',
    name: 'Agentic AI Frameworks',
    icon: Workflow,
    accent: 'from-amber-500 to-yellow-400',
    accentBg: 'bg-amber-500/10',
    accentText: 'text-amber-400',
    accentBorder: 'border-amber-500/20',
    description: 'Agent orchestration, tool use, planning, and multi-agent systems',
    technologies: [
      { name: 'Custom TPAOR Framework', type: 'Agent Loop', status: 'implemented', projectUse: 'Built-in 14-phase agent loop: Pattern Match → Think → Plan → Act → Re-Plan → Observe → Reflect → Multi-Turn → Policy → Judge → KB Write → Learn → Emit → Eval.', icon: '🔄' },
      { name: 'Base Agent + 23 Specialized', type: 'Multi-Agent System', status: 'implemented', projectUse: '23 domain-specific agents (onboarding, payout, ATO, listing, etc.) with cross-agent judging, consensus engine, and messenger protocol.', icon: '🤖' },
      { name: 'Policy Engine', type: 'Rule Override System', status: 'implemented', projectUse: 'Hard/soft policy rules that always run after LLM reasoning — ensures compliance regardless of LLM output. 8 core policies.', icon: '⚖' },
      { name: 'LangChain', type: 'LLM Framework', status: 'not-implemented', projectUse: 'Popular LLM orchestration framework — could replace custom prompt templates, tool calling, and chain-of-thought management.', icon: '🔗' },
      { name: 'LangGraph', type: 'Agent Graph Framework', status: 'not-implemented', projectUse: 'State machine-based agent workflows with cycles — could formalize the TPAOR loop as a directed graph with conditional edges.', icon: '📊' },
      { name: 'CrewAI', type: 'Multi-Agent Framework', status: 'not-implemented', projectUse: 'Role-based multi-agent collaboration — could orchestrate analyst teams (fraud investigator, compliance officer, risk analyst).', icon: '👥' },
      { name: 'AutoGen', type: 'Multi-Agent Framework', status: 'not-implemented', projectUse: 'Microsoft\'s conversational multi-agent framework — agents debate risk decisions before reaching consensus.', icon: '💬' },
      { name: 'DSPy', type: 'LLM Programming', status: 'not-implemented', projectUse: 'Programmatic prompt optimization — automatically tune agent prompts based on evaluation scores and golden test cases.', icon: '📐' },
      { name: 'Semantic Kernel', type: 'AI Orchestration', status: 'not-implemented', projectUse: 'Microsoft\'s SDK for building AI agents with planners, plugins, and memory — enterprise-grade agent orchestration.', icon: '🧩' },
      { name: 'Claude Agent SDK', type: 'Agent Framework', status: 'not-implemented', projectUse: 'Anthropic\'s SDK for building agentic applications with Claude — tool use, multi-turn conversations, and structured outputs.', icon: '🤖' },
      { name: 'MCP (Model Context Protocol)', type: 'Tool Protocol', status: 'implemented', projectUse: 'Standardized protocol for connecting LLMs to external tools and data sources. Used for agent tool discovery and execution.', icon: '🔌' },
    ]
  },
  {
    id: 'agent-memory',
    name: 'Agent Memory & State',
    icon: HardDrive,
    accent: 'from-indigo-500 to-blue-400',
    accentBg: 'bg-indigo-500/10',
    accentText: 'text-indigo-400',
    accentBorder: 'border-indigo-500/20',
    description: 'Short-term, long-term, episodic, and shared memory for AI agents',
    technologies: [
      { name: 'Custom Memory Store', type: 'Multi-Tier Memory', status: 'implemented', projectUse: 'Short-term (session), long-term (persistent), shared (cross-agent), and episodic memory with TF-IDF search and importance scoring.', icon: '🧠' },
      { name: 'Mem0', type: 'AI Memory Platform', status: 'implemented', projectUse: 'Production memory backend — automatically extracts and organizes facts from agent interactions. Cross-session memory persistence.', icon: '💭' },
      { name: 'Zep', type: 'Temporal Memory', status: 'implemented', projectUse: 'Docker service on port 8200. Temporal/episodic memory for agents — tracks how seller risk profiles evolve over time with session context.', icon: '⏳' },
      { name: 'Letta (MemGPT)', type: 'Long-Term Memory', status: 'implemented', projectUse: 'Docker service on port 8283. Virtual context management — agents maintain unlimited conversation history and learned patterns.', icon: '📚' },
      { name: 'Knowledge Base (TF-IDF)', type: 'Information Retrieval', status: 'implemented', projectUse: 'Built-in TF-IDF search over agent knowledge entries with recency boost, namespace filtering, and document chunking.', icon: '📖' },
      { name: 'LangMem', type: 'Memory Framework', status: 'not-implemented', projectUse: 'LangChain\'s memory module — could provide structured memory management with automatic summarization and fact extraction.', icon: '🗂' },
    ]
  },
  {
    id: 'ml-platform',
    name: 'ML & Feature Engineering',
    icon: Cpu,
    accent: 'from-teal-500 to-green-400',
    accentBg: 'bg-teal-500/10',
    accentText: 'text-teal-400',
    accentBorder: 'border-teal-500/20',
    description: 'Machine learning models, feature stores, and training infrastructure',
    technologies: [
      { name: 'TensorFlow.js', type: 'ML Framework', status: 'implemented', projectUse: 'In-process fraud detection model — real-time ML scoring during transaction processing. Runs in Node.js without Python dependency.', icon: '🧮' },
      { name: 'Custom Feature Store', type: 'Feature Serving', status: 'implemented', projectUse: 'In-memory feature store with real-time feature extraction — amount bucketing, velocity indicators, time-of-day features, and risk signals.', icon: '📊' },
      { name: 'Model Registry', type: 'Model Management', status: 'implemented', projectUse: 'Tracks ML model versions, performance metrics, drift detection (PSI), and training run lineage in the ml_models table.', icon: '📦' },
      { name: 'Feast', type: 'Feature Store', status: 'not-implemented', projectUse: 'Production feature store — serve pre-computed seller risk features at low latency, ensure training/serving feature parity.', icon: '🍽' },
      { name: 'MLflow', type: 'ML Lifecycle', status: 'not-implemented', projectUse: 'Experiment tracking, model versioning, and deployment management for fraud detection model iterations.', icon: '📈' },
      { name: 'Weights & Biases', type: 'Experiment Tracking', status: 'not-implemented', projectUse: 'Visualize model training runs, compare fraud detection model architectures, and track evaluation metrics over time.', icon: '📉' },
      { name: 'PyTorch', type: 'ML Framework', status: 'not-implemented', projectUse: 'Deep learning for complex fraud patterns — graph neural networks for network analysis, transformers for sequence detection.', icon: '🔥' },
      { name: 'XGBoost / LightGBM', type: 'Gradient Boosting', status: 'not-implemented', projectUse: 'Industry-standard for tabular fraud detection — fast training, interpretable feature importance, high accuracy on structured data.', icon: '🌳' },
      { name: 'Ray', type: 'Distributed Compute', status: 'not-implemented', projectUse: 'Distributed ML training and hyperparameter tuning. Scale fraud model training across multiple GPUs/nodes.', icon: '☀' },
    ]
  },
  {
    id: 'observability',
    name: 'Observability & Evaluation',
    icon: Eye,
    accent: 'from-rose-500 to-pink-400',
    accentBg: 'bg-rose-500/10',
    accentText: 'text-rose-400',
    accentBorder: 'border-rose-500/20',
    description: 'LLM tracing, evaluation frameworks, monitoring, and debugging',
    technologies: [
      { name: 'Langfuse', type: 'LLM Observability', status: 'implemented', projectUse: 'Docker service on port 3100. Traces every TPAOR agent loop — input/output, latency, token usage, cost tracking. Production LLM monitoring.', icon: '🔭' },
      { name: 'Arize Phoenix', type: 'AI Observability', status: 'implemented', projectUse: 'Docker service on port 6006. OpenTelemetry-native tracing for evaluating LLM outputs, embedding drift detection, and retrieval quality.', icon: '🦅' },
      { name: 'TruLens', type: 'LLM Evaluation', status: 'implemented', projectUse: 'Evaluates agent groundedness, answer relevance, context relevance, and coherence. Runs against all 23 agents\' outputs.', icon: '🎯' },
      { name: 'RAGAS', type: 'RAG Evaluation', status: 'implemented', projectUse: 'Faithfulness, answer relevancy, context precision/recall metrics for evaluating agent evidence quality and reasoning.', icon: '📏' },
      { name: 'DeepEval', type: 'Custom Evaluation', status: 'implemented', projectUse: 'Custom fraud-specific evaluation metrics — false positive rate, decision consistency, risk calibration accuracy.', icon: '🔬' },
      { name: 'BrainTrust', type: 'Regression Testing', status: 'implemented', projectUse: 'Golden dataset regression detection — ensures agent decisions don\'t degrade across code changes and prompt updates.', icon: '🧪' },
      { name: 'Custom Trace Collector', type: 'Span Tracing', status: 'implemented', projectUse: 'Per-agent timing traces across all TPAOR phases with SQLite/Langfuse dual backend. Latency analysis per decision stage.', icon: '⏱' },
      { name: 'Datadog', type: 'Full-Stack Monitoring', status: 'not-implemented', projectUse: 'Production APM — end-to-end request tracing from API gateway through agent evaluation to database writes.', icon: '🐕' },
      { name: 'Grafana + Prometheus', type: 'Metrics & Dashboards', status: 'not-implemented', projectUse: 'Custom dashboards for agent performance, risk score distributions, decision latency percentiles, and system health.', icon: '📊' },
      { name: 'OpenTelemetry', type: 'Instrumentation', status: 'not-implemented', projectUse: 'Vendor-neutral tracing standard — instrument agent calls, DB queries, and API requests with consistent span format.', icon: '📡' },
    ]
  },
  {
    id: 'orchestration',
    name: 'Infrastructure & Orchestration',
    icon: Container,
    accent: 'from-sky-500 to-blue-400',
    accentBg: 'bg-sky-500/10',
    accentText: 'text-sky-400',
    accentBorder: 'border-sky-500/20',
    description: 'Container orchestration, CI/CD, and deployment infrastructure',
    technologies: [
      { name: 'Docker Compose', type: 'Container Orchestration', status: 'implemented', projectUse: '12 services orchestrated — Postgres, Redis, Qdrant, Neo4j, Langfuse, Zep, Letta, ChromaDB, Weaviate, Ollama, Phoenix, Pinot.', icon: '🐳' },
      { name: 'Kubernetes', type: 'Container Orchestration', status: 'implemented', projectUse: 'Kustomize manifests in k8s/base/ with dev and prod overlays. Production-grade deployment with resource limits and health checks.', icon: '☸' },
      { name: 'GitHub Actions', type: 'CI/CD', status: 'implemented', projectUse: 'Automated test runs with coverage reporting on every push. CI pipeline validates all agent tests and integration suites.', icon: '⚙' },
      { name: 'Terraform', type: 'Infrastructure as Code', status: 'not-implemented', projectUse: 'Provision cloud infrastructure — managed Postgres, Redis clusters, vector DB instances, and Kubernetes clusters.', icon: '🏗' },
      { name: 'ArgoCD', type: 'GitOps', status: 'not-implemented', projectUse: 'Declarative GitOps deployment — automatically sync Kubernetes manifests from git, with rollback on failure.', icon: '🔄' },
      { name: 'Istio', type: 'Service Mesh', status: 'not-implemented', projectUse: 'mTLS between services, traffic management, circuit breaking, and observability for microservice-based fraud detection.', icon: '🕸' },
    ]
  },
  {
    id: 'security',
    name: 'Security & Compliance',
    icon: Lock,
    accent: 'from-slate-400 to-gray-300',
    accentBg: 'bg-slate-500/10',
    accentText: 'text-slate-400',
    accentBorder: 'border-slate-500/20',
    description: 'Data protection, access control, and regulatory compliance',
    technologies: [
      { name: 'OFAC/SDN Screening', type: 'Sanctions Compliance', status: 'implemented', projectUse: 'Real OFAC SDN list loaded (18,718 entries). Every seller screened against US Treasury sanctions database during onboarding.', icon: '🛡' },
      { name: 'Policy Engine', type: 'Compliance Rules', status: 'implemented', projectUse: '8 hard/soft policies enforce compliance regardless of LLM decisions — sanctions blocks, high-risk country reviews, velocity limits.', icon: '⚖' },
      { name: 'Prompt Injection Detection', type: 'AI Security', status: 'implemented', projectUse: 'Base agent detects and blocks prompt injection attempts in seller-provided data before passing to LLM for analysis.', icon: '🚫' },
      { name: 'Vault (HashiCorp)', type: 'Secrets Management', status: 'not-implemented', projectUse: 'Centralized secrets management for API keys, database credentials, and LLM provider tokens with dynamic rotation.', icon: '🔐' },
      { name: 'OPA (Open Policy Agent)', type: 'Policy as Code', status: 'not-implemented', projectUse: 'Externalized policy decisions — decouple fraud rules from application code, enable policy versioning and testing.', icon: '📜' },
      { name: 'Guardrails AI', type: 'LLM Safety', status: 'not-implemented', projectUse: 'Validate and structure LLM outputs — ensure agent decisions conform to expected schemas and safety constraints.', icon: '🛤' },
    ]
  },
  {
    id: 'frontend',
    name: 'Frontend & Visualization',
    icon: MonitorDot,
    accent: 'from-fuchsia-500 to-pink-400',
    accentBg: 'bg-fuchsia-500/10',
    accentText: 'text-fuchsia-400',
    accentBorder: 'border-fuchsia-500/20',
    description: 'UI frameworks, data visualization, and real-time dashboards',
    technologies: [
      { name: 'React 19', type: 'UI Framework', status: 'implemented', projectUse: 'Frontend framework — 34 routes across seller lifecycle, risk operations, platform dashboards, and agent monitoring.', icon: '⚛' },
      { name: 'Vite', type: 'Build Tool', status: 'implemented', projectUse: 'Lightning-fast HMR development server and production bundler. Proxy configuration routes API calls to backend.', icon: '⚡' },
      { name: 'Tailwind CSS', type: 'CSS Framework', status: 'implemented', projectUse: 'Utility-first styling for the entire dark-theme dashboard. Consistent design tokens across all 34 pages.', icon: '🎨' },
      { name: 'Recharts', type: 'Chart Library', status: 'implemented', projectUse: 'Interactive data visualizations — risk score trends, transaction volume charts, agent performance histograms.', icon: '📈' },
      { name: 'react-force-graph-2d', type: 'Graph Visualization', status: 'implemented', projectUse: 'Interactive network graph for visualizing seller relationships, fraud rings, and entity connections.', icon: '🕸' },
      { name: 'Lucide React', type: 'Icon Library', status: 'implemented', projectUse: '100+ icons across navigation, status indicators, and action buttons throughout the dashboard.', icon: '✨' },
      { name: 'D3.js', type: 'Data Visualization', status: 'not-implemented', projectUse: 'Advanced custom visualizations — Sankey diagrams for money flow, chord diagrams for seller relationships.', icon: '📊' },
    ]
  },
]

// ─── Status Badges ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const config = {
    'implemented': { label: 'Implemented', icon: CheckCircle2, bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    'partial': { label: 'Partial', icon: Clock, bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
    'not-implemented': { label: 'Not Implemented', icon: XCircle, bg: 'bg-gray-500/15', text: 'text-gray-500', border: 'border-gray-500/30' },
  }
  const c = config[status] || config['not-implemented']
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text} border ${c.border}`}>
      <c.icon className="w-3 h-3" />
      {c.label}
    </span>
  )
}

// ─── Technology Card ─────────────────────────────────────────────────────────

function TechCard({ tech, accentText }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      className={`group relative rounded-xl border transition-all duration-200 cursor-pointer ${
        tech.status === 'implemented'
          ? 'bg-gray-900/60 border-gray-700/60 hover:border-gray-600'
          : 'bg-gray-900/30 border-gray-800/50 hover:border-gray-700/60'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl flex-shrink-0">{tech.icon}</span>
            <div className="min-w-0">
              <h4 className={`font-semibold text-sm ${tech.status === 'implemented' ? 'text-white' : 'text-gray-400'}`}>
                {tech.name}
              </h4>
              <p className="text-xs text-gray-600 mt-0.5">{tech.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={tech.status} />
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
          </div>
        </div>
        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-800/60">
            <p className="text-xs text-gray-400 leading-relaxed">{tech.projectUse}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Category Section ────────────────────────────────────────────────────────

function CategorySection({ category }) {
  const [collapsed, setCollapsed] = useState(false)
  const implemented = category.technologies.filter(t => t.status === 'implemented' || t.status === 'partial').length
  const total = category.technologies.length

  return (
    <div className="mb-8">
      {/* Category Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-4 mb-4 group"
      >
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${category.accent} shadow-lg`}>
          <category.icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">{category.name}</h2>
            <span className="text-xs text-gray-600">
              {implemented}/{total} implemented
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{category.description}</p>
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${category.accent}`}
              style={{ width: `${(implemented / total) * 100}%` }}
            />
          </div>
          <span className={`text-xs font-mono ${category.accentText}`}>
            {Math.round((implemented / total) * 100)}%
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </div>
      </button>

      {/* Technology Grid */}
      {!collapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 ml-14">
          {category.technologies.map(tech => (
            <TechCard key={tech.name} tech={tech} accentText={category.accentText} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Education() {
  const [filter, setFilter] = useState('all') // all | implemented | not-implemented
  const [searchQuery, setSearchQuery] = useState('')

  const filteredCategories = useMemo(() => {
    return CATEGORIES.map(cat => ({
      ...cat,
      technologies: cat.technologies.filter(t => {
        const matchesFilter = filter === 'all' || t.status === filter || (filter === 'implemented' && t.status === 'partial')
        const matchesSearch = !searchQuery ||
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.projectUse.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesFilter && matchesSearch
      })
    })).filter(cat => cat.technologies.length > 0)
  }, [filter, searchQuery])

  const totalTech = CATEGORIES.reduce((sum, c) => sum + c.technologies.length, 0)
  const implementedTech = CATEGORIES.reduce((sum, c) => sum + c.technologies.filter(t => t.status === 'implemented' || t.status === 'partial').length, 0)
  const notImplementedTech = totalTech - implementedTech

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/20">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Technology Reference</h1>
            <p className="text-sm text-gray-500">Industry tools for fraud detection, real-time decisioning, and agentic AI systems</p>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{totalTech}</div>
          <div className="text-xs text-gray-500 mt-1">Total Technologies</div>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-emerald-400">{implementedTech}</div>
          <div className="text-xs text-gray-500 mt-1">Implemented</div>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-500">{notImplementedTech}</div>
          <div className="text-xs text-gray-500 mt-1">Available to Add</div>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-amber-400">{CATEGORIES.length}</div>
          <div className="text-xs text-gray-500 mt-1">Categories</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input
            type="text"
            placeholder="Search technologies, use cases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-900/50 border border-gray-800 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-600"
          />
        </div>
        <div className="flex items-center bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
          {[
            { id: 'all', label: 'All' },
            { id: 'implemented', label: 'Implemented' },
            { id: 'not-implemented', label: 'Not Yet' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2.5 text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'bg-gray-700/50 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Categories */}
      {filteredCategories.map(category => (
        <CategorySection key={category.id} category={category} />
      ))}
    </div>
  )
}
