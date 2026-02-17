import { useState, useEffect } from 'react'
import { DollarSign, AlertTriangle, TrendingUp, Tag } from 'lucide-react'

const API_BASE = '/api'

export default function Pricing() {
  const [stats, setStats] = useState(null)
  const [records, setRecords] = useState([])

  useEffect(() => {
    fetch(`${API_BASE}/pricing/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {})
    fetch(`${API_BASE}/pricing?limit=20`).then(r => r.json()).then(d => d.success && setRecords(d.data)).catch(() => {})
  }, [])

  const statusColor = (s) => ({
    ACTIVE: 'text-emerald-400 bg-emerald-400/10',
    PENDING_REVIEW: 'text-yellow-400 bg-yellow-400/10',
    ADJUSTED: 'text-blue-400 bg-blue-400/10',
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl">
            <DollarSign className="w-6 h-6 text-white" />
          </div>
          Pricing
        </h1>
        <p className="text-gray-400 mt-1">Price changes, promotions, dynamic pricing monitoring</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-gray-400">Total Records</span>
            </div>
            <div className="text-2xl font-bold text-white">{stats.total || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-gray-400">Avg Price</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400">${stats.avgPrice?.toFixed(2) || '0.00'}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-gray-400">Dynamic</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400">{stats.byChangeType?.DYNAMIC || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm text-gray-400">Flagged</span>
            </div>
            <div className="text-2xl font-bold text-red-400">{stats.flagged || 0}</div>
          </div>
        </div>
      )}

      {/* Records Table */}
      <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="font-semibold text-white">Recent Pricing Records</h3>
        </div>
        <div className="overflow-auto max-h-[500px]">
          <table className="w-full">
            <thead className="bg-[#141824] sticky top-0">
              <tr className="text-xs text-gray-500">
                <th className="px-4 py-3 text-left">Pricing ID</th>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Price</th>
                <th className="px-4 py-3 text-left">Previous</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Risk</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.pricingId || i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-emerald-400">{r.pricingId}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-white">{r.productName}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">${r.newPrice?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">${r.previousPrice?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{r.changeType}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${statusColor(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${riskColor(r.riskScore)}`}>
                      {r.riskScore}
                    </span>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">
                    No pricing records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
