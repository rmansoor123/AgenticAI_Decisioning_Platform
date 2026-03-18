import { useState } from 'react'
import {
  ChevronDown, ChevronRight, CheckCircle2, Clock, Rocket, Sparkles,
  Target, Layers, Cpu, Database, Radio, Shield, Eye, BarChart3,
  Cloud, Network, Lock, Workflow, Box, Server, Brain, Gauge,
  GitBranch, Zap, Container, MonitorDot, FileCode, Scale, Filter,
  ArrowUpDown, ExternalLink, MapPin
} from 'lucide-react'

// ─── Data ────────────────────────────────────────────────────────────────────

const EFFORT_CONFIG = {
  S: { label: 'S', description: 'Days', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  M: { label: 'M', description: 'Weeks', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  L: { label: 'L', description: 'Month', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  XL: { label: 'XL', description: 'Quarter', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
}

const LEVELS = [
  {
    id: 1,
    title: 'Foundation',
    subtitle: 'Current State',
    accent: 'green',
    borderColor: 'border-green-500',
    accentBg: 'bg-green-500/10',
    accentText: 'text-green-400',
    badgeBg: 'bg-green-500/20 text-green-400 border-green-500/30',
    dotColor: 'bg-green-500',
    progressColor: 'bg-green-500',
    summary: 'Production-grade agentic fraud decisioning with real infrastructure. All core patterns established.',
    technologies: [
      { name: 'PostgreSQL (pgvector)', category: 'Database', status: 'Implemented' },
      { name: 'Apache Kafka + Zookeeper', category: 'Streaming', status: 'Implemented' },
      { name: 'Redis 7', category: 'Cache', status: 'Implemented' },
      { name: 'TensorFlow.js', category: 'ML', status: 'Implemented', detail: '2 neural networks' },
      { name: 'OpenAI gpt-4o-mini / Ollama', category: 'LLM', status: 'Implemented' },
      { name: 'Neo4j 5', category: 'Graph', status: 'Implemented' },
      { name: 'Langfuse', category: 'Observability', status: 'Implemented' },
      { name: 'Qdrant / Pinecone / ChromaDB / Weaviate', category: 'Vector DB', status: 'Implemented' },
      { name: 'Mem0 / Letta / Zep', category: 'Memory', status: 'Implemented' },
      { name: 'Apache Pinot', category: 'Analytics', status: 'Implemented' },
      { name: 'OFAC SDN (US Treasury)', category: 'Screening', status: 'Implemented' },
      { name: 'Docker Compose (14 services)', category: 'Infra', status: 'Implemented' },
      { name: 'Kubernetes manifests', category: 'Infra', status: 'Implemented' },
      { name: 'GitHub Actions', category: 'CI/CD', status: 'Implemented' },
    ],
    products: [
      { name: 'Seller onboarding decisioning', detail: '23 agents, TPAOR loop', status: 'Live' },
      { name: '9-stage seller lifecycle', status: 'Live' },
      { name: 'Real-time ML inference', detail: '25-feature onboarding model', status: 'Live' },
      { name: '6-stage streaming pipeline', status: 'Live' },
      { name: 'Case queue with agent triage', status: 'Live' },
      { name: '122 decision rules', status: 'Live' },
      { name: 'Cross-domain risk profiling', status: 'Live' },
      { name: 'Education & technology reference', status: 'Live' },
    ],
  },
  {
    id: 2,
    title: 'Advanced',
    subtitle: 'Next Quarter',
    accent: 'amber',
    borderColor: 'border-amber-500',
    accentBg: 'bg-amber-500/10',
    accentText: 'text-amber-400',
    badgeBg: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    dotColor: 'bg-amber-500',
    progressColor: 'bg-amber-500',
    summary: 'Complex event processing, proper ML lifecycle, external integrations.',
    technologies: [
      { name: 'Apache Flink', category: 'Stream Processing', enables: 'Windowed aggregations, sessionization, CEP', effort: 'L' },
      { name: 'MLflow', category: 'ML Lifecycle', enables: 'Experiment tracking, model registry, deployment', effort: 'M' },
      { name: 'Feast', category: 'Feature Store', enables: 'Production feature store with offline/online sync', effort: 'M' },
      { name: 'Apache Airflow', category: 'Orchestration', enables: 'Scheduled training pipelines, data quality checks', effort: 'M' },
      { name: 'Grafana + Prometheus', category: 'Monitoring', enables: 'Real-time dashboards, alerting', effort: 'M' },
      { name: 'Stripe/Plaid webhooks', category: 'Integrations', enables: 'Real payment data, bank verification', effort: 'S' },
      { name: 'Twilio Verify', category: 'Identity', enables: 'Real phone/SMS verification', effort: 'S' },
      { name: 'Great Expectations', category: 'Data Quality', enables: 'Automated data validation', effort: 'S' },
      { name: 'dbt', category: 'Data Transform', enables: 'SQL-based transformation pipelines', effort: 'M' },
    ],
    products: [
      { name: 'Real-time transaction scoring with velocity windows', status: 'Planned' },
      { name: 'Merchant risk scoring', status: 'Planned' },
      { name: 'Automated dispute resolution', status: 'Planned' },
      { name: 'Model performance dashboards', status: 'Planned' },
      { name: 'Data quality monitoring pipeline', status: 'Planned' },
    ],
  },
  {
    id: 3,
    title: 'Enterprise',
    subtitle: '6 Months',
    accent: 'blue',
    borderColor: 'border-blue-500',
    accentBg: 'bg-blue-500/10',
    accentText: 'text-blue-400',
    badgeBg: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    dotColor: 'bg-blue-500',
    progressColor: 'bg-blue-500',
    summary: 'Kubernetes-native, multi-region, advanced ML, self-optimizing systems.',
    technologies: [
      { name: 'Kubernetes (EKS/GKE)', category: 'Infrastructure', enables: 'Auto-scaling, rolling deployments', effort: 'XL' },
      { name: 'Helm Charts', category: 'Deployment', enables: 'Reproducible multi-env deployments', effort: 'M' },
      { name: 'Kafka MirrorMaker 2', category: 'Replication', enables: 'Multi-region streaming, DR', effort: 'L' },
      { name: 'Apache Superset', category: 'BI/Analytics', enables: 'Self-service fraud analytics', effort: 'M' },
      { name: 'Ray Serve', category: 'ML Serving', enables: 'Distributed model serving, auto-batching', effort: 'L' },
      { name: 'PyTorch', category: 'ML Framework', enables: 'GNNs, attention-based fraud detection', effort: 'L' },
      { name: 'Label Studio', category: 'Annotation', enables: 'Human-in-the-loop model training', effort: 'M' },
      { name: 'Temporal.io', category: 'Workflows', enables: 'Durable agent execution', effort: 'M' },
      { name: 'OpenTelemetry', category: 'Observability', enables: 'Distributed tracing', effort: 'M' },
      { name: 'Vault (HashiCorp)', category: 'Security', enables: 'Secrets management', effort: 'M' },
    ],
    products: [
      { name: 'Cross-merchant fraud intelligence network', status: 'Future' },
      { name: 'Regulatory reporting automation (SAR/CTR)', status: 'Future' },
      { name: 'Self-optimizing rules engine', status: 'Future' },
      { name: 'Fraud analyst workbench', status: 'Future' },
      { name: 'Merchant onboarding risk API (external product)', status: 'Future' },
    ],
  },
  {
    id: 4,
    title: 'State-of-the-Art',
    subtitle: 'Vision',
    accent: 'purple',
    borderColor: 'border-purple-500',
    accentBg: 'bg-purple-500/10',
    accentText: 'text-purple-400',
    badgeBg: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    dotColor: 'bg-purple-500',
    progressColor: 'bg-purple-500',
    summary: 'The frontier. Autonomous prevention, advanced AI, next-gen infrastructure.',
    technologies: [
      { name: 'LLM Agents (Claude/GPT-4)', category: 'Autonomous AI', enables: 'Multi-turn investigation, NL case summaries', effort: 'L' },
      { name: 'Reinforcement Learning', category: 'ML', enables: 'Dynamic threshold optimization', effort: 'XL' },
      { name: 'Causal Inference (DoWhy)', category: 'ML', enables: 'Counterfactual fraud analysis', effort: 'L' },
      { name: 'GANs / Diffusion Models', category: 'Synthetic Data', enables: 'Realistic fraud patterns for training', effort: 'L' },
      { name: 'Graph Neural Networks', category: 'ML', enables: 'Fraud ring detection via message passing', effort: 'XL' },
      { name: 'Digital Twin Simulation', category: 'Testing', enables: 'Simulate entire payment ecosystem', effort: 'XL' },
      { name: 'Federated Learning', category: 'ML', enables: 'Cross-merchant training without data sharing', effort: 'XL' },
      { name: 'Blockchain (Hyperledger)', category: 'Audit', enables: 'Cryptographically verifiable audit trails', effort: 'L' },
      { name: 'Neuromorphic Computing', category: 'Hardware', enables: 'Sub-millisecond pattern detection', effort: 'XL' },
      { name: 'Confidential Computing', category: 'Security', enables: 'Encrypted memory processing (SGX/SEV)', effort: 'L' },
    ],
    products: [
      { name: 'Predictive fraud prevention', detail: 'Stop fraud before it happens', status: 'Vision' },
      { name: 'Autonomous compliance officer', status: 'Vision' },
      { name: 'Merchant trust marketplace', status: 'Vision' },
      { name: 'Industry-wide fraud intelligence sharing', status: 'Vision' },
      { name: 'Real-time fraud simulation engine', status: 'Vision' },
      { name: 'Natural language investigation', status: 'Vision' },
    ],
  },
]

// ─── Status Badge Component ─────────────────────────────────────────────────

function StatusBadge({ status }) {
  const config = {
    Implemented: 'bg-green-500/20 text-green-400 border border-green-500/30',
    Live: 'bg-green-500/20 text-green-400 border border-green-500/30',
    Planned: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    Future: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    Vision: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  }

  const icons = {
    Implemented: CheckCircle2,
    Live: CheckCircle2,
    Planned: Clock,
    Future: Rocket,
    Vision: Sparkles,
  }

  const Icon = icons[status] || Clock
  const classes = config[status] || config.Planned

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  )
}

// ─── Effort Badge ───────────────────────────────────────────────────────────

function EffortBadge({ effort }) {
  if (!effort) return null
  const cfg = EFFORT_CONFIG[effort]
  if (!cfg) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold border ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

// ─── Collapsible Section ────────────────────────────────────────────────────

function CollapsibleSection({ title, icon: Icon, count, defaultOpen = true, children, accentText }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left group mb-3"
      >
        {open ? (
          <ChevronDown className={`w-4 h-4 ${accentText}`} />
        ) : (
          <ChevronRight className={`w-4 h-4 ${accentText}`} />
        )}
        <Icon className={`w-4 h-4 ${accentText}`} />
        <span className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">
          {title}
        </span>
        {count !== undefined && (
          <span className="text-xs text-gray-500 ml-1">({count})</span>
        )}
      </button>
      {open && children}
    </div>
  )
}

// ─── Level Card ─────────────────────────────────────────────────────────────

function LevelCard({ level, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const isFoundation = level.id === 1

  return (
    <div className={`bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden border-l-4 ${level.borderColor}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-6 flex items-start justify-between gap-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-start gap-4 flex-1">
          <div className={`w-10 h-10 rounded-lg ${level.accentBg} flex items-center justify-center shrink-0 mt-0.5`}>
            <span className={`text-lg font-bold ${level.accentText}`}>{level.id}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-lg font-bold text-white">
                Level {level.id} — {level.title}
              </h3>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${level.badgeBg}`}>
                {level.subtitle}
              </span>
              {isFoundation && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                  <MapPin className="w-3 h-3" />
                  You Are Here
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400 mt-1">{level.summary}</p>
          </div>
        </div>
        <div className="shrink-0 mt-1">
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-500" />
          )}
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-6 pb-6 space-y-6">
          <div className="border-t border-gray-800" />

          {/* Technologies */}
          <CollapsibleSection
            title={isFoundation ? 'Technologies' : 'Technologies to Add'}
            icon={Cpu}
            count={level.technologies.length}
            defaultOpen={true}
            accentText={level.accentText}
          >
            {isFoundation ? (
              /* Foundation: simple grid with green badges */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {level.technologies.map((tech) => (
                  <div
                    key={tech.name}
                    className="bg-[#0a0a12] rounded-lg border border-gray-800 p-3 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200 truncate">{tech.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{tech.category}</p>
                      {tech.detail && (
                        <p className="text-xs text-gray-500">{tech.detail}</p>
                      )}
                    </div>
                    <StatusBadge status={tech.status} />
                  </div>
                ))}
              </div>
            ) : (
              /* Levels 2-4: detailed cards with effort + enables */
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {level.technologies.map((tech) => (
                  <div
                    key={tech.name}
                    className="bg-[#0a0a12] rounded-lg border border-gray-800 p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-200">{tech.name}</p>
                        <span className={`inline-block text-xs mt-1 px-2 py-0.5 rounded ${level.accentBg} ${level.accentText}`}>
                          {tech.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <EffortBadge effort={tech.effort} />
                        <StatusBadge status={level.id === 2 ? 'Planned' : level.id === 3 ? 'Future' : 'Vision'} />
                      </div>
                    </div>
                    {tech.enables && (
                      <p className="text-xs text-gray-400 leading-relaxed">{tech.enables}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Products */}
          <CollapsibleSection
            title={isFoundation ? 'Products' : 'Products Enabled'}
            icon={Target}
            count={level.products.length}
            defaultOpen={true}
            accentText={level.accentText}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {level.products.map((product) => (
                <div
                  key={product.name}
                  className="bg-[#0a0a12] rounded-lg border border-gray-800 p-3 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-200">{product.name}</p>
                    {product.detail && (
                      <p className="text-xs text-gray-500 mt-0.5">{product.detail}</p>
                    )}
                  </div>
                  <StatusBadge status={product.status} />
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  )
}

// ─── Progress Bar ───────────────────────────────────────────────────────────

function ProgressBar() {
  return (
    <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-300">Maturity Progress</h2>
          <p className="text-xs text-gray-500 mt-0.5">Level 1 — Foundation</p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
          <MapPin className="w-3 h-3" />
          Current: Level 1
        </span>
      </div>
      <div className="relative">
        {/* Track */}
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full w-1/4 bg-gradient-to-r from-green-500 to-green-400 rounded-full" />
        </div>
        {/* Level markers */}
        <div className="flex justify-between mt-3">
          {LEVELS.map((level) => (
            <div key={level.id} className="flex flex-col items-center" style={{ width: '25%' }}>
              <div className={`w-3 h-3 rounded-full ${level.id === 1 ? level.dotColor : 'bg-gray-700'} ${level.id === 1 ? 'ring-2 ring-green-500/30' : ''}`} />
              <span className={`text-xs mt-1 ${level.id === 1 ? level.accentText + ' font-semibold' : 'text-gray-600'}`}>
                L{level.id}
              </span>
              <span className={`text-xs ${level.id === 1 ? 'text-gray-400' : 'text-gray-600'}`}>
                {level.title}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Effort Legend ──────────────────────────────────────────────────────────

function EffortLegend() {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <span className="text-xs text-gray-500 font-medium">Effort:</span>
      {Object.entries(EFFORT_CONFIG).map(([key, cfg]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold border ${cfg.color}`}>
            {cfg.label}
          </span>
          <span className="text-xs text-gray-500">{cfg.description}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function PlatformRoadmap() {
  return (
    <div className="min-h-screen bg-[#0a0a12] text-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Page Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Platform Roadmap</h1>
            <p className="text-sm text-gray-400 mt-1">
              4-level maturity model from foundation to state-of-the-art fraud prevention
            </p>
          </div>
          <EffortLegend />
        </div>

        {/* Progress Bar */}
        <ProgressBar />

        {/* Level Cards */}
        <div className="space-y-4">
          {LEVELS.map((level) => (
            <LevelCard
              key={level.id}
              level={level}
              defaultExpanded={level.id === 1}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
