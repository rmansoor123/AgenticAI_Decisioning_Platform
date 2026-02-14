import { useState, useEffect } from 'react'
import { Truck, AlertTriangle, MapPin, Package } from 'lucide-react'

const API_BASE = 'http://localhost:3005/api'

export default function Shipments() {
  const [stats, setStats] = useState(null)
  const [records, setRecords] = useState([])

  useEffect(() => {
    fetch(`${API_BASE}/shipments/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {})
    fetch(`${API_BASE}/shipments?limit=20`).then(r => r.json()).then(d => d.success && setRecords(d.data)).catch(() => {})
  }, [])

  const statusColor = (s) => ({
    LABEL_CREATED: 'text-gray-400 bg-gray-400/10',
    PICKED_UP: 'text-blue-400 bg-blue-400/10',
    IN_TRANSIT: 'text-yellow-400 bg-yellow-400/10',
    DELIVERED: 'text-emerald-400 bg-emerald-400/10',
    FAILED: 'text-red-400 bg-red-400/10',
    RETURNED_TO_SENDER: 'text-orange-400 bg-orange-400/10'
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
          <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl">
            <Truck className="w-6 h-6 text-white" />
          </div>
          Shipments
        </h1>
        <p className="text-gray-400 mt-1">Outbound shipment creation, label generation, tracking</p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-gray-400">Total Shipments</span>
            </div>
            <div className="text-2xl font-bold text-white">{stats.total || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-gray-400">Delivered</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400">{stats.byStatus?.DELIVERED || 0}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-gray-400">In Transit</span>
            </div>
            <div className="text-2xl font-bold text-yellow-400">{stats.byStatus?.IN_TRANSIT || 0}</div>
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
          <h3 className="font-semibold text-white">Recent Shipments</h3>
        </div>
        <div className="overflow-auto max-h-[500px]">
          <table className="w-full">
            <thead className="bg-[#141824] sticky top-0">
              <tr className="text-xs text-gray-500">
                <th className="px-4 py-3 text-left">Shipment ID</th>
                <th className="px-4 py-3 text-left">Carrier</th>
                <th className="px-4 py-3 text-left">Destination</th>
                <th className="px-4 py-3 text-left">Value</th>
                <th className="px-4 py-3 text-left">Insured</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Risk</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={r.shipmentId || i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-blue-400">{r.shipmentId}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">{r.carrier}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{r.destination?.country || 'N/A'}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">${r.declaredValue?.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={r.insured ? 'text-xs text-emerald-400' : 'text-xs text-gray-500'}>
                      {r.insured ? 'Yes' : 'No'}
                    </span>
                  </td>
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
                    No shipment records found
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
