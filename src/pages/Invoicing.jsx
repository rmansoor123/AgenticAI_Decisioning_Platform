import { useState, useEffect, useCallback } from 'react'
import { FileText, DollarSign, AlertTriangle, Clock, CheckCircle, Send, Edit3, ChevronDown, ChevronRight, Search, Filter, RefreshCw } from 'lucide-react'

const API_BASE = '/api'

export default function Invoicing() {
  const [stats, setStats] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)
  const [expandedDetail, setExpandedDetail] = useState(null)
  const [sortField, setSortField] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')

  const fetchData = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)

    Promise.all([
      fetch(`${API_BASE}/financial/invoices/stats`).then(r => r.json()),
      fetch(`${API_BASE}/financial/invoices?${params}`).then(r => r.json())
    ]).then(([statsRes, invoicesRes]) => {
      if (statsRes.success) setStats(statsRes.data)
      if (invoicesRes.success) setInvoices(invoicesRes.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [statusFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerateResult(null)
    try {
      const res = await fetch(`${API_BASE}/financial/invoices/generate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setGenerateResult({ count: data.data.generated, message: data.data.message })
        fetchData()
      }
    } catch { /* ignore */ }
    setGenerating(false)
  }

  const handleExpandRow = async (invoiceId) => {
    if (expandedRow === invoiceId) {
      setExpandedRow(null)
      setExpandedDetail(null)
      return
    }
    setExpandedRow(invoiceId)
    try {
      const res = await fetch(`${API_BASE}/financial/invoices/${invoiceId}/pdf`)
      const data = await res.json()
      if (data.success) setExpandedDetail(data.data)
    } catch { setExpandedDetail(null) }
  }

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const filtered = invoices.filter(inv => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      if (!inv.invoiceId?.toLowerCase().includes(term) && !inv.sellerName?.toLowerCase().includes(term) && !inv.sellerId?.toLowerCase().includes(term)) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortField], bv = b[sortField]
    if (typeof av === 'string' && av.match(/^\d{4}-/)) { av = new Date(av); bv = new Date(bv) }
    if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av
    if (av instanceof Date) return sortDir === 'asc' ? av - bv : bv - av
    return sortDir === 'asc' ? String(av || '').localeCompare(String(bv || '')) : String(bv || '').localeCompare(String(av || ''))
  })

  const overdueInvoices = invoices.filter(inv => inv.status === 'OVERDUE')
  const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0)

  const statusBadge = (status) => {
    const styles = {
      PAID: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
      SENT: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
      OVERDUE: 'text-red-400 bg-red-400/10 border-red-400/20',
      DRAFT: 'text-gray-400 bg-gray-400/10 border-gray-400/20'
    }
    return `px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.DRAFT}`
  }

  const statusIcon = (status) => {
    const icons = { PAID: CheckCircle, SENT: Send, OVERDUE: AlertTriangle, DRAFT: Edit3 }
    const Icon = icons[status] || Edit3
    return <Icon className="w-3 h-3" />
  }

  const formatCurrency = (val) => `$${(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'
  const formatPeriod = (s, e) => {
    if (!s || !e) return '-'
    const start = new Date(s)
    const end = new Date(e)
    return `${start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
  }

  const SortHeader = ({ field, children }) => (
    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none" onClick={() => handleSort(field)}>
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && <span className="text-emerald-400">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
      </div>
    </th>
  )

  return (
    <div className="space-y-6">
      {/* Overdue Alert Banner */}
      {overdueInvoices.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <span className="text-red-400 font-semibold">{overdueInvoices.length} Overdue Invoice{overdueInvoices.length > 1 ? 's' : ''}</span>
            <span className="text-red-300 ml-2">totaling {formatCurrency(overdueTotal)}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl">
              <FileText className="w-6 h-6 text-white" />
            </div>
            Invoicing
          </h1>
          <p className="text-gray-400 mt-1">Automated invoice generation and payment tracking</p>
        </div>
        <div className="flex items-center gap-3">
          {generateResult && (
            <span className="text-emerald-400 text-sm">{generateResult.message}</span>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Generate Invoices'}
          </button>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-indigo-400" />
              <span className="text-sm text-gray-400">Total Invoiced</span>
            </div>
            <div className="text-2xl font-bold text-white">{formatCurrency(stats.totalInvoiced)}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-gray-400">Total Paid</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400">{formatCurrency(stats.paidAmount)}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm text-gray-400">Overdue Amount</span>
            </div>
            <div className="text-2xl font-bold text-red-400">{formatCurrency(stats.overdueAmount)}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-gray-400">Average Invoice</span>
            </div>
            <div className="text-2xl font-bold text-blue-400">{formatCurrency(stats.averageInvoice)}</div>
          </div>
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-gray-400">Invoices Count</span>
            </div>
            <div className="text-2xl font-bold text-purple-400">{stats.invoiceCount}</div>
          </div>
        </div>
      )}

      {/* Status Overview */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { status: 'DRAFT', color: 'gray', icon: Edit3 },
            { status: 'SENT', color: 'blue', icon: Send },
            { status: 'PAID', color: 'emerald', icon: CheckCircle },
            { status: 'OVERDUE', color: 'red', icon: AlertTriangle }
          ].map(({ status, color, icon: Icon }) => (
            <div key={status} className={`bg-[#1a1f2e] rounded-xl border border-${color}-500/20 p-3 flex items-center gap-3`}>
              <div className={`p-2 bg-${color}-400/10 rounded-lg`}>
                <Icon className={`w-4 h-4 text-${color}-400`} />
              </div>
              <div>
                <div className={`text-lg font-bold text-${color}-400`}>{stats.byStatus?.[status] || 0}</div>
                <div className="text-xs text-gray-500">{status}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by invoice ID or seller..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#1a1f2e] border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-[#1a1f2e] border border-gray-700 rounded-lg text-white text-sm px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="font-semibold text-white">Invoices</h3>
          <p className="text-xs text-gray-500 mt-0.5">{sorted.length} invoice{sorted.length !== 1 ? 's' : ''} found</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-4 py-3 w-8"></th>
                <SortHeader field="invoiceId">Invoice ID</SortHeader>
                <SortHeader field="sellerName">Seller</SortHeader>
                <SortHeader field="periodStart">Period</SortHeader>
                <SortHeader field="subtotal">Subtotal</SortHeader>
                <SortHeader field="tax">Tax</SortHeader>
                <SortHeader field="total">Total</SortHeader>
                <SortHeader field="status">Status</SortHeader>
                <SortHeader field="dueDate">Due Date</SortHeader>
                <SortHeader field="paidAt">Paid Date</SortHeader>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">Loading invoices...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No invoices found</td></tr>
              ) : sorted.map(inv => (
                <>
                  <tr
                    key={inv.invoiceId}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors"
                    onClick={() => handleExpandRow(inv.invoiceId)}
                  >
                    <td className="px-4 py-3">
                      {expandedRow === inv.invoiceId ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-indigo-400">{inv.invoiceId}</td>
                    <td className="px-4 py-3 text-sm text-white">
                      <div>{inv.sellerName}</div>
                      <div className="text-xs text-gray-500">{inv.sellerId}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{formatPeriod(inv.periodStart, inv.periodEnd)}</td>
                    <td className="px-4 py-3 text-sm text-gray-300 font-mono">{formatCurrency(inv.subtotal)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{formatCurrency(inv.tax)}</td>
                    <td className="px-4 py-3 text-sm text-white font-mono font-semibold">{formatCurrency(inv.total)}</td>
                    <td className="px-4 py-3">
                      <span className={statusBadge(inv.status)}>
                        <span className="flex items-center gap-1">{statusIcon(inv.status)} {inv.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{formatDate(inv.dueDate)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{formatDate(inv.paidAt)}</td>
                  </tr>
                  {expandedRow === inv.invoiceId && (
                    <tr key={`${inv.invoiceId}-detail`} className="bg-gray-900/50">
                      <td colSpan={10} className="px-6 py-4">
                        {expandedDetail ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <div className="text-gray-500 text-xs mb-1">Company</div>
                                <div className="text-white font-medium">{expandedDetail.companyHeader?.name}</div>
                                <div className="text-gray-400 text-xs">{expandedDetail.companyHeader?.address}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 text-xs mb-1">Seller</div>
                                <div className="text-white font-medium">{expandedDetail.sellerAddress?.name}</div>
                                <div className="text-gray-400 text-xs">{expandedDetail.sellerAddress?.address}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 text-xs mb-1">Payment Terms</div>
                                <div className="text-white">{expandedDetail.paymentTerms}</div>
                                <div className="text-gray-400 text-xs">Due: {formatDate(expandedDetail.dueDate)}</div>
                              </div>
                            </div>

                            {/* Line Items Table */}
                            <div className="border border-gray-700 rounded-lg overflow-hidden">
                              <table className="w-full">
                                <thead>
                                  <tr className="bg-gray-800/50">
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Description</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-400">Qty</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-400">Unit Price</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-400">Amount</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Fee Type</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedDetail.lineItems?.map((li, i) => (
                                    <tr key={i} className="border-t border-gray-700/50">
                                      <td className="px-4 py-2 text-sm text-white">{li.description}</td>
                                      <td className="px-4 py-2 text-sm text-gray-300 text-right font-mono">{li.quantity}</td>
                                      <td className="px-4 py-2 text-sm text-gray-300 text-right font-mono">{formatCurrency(li.unitPrice)}</td>
                                      <td className={`px-4 py-2 text-sm text-right font-mono ${li.amount < 0 ? 'text-red-400' : 'text-white'}`}>{formatCurrency(li.amount)}</td>
                                      <td className="px-4 py-2 text-xs text-gray-500 font-mono">{li.feeType}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-gray-600">
                                    <td colSpan={3} className="px-4 py-2 text-sm text-gray-400 text-right">Subtotal</td>
                                    <td className="px-4 py-2 text-sm text-white text-right font-mono">{formatCurrency(expandedDetail.subtotal)}</td>
                                    <td></td>
                                  </tr>
                                  <tr>
                                    <td colSpan={3} className="px-4 py-1 text-sm text-gray-400 text-right">Tax (8.5%)</td>
                                    <td className="px-4 py-1 text-sm text-gray-300 text-right font-mono">{formatCurrency(expandedDetail.tax)}</td>
                                    <td></td>
                                  </tr>
                                  <tr className="border-t border-gray-600">
                                    <td colSpan={3} className="px-4 py-2 text-sm text-white font-semibold text-right">Total</td>
                                    <td className="px-4 py-2 text-sm text-white font-bold text-right font-mono">{formatCurrency(expandedDetail.total)}</td>
                                    <td></td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>

                            {/* Invoice Metadata */}
                            <div className="flex items-center gap-6 text-xs text-gray-500">
                              <span>Currency: {expandedDetail.currency}</span>
                              <span>Issue Date: {formatDate(expandedDetail.issueDate)}</span>
                              <span>Period: {formatDate(expandedDetail.period?.start)} - {formatDate(expandedDetail.period?.end)}</span>
                              {expandedDetail.paidAt && <span className="text-emerald-400">Paid: {formatDate(expandedDetail.paidAt)}</span>}
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-500 text-sm">Loading details...</div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
