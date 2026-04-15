import { useState } from 'react'
import { Code, Terminal, Database, Layers, GitBranch, BookOpen, ChevronDown, ChevronRight, Copy, Check, ExternalLink } from 'lucide-react'

function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800">
        <span className="text-xs text-gray-500">{language || 'bash'}</span>
        <button onClick={handleCopy} className="text-gray-500 hover:text-white transition-colors">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <pre className="p-3 text-sm text-gray-300 overflow-x-auto"><code>{code}</code></pre>
    </div>
  )
}

function Section({ title, icon: Icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-semibold text-white">{title}</h2>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-gray-800 pt-4">{children}</div>}
    </div>
  )
}

function Step({ number, title, children }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-bold text-white">
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white mb-1">{title}</div>
        <div className="text-sm text-gray-400">{children}</div>
      </div>
    </div>
  )
}

export default function DeveloperPortal() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Developer Portal</h1>
        <p className="text-gray-400 mt-1">Build on the platform -- guides, APIs, and integration patterns</p>
      </div>

      {/* Section 1: Getting Started */}
      <Section title="Getting Started" icon={Terminal} defaultOpen={true}>
        <p className="text-sm text-gray-400 mb-4">
          Get the platform running in under 5 minutes. The system supports zero-Docker mode with graceful fallbacks for every backend.
        </p>

        <div className="space-y-4">
          <Step number={1} title="Clone and start infrastructure">
            <CodeBlock code={`# Start all Docker services (Postgres, Redis, Kafka, Neo4j, Langfuse, etc.)
docker-compose up -d

# Start the backend gateway (port 3001)
node backend/gateway/server.js`} />
          </Step>

          <Step number={2} title="Start the frontend dev server">
            <CodeBlock code={`npm run dev
# Opens at http://localhost:5173`} />
          </Step>

          <Step number={3} title="Explore the APIs">
            <div className="grid grid-cols-2 gap-3 mt-2">
              <a href="http://localhost:5173" target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 text-sm text-indigo-400 hover:bg-gray-700 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Frontend Dashboard
              </a>
              <a href="http://localhost:3001/api/docs" target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 text-sm text-indigo-400 hover:bg-gray-700 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Swagger API Docs
              </a>
              <a href="http://localhost:3100" target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 text-sm text-indigo-400 hover:bg-gray-700 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Langfuse Observability
              </a>
              <a href="http://localhost:7474" target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 text-sm text-indigo-400 hover:bg-gray-700 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Neo4j Browser
              </a>
            </div>
          </Step>
        </div>
      </Section>

      {/* Section 2: How to Build an Agent */}
      <Section title="How to Build an Agent" icon={Code}>
        <p className="text-sm text-gray-400 mb-4">
          Every agent extends BaseAgent and follows the 14-phase TPAOR reasoning loop.
          Agents are singletons exported via factory functions.
        </p>

        <div className="space-y-4">
          <Step number={1} title="Create a new file">
            <code className="text-xs text-indigo-400">backend/agents/specialized/my-agent.js</code>
          </Step>

          <Step number={2} title="Extend BaseAgent">
            <CodeBlock language="javascript" code={`import { BaseAgent } from '../core/base-agent.js';

class MyAgent extends BaseAgent {
  constructor() {
    super({
      agentId: 'MY_AGENT',
      name: 'My Custom Agent',
      domain: 'custom',
      version: '1.0.0'
    });
  }
}`} />
          </Step>

          <Step number={3} title="Implement think(), plan(), observe()">
            <CodeBlock language="javascript" code={`// think() — analyze context, identify risk signals
async think(context) {
  return { signals: [...], riskLevel: 'LOW' };
}

// plan() — select tools to execute
async plan(thinkResult) {
  return [{ tool: 'verify_identity', params: {...} }];
}

// observe() — synthesize tool results into a decision
async observe(toolResults) {
  return { action: 'APPROVE', confidence: 0.95, reason: '...' };
}`} />
          </Step>

          <Step number={4} title="Register tools in constructor">
            <CodeBlock language="javascript" code={`this.registerTool('verify_identity', 'Verify identity documents', async (params) => {
  // Tool implementation
  return { verified: true, score: 0.98 };
});`} />
          </Step>

          <Step number={5} title="Export singleton factory">
            <CodeBlock language="javascript" code={`let instance = null;
export function getMyAgent() {
  if (!instance) instance = new MyAgent();
  return instance;
}`} />
          </Step>

          <Step number={6} title="Wire into a service router">
            Create an Express router in <code className="text-xs text-indigo-400">backend/services/business/my-service/index.js</code> that
            calls <code className="text-xs text-indigo-400">getMyAgent().reason(context)</code> on incoming requests.
          </Step>

          <Step number={7} title="Mount in server.js">
            <CodeBlock language="javascript" code={`import myServiceRouter from '../services/business/my-service/index.js';
app.use('/api/my-service', myServiceRouter);`} />
          </Step>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mt-2">
          <p className="text-xs text-amber-400">
            <strong>Non-negotiable:</strong> Agent errors must default to HOLD, never APPROVE.
            Policy engine runs last and always overrides LLM. Every decision must call emitRiskEvent().
          </p>
        </div>
      </Section>

      {/* Section 3: How to Add a Data Source */}
      <Section title="How to Add a Data Source" icon={Database}>
        <p className="text-sm text-gray-400 mb-4">
          The Data Platform supports 6 connector types. Add a source via API, then agents query it through the federation layer.
        </p>

        <div className="space-y-4">
          <Step number={1} title="Register a data source">
            <CodeBlock code={`curl -X POST http://localhost:3001/api/data-platform/connectors/sources \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "fraud-signals-api",
    "type": "rest-api",
    "config": {
      "baseUrl": "https://api.example.com/v1",
      "authType": "bearer",
      "pollInterval": 30000
    }
  }'`} />
          </Step>

          <Step number={2} title="Choose connector type">
            <div className="grid grid-cols-3 gap-2 mt-2">
              {['rest-api', 'webhook', 'database', 'kafka', 'file', 'graphql'].map(t => (
                <div key={t} className="bg-gray-800 rounded px-2 py-1 text-xs text-center text-gray-300 font-mono">{t}</div>
              ))}
            </div>
          </Step>

          <Step number={3} title="Query through federation">
            <CodeBlock code={`curl http://localhost:3001/api/data-platform/connectors/query \\
  -H "Content-Type: application/json" \\
  -d '{ "source": "fraud-signals-api", "query": { "sellerId": "SLR-ABC123" } }'`} />
          </Step>
        </div>
      </Section>

      {/* Section 4: How to Create a Decision Rule */}
      <Section title="How to Create a Decision Rule" icon={GitBranch}>
        <p className="text-sm text-gray-400 mb-4">
          106 fraud rules are currently active. Rules follow a lifecycle: TESTING &rarr; SHADOW &rarr; ACTIVE &rarr; DEPRECATED.
          New rules always start in SHADOW mode.
        </p>

        <div className="space-y-4">
          <Step number={1} title="Create a rule via API">
            <CodeBlock code={`curl -X POST http://localhost:3001/api/rules \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "high-value-first-payout",
    "description": "Flag first payouts over $5000",
    "type": "THRESHOLD",
    "domain": "payout",
    "condition": { "field": "amount", "operator": ">", "value": 5000 },
    "action": "HOLD",
    "severity": "HIGH",
    "status": "SHADOW"
  }'`} />
          </Step>

          <Step number={2} title="Rule types">
            <div className="grid grid-cols-4 gap-2 mt-2">
              {[
                { type: 'THRESHOLD', desc: 'Single value comparison' },
                { type: 'VELOCITY', desc: 'Rate-based detection' },
                { type: 'ML_SCORE', desc: 'Model score threshold' },
                { type: 'COMPOSITE', desc: 'Multi-condition logic' }
              ].map(r => (
                <div key={r.type} className="bg-gray-800 rounded-lg p-2">
                  <div className="text-xs font-mono text-indigo-400">{r.type}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{r.desc}</div>
                </div>
              ))}
            </div>
          </Step>

          <Step number={3} title="Rule lifecycle">
            <div className="flex items-center gap-2 mt-2">
              {['TESTING', 'SHADOW', 'ACTIVE', 'DEPRECATED'].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-gray-800 rounded text-gray-300 font-mono">{s}</span>
                  {i < 3 && <span className="text-gray-600">&rarr;</span>}
                </div>
              ))}
            </div>
          </Step>
        </div>
      </Section>

      {/* Section 5: API Reference */}
      <Section title="API Reference" icon={BookOpen}>
        <div className="flex items-center gap-2 mb-4">
          <a href="http://localhost:3001/api/docs" target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2 text-sm text-white transition-colors">
            <ExternalLink className="w-4 h-4" /> Open Swagger UI
          </a>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-white">Key Endpoint Categories</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { category: 'Seller Lifecycle', endpoints: ['POST /api/onboarding/sellers', 'POST /api/payout/payouts', 'POST /api/listing/listings', 'POST /api/returns'] },
              { category: 'Risk Operations', endpoints: ['GET /api/risk-profile/:id', 'POST /api/cases', 'GET /api/analytics/risk-trends'] },
              { category: 'AI Agents', endpoints: ['GET /api/agents/cross-domain/status', 'POST /api/ato/evaluate', 'POST /api/compliance'] },
              { category: 'Platform', endpoints: ['GET /api/streaming/stats', 'GET /api/observability/traces', 'GET /api/ml/inference/health'] }
            ].map(cat => (
              <div key={cat.category} className="bg-gray-800 rounded-lg p-3">
                <div className="text-xs font-semibold text-indigo-400 mb-2">{cat.category}</div>
                {cat.endpoints.map(ep => (
                  <div key={ep} className="text-xs font-mono text-gray-400 py-0.5">{ep}</div>
                ))}
              </div>
            ))}
          </div>

          <h3 className="text-sm font-medium text-white mt-4">Example: Create a Seller</h3>
          <CodeBlock code={`curl -X POST http://localhost:3001/api/onboarding/sellers \\
  -H "Content-Type: application/json" \\
  -d '{
    "businessName": "Acme Corp",
    "businessCategory": "electronics",
    "country": "US",
    "email": "seller@acme.com",
    "phone": "+1-555-0100"
  }'`} />
        </div>
      </Section>

      {/* Section 6: Architecture Overview */}
      <Section title="Architecture Overview" icon={Layers}>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-white">Core Architecture</h3>
            <div className="space-y-2">
              {[
                { label: 'Pluggable Backends', value: '9 backends with factory pattern', detail: 'DB, Cache, Vector, Graph, Observability, Memory, LLM, Analytics, Temporal' },
                { label: 'Agent Reasoning', value: '14-phase TPAOR loop', detail: 'Pattern Match, Think, Plan, Act, Re-Plan, Observe, Reflect, Multi-Turn, Policy, Judge, KB Write, Learn, Emit, Eval' },
                { label: 'Streaming Pipeline', value: '6-stage Kafka pipeline', detail: 'Ingest, Validate, Enrich, Score, Decide, Emit' },
                { label: 'Financial Ledger', value: 'Double-entry accounting', detail: 'Full audit trail, real-time balance tracking' },
                { label: 'Data Connectors', value: '14 connector types', detail: 'REST, WebSocket, GraphQL, Database, File, Kafka, etc.' }
              ].map(item => (
                <div key={item.label} className="bg-gray-800 rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-white font-medium">{item.label}</span>
                    <span className="text-xs text-indigo-400">{item.value}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-white">Scale & Coverage</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Specialized Agents', value: '23' },
                { label: 'API Routes', value: '48+' },
                { label: 'Database Tables', value: '28' },
                { label: 'Fraud Rules', value: '106' },
                { label: 'Frontend Pages', value: '34+' },
                { label: 'Docker Services', value: '12' },
                { label: 'Core Agent Modules', value: '18' },
                { label: 'WebSocket Events', value: '20+' }
              ].map(stat => (
                <div key={stat.label} className="bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-white">{stat.value}</div>
                  <div className="text-xs text-gray-500">{stat.label}</div>
                </div>
              ))}
            </div>

            <h3 className="text-sm font-medium text-white mt-2">Key Principles</h3>
            <ul className="space-y-1.5">
              {[
                'Agent errors default to HOLD, never APPROVE',
                'Policy engine always runs last, overrides LLM',
                'Every decision emits a risk event',
                'All backends have automatic graceful fallback',
                'Factory pattern everywhere -- never import backends directly',
                'New rules start in SHADOW mode, never ACTIVE',
                'ES modules only -- no CommonJS'
              ].map((p, i) => (
                <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
                  <span className="text-indigo-400 mt-0.5">&#8226;</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  )
}
