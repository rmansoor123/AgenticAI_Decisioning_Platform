import { useState, useEffect, useCallback } from 'react'
import {
  DollarSign, TrendingUp, Users, BarChart3,
  ChevronDown, ChevronRight, Calculator, CreditCard,
  ArrowUpDown, Receipt
} from 'lucide-react'
import { safeJson } from '../utils/api'

const API = 'http://localhost:3001/api/financial/billing'

const TIER_COLORS = {
  New:        { bg: 'bg-gray-500/20',    text: 'text-gray-400',    border: 'border-gray-500/30',    bar: 'bg-gray-500' },
  Bronze:     { bg: 'bg-amber-600/20',   text: 'text-amber-400',   border: 'border-amber-500/30',   bar: 'bg-amber-600' },
  Silver:     { bg: 'bg-slate-400/20',   text: 'text-slate-300',   border: 'border-slate-400/30',   bar: 'bg-slate-400' },
  Gold:       { bg: 'bg-yellow-500/20',  text: 'text-yellow-400',  border: 'border-yellow-500/30',  bar: 'bg-yellow-500' },
  Platinum:   { bg: 'bg-cyan-400/20',    text: 'text-cyan-300',    border: 'border-cyan-400/30',    bar: 'bg-cyan-400' },
  Enterprise: { bg: 'bg-purple-500/20',  text: 'text-purple-400',  border: 'border-purple-500/30',  bar: 'bg-purple-500' }
}

const TX_TYPE_COLORS = {
  FEE:          { bg: 'bg-blue-500/20',   text: 'text-blue-400' },
  COMMISSION:   { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  SUBSCRIPTION: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  CREDIT:       { bg: 'bg-amber-500/20',  text: 'text-amber-400' }
}

function formatCurrency(val) {
  if (val == null || isNaN(val)) return '$0.00'
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(2)}K`
  return `$${val.toFixed(2)}`
}

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function TierBadge({ tier }) {
  const c = TIER_COLORS[tier] || TIER_COLORS.New
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text} border ${c.border}`}>
      {tier}
    </span>
  )
}

