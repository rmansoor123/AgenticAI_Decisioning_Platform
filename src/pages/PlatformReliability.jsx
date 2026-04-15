import { useState, useEffect, useCallback } from 'react'
import { Shield, Activity, AlertTriangle, CheckCircle, XCircle, Clock, Zap, Server, ChevronDown, Plus } from 'lucide-react'

const API_BASE = '/api/platform/reliability'

function useFetch(endpoint) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const refetch = useCallback(() => {
    setLoading(true)
    fetch(`${API_BASE}${endpoint}`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [endpoint])
  useEffect(() => { refetch() }, [refetch])
  return { data, loading, refetch }
}

function StatusDot({ status }) {
  const colors = {
    HEALTHY: 'bg-emerald-400',
    DEGRADED: 'bg-amber-400',
    CRITICAL: 'bg-red-400',
    CLOSED: 'bg-emerald-400',
    OPEN: 'bg-red-400',
    HALF_OPEN: 'bg-amber-400'
  }
  return <div className={`w-2.5 h-2.5 rounded-full ${colors[status] || 'bg-gray-500'}`} />
}

function SeverityBadge({ severity }) {
  const colors = {
    CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
    HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    LOW: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${colors[severity] || 'bg-gray-700 text-gray-400 border-gray-600'}`}>
      {severity}
    </span>
  )
}

function StatusBadge({ status }) {
  const colors = {
    OPEN: 'bg-red-500/20 text-red-400',
    RESOLVED: 'bg-emerald-500/20 text-emerald-400'
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors[status] || 'bg-gray-700 text-gray-400'}`}>
      {status}
    </span>
  )
}

