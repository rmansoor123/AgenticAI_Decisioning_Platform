import { useState, useEffect } from 'react'
import { ShieldAlert, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

const API_BASE = '/api'

export default function ATO() {
  const [stats, setStats] = useState(null)
  const [records, setRecords] = useState([])

  useEffect(() => {
    fetch(`${API_BASE}/ato/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {})
    fetch(`${API_BASE}/ato?limit=20`).then(r => r.json()).then(d => d.success && setRecords(d.data)).catch(() => {})
  }, [])

  const statusColor = (s) => ({
    RESOLVED: 'text-emerald-400 bg-emerald-400/10',
    ACTIVE: 'text-red-400 bg-red-400/10',
    INVESTIGATING: 'text-yellow-400 bg-yellow-400/10',
    MONITORING: 'text-blue-400 bg-blue-400/10',
    BLOCKED: 'text-red-400 bg-red-400/10'
  }[s] || 'text-gray-400 bg-gray-400/10')

  const riskColor = (score) => {
    if (score >= 80) return 'text-red-400'
    if (score >= 60) return 'text-orange-400'
    if (score >= 40) return 'text-yellow-400'
    return 'text-emerald-400'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-red-500 to-red-600 rounded-xl">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          Account Takeover (ATO)
        </h1>
        <p className="text-gray-400 mt-1">Detect and prevent account takeover attempts</p>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span className="text-sm text-gray-400">Total Events</span>
            </div>
            <div className="text-2xl font-bold text-white">{stats.total || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-gray-400">Resolved</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400">{stats.byStatus?.RESOLVED || stats.resolved || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-gray-400">Investigating</span>
            </div>
            <div className="text-2xl font-bold text-yellow-400">{stats.byStatus?.INVESTIGATING || stats.investigating || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm text-gray-400">Active Threats</span>
            </div>
            <div className="text-2xl font-bold text-red-400">{stats.byStatus?.ACTIVE || stats.active || 0}</div>
          </div>
        </div>
      )}

      <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="font-semibold text-white">Recent ATO Events</h3>
        </div>
        <div className="overflow-auto max-h-[500px]">
          <table className="w-full">
            <thead className="bg-[#141824] sticky top-0">
              <tr className="text-xs text-gray-500">
                <th className="px-4 py-3 text-left">Event ID</th>
                <th className="px-4 py-3 text-left">Seller</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">IP / Device</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Risk</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.eventId || r.atoId || i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-red-400">{r.eventId || r.atoId}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">{r.sellerId}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{(r.eventType || r.type || '-').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">{r.ipAddress || r.deviceFingerprint || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${statusColor(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${riskColor(r.riskScore || 0)}`}>{r.riskScore || 0}</span>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">No ATO events found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
