import { useState, useEffect } from 'react'
import { safeJson } from '../utils/api'
import {
  CreditCard, DollarSign, TrendingUp, Clock, ArrowRight,
  RefreshCw, Search, ChevronDown, AlertTriangle, CheckCircle, XCircle
} from 'lucide-react'

const API_BASE = '/api/financial/payments'

export default function PaymentProcessing() {
  const [stats, setStats] = useState(null)
  const [payments, setPayments] = useState([])
  const [methods, setMethods] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')

  const fetchData = async () => {
    setLoading(true)
    try {
      const [statsRes, paymentsRes, methodsRes] = await Promise.all([
        fetch(`${API_BASE}/stats`).then(r => safeJson(r)),
        fetch(`${API_BASE}`).then(r => safeJson(r)),
        fetch(`${API_BASE}/methods`).then(r => safeJson(r))
      ])
      if (statsRes.success) setStats(statsRes.data)
      if (paymentsRes.success) setPayments(paymentsRes.data)
      if (methodsRes.success) setMethods(methodsRes.data)
    } catch (e) {
      console.error('Failed to load payment data:', e)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // ── Status colors ──────────────────────────────────────────────────────
  const statusColor = (s) => ({
    RELEASED: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    CAPTURED: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    HELD: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    PENDING: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
    REFUNDED: 'text-red-400 bg-red-400/10 border-red-400/20',
    CHARGEDBACK: 'text-red-500 bg-red-500/10 border-red-500/20'
  }[s] || 'text-gray-400 bg-gray-400/10 border-gray-400/20')

  const methodColor = (m) => ({
    CARD: 'text-indigo-400 bg-indigo-400/10',
    BANK_TRANSFER: 'text-cyan-400 bg-cyan-400/10',
    DIGITAL_WALLET: 'text-violet-400 bg-violet-400/10',
    CRYPTO: 'text-orange-400 bg-orange-400/10'
  }[m] || 'text-gray-400 bg-gray-400/10')

  // ── Filtering & sorting ────────────────────────────────────────────────
  const filtered = payments
    .filter(p => !statusFilter || p.status === statusFilter)
    .filter(p => !methodFilter || p.method === methodFilter)
    .filter(p => !searchQuery || p.paymentId?.toLowerCase().includes(searchQuery.toLowerCase()) || p.orderId?.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      let va = a[sortField], vb = b[sortField]
      if (sortField === 'amount') { va = +va; vb = +vb }
      if (sortField === 'createdAt') { va = new Date(va); vb = new Date(vb) }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  const toggleSort = (field) => {
    if (sortField === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc') }
    else { setSortField(field); setSortDir('desc') }
  }

  // ── Pipeline counts ────────────────────────────────────────────────────
  const pipelineCounts = stats?.byStatus || {}

  const fmt = (n) => {
    if (n == null) return '...'
    if (typeof n === 'number' && n >= 1000) return `$${(n / 1000).toFixed(1)}k`
    return typeof n === 'number' ? n.toLocaleString() : n
  }

  const fmtCurrency = (n) => {
    if (n == null) return '...'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            Payment Processing
          </h1>
          <p className="text-gray-400 mt-1">End-to-end payment lifecycle management</p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-2 px-3 py-2 bg-[#1a1f2e] border border-gray-700 rounded-lg text-gray-300 hover:text-white hover:border-gray-500 transition-colors text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Payments', value: stats?.totalPayments, icon: CreditCard, color: 'text-blue-400', iconBg: 'text-blue-400' },
          { label: 'Total Volume', value: stats ? fmtCurrency(stats.totalVolume) : '...', icon: DollarSign, color: 'text-emerald-400', iconBg: 'text-emerald-400' },
          { label: 'Success Rate', value: stats ? `${stats.successRate}%` : '...', icon: CheckCircle, color: 'text-green-400', iconBg: 'text-green-400' },
          { label: 'Avg Amount', value: stats ? fmtCurrency(stats.avgAmount) : '...', icon: TrendingUp, color: 'text-purple-400', iconBg: 'text-purple-400' },
          { label: 'Pending Count', value: stats?.pendingCount, icon: Clock, color: 'text-amber-400', iconBg: 'text-amber-400' },
          { label: 'Refund Rate', value: stats ? `${stats.refundRate}%` : '...', icon: AlertTriangle, color: 'text-red-400', iconBg: 'text-red-400' }
        ].map((s, i) => (
          <div key={i} className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`w-4 h-4 ${s.iconBg}`} />
              <span className="text-xs text-gray-400">{s.label}</span>
            </div>
            <div className={`text-xl font-bold ${s.color}`}>
              {typeof s.value === 'number' ? fmt(s.value) : (s.value ?? '...')}
            </div>
          </div>
        ))}
      </div>

      {/* Payment Pipeline Visualization */}
      <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Payment Pipeline</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Main flow */}
          {[
            { label: 'Initiated', status: 'PENDING', color: 'gray' },
            { label: 'Captured', status: 'CAPTURED', color: 'blue' },
            { label: 'Held in Escrow', status: 'HELD', color: 'amber' },
            { label: 'Released to Seller', status: 'RELEASED', color: 'emerald' }
          ].map((stage, i) => (
            <div key={stage.status} className="flex items-center gap-2">
              <div className={`px-4 py-3 rounded-lg border bg-${stage.color}-500/5 border-${stage.color}-500/20 text-center min-w-[120px]`}
                   style={{
                     backgroundColor: { gray: 'rgba(156,163,175,0.05)', blue: 'rgba(59,130,246,0.05)', amber: 'rgba(245,158,11,0.05)', emerald: 'rgba(16,185,129,0.05)' }[stage.color],
                     borderColor: { gray: 'rgba(156,163,175,0.2)', blue: 'rgba(59,130,246,0.2)', amber: 'rgba(245,158,11,0.2)', emerald: 'rgba(16,185,129,0.2)' }[stage.color]
                   }}>
                <div className="text-xs text-gray-400">{stage.label}</div>
                <div className={`text-lg font-bold`}
                     style={{ color: { gray: '#9ca3af', blue: '#60a5fa', amber: '#fbbf24', emerald: '#34d399' }[stage.color] }}>
                  {pipelineCounts[stage.status] || 0}
                </div>
              </div>
              {i < 3 && <ArrowRight className="w-4 h-4 text-gray-600 flex-shrink-0" />}
            </div>
          ))}

          {/* Branches */}
          <div className="ml-4 flex items-center gap-3 border-l border-gray-700 pl-4">
            {[
              { label: 'Refunded', status: 'REFUNDED', color: '#f87171' },
              { label: 'Chargedback', status: 'CHARGEDBACK', color: '#ef4444' }
            ].map((branch) => (
              <div key={branch.status} className="px-3 py-2 rounded-lg border text-center min-w-[100px]"
                   style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
                <div className="text-xs text-gray-400">{branch.label}</div>
                <div className="text-lg font-bold" style={{ color: branch.color }}>
                  {pipelineCounts[branch.status] || 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold text-white">Payments</h3>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-[#0f1219] border border-gray-700 rounded-lg text-sm text-gray-300 w-48 focus:outline-none focus:border-gray-500"
              />
            </div>
            {/* Status filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 bg-[#0f1219] border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-gray-500"
              >
                <option value="">All Statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {/* Method filter */}
            <div className="relative">
              <select
                value={methodFilter}
                onChange={e => setMethodFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 bg-[#0f1219] border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-gray-500"
              >
                <option value="">All Methods</option>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="overflow-auto max-h-[500px]">
          <table className="w-full">
            <thead className="sticky top-0 bg-[#151926]">
              <tr className="text-xs text-gray-500 uppercase tracking-wider">
                {[
                  { key: 'paymentId', label: 'Payment ID' },
                  { key: 'orderId', label: 'Order ID' },
                  { key: 'sellerId', label: 'Seller' },
                  { key: 'amount', label: 'Amount' },
                  { key: 'currency', label: 'Currency' },
                  { key: 'method', label: 'Method' },
                  { key: 'status', label: 'Status' },
                  { key: 'gateway', label: 'Gateway' },
                  { key: 'createdAt', label: 'Date' }
                ].map(col => (
                  <th key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="px-4 py-3 text-left cursor-pointer hover:text-gray-300 transition-colors select-none">
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sortField === col.key && <span className="text-blue-400">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    {loading ? 'Loading payments...' : 'No payments found'}
                  </td>
                </tr>
              )}
              {filtered.map(p => (
                <tr key={p.paymentId} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-gray-300">{p.paymentId}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-400">{p.orderId}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{p.sellerId}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-white">${(+p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{p.currency}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${methodColor(p.method)}`}>
                      {p.method}{p.methodDetail ? ` (${p.methodDetail})` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{p.gateway}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Method Distribution */}
      {methods && (
        <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Payment Method Distribution</h3>
          <div className="space-y-3">
            {Object.entries(methods).sort((a, b) => b[1] - a[1]).map(([method, pct]) => (
              <div key={method} className="flex items-center gap-3">
                <div className="w-32 text-sm text-gray-300">{method.replace('_', ' ')}</div>
                <div className="flex-1 h-6 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: {
                        CARD: '#818cf8',
                        BANK_TRANSFER: '#22d3ee',
                        DIGITAL_WALLET: '#a78bfa',
                        CRYPTO: '#fb923c'
                      }[method] || '#6b7280'
                    }}
                  />
                </div>
                <div className="w-14 text-sm text-gray-400 text-right">{pct}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const STATUSES = ['PENDING', 'CAPTURED', 'HELD', 'RELEASED', 'REFUNDED', 'CHARGEDBACK']
const PAYMENT_METHODS = ['CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'CRYPTO']
