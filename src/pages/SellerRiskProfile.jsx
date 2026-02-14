import { useState, useEffect } from 'react'
import {
  Shield, AlertTriangle, TrendingUp, TrendingDown, Clock, Filter,
  ArrowLeft, UserX, CreditCard, Package, Truck, Activity, ShieldAlert,
  Eye, RefreshCw, Settings, DollarSign, UserCog, RotateCcw
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const API_BASE = 'http://localhost:3005/api'

const TIER_COLORS = {
  LOW: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', bar: 'bg-emerald-500' },
  MEDIUM: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', bar: 'bg-amber-500' },
  HIGH: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', bar: 'bg-orange-500' },
  CRITICAL: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', bar: 'bg-red-500' }
}

const DOMAIN_ICONS = {
  onboarding: UserX,
  account_setup: Settings,
  item_setup: Package,
  listing: Package,
  pricing: DollarSign,
  transaction: Activity,
  payout: CreditCard,
  shipping: Truck,
  returns: RotateCcw,
  ato: ShieldAlert,
  profile_updates: UserCog
}

const DOMAIN_COLORS = {
  onboarding: 'bg-blue-500',
  account_setup: 'bg-cyan-500',
  item_setup: 'bg-violet-500',
  listing: 'bg-purple-500',
  pricing: 'bg-emerald-500',
  transaction: 'bg-indigo-500',
  payout: 'bg-amber-500',
  shipping: 'bg-teal-500',
  returns: 'bg-pink-500',
  ato: 'bg-red-500',
  profile_updates: 'bg-orange-500'
}

const DOMAIN_LABELS = {
  onboarding: 'Onboarding',
  account_setup: 'Account Setup',
  item_setup: 'Item Setup',
  listing: 'Listing',
  pricing: 'Pricing',
  transaction: 'Transaction',
  payout: 'Payout',
  shipping: 'Shipping',
  returns: 'Returns',
  ato: 'ATO',
  profile_updates: 'Profile Updates'
}

const LIFECYCLE_ORDER = [
  'onboarding', 'account_setup', 'item_setup', 'listing', 'pricing',
  'transaction', 'payout', 'shipping', 'returns', 'ato', 'profile_updates'
]

function getTierColor(tier) {
  return TIER_COLORS[tier] || TIER_COLORS.LOW
}

function getScoreColor(score) {
  if (score >= 75) return 'text-red-400'
  if (score >= 50) return 'text-orange-400'
  if (score >= 25) return 'text-amber-400'
  return 'text-emerald-400'
}

function LifecycleFlow({ domainScores }) {
  const getNodeColor = (score) => {
    if (score >= 75) return { bg: 'bg-red-500/30', border: 'border-red-500', text: 'text-red-400' }
    if (score >= 50) return { bg: 'bg-orange-500/30', border: 'border-orange-500', text: 'text-orange-400' }
    if (score >= 25) return { bg: 'bg-amber-500/30', border: 'border-amber-500', text: 'text-amber-400' }
    return { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400' }
  }

  const preLaunch = ['onboarding', 'account_setup', 'item_setup', 'listing', 'pricing']
  const liveOps = ['transaction', 'payout', 'shipping', 'returns']
  const security = ['ato', 'profile_updates']

  const renderNode = (domain) => {
    const score = Math.round(domainScores[domain] || 0)
    const colors = getNodeColor(score)
    const Icon = DOMAIN_ICONS[domain]
    return (
      <div key={domain} className={`flex flex-col items-center gap-1 p-2 rounded-lg border ${colors.bg} ${colors.border}`}>
        <Icon className={`w-4 h-4 ${colors.text}`} />
        <span className="text-[10px] text-gray-400 whitespace-nowrap">{DOMAIN_LABELS[domain]}</span>
        <span className={`text-sm font-bold font-mono ${colors.text}`}>{score}</span>
      </div>
    )
  }

  const renderArrow = () => (
    <div className="text-gray-600 flex items-center px-0.5">&rarr;</div>
  )

  return (
    <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
      <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
        <Shield className="w-4 h-4 text-indigo-400" />
        Seller Lifecycle
      </h3>
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2">Pre-Launch</div>
          <div className="flex items-center gap-1 flex-wrap">
            {preLaunch.map((d, i) => (
              <div key={d} className="flex items-center">
                {renderNode(d)}
                {i < preLaunch.length - 1 && renderArrow()}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2">Live Operations</div>
          <div className="flex items-center gap-1 flex-wrap">
            {liveOps.map((d, i) => (
              <div key={d} className="flex items-center">
                {renderNode(d)}
                {i < liveOps.length - 1 && renderArrow()}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2">Security</div>
          <div className="flex items-center gap-1 flex-wrap">
            {security.map((d, i) => (
              <div key={d} className="flex items-center">
                {renderNode(d)}
                {i < security.length - 1 && renderArrow()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DomainHeatmap({ sellers }) {
  const getCellColor = (score) => {
    if (score >= 75) return 'bg-red-500/60'
    if (score >= 50) return 'bg-orange-500/50'
    if (score >= 25) return 'bg-amber-500/30'
    if (score > 0) return 'bg-emerald-500/20'
    return 'bg-gray-800/30'
  }

  if (!sellers || sellers.length === 0) return null

  return (
    <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
      <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
        <Activity className="w-4 h-4 text-indigo-400" />
        Risk Heatmap
      </h3>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left text-gray-500 font-medium px-2 py-1 sticky left-0 bg-[#12121a]">Seller</th>
              {LIFECYCLE_ORDER.map(d => (
                <th key={d} className="text-center text-gray-500 font-medium px-1 py-1 whitespace-nowrap">
                  {DOMAIN_LABELS[d]?.slice(0, 6)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sellers.slice(0, 20).map((seller, i) => (
              <tr key={seller.sellerId || i}>
                <td className="text-gray-400 px-2 py-1 font-mono sticky left-0 bg-[#12121a]">
                  {seller.businessName?.slice(0, 15) || seller.sellerId?.slice(0, 12)}
                </td>
                {LIFECYCLE_ORDER.map(d => {
                  const score = Math.round(seller.domainScores?.[d] || 0)
                  return (
                    <td key={d} className="px-1 py-1 text-center">
                      <div className={`w-8 h-6 rounded flex items-center justify-center mx-auto ${getCellColor(score)}`}>
                        <span className="text-[10px] font-mono text-gray-300">{score > 0 ? score : ''}</span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SellerRiskProfile() {
  const [stats, setStats] = useState(null)
  const [highRiskSellers, setHighRiskSellers] = useState([])
  const [selectedSeller, setSelectedSeller] = useState(null)
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [events, setEvents] = useState([])
  const [domainFilter, setDomainFilter] = useState('all')
  const [overrideForm, setOverrideForm] = useState({ tier: '', reason: '', overriddenBy: '' })
  const [overrideStatus, setOverrideStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOverviewData()
  }, [])

  useEffect(() => {
    if (selectedSeller) {
      fetchSellerDetail(selectedSeller)
    }
  }, [selectedSeller])

  const fetchOverviewData = async () => {
    setLoading(true)
    try {
      const [statsRes, highRiskRes] = await Promise.all([
        fetch(`${API_BASE}/risk-profile/stats`),
        fetch(`${API_BASE}/risk-profile/high-risk?tier=MEDIUM&limit=50`)
      ])
      const [statsData, highRiskData] = await Promise.all([
        statsRes.json(),
        highRiskRes.json()
      ])
      if (statsData.success) setStats(statsData.data)
      if (highRiskData.success) {
        const sorted = (highRiskData.data || []).sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0))
        setHighRiskSellers(sorted)
      }
    } catch (error) {
      console.error('Error fetching overview data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSellerDetail = async (sellerId) => {
    setLoading(true)
    try {
      const [profileRes, historyRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE}/risk-profile/${sellerId}`),
        fetch(`${API_BASE}/risk-profile/${sellerId}/history`),
        fetch(`${API_BASE}/risk-profile/${sellerId}/events`)
      ])
      const [profileData, historyData, eventsData] = await Promise.all([
        profileRes.json(),
        historyRes.json(),
        eventsRes.json()
      ])
      if (profileData.success) {
        setProfile(profileData.data)
        if (profileData.data.override) {
          setOverrideStatus(profileData.data.override)
        } else {
          setOverrideStatus(null)
        }
      }
      if (historyData.success) {
        const formatted = (historyData.data || []).map(h => ({
          ...h,
          date: new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          compositeScore: h.compositeScore || 0
        }))
        setHistory(formatted)
      }
      if (eventsData.success) {
        setEvents(eventsData.data || [])
      }
    } catch (error) {
      console.error('Error fetching seller detail:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOverrideSubmit = async (e) => {
    e.preventDefault()
    if (!overrideForm.tier || !overrideForm.reason || !overrideForm.overriddenBy) return
    try {
      const res = await fetch(`${API_BASE}/risk-profile/${selectedSeller}/override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrideForm)
      })
      const data = await res.json()
      if (data.success) {
        setOverrideStatus({ ...overrideForm, timestamp: new Date().toISOString() })
        setOverrideForm({ tier: '', reason: '', overriddenBy: '' })
        fetchSellerDetail(selectedSeller)
      }
    } catch (error) {
      console.error('Error submitting override:', error)
    }
  }

  const handleSelectSeller = (sellerId) => {
    setSelectedSeller(sellerId)
    setProfile(null)
    setHistory([])
    setEvents([])
    setDomainFilter('all')
    setOverrideForm({ tier: '', reason: '', overriddenBy: '' })
    setOverrideStatus(null)
  }

  const handleBack = () => {
    setSelectedSeller(null)
    setProfile(null)
    setHistory([])
    setEvents([])
    setDomainFilter('all')
    setOverrideStatus(null)
  }

  const filteredEvents = domainFilter === 'all'
    ? events
    : events.filter(ev => ev.domain === domainFilter)

  // ---------- DETAIL VIEW ----------
  if (selectedSeller && profile) {
    const tierColor = getTierColor(profile.tier)
    const domains = profile.domainScores || {}

    return (
      <div className="space-y-6">
        {/* Back Button + Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{profile.businessName || profile.sellerId}</h1>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${tierColor.bg} ${tierColor.text}`}>
                {profile.tier}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1 font-mono">{profile.sellerId}</p>
          </div>
          <div className="text-right">
            <div className={`text-4xl font-bold ${getScoreColor(profile.compositeScore)}`}>
              {Math.round(profile.compositeScore || 0)}
            </div>
            <div className="text-xs text-gray-500">Composite Score</div>
          </div>
        </div>

        {/* Active Actions */}
        {profile.activeActions && profile.activeActions.length > 0 && (
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">Active Actions</h3>
            <div className="flex flex-wrap gap-2">
              {profile.activeActions.map((action, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30"
                >
                  {action.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Lifecycle Flow */}
        <LifecycleFlow domainScores={domains} />

        {/* Domain Breakdown */}
        <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            Domain Breakdown
          </h3>
          <div className="space-y-4">
            {LIFECYCLE_ORDER.map(domain => {
              const score = domains[domain] || 0
              const DomainIcon = DOMAIN_ICONS[domain]
              const barColor = DOMAIN_COLORS[domain]
              return (
                <div key={domain} className="flex items-center gap-4">
                  <div className="w-8 flex justify-center">
                    <DomainIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="w-28 text-sm text-gray-300">{DOMAIN_LABELS[domain]}</div>
                  <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.min(score, 100)}%` }}
                    />
                  </div>
                  <div className={`w-10 text-right text-sm font-mono ${getScoreColor(score)}`}>
                    {Math.round(score)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Risk Timeline Chart */}
        <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            Risk Timeline
          </h3>
          <div className="h-64">
            {history.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="date"
                    stroke="#6b7280"
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="#6b7280"
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a2e',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#e5e7eb'
                    }}
                    formatter={(value, name) => [Math.round(value), 'Composite Score']}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload
                      const trigger = item?.trigger || item?.eventType || ''
                      return trigger ? `${label} - ${trigger}` : label
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="compositeScore"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ fill: '#6366f1', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, fill: '#818cf8' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                No history data available
              </div>
            )}
          </div>
        </div>

        {/* Event Log */}
        <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              Event Log
            </h3>
            <div className="flex flex-wrap gap-2">
              {['all', ...LIFECYCLE_ORDER].map(d => (
                <button
                  key={d}
                  onClick={() => setDomainFilter(d)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    domainFilter === d
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                      : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  {d === 'all' ? 'All' : DOMAIN_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-auto max-h-[400px]">
            <table className="w-full">
              <thead className="bg-[#0d0d14] sticky top-0">
                <tr className="text-xs text-gray-500">
                  <th className="px-4 py-3 text-left font-medium">Timestamp</th>
                  <th className="px-4 py-3 text-left font-medium">Domain</th>
                  <th className="px-4 py-3 text-left font-medium">Event Type</th>
                  <th className="px-4 py-3 text-left font-medium">Original Score</th>
                  <th className="px-4 py-3 text-left font-medium">Decayed Score</th>
                  <th className="px-4 py-3 text-left font-medium">Impact</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.length > 0 ? filteredEvents.map((ev, i) => {
                  const DomainIcon = DOMAIN_ICONS[ev.domain] || Activity
                  const isPositive = (ev.score || ev.originalScore || 0) < 0
                  return (
                    <tr key={i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-400">
                          {new Date(ev.timestamp).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <DomainIcon className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs text-gray-300">{DOMAIN_LABELS[ev.domain] || ev.domain}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-white">{ev.eventType || ev.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-gray-300">
                          {typeof ev.originalScore === 'number' ? ev.originalScore.toFixed(1) : (ev.score || '-')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-gray-300">
                          {typeof ev.decayedScore === 'number' ? ev.decayedScore.toFixed(1) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isPositive ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <TrendingDown className="w-3 h-3" /> Positive
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-400">
                            <TrendingUp className="w-3 h-3" /> Negative
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      No events found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Manual Override */}
        <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Manual Override
          </h3>

          {overrideStatus && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="text-xs text-amber-400 font-medium mb-1">Current Override Active</div>
              <div className="text-xs text-gray-300">
                Tier: <span className="text-white font-medium">{overrideStatus.tier}</span>
                {' | '}
                Reason: <span className="text-white">{overrideStatus.reason}</span>
                {' | '}
                By: <span className="text-white">{overrideStatus.overriddenBy}</span>
                {overrideStatus.timestamp && (
                  <>
                    {' | '}
                    <span className="text-gray-500">{new Date(overrideStatus.timestamp).toLocaleString()}</span>
                  </>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleOverrideSubmit} className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs text-gray-400 mb-1">Tier</label>
              <select
                value={overrideForm.tier}
                onChange={e => setOverrideForm(prev => ({ ...prev, tier: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select tier...</option>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
            <div className="flex-[2] min-w-[200px]">
              <label className="block text-xs text-gray-400 mb-1">Reason</label>
              <input
                type="text"
                value={overrideForm.reason}
                onChange={e => setOverrideForm(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Reason for override..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs text-gray-400 mb-1">Override By</label>
              <input
                type="text"
                value={overrideForm.overriddenBy}
                onChange={e => setOverrideForm(prev => ({ ...prev, overriddenBy: e.target.value }))}
                placeholder="Your name..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={!overrideForm.tier || !overrideForm.reason || !overrideForm.overriddenBy}
              className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Submit Override
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ---------- LOADING STATE FOR DETAIL ----------
  if (selectedSeller && !profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  // ---------- OVERVIEW VIEW ----------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
              <Shield className="w-6 h-6 text-white" />
            </div>
            Seller Risk Profiles
          </h1>
          <p className="text-gray-400 mt-1">Composite risk scoring across all fraud domains</p>
        </div>
        <button
          onClick={fetchOverviewData}
          disabled={loading}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <div className="flex items-start justify-between mb-2">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white">{stats.totalProfiles || 0}</div>
            <div className="text-sm text-gray-400">Total Profiles</div>
          </div>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(tier => {
            const color = getTierColor(tier)
            const count = stats.byTier?.[tier] || 0
            return (
              <div key={tier} className={`bg-[#12121a] rounded-xl border ${color.border} p-4`}>
                <div className="flex items-start justify-between mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${color.bg} ${color.text}`}>
                    {tier}
                  </span>
                </div>
                <div className={`text-2xl font-bold ${color.text}`}>{count}</div>
                <div className="text-sm text-gray-400">{tier.charAt(0) + tier.slice(1).toLowerCase()} Risk</div>
              </div>
            )
          })}
        </div>
      )}

      {/* High Risk Sellers Table */}
      <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            High-Risk Sellers
          </h3>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Filter className="w-3.5 h-3.5" />
            <span>MEDIUM tier and above</span>
          </div>
        </div>
        <div className="overflow-auto max-h-[500px]">
          <table className="w-full">
            <thead className="bg-[#0d0d14] sticky top-0">
              <tr className="text-xs text-gray-500">
                <th className="px-4 py-3 text-left font-medium">Seller ID</th>
                <th className="px-4 py-3 text-left font-medium">Business Name</th>
                <th className="px-4 py-3 text-left font-medium">Composite Score</th>
                <th className="px-4 py-3 text-left font-medium">Tier</th>
                <th className="px-4 py-3 text-left font-medium">Top Domain</th>
                <th className="px-4 py-3 text-left font-medium">Last Event</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {highRiskSellers.length > 0 ? highRiskSellers.map((seller, i) => {
                const tierColor = getTierColor(seller.tier)
                const topDomain = seller.topDomain || findTopDomain(seller.domainScores)
                return (
                  <tr
                    key={seller.sellerId || i}
                    className="border-t border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-300">{seller.sellerId}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-white">{seller.businessName || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-bold font-mono ${getScoreColor(seller.compositeScore)}`}>
                        {Math.round(seller.compositeScore || 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${tierColor.bg} ${tierColor.text}`}>
                        {seller.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-400">{topDomain ? DOMAIN_LABELS[topDomain] || topDomain : '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">
                        {seller.lastEventAt
                          ? new Date(seller.lastEventAt).toLocaleDateString()
                          : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleSelectSeller(seller.sellerId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-lg text-xs font-medium transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Loading sellers...
                      </div>
                    ) : (
                      'No high-risk sellers found'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Domain Risk Heatmap */}
      <DomainHeatmap sellers={highRiskSellers} />
    </div>
  )
}

function findTopDomain(domainScores) {
  if (!domainScores || typeof domainScores !== 'object') return null
  let top = null
  let topScore = -1
  for (const [domain, score] of Object.entries(domainScores)) {
    if (score > topScore) {
      topScore = score
      top = domain
    }
  }
  return top
}
