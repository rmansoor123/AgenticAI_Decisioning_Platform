import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const STATUS_COLORS = {
  Implemented: 'bg-green-500/20 text-green-400',
  Planned: 'bg-amber-500/20 text-amber-400',
  Future: 'bg-blue-500/20 text-blue-400',
  Vision: 'bg-purple-500/20 text-purple-400',
}

const EFFORT_COLORS = {
  S: 'text-green-400',
  M: 'text-amber-400',
  L: 'text-orange-400',
  XL: 'text-red-400',
}

function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.Planned}`}>
      {status}
    </span>
  )
}

function EffortBadge({ effort }) {
  if (!effort) return null
  return (
    <span className={`text-xs font-mono font-bold ${EFFORT_COLORS[effort] || 'text-gray-400'}`}>
      {effort}
    </span>
  )
}

function LevelSection({ level, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-[#12121a] rounded-lg border border-gray-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left p-6 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-white">
            Level {level.id} — {level.title}
          </h2>
          <StatusBadge status={level.status} />
          {level.id === 1 && (
            <span className="text-xs text-green-400 font-medium">You Are Here</span>
          )}
        </div>
        {open ? (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-6">
          <p className="text-sm text-gray-400">{level.description}</p>

          {/* Technologies */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">
              {level.id === 1 ? 'Technologies' : 'Technologies to Add'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                    <th className="pb-2 pr-4 font-medium">Technology</th>
                    <th className="pb-2 pr-4 font-medium">Category</th>
                    <th className="pb-2 pr-4 font-medium">What it enables</th>
                    {level.id > 1 && <th className="pb-2 pr-4 font-medium">Effort</th>}
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {level.technologies.map((tech) => (
                    <tr key={tech.name} className="border-b border-gray-800/50">
                      <td className="py-2.5 pr-4 text-gray-200 font-medium">{tech.name}</td>
                      <td className="py-2.5 pr-4 text-gray-400">{tech.category}</td>
                      <td className="py-2.5 pr-4 text-gray-400">{tech.enables}</td>
                      {level.id > 1 && (
                        <td className="py-2.5 pr-4">
                          <EffortBadge effort={tech.effort} />
                        </td>
                      )}
                      <td className="py-2.5">
                        <StatusBadge status={tech.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Products */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">
              {level.id === 1 ? 'Products Live' : 'Products This Enables'}
            </h3>
            <ul className="space-y-1.5">
              {level.products.map((p) => (
                <li key={p} className="text-sm text-gray-400 flex items-start gap-2">
                  <span className="text-gray-600 mt-0.5">-</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

const LEVELS = [
  {
    id: 1,
    title: 'Foundation (Current State)',
    status: 'Implemented',
    description: "We're here. Everything below is implemented and running.",
    technologies: [
      { name: 'PostgreSQL (pgvector)', category: 'Database', enables: '28 tables, full ACID, vector similarity', status: 'Implemented' },
      { name: 'Apache Kafka + Zookeeper', category: 'Streaming', enables: '14 topics, 4 partitions each, real streaming', status: 'Implemented' },
      { name: 'Redis 7', category: 'Cache', enables: 'Feature store caching, prediction cache, LLM cache', status: 'Implemented' },
      { name: 'TensorFlow.js', category: 'ML', enables: '2 neural networks (fraud-detector-v3, onboarding-risk-v1)', status: 'Implemented' },
      { name: 'OpenAI gpt-4o-mini', category: 'LLM', enables: 'Real LLM calls for agent reasoning', status: 'Implemented' },
      { name: 'Neo4j 5', category: 'Graph', enables: 'Fraud ring graph analysis', status: 'Implemented' },
      { name: 'Langfuse', category: 'Observability', enables: 'Agent traces, metrics, decision audit', status: 'Implemented' },
      { name: 'Qdrant', category: 'Vector DB', enables: 'Vector similarity search for pattern matching', status: 'Implemented' },
      { name: 'Mem0 + Letta + Zep', category: 'Memory', enables: 'Long-term, episodic, temporal memory', status: 'Implemented' },
      { name: 'Apache Pinot', category: 'Analytics', enables: 'OLAP analytics for risk trends', status: 'Implemented' },
      { name: 'OFAC SDN', category: 'Screening', enables: '18,712 real sanctions entries from US Treasury', status: 'Implemented' },
      { name: 'Docker Compose', category: 'Infrastructure', enables: '14 services orchestrated', status: 'Implemented' },
      { name: 'Kubernetes manifests', category: 'Infrastructure', enables: 'Dev and prod overlays ready', status: 'Implemented' },
    ],
    products: [
      '23 AI agents with TPAOR reasoning loop',
      '9-stage seller lifecycle (onboarding to payout)',
      'Real-time ML inference (25-feature onboarding model)',
      '6-stage Kafka streaming pipeline',
      '122 decision rules with lifecycle management',
      'Cross-domain risk profiling with score decay',
      'Case queue with agent triage',
      'Platform Integration panel showing ML/pipeline/features in real-time',
    ],
  },
  {
    id: 2,
    title: 'Advanced (Next Quarter)',
    status: 'Planned',
    description: 'Complex event processing, proper ML lifecycle, external integrations.',
    technologies: [
      { name: 'Apache Flink', category: 'Stream Processing', enables: 'Windowed aggregations, sessionization, complex event patterns', effort: 'L', status: 'Planned' },
      { name: 'MLflow', category: 'ML Lifecycle', enables: 'Experiment tracking, model registry, deployment pipelines', effort: 'M', status: 'Planned' },
      { name: 'Feast', category: 'Feature Store', enables: 'Production feature store with offline/online sync', effort: 'M', status: 'Planned' },
      { name: 'Apache Airflow', category: 'Orchestration', enables: 'Scheduled training pipelines, data quality checks', effort: 'M', status: 'Planned' },
      { name: 'Grafana + Prometheus', category: 'Monitoring', enables: 'Real-time infrastructure dashboards, alerting', effort: 'M', status: 'Planned' },
      { name: 'Stripe/Plaid webhooks', category: 'Integrations', enables: 'Real payment data, real bank verification', effort: 'S', status: 'Planned' },
      { name: 'Twilio Verify', category: 'Identity', enables: 'Real phone/SMS verification', effort: 'S', status: 'Planned' },
      { name: 'Great Expectations', category: 'Data Quality', enables: 'Automated data validation and profiling', effort: 'S', status: 'Planned' },
      { name: 'dbt', category: 'Data Transform', enables: 'SQL-based data transformation pipelines', effort: 'M', status: 'Planned' },
    ],
    products: [
      'Real-time transaction scoring with velocity windows (Flink CEP)',
      'Merchant risk scoring (aggregate seller behavior over time)',
      'Automated dispute resolution (agent + real payment data)',
      'Model performance dashboards (MLflow + Grafana)',
      'Data quality monitoring pipeline (Great Expectations)',
    ],
  },
  {
    id: 3,
    title: 'Enterprise (6 Months)',
    status: 'Future',
    description: 'Kubernetes-native, multi-region, advanced ML, self-optimizing.',
    technologies: [
      { name: 'Kubernetes (EKS/GKE)', category: 'Infrastructure', enables: 'Auto-scaling, rolling deployments, resource isolation', effort: 'XL', status: 'Future' },
      { name: 'Helm Charts', category: 'Deployment', enables: 'Reproducible deployments across environments', effort: 'M', status: 'Future' },
      { name: 'Kafka MirrorMaker 2', category: 'Replication', enables: 'Multi-region streaming, disaster recovery', effort: 'L', status: 'Future' },
      { name: 'Apache Superset', category: 'BI/Analytics', enables: 'Self-service analytics for fraud analysts', effort: 'M', status: 'Future' },
      { name: 'Ray Serve', category: 'ML Serving', enables: 'Distributed model serving with auto-batching', effort: 'L', status: 'Future' },
      { name: 'PyTorch', category: 'ML Framework', enables: 'Graph neural networks, attention-based fraud detection', effort: 'L', status: 'Future' },
      { name: 'Label Studio', category: 'Annotation', enables: 'Human-in-the-loop labeling for model training', effort: 'M', status: 'Future' },
      { name: 'Temporal.io', category: 'Workflows', enables: 'Long-running agent workflows, durable execution', effort: 'M', status: 'Future' },
      { name: 'OpenTelemetry', category: 'Observability', enables: 'Distributed tracing across microservices', effort: 'M', status: 'Future' },
      { name: 'Vault (HashiCorp)', category: 'Security', enables: 'Secrets management, dynamic credentials', effort: 'M', status: 'Future' },
    ],
    products: [
      'Cross-merchant fraud intelligence network (shared signals, privacy-preserving)',
      'Regulatory reporting automation (SAR generation, CTR filing)',
      'Self-optimizing rules engine (agent-driven threshold tuning)',
      'Fraud analyst workbench (investigation tools, case collaboration)',
      'Merchant onboarding risk API (external-facing product)',
    ],
  },
  {
    id: 4,
    title: 'State-of-the-Art (Vision)',
    status: 'Vision',
    description: 'The frontier. Autonomous prevention, advanced AI.',
    technologies: [
      { name: 'LLM Agents (Claude/GPT-4)', category: 'Autonomous AI', enables: 'Multi-turn investigation, natural language case summaries', effort: 'L', status: 'Vision' },
      { name: 'Reinforcement Learning', category: 'ML', enables: 'Dynamic threshold optimization from outcome feedback', effort: 'XL', status: 'Vision' },
      { name: 'Causal Inference (DoWhy)', category: 'ML', enables: 'Counterfactual analysis — "what would have happened"', effort: 'L', status: 'Vision' },
      { name: 'GANs / Diffusion Models', category: 'Synthetic Data', enables: 'Generate realistic fraud patterns for training', effort: 'L', status: 'Vision' },
      { name: 'Graph Neural Networks', category: 'ML', enables: 'Fraud ring detection via message passing networks', effort: 'XL', status: 'Vision' },
      { name: 'Digital Twin Simulation', category: 'Testing', enables: 'Simulate entire payment ecosystem for stress testing', effort: 'XL', status: 'Vision' },
      { name: 'Federated Learning', category: 'ML', enables: 'Train models across merchants without sharing data', effort: 'XL', status: 'Vision' },
      { name: 'Blockchain (Hyperledger)', category: 'Audit', enables: 'Cryptographically verifiable audit trails', effort: 'L', status: 'Vision' },
      { name: 'Neuromorphic Computing', category: 'Hardware', enables: 'Sub-millisecond pattern detection', effort: 'XL', status: 'Vision' },
      { name: 'Confidential Computing', category: 'Security', enables: 'Process sensitive data in encrypted memory', effort: 'L', status: 'Vision' },
    ],
    products: [
      'Predictive fraud prevention — stop fraud before it happens',
      'Autonomous compliance officer — agent monitors regulatory changes and adapts policies',
      'Merchant trust marketplace — sellers earn visible trust scores',
      'Industry-wide fraud intelligence sharing — federated, privacy-preserving',
      'Real-time fraud simulation engine — test rules against synthetic attacks',
      'Natural language investigation — "tell me about fraud patterns for seller X"',
    ],
  },
]

export default function PlatformRoadmap() {
  return (
    <div className="min-h-screen bg-[#0a0a12] text-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Roadmap</h1>
          <p className="text-sm text-gray-400 mt-1">
            4-level maturity model from foundation to state-of-the-art fraud prevention
          </p>
        </div>

        {/* Effort legend */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="font-medium">Effort:</span>
          <span><span className="text-green-400 font-mono font-bold">S</span> Days</span>
          <span><span className="text-amber-400 font-mono font-bold">M</span> Weeks</span>
          <span><span className="text-orange-400 font-mono font-bold">L</span> Month</span>
          <span><span className="text-red-400 font-mono font-bold">XL</span> Quarter</span>
        </div>

        {/* Levels */}
        <div className="space-y-4">
          {LEVELS.map((level) => (
            <LevelSection
              key={level.id}
              level={level}
              defaultOpen={level.id === 1}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
