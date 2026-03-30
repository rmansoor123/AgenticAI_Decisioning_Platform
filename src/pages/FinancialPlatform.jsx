import { useState, useEffect } from 'react'
import {
  DollarSign, CreditCard, ArrowUpDown, TrendingUp, BookOpen, FileText,
  ChevronDown, ChevronRight, Search, CheckCircle, XCircle, AlertTriangle,
  Loader2, BarChart3, Clock, Shield
} from 'lucide-react'
import { safeJson } from '../utils/api'

const API = '/api/financial-platform'

function StatCard({ label, value, sub, icon: Icon, color = 'text-blue-400' }) {
  return (
    <div className="bg-[#12121a] border border-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className={`w-4 h-4 ${color}`} />}
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

function Badge({ children, color = 'gray' }) {
  const colors = {
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
    red: 'bg-red-500/20 text-red-400 border-red-500/30',
    amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    gray: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${colors[color] || colors.gray}`}>
      {children}
    </span>
  )
}

function CollapsibleSection({ title, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#12121a] hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <span className="text-sm font-medium text-white">{title}</span>
          {count != null && <Badge color="blue">{count} rules</Badge>}
        </div>
      </button>
      {open && <div className="p-4 border-t border-gray-800">{children}</div>}
    </div>
  )
}

function RulesTable({ rules }) {
  if (!rules || rules.length === 0) return <p className="text-sm text-gray-500">No rules found.</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-500 border-b border-gray-800">
          <th className="pb-2 pr-4">ID</th>
          <th className="pb-2 pr-4">Name</th>
          <th className="pb-2 pr-4">Condition</th>
          <th className="pb-2">Action / Priority</th>
        </tr>
      </thead>
      <tbody>
        {rules.map((r, i) => (
          <tr key={r.id || i} className="border-b border-gray-800/50">
            <td className="py-2 pr-4 text-gray-400 font-mono text-xs">{r.id}</td>
            <td className="py-2 pr-4 text-white">{r.name}</td>
            <td className="py-2 pr-4 text-gray-400">{r.condition}</td>
            <td className="py-2">
              <span className="text-gray-300">{r.action || r.priority}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---- Tab: Overview ----
function OverviewTab() {
  const [stats, setStats] = useState(null)
  const [rules, setRules] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [statsRes, rulesRes] = await Promise.all([
          fetch(`${API}/stats`),
          fetch(`${API}/rules`)
        ])
        const statsData = await safeJson(statsRes)
        const rulesData = await safeJson(rulesRes)
        setStats(statsData.data || statsData)
        setRules(rulesData.data || rulesData)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="flex items-center gap-2 text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading overview...</div>
  if (error) return <div className="text-red-400 text-sm">Error: {error}</div>

  const s = stats || {}

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Underwriting" value={s.underwriting?.evaluated ?? 0} sub={`${s.underwriting?.approved ?? 0} approved / ${s.underwriting?.denied ?? 0} denied`} icon={CreditCard} color="text-blue-400" />
        <StatCard label="Credit Lines" value={s.creditLines?.adjustments ?? 0} sub={`${s.creditLines?.increases ?? 0} up / ${s.creditLines?.decreases ?? 0} down`} icon={ArrowUpDown} color="text-purple-400" />
        <StatCard label="Payouts" value={s.payouts?.evaluated ?? 0} sub={`${s.payouts?.released ?? 0} released / ${s.payouts?.held ?? 0} held`} icon={DollarSign} color="text-green-400" />
        <StatCard label="Forecasts" value={s.forecasts?.count ?? 0} sub="generated" icon={TrendingUp} color="text-cyan-400" />
        <StatCard label="Loans" value={s.loans?.processed ?? 0} sub={`${s.loans?.onTime ?? 0} on-time / ${s.loans?.late ?? 0} late / ${s.loans?.defaults ?? 0} defaults`} icon={FileText} color="text-amber-400" />
        <StatCard label="Ledger" value={s.ledger?.totalEntries ?? 0} sub={`Net flow: $${(s.ledger?.netFlow ?? 0).toLocaleString()}`} icon={BookOpen} color="text-emerald-400" />
      </div>

      {/* Policy Rules */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Policy Rules</h3>
        <div className="space-y-3">
          <CollapsibleSection title="Credit Underwriting" count={rules?.creditUnderwriting?.length} defaultOpen>
            <RulesTable rules={rules?.creditUnderwriting} />
          </CollapsibleSection>
          <CollapsibleSection title="Payout Hold" count={rules?.payoutHold?.length}>
            <RulesTable rules={rules?.payoutHold} />
          </CollapsibleSection>
          <CollapsibleSection title="Credit Tiering" count={rules?.creditTiering?.length}>
            <RulesTable rules={rules?.creditTiering} />
          </CollapsibleSection>
        </div>
      </div>
    </div>
  )
}

// ---- Tab: Underwriting ----
function UnderwritingTab() {
  const [form, setForm] = useState({
    sellerId: '',
    riskScore: 50,
    thirtyDayGmv: 10000,
    fraudIncidentRate: 0.02,
    accountAgeDays: 90,
    sellerTier: 'Silver'
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API}/underwrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await safeJson(res)
      setResult(data.data || data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Underwrite a Seller</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Seller ID</label>
            <input type="text" className={inputClass} value={form.sellerId} onChange={e => setForm({ ...form, sellerId: e.target.value })} placeholder="SLR-..." required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Risk Score (0-100)</label>
              <input type="number" min={0} max={100} className={inputClass} value={form.riskScore} onChange={e => setForm({ ...form, riskScore: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">30-day GMV ($)</label>
              <input type="number" min={0} className={inputClass} value={form.thirtyDayGmv} onChange={e => setForm({ ...form, thirtyDayGmv: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Fraud Incident Rate (0-1)</label>
              <input type="number" min={0} max={1} step={0.01} className={inputClass} value={form.fraudIncidentRate} onChange={e => setForm({ ...form, fraudIncidentRate: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Account Age (days)</label>
              <input type="number" min={0} className={inputClass} value={form.accountAgeDays} onChange={e => setForm({ ...form, accountAgeDays: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Seller Tier</label>
            <select className={inputClass} value={form.sellerTier} onChange={e => setForm({ ...form, sellerTier: e.target.value })}>
              {['New', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Enterprise'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50">
            {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Running...</span> : 'Run Underwriting'}
          </button>
        </form>
      </div>

      {/* Result */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Result</h3>
        {error && <div className="text-red-400 text-sm mb-4">Error: {error}</div>}
        {!result && !error && <p className="text-gray-500 text-sm">Submit a seller to see underwriting results.</p>}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge color={result.creditApproved ? 'green' : 'red'}>
                {result.creditApproved ? 'Credit Approved' : 'Credit Denied'}
              </Badge>
              {result.interestRateTier && <Badge color="purple">Tier {result.interestRateTier}</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Credit Limit</span>
                <p className="text-white font-semibold">${(result.creditLimit ?? 0).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-gray-400">Interest Rate</span>
                <p className="text-white font-semibold">{result.interestRate ?? 0}%</p>
              </div>
            </div>
            {result.reasoning && (
              <div>
                <span className="text-gray-400 text-xs">Reasoning</span>
                <p className="text-gray-300 text-sm mt-1">{result.reasoning}</p>
              </div>
            )}
            {result.factors && result.factors.length > 0 && (
              <div>
                <span className="text-gray-400 text-xs">Factors</span>
                <table className="w-full text-sm mt-2">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-800">
                      <th className="pb-2">Factor</th>
                      <th className="pb-2">Detail</th>
                      <th className="pb-2">Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.factors.map((f, i) => (
                      <tr key={i} className="border-b border-gray-800/50">
                        <td className="py-2 text-white">{f.name || f.factor}</td>
                        <td className="py-2 text-gray-400">{f.detail}</td>
                        <td className="py-2">
                          <Badge color={f.impact === 'positive' ? 'green' : f.impact === 'negative' ? 'red' : 'gray'}>
                            {f.impact}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Tab: Payouts ----
function PayoutsTab() {
  const [form, setForm] = useState({
    sellerId: '',
    payoutAmount: 5000,
    sellerTier: 'Silver',
    riskScore: 30,
    fraudHoldStatus: false,
    accountAgeDays: 120,
    sevenDayPayoutVelocity: 2,
    isFirstPayout: false
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API}/payout/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await safeJson(res)
      setResult(data.data || data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Payout Request</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Seller ID</label>
              <input type="text" className={inputClass} value={form.sellerId} onChange={e => setForm({ ...form, sellerId: e.target.value })} placeholder="SLR-..." required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Payout Amount ($)</label>
              <input type="number" min={0} className={inputClass} value={form.payoutAmount} onChange={e => setForm({ ...form, payoutAmount: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Seller Tier</label>
              <select className={inputClass} value={form.sellerTier} onChange={e => setForm({ ...form, sellerTier: e.target.value })}>
                {['New', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Enterprise'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Risk Score (0-100)</label>
              <input type="number" min={0} max={100} className={inputClass} value={form.riskScore} onChange={e => setForm({ ...form, riskScore: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Account Age (days)</label>
              <input type="number" min={0} className={inputClass} value={form.accountAgeDays} onChange={e => setForm({ ...form, accountAgeDays: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">7-day Payout Velocity</label>
              <input type="number" min={0} className={inputClass} value={form.sevenDayPayoutVelocity} onChange={e => setForm({ ...form, sevenDayPayoutVelocity: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.fraudHoldStatus} onChange={e => setForm({ ...form, fraudHoldStatus: e.target.checked })} className="rounded border-gray-600" />
              Fraud Hold Status
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.isFirstPayout} onChange={e => setForm({ ...form, isFirstPayout: e.target.checked })} className="rounded border-gray-600" />
              Is First Payout
            </label>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50">
            {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</span> : 'Submit Payout Request'}
          </button>
        </form>
      </div>

      {/* Result */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Result</h3>
        {error && <div className="text-red-400 text-sm mb-4">Error: {error}</div>}
        {!result && !error && <p className="text-gray-500 text-sm">Submit a payout request to see results.</p>}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge color={result.releaseApproved ? 'green' : 'red'}>
                {result.releaseApproved ? 'Release Approved' : 'Release Held'}
              </Badge>
            </div>
            {result.holdReason && (
              <div>
                <span className="text-gray-400 text-xs">Hold Reason</span>
                <p className="text-amber-400 text-sm mt-1">{result.holdReason}</p>
              </div>
            )}
            {result.estimatedReleaseDate && (
              <div>
                <span className="text-gray-400 text-xs">Estimated Release Date</span>
                <p className="text-white text-sm mt-1">{new Date(result.estimatedReleaseDate).toLocaleDateString()}</p>
              </div>
            )}
            {result.checks && result.checks.length > 0 && (
              <div>
                <span className="text-gray-400 text-xs">Checks</span>
                <table className="w-full text-sm mt-2">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-800">
                      <th className="pb-2">Check</th>
                      <th className="pb-2">Passed</th>
                      <th className="pb-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.checks.map((c, i) => (
                      <tr key={i} className="border-b border-gray-800/50">
                        <td className="py-2 text-white">{c.name || c.check}</td>
                        <td className="py-2">
                          {c.passed ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                        </td>
                        <td className="py-2 text-gray-400">{c.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Tab: Loans ----
function LoansTab() {
  const [form, setForm] = useState({
    loanId: '',
    sellerId: '',
    paymentAmount: 500,
    expectedAmount: 500,
    dueDate: new Date().toISOString().split('T')[0],
    outstandingBalance: 10000,
    totalLoanAmount: 25000,
    paymentsCompleted: 5,
    totalPayments: 24
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API}/loan/service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await safeJson(res)
      setResult(data.data || data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500'

  const paymentStatusColor = (status) => {
    if (!status) return 'gray'
    const s = status.toUpperCase()
    if (s === 'ON_TIME') return 'green'
    if (s === 'LATE') return 'amber'
    if (s === 'DEFAULT') return 'red'
    return 'gray'
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Form */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Loan Servicing</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Loan ID</label>
              <input type="text" className={inputClass} value={form.loanId} onChange={e => setForm({ ...form, loanId: e.target.value })} placeholder="LOAN-..." required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Seller ID</label>
              <input type="text" className={inputClass} value={form.sellerId} onChange={e => setForm({ ...form, sellerId: e.target.value })} placeholder="SLR-..." required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Payment Amount ($)</label>
              <input type="number" min={0} className={inputClass} value={form.paymentAmount} onChange={e => setForm({ ...form, paymentAmount: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Expected Amount ($)</label>
              <input type="number" min={0} className={inputClass} value={form.expectedAmount} onChange={e => setForm({ ...form, expectedAmount: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Due Date</label>
            <input type="date" className={inputClass} value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Outstanding Balance ($)</label>
              <input type="number" min={0} className={inputClass} value={form.outstandingBalance} onChange={e => setForm({ ...form, outstandingBalance: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Total Loan Amount ($)</label>
              <input type="number" min={0} className={inputClass} value={form.totalLoanAmount} onChange={e => setForm({ ...form, totalLoanAmount: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Payments Completed</label>
              <input type="number" min={0} className={inputClass} value={form.paymentsCompleted} onChange={e => setForm({ ...form, paymentsCompleted: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Total Payments</label>
              <input type="number" min={0} className={inputClass} value={form.totalPayments} onChange={e => setForm({ ...form, totalPayments: Number(e.target.value) })} />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50">
            {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Processing...</span> : 'Process Payment'}
          </button>
        </form>
      </div>

      {/* Result */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Result</h3>
        {error && <div className="text-red-400 text-sm mb-4">Error: {error}</div>}
        {!result && !error && <p className="text-gray-500 text-sm">Submit a loan payment to see servicing results.</p>}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              {result.loanStatus && <Badge color="blue">{result.loanStatus}</Badge>}
              {result.paymentStatus && <Badge color={paymentStatusColor(result.paymentStatus)}>{result.paymentStatus}</Badge>}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Days Past Due</span>
                <p className="text-white font-semibold">{result.daysPastDue ?? 0}</p>
              </div>
              <div>
                <span className="text-gray-400">Outstanding Balance</span>
                <p className="text-white font-semibold">${(result.outstandingBalance ?? 0).toLocaleString()}</p>
              </div>
            </div>

            {/* Default Risk Score */}
            {result.defaultRiskScore != null && (
              <div>
                <span className="text-gray-400 text-xs">Default Risk Score</span>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex-1 bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${result.defaultRiskScore >= 70 ? 'bg-red-500' : result.defaultRiskScore >= 40 ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${result.defaultRiskScore}%` }}
                    />
                  </div>
                  <span className="text-white text-sm font-mono">{result.defaultRiskScore}/100</span>
                </div>
              </div>
            )}

            {/* Next Action */}
            {result.nextAction && (
              <div className="bg-gray-800/50 rounded-lg p-3">
                <span className="text-gray-400 text-xs">Next Action</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-white text-sm font-medium">{result.nextAction.action}</span>
                  {result.nextAction.priority && <Badge color={result.nextAction.priority === 'HIGH' ? 'red' : result.nextAction.priority === 'MEDIUM' ? 'amber' : 'green'}>{result.nextAction.priority}</Badge>}
                </div>
                {result.nextAction.description && <p className="text-gray-400 text-sm mt-1">{result.nextAction.description}</p>}
              </div>
            )}

            {/* Late Fee / Early Discount */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              {result.lateFee != null && (
                <div>
                  <span className="text-gray-400">Late Fee</span>
                  <p className="text-red-400 font-semibold">${result.lateFee.toLocaleString()}</p>
                </div>
              )}
              {result.earlyPaymentDiscount != null && (
                <div>
                  <span className="text-gray-400">Early Payment Discount</span>
                  <p className="text-green-400 font-semibold">${result.earlyPaymentDiscount.toLocaleString()}</p>
                </div>
              )}
            </div>

            {/* Payment Progress */}
            {result.paymentsCompleted != null && result.totalPayments != null && (
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Payment Progress</span>
                  <span>{result.paymentsCompleted} / {result.totalPayments}</span>
                </div>
                <div className="bg-gray-700 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{ width: `${result.totalPayments > 0 ? (result.paymentsCompleted / result.totalPayments) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Seller Financial Profile ----
function SellerProfile() {
  const [sellerId, setSellerId] = useState('')
  const [profile, setProfile] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [loading, setLoading] = useState(false)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!sellerId.trim()) return
    setLoading(true)
    setError(null)
    setProfile(null)
    setForecast(null)
    try {
      const res = await fetch(`${API}/seller/${sellerId}/credit`)
      const data = await safeJson(res)
      setProfile(data.data || data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleForecast = async () => {
    if (!sellerId.trim()) return
    setForecastLoading(true)
    try {
      const res = await fetch(`${API}/seller/${sellerId}/forecast`)
      const data = await safeJson(res)
      setForecast(data.data || data)
    } catch (e) {
      setError(e.message)
    } finally {
      setForecastLoading(false)
    }
  }

  const inputClass = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500'

  return (
    <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Seller Financial Profile</h3>
      <form onSubmit={handleSearch} className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            className={`${inputClass} pl-9 w-full`}
            value={sellerId}
            onChange={e => setSellerId(e.target.value)}
            placeholder="Enter Seller ID (e.g. SLR-...)"
          />
        </div>
        <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
        </button>
      </form>

      {error && <div className="text-red-400 text-sm mb-4">Error: {error}</div>}

      {profile && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Credit Status</span>
              <p className="text-white font-semibold">{profile.creditStatus || 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-400">GMV</span>
              <p className="text-white font-semibold">${(profile.gmv ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-400">Payouts</span>
              <p className="text-white font-semibold">${(profile.payouts ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-400">Active Loan</span>
              <p className="text-white font-semibold">{profile.activeLoan ? 'Yes' : 'No'}</p>
            </div>
          </div>

          {profile.financialDecisions && profile.financialDecisions.length > 0 && (
            <div>
              <span className="text-gray-400 text-xs">Financial Decisions</span>
              <div className="mt-2 space-y-2">
                {profile.financialDecisions.map((d, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2 text-sm">
                    <span className="text-white">{d.type}</span>
                    <span className="text-gray-400">{d.date ? new Date(d.date).toLocaleDateString() : ''}</span>
                    <Badge color={d.result === 'APPROVED' ? 'green' : d.result === 'DENIED' ? 'red' : 'amber'}>{d.result}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={handleForecast}
              disabled={forecastLoading}
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {forecastLoading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Forecasting...</span> : 'Forecast'}
            </button>
          </div>

          {forecast && (
            <div className="bg-gray-800/50 rounded-lg p-4 mt-2">
              <h4 className="text-sm font-semibold text-white mb-3">Cash Flow Forecast</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Projected 30-day Revenue</span>
                  <p className="text-white font-semibold">${(forecast.projectedRevenue ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-gray-400">Confidence</span>
                  <p className="text-white font-semibold">{((forecast.confidence ?? 0) * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <span className="text-gray-400">Trend</span>
                  <p className={`font-semibold ${forecast.trend === 'up' ? 'text-green-400' : forecast.trend === 'down' ? 'text-red-400' : 'text-gray-300'}`}>
                    {forecast.trend || 'Stable'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400">Anomaly Flag</span>
                  <p className="font-semibold">
                    {forecast.anomalyFlag ? <Badge color="red">Anomaly Detected</Badge> : <Badge color="green">Normal</Badge>}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Main Page ----
const TABS = ['Overview', 'Underwriting', 'Payouts', 'Loans']

export default function FinancialPlatform() {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Financial Platform</h1>
        <p className="text-gray-400 mt-1">Credit underwriting, payout gating, cash flow forecasting, and loan servicing</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'Overview' && <OverviewTab />}
      {activeTab === 'Underwriting' && <UnderwritingTab />}
      {activeTab === 'Payouts' && <PayoutsTab />}
      {activeTab === 'Loans' && <LoansTab />}

      {/* Seller Financial Profile — always visible at the bottom */}
      <SellerProfile />
    </div>
  )
}
