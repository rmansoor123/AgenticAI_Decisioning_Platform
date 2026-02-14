import { useState, useEffect } from 'react'
import { RotateCcw, AlertTriangle, DollarSign, XCircle } from 'lucide-react'

const API_BASE = 'http://localhost:3005/api'

export default function Returns() {
  const [stats, setStats] = useState(null)
  const [records, setRecords] = useState([])

  useEffect(() => {
    fetch(`${API_BASE}/returns/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {})
    fetch(`${API_BASE}/returns?limit=20`).then(r => r.json()).then(d => d.success && setRecords(d.data)).catch(() => {})
  }, [])

  const statusColor = (s) => ({
    REQUESTED: 'text-yellow-400 bg-yellow-400/10',
    APPROVED: 'text-blue-400 bg-blue-400/10',
    RECEIVED: 'text-cyan-400 bg-cyan-400/10',
    REFUNDED: 'text-emerald-400 bg-emerald-400/10',
    REJECTED: 'text-red-400 bg-red-400/10',
    UNDER_REVIEW: 'text-orange-400 bg-orange-400/10'
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
          <div className="p-2 bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl">
            <RotateCcw className="w-6 h-6 text-white" />
          </div>
          Returns
        </h1>
        <p className="text-gray-400 mt-1">Return/refund processing, abuse detection</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <RotateCcw className="w-4 h-4 text-pink-400" />
              <span className="text-sm text-gray-400">Total Returns</span>
            </div>
            <div className="text-2xl font-bold text-white">{stats.total || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-pink-400" />
              <span className="text-sm text-gray-400">Total Refunds</span>
            </div>
            <div className="text-2xl font-bold text-pink-400">${stats.totalRefunds?.toLocaleString() || '0'}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-sm text-gray-400">Rejected</span>
            </div>
            <div className="text-2xl font-bold text-red-400">{stats.byStatus?.REJECTED || 0}</div>
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
          <h3 className="font-semibold text-white">Recent Returns</h3>
        </div>
        <div className="overflow-auto max-h-[500px]">
          <table className="w-full">
            <thead className="bg-[#141824] sticky top-0">
              <tr className="text-xs text-gray-500">
                <th className="px-4 py-3 text-left">Return ID</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-left">Purchase</th>
                <th className="px-4 py-3 text-left">Refund</th>
                <th className="px-4 py-3 text-left">Paid By</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Risk</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.returnId || i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-pink-400">{r.returnId}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {r.reason?.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">${r.purchaseAmount?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">${r.refundAmount?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{r.refundMethod}</td>
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
                    No return records found
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
