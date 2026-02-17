import { useState, useEffect, Fragment } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const API_BASE = '/api'

export default function Observability() {
  const [activeTab, setActiveTab] = useState('health')
  const [health, setHealth] = useState(null)
  const [metrics, setMetrics] = useState([])
  const [traces, setTraces] = useState([])
  const [decisions, setDecisions] = useState([])
  const [expandedTrace, setExpandedTrace] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [healthRes, metricsRes, tracesRes, decisionsRes] = await Promise.all([
          fetch(`${API_BASE}/observability/health`).then(r => r.json()),
          fetch(`${API_BASE}/observability/metrics`).then(r => r.json()),
          fetch(`${API_BASE}/observability/traces?limit=50`).then(r => r.json()),
          fetch(`${API_BASE}/observability/decisions?limit=50`).then(r => r.json())
        ])
        if (healthRes.success) setHealth(healthRes.data)
        if (metricsRes.success) setMetrics(metricsRes.data)
        if (tracesRes.success) setTraces(tracesRes.data)
        if (decisionsRes.success) setDecisions(decisionsRes.data)
      } catch (err) {
        console.error('Failed to fetch observability data:', err)
      }
      setLoading(false)
    }
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  const tabs = [
    { id: 'health', label: 'Agent Health' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'traces', label: 'Traces' },
    { id: 'decisions', label: 'Decisions' }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Observability</h1>
          <p className="text-gray-400 text-sm mt-1">Agent metrics, traces, and decision audit trail</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs text-cyan-400">Live Monitoring</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900/50 p-1 rounded-lg border border-gray-800 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && !health ? (
        <div className="text-center py-12 text-gray-400">Loading observability data...</div>
      ) : (
        <>
          {/* Health Tab */}
          {activeTab === 'health' && health && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {metrics.map(agent => (
                  <div key={agent.agentId} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white truncate">{agent.agentId}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        agent.successRate > 0.9 ? 'bg-emerald-500/20 text-emerald-400' :
                        agent.successRate > 0.7 ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {(agent.successRate * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="space-y-2 text-xs text-gray-400">
                      <div className="flex justify-between"><span>Executions</span><span className="text-white">{agent.executions}</span></div>
                      <div className="flex justify-between"><span>Avg Duration</span><span className="text-white">{agent.avgDuration}ms</span></div>
                      <div className="flex justify-between"><span>P95 Duration</span><span className="text-white">{agent.p95Duration}ms</span></div>
                      <div className="flex justify-between"><span>Failures</span><span className="text-red-400">{agent.failures}</span></div>
                    </div>
                    {agent.lastExecution && (
                      <p className="text-[10px] text-gray-500 mt-2">Last: {new Date(agent.lastExecution).toLocaleTimeString()}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* System Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-400">Knowledge Base</p>
                  <p className="text-xl font-bold text-white mt-1">{health.knowledgeBase?.totalEntries || 0}</p>
                  <p className="text-xs text-gray-500">entries</p>
                </div>
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-400">Memory Store</p>
                  <p className="text-xl font-bold text-white mt-1">{(health.memory?.shortTermEntries || 0) + (health.memory?.longTermEntries || 0)}</p>
                  <p className="text-xs text-gray-500">memories</p>
                </div>
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-400">Context Assemblies</p>
                  <p className="text-xl font-bold text-white mt-1">{health.contextEngine?.assemblies || 0}</p>
                  <p className="text-xs text-gray-500">total</p>
                </div>
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-400">Active Traces</p>
                  <p className="text-xl font-bold text-white mt-1">{health.tracing?.activeTraces || 0}</p>
                  <p className="text-xs text-gray-500">in progress</p>
                </div>
              </div>

              {/* Circuit Breakers */}
              {health.circuitBreakers && health.circuitBreakers.length > 0 && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Circuit Breakers</h3>
                  <div className="space-y-2">
                    {health.circuitBreakers.map(cb => (
                      <div key={cb.name} className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">{cb.name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          cb.state === 'CLOSED' ? 'bg-emerald-500/20 text-emerald-400' :
                          cb.state === 'OPEN' ? 'bg-red-500/20 text-red-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>{cb.state}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Metrics Tab */}
          {activeTab === 'metrics' && (
            <div className="space-y-6">
              {metrics.length > 0 ? (
                <>
                  <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-4">Agent Execution Overview</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={metrics}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="agentId" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                        <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
                        <Bar dataKey="successes" fill="#10b981" name="Successes" />
                        <Bar dataKey="failures" fill="#ef4444" name="Failures" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-4">Latency (ms)</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={metrics}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="agentId" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
                        <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
                        <Bar dataKey="avgDuration" fill="#06b6d4" name="Avg (ms)" />
                        <Bar dataKey="p95Duration" fill="#8b5cf6" name="P95 (ms)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-gray-400">No metrics data yet. Trigger some agent actions first.</div>
              )}
            </div>
          )}

          {/* Traces Tab */}
          {activeTab === 'traces' && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th className="text-left p-3 text-gray-400 font-medium">Trace ID</th>
                    <th className="text-left p-3 text-gray-400 font-medium">Agent</th>
                    <th className="text-left p-3 text-gray-400 font-medium">Duration</th>
                    <th className="text-left p-3 text-gray-400 font-medium">Spans</th>
                    <th className="text-left p-3 text-gray-400 font-medium">Status</th>
                    <th className="text-left p-3 text-gray-400 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {traces.length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-gray-400">No traces yet</td></tr>
                  ) : traces.map(trace => (
                    <Fragment key={trace.traceId}>
                      <tr
                        className="hover:bg-gray-800/30 cursor-pointer"
                        onClick={() => setExpandedTrace(expandedTrace === trace.traceId ? null : trace.traceId)}
                      >
                        <td className="p-3 text-cyan-400 font-mono text-xs">{trace.traceId}</td>
                        <td className="p-3 text-white">{trace.agentId}</td>
                        <td className="p-3 text-gray-300">{trace.duration}ms</td>
                        <td className="p-3 text-gray-300">{trace.spans?.length || 0}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            trace.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                          }`}>{trace.status}</span>
                        </td>
                        <td className="p-3 text-gray-500 text-xs">{trace.startedAt ? new Date(trace.startedAt).toLocaleTimeString() : '-'}</td>
                      </tr>
                      {expandedTrace === trace.traceId && trace.spans && (
                        <tr>
                          <td colSpan={6} className="p-4 bg-gray-800/20">
                            <div className="space-y-1">
                              <p className="text-xs text-gray-400 mb-2">Spans:</p>
                              {trace.spans.map((span, i) => (
                                <div key={i} className="flex items-center gap-3 text-xs pl-4 py-1 border-l-2 border-cyan-500/30">
                                  <span className="text-cyan-400 font-mono">{span.spanName}</span>
                                  <span className="text-gray-400">{span.duration}ms</span>
                                  <span className={span.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}>{span.status}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Decisions Tab */}
          {activeTab === 'decisions' && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th className="text-left p-3 text-gray-400 font-medium">Decision ID</th>
                    <th className="text-left p-3 text-gray-400 font-medium">Agent</th>
                    <th className="text-left p-3 text-gray-400 font-medium">Decision</th>
                    <th className="text-left p-3 text-gray-400 font-medium">Reasoning</th>
                    <th className="text-left p-3 text-gray-400 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {decisions.length === 0 ? (
                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">No decisions logged yet</td></tr>
                  ) : decisions.map(dec => (
                    <tr key={dec.decisionId} className="hover:bg-gray-800/30">
                      <td className="p-3 text-cyan-400 font-mono text-xs">{dec.decisionId}</td>
                      <td className="p-3 text-white text-xs">{dec.agentId}</td>
                      <td className="p-3">
                        <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">
                          {typeof dec.decision === 'object' ? JSON.stringify(dec.decision).slice(0, 60) : String(dec.decision).slice(0, 60)}
                        </span>
                      </td>
                      <td className="p-3 text-gray-400 text-xs max-w-md truncate">{dec.reasoning || '-'}</td>
                      <td className="p-3 text-gray-500 text-xs">{new Date(dec.timestamp).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