function TypeBadge({ type }) {
  const c = TX_TYPE_COLORS[type] || TX_TYPE_COLORS.FEE
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {type}
    </span>
  )
}

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/30',
    green: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/30',
    amber: 'from-amber-500/20 to-amber-600/5 border-amber-500/30'
  }
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-xl p-5`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

export default function BillingFees() {
  const [stats, setStats] = useState(null)
  const [fees, setFees] = useState([])
  const [revenue, setRevenue] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [expandedSeller, setExpandedSeller] = useState(null)
  const [sellerTxs, setSellerTxs] = useState({})
  const [sortField, setSortField] = useState('totalCharged')
  const [sortDir, setSortDir] = useState('desc')
  const [calcAmount, setCalcAmount] = useState('')
  const [calcTier, setCalcTier] = useState('New')
  const [calcResult, setCalcResult] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, feesRes, revenueRes, accountsRes] = await Promise.all([
        fetch(`${API}/stats`).then(safeJson),
        fetch(`${API}/fees`).then(safeJson),
        fetch(`${API}/revenue`).then(safeJson),
        fetch(`${API}/accounts`).then(safeJson)
      ])
      if (statsRes.success) setStats(statsRes.data)
      if (feesRes.success) setFees(feesRes.data)
      if (revenueRes.success) setRevenue(revenueRes.data)
      if (accountsRes.success) setAccounts(accountsRes.data)
    } catch (err) {
      console.error('Failed to load billing data:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const toggleExpand = async (sellerId) => {
    if (expandedSeller === sellerId) {
      setExpandedSeller(null)
      return
    }
    setExpandedSeller(sellerId)
    if (!sellerTxs[sellerId]) {
      try {
        const res = await fetch(`${API}/accounts/${sellerId}`).then(safeJson)
        if (res.success) {
          setSellerTxs(prev => ({ ...prev, [sellerId]: res.data.transactions }))
        }
      } catch (err) {
        console.error('Failed to load seller transactions:', err)
      }
    }
  }

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sortedAccounts = [...accounts].sort((a, b) => {
    let av = a[sortField], bv = b[sortField]
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const handleCalculate = async () => {
    const amt = parseFloat(calcAmount)
    if (!amt || amt <= 0) return
    try {
      const res = await fetch(`${API}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, tier: calcTier })
      }).then(safeJson)
      if (res.success) setCalcResult(res.data.breakdown)
    } catch (err) {
      console.error('Fee calculation failed:', err)
    }
  }

  // Revenue bar chart data
  const maxTierRevenue = revenue ? Math.max(...Object.values(revenue.byTier || {}), 1) : 1

  const SortHeader = ({ field, children }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none"
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortField === field && (
          <ArrowUpDown className="w-3 h-3" />
        )}
      </span>
    </th>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading billing data...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Billing & Fees</h1>
        <p className="text-gray-400 mt-1">Platform revenue, fee schedules, and seller billing management</p>
      </div>

      {/* Revenue Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={DollarSign} label="Monthly Recurring Revenue" value={formatCurrency(stats.mrr)} sub="Last 30 days" color="blue" />
          <StatCard icon={BarChart3} label="Avg Revenue Per User" value={formatCurrency(stats.arpu)} sub={`${stats.totalSellers} sellers`} color="green" />
          <StatCard icon={Users} label="Total Sellers Billed" value={stats.totalSellers?.toLocaleString()} sub={`Churn: ${stats.churnRate}%`} color="purple" />
          <StatCard icon={TrendingUp} label="Growth Rate" value={`${stats.growthRate}%`} sub="Month over month" color="amber" />
        </div>
      )}

      {/* Fee Schedule Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-400" />
            Fee Schedule
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Tier</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">Listing Fee</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">Transaction Fee</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">Payout Fee</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">Monthly Sub</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">Discount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {fees.map(f => {
                const c = TIER_COLORS[f.tier] || TIER_COLORS.New
                return (
                  <tr key={f.tier} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-3"><TierBadge tier={f.tier} /></td>
                    <td className="px-6 py-3 text-right text-sm text-gray-300">{(f.listingFee * 100).toFixed(0)}%</td>
                    <td className="px-6 py-3 text-right text-sm text-gray-300">{(f.transactionFee * 100).toFixed(0)}%</td>
                    <td className="px-6 py-3 text-right text-sm text-gray-300">{(f.payoutFee * 100).toFixed(1)}%</td>
                    <td className="px-6 py-3 text-right text-sm text-gray-300">
                      {f.monthlySubscription === 0 ? <span className="text-gray-500">Free</span> : `$${f.monthlySubscription.toFixed(2)}`}
                    </td>
                    <td className="px-6 py-3 text-right text-sm text-gray-300">
                      {f.discount === 0 ? <span className="text-gray-500">-</span> : `${(f.discount * 100).toFixed(0)}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revenue by Tier */}
      {revenue && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            Revenue by Tier
          </h2>
          <div className="space-y-3">
            {Object.entries(revenue.byTier || {}).map(([tier, amount]) => {
              const c = TIER_COLORS[tier] || TIER_COLORS.New
              const pct = (amount / maxTierRevenue) * 100
              return (
                <div key={tier} className="flex items-center gap-4">
                  <div className="w-24 text-sm"><TierBadge tier={tier} /></div>
                  <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-full ${c.bar} rounded-full transition-all duration-500 flex items-center px-2`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    >
                      {pct > 15 && <span className="text-xs font-medium text-white">{formatCurrency(amount)}</span>}
                    </div>
                  </div>
                  {pct <= 15 && <span className="text-sm text-gray-400 w-20 text-right">{formatCurrency(amount)}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Billing Accounts Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-purple-400" />
            Billing Accounts
            <span className="text-sm text-gray-500 font-normal ml-2">({accounts.length})</span>
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                <SortHeader field="sellerId">Seller ID</SortHeader>
                <SortHeader field="businessName">Business Name</SortHeader>
                <SortHeader field="tier">Tier</SortHeader>
                <SortHeader field="plan">Plan</SortHeader>
                <SortHeader field="balance">Balance</SortHeader>
                <SortHeader field="nextBillingDate">Next Billing</SortHeader>
                <SortHeader field="totalCharged">Total Charged</SortHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {sortedAccounts.map(acct => (
                <>
                  <tr
                    key={acct.sellerId}
                    className="hover:bg-gray-800/30 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(acct.sellerId)}
                  >
                    <td className="px-4 py-3 text-gray-500">
                      {expandedSeller === acct.sellerId
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />
                      }
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-300">{acct.sellerId}</td>
                    <td className="px-4 py-3 text-sm text-white">{acct.businessName}</td>
                    <td className="px-4 py-3"><TierBadge tier={acct.tier} /></td>
                    <td className="px-4 py-3 text-sm text-gray-400">{acct.plan}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{formatCurrency(acct.balance)}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{formatDate(acct.nextBillingDate)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-emerald-400">{formatCurrency(acct.totalCharged)}</td>
                  </tr>
                  {expandedSeller === acct.sellerId && (
                    <tr key={`${acct.sellerId}-txs`}>
                      <td colSpan={8} className="bg-gray-800/20 px-8 py-4">
                        <div className="text-xs font-medium text-gray-400 uppercase mb-2">Recent Billing Transactions</div>
                        {sellerTxs[acct.sellerId] ? (
                          <table className="w-full">
                            <thead>
                              <tr className="text-xs text-gray-500">
                                <th className="pb-2 text-left">Date</th>
                                <th className="pb-2 text-left">Type</th>
                                <th className="pb-2 text-left">Description</th>
                                <th className="pb-2 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/50">
                              {sellerTxs[acct.sellerId].map(tx => (
                                <tr key={tx.txId} className="text-sm">
                                  <td className="py-1.5 text-gray-400">{formatDate(tx.createdAt)}</td>
                                  <td className="py-1.5"><TypeBadge type={tx.type} /></td>
                                  <td className="py-1.5 text-gray-300">{tx.description}</td>
                                  <td className={`py-1.5 text-right font-mono ${tx.amount < 0 ? 'text-amber-400' : 'text-gray-300'}`}>
                                    {tx.amount < 0 ? '-' : ''}${Math.abs(tx.amount).toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="text-gray-500 text-sm">Loading transactions...</div>
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

      {/* Fee Calculator */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-amber-400" />
          Fee Calculator
        </h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Transaction Amount ($)</label>
            <input
              type="number"
              value={calcAmount}
              onChange={(e) => setCalcAmount(e.target.value)}
              placeholder="100.00"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white w-40 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tier</label>
            <select
              value={calcTier}
              onChange={(e) => setCalcTier(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white w-40 focus:outline-none focus:border-blue-500"
            >
              {['New', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Enterprise'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCalculate}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-medium transition-colors"
          >
            Calculate
          </button>
        </div>

        {calcResult && (
          <div className="mt-4 bg-gray-800/50 border border-gray-700 rounded-lg p-4 max-w-md">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Listing Fee</span>
                <span className="text-gray-200">{formatCurrency(calcResult.listingFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Transaction Fee</span>
                <span className="text-gray-200">{formatCurrency(calcResult.transactionFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Payout Fee</span>
                <span className="text-gray-200">{formatCurrency(calcResult.payoutFee)}</span>
              </div>
              <div className="border-t border-gray-700 pt-2 flex justify-between">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-gray-200">{formatCurrency(calcResult.subtotal)}</span>
              </div>
              {calcResult.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-amber-400">Discount ({calcResult.discount})</span>
                  <span className="text-amber-400">-{formatCurrency(calcResult.discountAmount)}</span>
                </div>
              )}
              <div className="border-t border-gray-600 pt-2 flex justify-between font-bold">
                <span className="text-white">Total Fees</span>
                <span className="text-emerald-400">{formatCurrency(calcResult.total)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
