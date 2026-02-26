import { useState, useEffect, useCallback } from 'react'
import { Activity, Shield, RefreshCw, Clock, AlertTriangle, CheckCircle, XCircle, Zap, GitBranch, Eye } from 'lucide-react'

const API_BASE = '/api'

function timeAgo(dateStr) {
  if (!dateStr) return 'N/A'
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return 'N/A'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

export default function AutonomousAgents() {
  const [activeTab, setActiveTab] = useState('cross-domain')
  const [cdStatus, setCdStatus] = useState(null)
  const [cdDetections, setCdDetections] = useState([])
  const [cdPatterns, setCdPatterns] = useState([])
  const [cdHistory, setCdHistory] = useState([])
  const [peStatus, setPeStatus] = useState(null)
  const [peProposals, setPeProposals] = useState([])
  const [pePipeline, setPePipeline] = useState([])
  const [peHistory, setPeHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)

  const fetchCrossDomainData = useCallback(async () => {
    try {
      const [statusRes, detectionsRes, patternsRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/agents/cross-domain/status`).then(r => r.json()),
        fetch(`${API_BASE}/agents/cross-domain/detections?limit=50`).then(r => r.json()),
        fetch(`${API_BASE}/agents/cross-domain/patterns`).then(r => r.json()),
        fetch(`${API_BASE}/agents/cross-domain/history?limit=20`).then(r => r.json())
      ])
      if (statusRes.success) setCdStatus(statusRes.data)
      if (detectionsRes.success) setCdDetections(detectionsRes.data || [])
      if (patternsRes.success) setCdPatterns(patternsRes.data || [])
      if (historyRes.success) setCdHistory(historyRes.data || [])
    } catch (err) {
      console.error('Failed to fetch cross-domain data:', err)
    }
  }, [])

  const fetchPolicyEvolutionData = useCallback(async () => {
    try {
      const [statusRes, proposalsRes, pipelineRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/agents/policy-evolution/status`).then(r => r.json()),
        fetch(`${API_BASE}/agents/policy-evolution/proposals?limit=50`).then(r => r.json()),
        fetch(`${API_BASE}/agents/policy-evolution/pipeline`).then(r => r.json()),
        fetch(`${API_BASE}/agents/policy-evolution/history?limit=20`).then(r => r.json())
      ])
      if (statusRes.success) setPeStatus(statusRes.data)
      if (proposalsRes.success) setPeProposals(proposalsRes.data || [])
      if (pipelineRes.success) setPePipeline(pipelineRes.data || [])
      if (historyRes.success) setPeHistory(historyRes.data || [])
    } catch (err) {
      console.error('Failed to fetch policy evolution data:', err)
    }
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      if (activeTab === 'cross-domain') {
        await fetchCrossDomainData()
      } else {
        await fetchPolicyEvolutionData()
      }
      setLoading(false)
    }

    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [activeTab, fetchCrossDomainData, fetchPolicyEvolutionData])

  const handleScan = async () => {
    setScanning(true)
    try {
      const endpoint = activeTab === 'cross-domain'
        ? `${API_BASE}/agents/cross-domain/scan`
        : `${API_BASE}/agents/policy-evolution/scan`
      await fetch(endpoint, { method: 'POST' })
      // Re-fetch data after scan
      if (activeTab === 'cross-domain') {
        await fetchCrossDomainData()
      } else {
        await fetchPolicyEvolutionData()
      }
    } catch (err) {
      console.error('Scan failed:', err)
    }
    setScanning(false)
  }

  const tabs = [
    { id: 'cross-domain', label: 'Cross-Domain Correlation', icon: GitBranch },
    { id: 'policy-evolution', label: 'Policy Evolution', icon: Shield }
  ]

  const severityBadge = (severity) => {
    const s = (severity || '').toUpperCase()
    if (s === 'CRITICAL') return 'bg-red-500/20 text-red-400'
    if (s === 'HIGH') return 'bg-amber-500/20 text-amber-400'
    if (s === 'MEDIUM') return 'bg-yellow-500/20 text-yellow-400'
    if (s === 'LOW') return 'bg-blue-500/20 text-blue-400'
    return 'bg-gray-500/20 text-gray-400'
  }

  const stageBadge = (stage) => {
    const s = (stage || '').toUpperCase()
    if (s === 'ACTIVE') return 'bg-emerald-500/20 text-emerald-400'
    if (s === 'SHADOW') return 'bg-blue-500/20 text-blue-400'
    if (s === 'PROPOSED') return 'bg-amber-500/20 text-amber-400'
    if (s === 'REJECTED') return 'bg-red-500/20 text-red-400'
    return 'bg-gray-500/20 text-gray-400'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Autonomous Agents</h1>
          <p className="text-gray-400 text-sm mt-1">Cross-domain correlation and policy evolution agents</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          <span className="text-xs text-indigo-400">Autonomous Mode</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900/50 p-1 rounded-lg border border-gray-800 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-indigo-500/20 text-white border-b-2 border-indigo-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {loading && !cdStatus && !peStatus ? (
        <div className="text-center py-12 text-gray-400">Loading agent data...</div>
      ) : (
        <>
          {/* ============ Cross-Domain Correlation Tab ============ */}
          {activeTab === 'cross-domain' && (
            <div className="space-y-6">
              {/* Status Bar */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${cdStatus?.running ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                      <span className={`text-sm font-medium ${cdStatus?.running ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {cdStatus?.running ? 'Running' : 'Stopped'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Clock className="w-4 h-4" />
                      <span>Last scan: {timeAgo(cdStatus?.lastScan)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <RefreshCw className="w-4 h-4" />
                      <span>Next: {cdStatus?.nextScan ? timeAgo(cdStatus.nextScan).replace('ago', 'from now') : 'N/A'}</span>
                    </div>
                    <div className="text-sm text-gray-400">
                      <span className="text-white font-medium">{cdStatus?.eventsBuffered ?? 0}</span> events buffered
                    </div>
                    <div className="text-sm text-gray-400">
                      <span className="text-white font-medium">{cdStatus?.totalCycles ?? 0}</span> cycles
                    </div>
                  </div>
                  <button
                    onClick={handleScan}
                    disabled={scanning}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      scanning
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30'
                    }`}
                  >
                    <Zap className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                    {scanning ? 'Scanning...' : 'Run Scan Now'}
                  </button>
                </div>
              </div>

              {/* Detections Table */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-gray-800">
                  <h3 className="text-sm font-semibold text-white">Detections</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
                      <th className="text-left p-3">Seller ID</th>
                      <th className="text-left p-3">Pattern</th>
                      <th className="text-left p-3">Match Score</th>
                      <th className="text-left p-3">Steps</th>
                      <th className="text-left p-3">Confidence</th>
                      <th className="text-left p-3">Severity</th>
                      <th className="text-left p-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {cdDetections.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-500">
                          No detections yet. Agent scans every 5 minutes.
                        </td>
                      </tr>
                    ) : cdDetections.map((d, i) => (
                      <tr key={d.id || i} className="hover:bg-gray-800/30">
                        <td className="p-3 text-indigo-400 font-mono text-xs">{d.sellerId || 'N/A'}</td>
                        <td className="p-3 text-white text-xs">{d.pattern || 'Unknown'}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  (d.matchScore || 0) > 0.8 ? 'bg-red-500' :
                                  (d.matchScore || 0) > 0.6 ? 'bg-amber-500' :
                                  'bg-gray-500'
                                }`}
                                style={{ width: `${(d.matchScore || 0) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400">{((d.matchScore || 0) * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-xs text-gray-300">{d.stepsCompleted ?? '?'}/{d.totalSteps ?? '?'}</td>
                        <td className="p-3 text-xs text-gray-300">{d.confidence ? `${(d.confidence * 100).toFixed(0)}%` : 'N/A'}</td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityBadge(d.severity)}`}>
                            {(d.severity || 'UNKNOWN').toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-gray-500">{d.timestamp ? timeAgo(d.timestamp) : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Attack Pattern Library */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Attack Pattern Library</h3>
                {cdPatterns.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 bg-gray-900/50 border border-gray-800 rounded-xl">
                    No patterns loaded.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {cdPatterns.map((p, i) => (
                      <div key={p.id || i} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-white truncate">{p.name || 'Unnamed Pattern'}</h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${severityBadge(p.severity)}`}>
                            {(p.severity || 'N/A').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mb-3 line-clamp-2">{p.description || 'No description'}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                          <span>{p.steps?.length || p.stepCount || 0} steps</span>
                          <span>|</span>
                          <span>min conf: {p.minConfidence ? `${(p.minConfidence * 100).toFixed(0)}%` : 'N/A'}</span>
                        </div>
                        {p.steps && p.steps.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {p.steps.map((step, si) => (
                              <span key={si} className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
                                {typeof step === 'string' ? step : step.name || step.type || `step-${si + 1}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cycle History */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-gray-800">
                  <h3 className="text-sm font-semibold text-white">Cycle History</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
                      <th className="text-left p-3">Cycle ID</th>
                      <th className="text-left p-3">Started At</th>
                      <th className="text-left p-3">Duration</th>
                      <th className="text-left p-3">Events Processed</th>
                      <th className="text-left p-3">Findings</th>
                      <th className="text-left p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {cdHistory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-500">No cycle history yet.</td>
                      </tr>
                    ) : cdHistory.map((h, i) => (
                      <tr key={h.cycleId || i} className="hover:bg-gray-800/30">
                        <td className="p-3 text-indigo-400 font-mono text-xs">{(h.cycleId || '').slice(0, 12)}...</td>
                        <td className="p-3 text-xs text-gray-400">{h.startedAt ? new Date(h.startedAt).toLocaleString() : 'N/A'}</td>
                        <td className="p-3 text-xs text-gray-300">{formatDuration(h.duration)}</td>
                        <td className="p-3 text-xs text-gray-300">{h.eventsProcessed ?? 0}</td>
                        <td className="p-3 text-xs text-white font-medium">{h.findings ?? 0}</td>
                        <td className="p-3">
                          {h.status === 'success' || h.status === 'completed' ? (
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============ Policy Evolution Tab ============ */}
          {activeTab === 'policy-evolution' && (
            <div className="space-y-6">
              {/* Status Bar */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${peStatus?.running ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                      <span className={`text-sm font-medium ${peStatus?.running ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {peStatus?.running ? 'Running' : 'Stopped'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Clock className="w-4 h-4" />
                      <span>Last scan: {timeAgo(peStatus?.lastScan)}</span>
                    </div>
                    <div className="text-sm text-gray-400">
                      <span className="text-white font-medium">{peStatus?.totalCycles ?? 0}</span> cycles
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
                        PROPOSED: {pePipeline.filter?.(r => (r.stage || '').toUpperCase() === 'PROPOSED').length ?? 0}
                      </span>
                      <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                        SHADOW: {pePipeline.filter?.(r => (r.stage || '').toUpperCase() === 'SHADOW').length ?? 0}
                      </span>
                      <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                        ACTIVE: {pePipeline.filter?.(r => (r.stage || '').toUpperCase() === 'ACTIVE').length ?? 0}
                      </span>
                      <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                        REJECTED: {pePipeline.filter?.(r => (r.stage || '').toUpperCase() === 'REJECTED').length ?? 0}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleScan}
                    disabled={scanning}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      scanning
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30'
                    }`}
                  >
                    <Zap className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                    {scanning ? 'Scanning...' : 'Run Scan Now'}
                  </button>
                </div>
              </div>

              {/* Rule Pipeline — Kanban */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Rule Pipeline</h3>
                {pePipeline.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 bg-gray-900/50 border border-gray-800 rounded-xl">
                    No rules proposed yet. Agent scans every 30 minutes.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {['PROPOSED', 'SHADOW', 'ACTIVE', 'REJECTED'].map(stage => {
                      const rules = pePipeline.filter(r => (r.stage || '').toUpperCase() === stage)
                      return (
                        <div key={stage} className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
                          <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                            <span className={`text-xs font-semibold uppercase ${stageBadge(stage).replace('bg-', 'text-').split(' ')[1]}`}>
                              {stage}
                            </span>
                            <span className="text-xs text-gray-500">{rules.length}</span>
                          </div>
                          <div className="p-2 space-y-2 min-h-[120px]">
                            {rules.length === 0 ? (
                              <p className="text-xs text-gray-600 text-center py-4">No rules</p>
                            ) : rules.map((rule, ri) => (
                              <div key={rule.id || ri} className="bg-gray-800/50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-white truncate">{rule.name || 'Unnamed Rule'}</span>
                                  {rule.checkpoint && (
                                    <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded">
                                      {rule.checkpoint}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-gray-500 mb-1">
                                  {rule.timeInStage ? timeAgo(rule.timeInStage) : 'Just added'}
                                </p>
                                {stage === 'SHADOW' && (
                                  <div className="flex items-center gap-2 mt-1 text-[10px]">
                                    {rule.estimatedCatchRate != null && (
                                      <span className="text-emerald-400">
                                        Catch: {(rule.estimatedCatchRate * 100).toFixed(1)}%
                                      </span>
                                    )}
                                    {rule.fpRate != null && (
                                      <span className="text-amber-400">
                                        FP: {(rule.fpRate * 100).toFixed(1)}%
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Cycle History */}
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-gray-800">
                  <h3 className="text-sm font-semibold text-white">Cycle History</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
                      <th className="text-left p-3">Cycle ID</th>
                      <th className="text-left p-3">Started At</th>
                      <th className="text-left p-3">Duration</th>
                      <th className="text-left p-3">Events Processed</th>
                      <th className="text-left p-3">Findings</th>
                      <th className="text-left p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {peHistory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-500">No cycle history yet.</td>
                      </tr>
                    ) : peHistory.map((h, i) => (
                      <tr key={h.cycleId || i} className="hover:bg-gray-800/30">
                        <td className="p-3 text-indigo-400 font-mono text-xs">{(h.cycleId || '').slice(0, 12)}...</td>
                        <td className="p-3 text-xs text-gray-400">{h.startedAt ? new Date(h.startedAt).toLocaleString() : 'N/A'}</td>
                        <td className="p-3 text-xs text-gray-300">{formatDuration(h.duration)}</td>
                        <td className="p-3 text-xs text-gray-300">{h.eventsProcessed ?? 0}</td>
                        <td className="p-3 text-xs text-white font-medium">{h.findings ?? 0}</td>
                        <td className="p-3">
                          {h.status === 'success' || h.status === 'completed' ? (
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
