import { useState, useEffect } from 'react'
import {
  Bot, Brain, Shield, Cog, Play, RefreshCw, CheckCircle,
  AlertTriangle, Zap, MessageSquare, GitBranch, Target,
  Activity, Clock, ChevronRight, Sparkles, Network
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

export default function AgenticAI() {
  const [agents, setAgents] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [demoResult, setDemoResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeAgent, setActiveAgent] = useState(null)
  const [investigationResult, setInvestigationResult] = useState(null)

  useEffect(() => {
    fetchAgentStatus()
  }, [])

  const fetchAgentStatus = async () => {
    try {
      const [agentsRes, workflowsRes] = await Promise.all([
        fetch(`${API_BASE}/agents/agents`),
        fetch(`${API_BASE}/agents/workflows`)
      ])
      const agentsData = await agentsRes.json()
      const workflowsData = await workflowsRes.json()
      if (agentsData.success) setAgents(agentsData.data)
      if (workflowsData.success) setWorkflows(workflowsData.data)
    } catch (error) {
      console.error('Error fetching agent status:', error)
    }
  }

  const runDemo = async () => {
    setLoading(true)
    setDemoResult(null)
    setInvestigationResult(null)

    try {
      const res = await fetch(`${API_BASE}/agents/demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: `TXN-DEMO-${Date.now().toString(36).toUpperCase()}` })
      })
      const data = await res.json()
      if (data.success) {
        setDemoResult(data.data)
      }
    } catch (error) {
      console.error('Error running demo:', error)
    } finally {
      setLoading(false)
    }
  }

  const runInvestigation = async (transactionId) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/agents/collaborate/investigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, fullAnalysis: true })
      })
      const data = await res.json()
      if (data.success) {
        setInvestigationResult(data.data)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const agentIcons = {
    'FRAUD_INVESTIGATOR': Shield,
    'RULE_OPTIMIZER': Cog,
    'ALERT_TRIAGE': Target
  }

  const agentColors = {
    'FRAUD_INVESTIGATOR': 'purple',
    'RULE_OPTIMIZER': 'amber',
    'ALERT_TRIAGE': 'blue'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl">
              <Bot className="w-6 h-6 text-white" />
            </div>
            Agentic AI Platform
          </h1>
          <p className="text-gray-400 mt-1">Autonomous AI agents for intelligent fraud detection</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchAgentStatus}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center gap-2 text-gray-300"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={runDemo}
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 rounded-lg flex items-center gap-2 font-medium disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run Multi-Agent Demo
          </button>
        </div>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-3 gap-4">
        {agents.map(agent => {
          const IconComponent = agentIcons[agent.role] || Bot
          const color = agentColors[agent.role] || 'gray'

          return (
            <div
              key={agent.agentId}
              onClick={() => setActiveAgent(activeAgent === agent.agentId ? null : agent.agentId)}
              className={`bg-[#12121a] rounded-xl border p-4 cursor-pointer transition-all hover:scale-[1.02] ${
                activeAgent === agent.agentId
                  ? `border-${color}-500/50 ring-2 ring-${color}-500/20`
                  : 'border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-${color}-500/20`}>
                    <IconComponent className={`w-5 h-5 text-${color}-400`} />
                  </div>
                  <div>
                    <div className="font-medium text-white">{agent.name}</div>
                    <div className="text-xs text-gray-500">{agent.agentId}</div>
                  </div>
                </div>
                <div className={`px-2 py-1 rounded text-xs ${
                  agent.status === 'IDLE' ? 'bg-emerald-500/20 text-emerald-400' :
                  agent.status === 'INVESTIGATING' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {agent.status}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Capabilities</span>
                  <span className="text-gray-300">{agent.capabilities?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tools</span>
                  <span className="text-gray-300">{agent.tools?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Memory (Short/Long)</span>
                  <span className="text-gray-300">{agent.memorySize?.shortTerm || 0}/{agent.memorySize?.longTerm || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Thoughts Logged</span>
                  <span className="text-gray-300">{agent.thoughtLogSize || 0}</span>
                </div>
              </div>

              {agent.capabilities && (
                <div className="mt-4 flex flex-wrap gap-1">
                  {agent.capabilities.slice(0, 4).map((cap, i) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">
                      {cap.replace(/_/g, ' ')}
                    </span>
                  ))}
                  {agent.capabilities.length > 4 && (
                    <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">
                      +{agent.capabilities.length - 4}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Workflows */}
      <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-violet-400" />
          Multi-Agent Workflows
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {workflows.map(wf => (
            <div key={wf.workflowId} className="bg-gray-800/50 rounded-lg p-3">
              <div className="font-medium text-white text-sm">{wf.name.replace(/_/g, ' ')}</div>
              <div className="text-xs text-gray-500 mt-1">{wf.workflowId}</div>
              <div className="mt-2 flex items-center gap-1">
                {wf.steps.map((step, i) => (
                  <div key={i} className="flex items-center">
                    <div className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300">
                      {step.name.replace(/_/g, ' ')}
                    </div>
                    {i < wf.steps.length - 1 && <ChevronRight className="w-3 h-3 text-gray-600" />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Investigation */}
      <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          Try Collaborative Investigation
        </h3>
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Enter transaction ID (e.g., TXN-ABC123)"
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-violet-500 focus:outline-none"
            id="txn-input"
          />
          <button
            onClick={() => runInvestigation(document.getElementById('txn-input').value || `TXN-${Date.now().toString(36).toUpperCase()}`)}
            disabled={loading}
            className="px-6 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <Shield className="w-4 h-4" />
            Investigate
          </button>
        </div>

        {investigationResult && (
          <div className="mt-4 p-4 bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-white">Investigation: {investigationResult.collaborationId}</span>
              <span className="text-xs text-gray-400">{investigationResult.transactionId}</span>
            </div>

            {/* Reasoning Chain */}
            <div className="space-y-2 mb-4">
              {investigationResult.reasoningChain?.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs text-violet-400">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-white">{step.step}</div>
                    <div className="text-xs text-gray-400">{step.agent}</div>
                  </div>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </div>
              ))}
            </div>

            {/* Final Recommendation */}
            <div className={`p-3 rounded-lg ${
              investigationResult.finalRecommendation?.action === 'BLOCK' ? 'bg-red-500/20 border border-red-500/30' :
              investigationResult.finalRecommendation?.action === 'REVIEW' ? 'bg-amber-500/20 border border-amber-500/30' :
              'bg-emerald-500/20 border border-emerald-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-white">{investigationResult.finalRecommendation?.action}</div>
                  <div className="text-sm text-gray-400">{investigationResult.finalRecommendation?.reason}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">
                    {((investigationResult.finalRecommendation?.confidence || 0) * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-400">Confidence</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Demo Results */}
      {demoResult && (
        <div className="bg-[#12121a] rounded-xl border border-violet-500/30 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-400" />
                Multi-Agent Demo Results
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                Transaction: {demoResult.transactionId} | Duration: {demoResult.duration}
              </p>
            </div>
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm">
              Completed
            </span>
          </div>

          {/* Agent Results */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {demoResult.agents?.map((agent, i) => {
              const colors = ['blue', 'purple', 'amber']
              const icons = [Target, Shield, Cog]
              const IconComp = icons[i]

              return (
                <div key={i} className={`bg-gray-800/50 rounded-lg p-4 border border-${colors[i]}-500/30`}>
                  <div className="flex items-center gap-2 mb-3">
                    <IconComp className={`w-5 h-5 text-${colors[i]}-400`} />
                    <span className="font-medium text-white">{agent.name}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{agent.role}</p>

                  {agent.name.includes('Triage') && agent.result && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Alerts Processed</span>
                        <span className="text-white">{agent.result.alertsProcessed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Queue Health</span>
                        <span className={`${
                          agent.result.queueHealth?.status === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'
                        }`}>{agent.result.queueHealth?.status}</span>
                      </div>
                    </div>
                  )}

                  {agent.name.includes('Investigation') && agent.result && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Recommendation</span>
                        <span className={`font-medium ${
                          agent.result.recommendation?.action === 'BLOCK' ? 'text-red-400' :
                          agent.result.recommendation?.action === 'REVIEW' ? 'text-amber-400' :
                          'text-emerald-400'
                        }`}>{agent.result.recommendation?.action}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Confidence</span>
                        <span className="text-white">{((agent.result.recommendation?.confidence || 0) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Risk Factors</span>
                        <span className="text-white">{agent.result.riskFactors?.length || 0}</span>
                      </div>
                    </div>
                  )}

                  {agent.name.includes('Optimization') && agent.result && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Insights</span>
                        <span className="text-white">{agent.result.insights?.length || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Recommendations</span>
                        <span className="text-white">{agent.result.recommendations?.length || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Rule Health</span>
                        <span className={`${
                          agent.result.ruleHealth?.status === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'
                        }`}>{agent.result.ruleHealth?.status}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Final Summary */}
          <div className={`p-4 rounded-lg ${
            demoResult.summary?.finalDecision === 'BLOCK' ? 'bg-red-500/10 border border-red-500/30' :
            demoResult.summary?.finalDecision === 'REVIEW' ? 'bg-amber-500/10 border border-amber-500/30' :
            demoResult.summary?.finalDecision === 'APPROVE' ? 'bg-emerald-500/10 border border-emerald-500/30' :
            'bg-gray-800/50 border border-gray-700'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-400">Final Decision</div>
                <div className="text-xl font-bold text-white">{demoResult.summary?.finalDecision || 'PENDING'}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-400">Confidence</div>
                <div className="text-xl font-bold text-white">
                  {((demoResult.summary?.confidence || 0) * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {demoResult.summary?.reasoning && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="text-sm text-gray-400 mb-2">Agent Reasoning:</div>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-black/30 p-3 rounded">
                  {demoResult.summary.reasoning}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Architecture Diagram */}
      <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Network className="w-4 h-4 text-violet-400" />
          Agentic AI Architecture
        </h3>
        <div className="relative">
          {/* Central Orchestrator */}
          <div className="flex justify-center mb-8">
            <div className="px-6 py-3 bg-gradient-to-r from-violet-500/20 to-purple-500/20 border border-violet-500/30 rounded-xl">
              <div className="text-center">
                <Bot className="w-8 h-8 text-violet-400 mx-auto mb-1" />
                <div className="font-medium text-white">Agent Orchestrator</div>
                <div className="text-xs text-gray-400">Coordinates multi-agent workflows</div>
              </div>
            </div>
          </div>

          {/* Connection Lines */}
          <div className="absolute top-20 left-1/2 w-px h-8 bg-gradient-to-b from-violet-500/50 to-transparent" />
          <div className="absolute top-28 left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />

          {/* Agents Row */}
          <div className="grid grid-cols-3 gap-6">
            {[
              { name: 'Alert Triage Agent', icon: Target, color: 'blue', desc: 'Prioritizes & routes alerts' },
              { name: 'Investigation Agent', icon: Shield, color: 'purple', desc: 'Deep fraud analysis' },
              { name: 'Rule Optimizer Agent', icon: Cog, color: 'amber', desc: 'Improves detection rules' }
            ].map((agent, i) => (
              <div key={i} className={`p-4 bg-${agent.color}-500/10 border border-${agent.color}-500/30 rounded-xl text-center`}>
                <agent.icon className={`w-6 h-6 text-${agent.color}-400 mx-auto mb-2`} />
                <div className="font-medium text-white text-sm">{agent.name}</div>
                <div className="text-xs text-gray-400 mt-1">{agent.desc}</div>
                <div className="mt-3 flex justify-center gap-1">
                  <span className="px-2 py-0.5 bg-black/30 rounded text-xs text-gray-400">Think</span>
                  <span className="px-2 py-0.5 bg-black/30 rounded text-xs text-gray-400">Plan</span>
                  <span className="px-2 py-0.5 bg-black/30 rounded text-xs text-gray-400">Act</span>
                </div>
              </div>
            ))}
          </div>

          {/* Tools Row */}
          <div className="mt-6 p-4 bg-gray-800/30 rounded-xl">
            <div className="text-xs text-gray-500 text-center mb-3">SHARED TOOLS & CAPABILITIES</div>
            <div className="flex justify-center flex-wrap gap-2">
              {['ML Models', 'Rule Engine', 'Data Platform', 'Feature Store', 'Alert Queue', 'Case Management'].map((tool, i) => (
                <span key={i} className="px-3 py-1 bg-gray-700/50 rounded-full text-xs text-gray-300">
                  {tool}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