export default function PlatformReliability() {
  const { data: sla, loading: slaLoading, refetch: refetchSla } = useFetch('/sla')
  const { data: health, loading: healthLoading, refetch: refetchHealth } = useFetch('/health-matrix')
  const { data: breakers, loading: breakersLoading } = useFetch('/circuit-breakers')
  const { data: degradation, loading: degradationLoading } = useFetch('/degradation-modes')
  const { data: incidents, loading: incidentsLoading, refetch: refetchIncidents } = useFetch('/incidents')
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [incidentForm, setIncidentForm] = useState({ severity: 'MEDIUM', title: '', description: '', affectedService: '' })

  // Auto-refresh SLA every 10s
  useEffect(() => {
    const interval = setInterval(() => { refetchSla(); refetchHealth() }, 10000)
    return () => clearInterval(interval)
  }, [refetchSla, refetchHealth])

  const submitIncident = async () => {
    if (!incidentForm.title) return
    await fetch(`${API_BASE}/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incidentForm)
    })
    setIncidentForm({ severity: 'MEDIUM', title: '', description: '', affectedService: '' })
    setShowIncidentForm(false)
    refetchIncidents()
  }

  const formatUptime = (seconds) => {
    if (!seconds) return '0s'
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    const parts = []
    if (d > 0) parts.push(`${d}d`)
    if (h > 0) parts.push(`${h}h`)
    if (m > 0) parts.push(`${m}m`)
    if (parts.length === 0) parts.push(`${s}s`)
    return parts.join(' ')
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Reliability</h1>
        <p className="text-gray-400 mt-1">SLA tracking, service health, circuit breakers, and incident management</p>
      </div>

      {/* Section 1: SLA Metrics */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            SLA Metrics
          </h2>
          {sla && (
            <span className="text-xs text-gray-500">
              Uptime: {formatUptime(sla.uptimeSeconds)} | {sla.totalRequests.toLocaleString()} requests tracked
            </span>
          )}
        </div>

        {slaLoading ? (
          <div className="text-gray-500 text-sm">Loading SLA metrics...</div>
        ) : sla ? (
          <div className="grid grid-cols-5 gap-4">
            {[
              { label: 'Availability', value: `${(sla.availability * 100).toFixed(2)}%`, target: `${(sla.slaTargets.availability * 100).toFixed(2)}%`, met: sla.availability >= sla.slaTargets.availability },
              { label: 'Error Rate', value: `${(sla.errorRate * 100).toFixed(2)}%`, target: `< ${(sla.slaTargets.errorRate * 100).toFixed(1)}%`, met: sla.errorRate <= sla.slaTargets.errorRate },
              { label: 'p50 Latency', value: `${sla.latency.p50}ms`, target: `< ${sla.slaTargets.p50Latency}ms`, met: sla.latency.p50 <= sla.slaTargets.p50Latency },
              { label: 'p95 Latency', value: `${sla.latency.p95}ms`, target: `< ${sla.slaTargets.p95Latency}ms`, met: sla.latency.p95 <= sla.slaTargets.p95Latency },
              { label: 'p99 Latency', value: `${sla.latency.p99}ms`, target: `< ${sla.slaTargets.p99Latency}ms`, met: sla.latency.p99 <= sla.slaTargets.p99Latency }
            ].map(metric => (
              <div key={metric.label} className={`bg-gray-900 border rounded-xl p-4 ${metric.met ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
                <div className="text-xs text-gray-500 mb-1">{metric.label}</div>
                <div className={`text-2xl font-bold ${metric.met ? 'text-emerald-400' : 'text-red-400'}`}>
                  {metric.value}
                </div>
                <div className="text-xs text-gray-600 mt-1">Target: {metric.target}</div>
                <div className={`text-xs mt-1 ${metric.met ? 'text-emerald-500' : 'text-red-500'}`}>
                  {metric.met ? 'Within SLA' : 'SLA Violated'}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {sla && !sla.allMet && sla.violations.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-400">
              {sla.violations.length} SLA violation{sla.violations.length > 1 ? 's' : ''} detected:{' '}
              {sla.violations.map(v => v.metric).join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* Section 2: Service Health Matrix */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Server className="w-5 h-5 text-indigo-400" />
          Service Health Matrix
        </h2>

        {healthLoading ? (
          <div className="text-gray-500 text-sm">Checking service health...</div>
        ) : health ? (
          <>
            <div className={`rounded-lg p-3 flex items-center gap-2 ${
              health.overall === 'HEALTHY' ? 'bg-emerald-500/10 border border-emerald-500/30' :
              health.overall === 'DEGRADED' ? 'bg-amber-500/10 border border-amber-500/30' :
              'bg-red-500/10 border border-red-500/30'
            }`}>
              <StatusDot status={health.overall} />
              <span className={`text-sm font-medium ${
                health.overall === 'HEALTHY' ? 'text-emerald-400' :
                health.overall === 'DEGRADED' ? 'text-amber-400' : 'text-red-400'
              }`}>
                Overall: {health.overall} — {health.healthy}/{health.total} services healthy
              </span>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {health.services.map(svc => (
                <div key={svc.name} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">{svc.name}</span>
                    <StatusDot status={svc.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs px-1.5 py-0.5 bg-gray-800 rounded text-gray-400">{svc.category}</span>
                    <span className="text-xs text-gray-500">{svc.latencyMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* Section 3: Circuit Breakers */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-indigo-400" />
          Circuit Breakers
        </h2>

        {breakersLoading ? (
          <div className="text-gray-500 text-sm">Loading circuit breakers...</div>
        ) : breakers ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Service</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Status</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Failure Count</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Threshold</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Last Failure</th>
                </tr>
              </thead>
              <tbody>
                {breakers.map(cb => (
                  <tr key={cb.service} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-sm text-white">{cb.service}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusDot status={cb.status} />
                        <span className={`text-xs font-medium ${
                          cb.status === 'CLOSED' ? 'text-emerald-400' :
                          cb.status === 'OPEN' ? 'text-red-400' : 'text-amber-400'
                        }`}>{cb.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{cb.failureCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{cb.threshold}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{cb.lastFailure || 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* Section 4: Degradation Modes */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-400" />
          Degradation Modes
        </h2>

        {degradationLoading ? (
          <div className="text-gray-500 text-sm">Loading degradation modes...</div>
        ) : degradation ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Service</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Fallback</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Impact</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Automatic</th>
                </tr>
              </thead>
              <tbody>
                {degradation.map(dm => (
                  <tr key={dm.service} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-sm text-white font-medium">{dm.service}</td>
                    <td className="px-4 py-3 text-sm text-indigo-400">{dm.fallback}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{dm.impact}</td>
                    <td className="px-4 py-3">
                      {dm.automatic ? (
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
        ) : null}
      </div>

      {/* Section 5: Incident Log */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-indigo-400" />
            Incident Log
          </h2>
          <button
            onClick={() => setShowIncidentForm(!showIncidentForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Log Incident
          </button>
        </div>

        {showIncidentForm && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Severity</label>
                <select
                  value={incidentForm.severity}
                  onChange={e => setIncidentForm(f => ({ ...f, severity: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Title</label>
                <input
                  value={incidentForm.title}
                  onChange={e => setIncidentForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Incident title"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Affected Service</label>
                <input
                  value={incidentForm.affectedService}
                  onChange={e => setIncidentForm(f => ({ ...f, affectedService: e.target.value }))}
                  placeholder="e.g. PostgreSQL"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <textarea
                value={incidentForm.description}
                onChange={e => setIncidentForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe the incident..."
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowIncidentForm(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white">
                Cancel
              </button>
              <button onClick={submitIncident} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg">
                Submit
              </button>
            </div>
          </div>
        )}

        {incidentsLoading ? (
          <div className="text-gray-500 text-sm">Loading incidents...</div>
        ) : incidents && incidents.length > 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">ID</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Severity</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Title</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Affected Service</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Status</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Created</th>
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Resolved</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map(inc => (
                  <tr key={inc.incidentId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{inc.incidentId}</td>
                    <td className="px-4 py-3"><SeverityBadge severity={inc.severity} /></td>
                    <td className="px-4 py-3 text-sm text-white">{inc.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{inc.affectedService}</td>
                    <td className="px-4 py-3"><StatusBadge status={inc.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(inc.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{inc.resolvedAt ? new Date(inc.resolvedAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No incidents recorded. All systems operational.</p>
          </div>
        )}
      </div>
    </div>
  )
}
