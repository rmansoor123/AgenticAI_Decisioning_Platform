import { useState, useEffect } from 'react'
import {
  TrendingUp, Users, Activity, BarChart3, Target, Zap,
  AlertTriangle, CheckCircle, Search, Loader2, ChevronDown,
  ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react'
import { safeJson } from '../utils/api'

const API = '/api/growth'

const TABS = ['Overview', 'Churn', 'Adoption', 'Personalization', 'Campaigns']

function StatCard({ label, value, sub, icon: Icon, color = 'text-green-400' }) {
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
    cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    gray: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${colors[color] || colors.gray}`}>
      {children}
    </span>
  )
}

function riskColor(level) {
  if (level === 'CRITICAL') return 'red'
  if (level === 'HIGH') return 'amber'
  if (level === 'MEDIUM') return 'blue'
  return 'green'
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab() {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/analytics/overview`)
      .then(r => safeJson(r))
      .then(d => { if (d.success) setOverview(d.data.metrics); else setError(d.error) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center gap-2 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /> Loading overview...</div>
  if (error) return <div className="text-red-400">Error: {error}</div>
  if (!overview) return <div className="text-gray-500">No data available</div>

  const gmvGrowthNum = parseInt(overview.gmvGrowth)
  const GrowthIcon = gmvGrowthNum > 0 ? ArrowUpRight : gmvGrowthNum < 0 ? ArrowDownRight : Minus
  const growthColor = gmvGrowthNum > 0 ? 'text-green-400' : gmvGrowthNum < 0 ? 'text-red-400' : 'text-gray-400'

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard label="DAU" value={overview.dau} icon={Users} />
        <StatCard label="MAU" value={overview.mau} icon={Users} color="text-blue-400" />
        <StatCard label="Stickiness" value={`${Math.round(overview.stickiness * 100)}%`} icon={Activity} color="text-purple-400" />
        <StatCard label="Total Sellers" value={overview.totalSellers?.toLocaleString()} icon={Users} color="text-cyan-400" />
        <StatCard label="New (30d)" value={overview.newSellers30d} icon={TrendingUp} />
        <StatCard label="NPS" value={overview.nps} icon={Target} color={overview.nps >= 50 ? 'text-green-400' : 'text-amber-400'} />
      </div>

      {/* GMV Section */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">GMV & Revenue</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <div className="text-xs text-gray-500">GMV (30d)</div>
            <div className="text-2xl font-bold text-white">${overview.gmv30d?.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">GMV Growth</div>
            <div className={`text-2xl font-bold flex items-center gap-1 ${growthColor}`}>
              <GrowthIcon className="w-5 h-5" />
              {overview.gmvGrowth}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Avg Order Value</div>
            <div className="text-2xl font-bold text-white">${overview.avgOrderValue?.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Avg LTV</div>
            <div className="text-2xl font-bold text-white">${overview.avgLTV?.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Rates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#12121a] border border-gray-800 rounded-lg p-5">
          <div className="text-xs text-gray-500 mb-1">Churn Rate</div>
          <div className="text-3xl font-bold text-red-400">{Math.round(overview.churnRate * 100)}%</div>
          <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(100, overview.churnRate * 100)}%` }} />
          </div>
        </div>
        <div className="bg-[#12121a] border border-gray-800 rounded-lg p-5">
          <div className="text-xs text-gray-500 mb-1">Growth Rate</div>
          <div className="text-3xl font-bold text-green-400">{Math.round(overview.growthRate * 100)}%</div>
          <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, overview.growthRate * 100)}%` }} />
          </div>
        </div>
        <div className="bg-[#12121a] border border-gray-800 rounded-lg p-5">
          <div className="text-xs text-gray-500 mb-1">Active Sellers</div>
          <div className="text-3xl font-bold text-blue-400">{overview.activeSellers}</div>
          <div className="text-xs text-gray-500 mt-1">of {overview.totalSellers} total</div>
        </div>
      </div>
    </div>
  )
}

// ─── Churn Tab ───────────────────────────────────────────────────────────────

function ChurnTab() {
  const [sellerId, setSellerId] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const analyze = () => {
    if (!sellerId.trim()) return
    setLoading(true)
    setError(null)
    fetch(`${API}/churn/${sellerId.trim()}`)
      .then(r => safeJson(r))
      .then(d => { if (d.success) setResult(d.data); else setError(d.error) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Enter Seller ID (e.g. SLR-...)"
          value={sellerId}
          onChange={e => setSellerId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && analyze()}
          className="flex-1 bg-[#12121a] border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
        />
        <button
          onClick={analyze}
          disabled={loading}
          className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Predict
        </button>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {result && (
        <div className="space-y-4">
          {/* Probability bar */}
          <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">Churn Probability</span>
              <Badge color={riskColor(result.riskLevel)}>{result.riskLevel}</Badge>
            </div>
            <div className="text-4xl font-bold text-white mb-3">{Math.round(result.churnProbability * 100)}%</div>
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  result.churnProbability >= 0.8 ? 'bg-red-500' :
                  result.churnProbability >= 0.6 ? 'bg-amber-500' :
                  result.churnProbability >= 0.35 ? 'bg-blue-500' : 'bg-green-500'
                }`}
                style={{ width: `${result.churnProbability * 100}%` }}
              />
            </div>
            {result.estimatedChurnDate && (
              <div className="text-xs text-gray-500 mt-2">Estimated churn date: {result.estimatedChurnDate}</div>
            )}
          </div>

          {/* Churn Drivers */}
          {result.churnDrivers?.length > 0 && (
            <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Top Churn Drivers</h3>
              <div className="space-y-3">
                {result.churnDrivers.map((d, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
                    <div>
                      <div className="text-sm text-white">{d.description}</div>
                      <div className="text-xs text-gray-500">{d.signal} (value: {d.value})</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color={d.severity === 'HIGH' ? 'red' : d.severity === 'MEDIUM' ? 'amber' : 'gray'}>{d.severity}</Badge>
                      <span className="text-xs text-gray-400 font-mono">{d.contribution}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Actions */}
          {result.recommendedActions?.length > 0 && (
            <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Recommended Actions</h3>
              <div className="space-y-2">
                {result.recommendedActions.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 py-2">
                    <Zap className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm text-white font-medium">{a.action.replace(/_/g, ' ')}</div>
                      <div className="text-xs text-gray-500">{a.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Adoption Tab ────────────────────────────────────────────────────────────

function AdoptionTab() {
  const [sellerId, setSellerId] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const analyze = () => {
    if (!sellerId.trim()) return
    setLoading(true)
    setError(null)
    fetch(`${API}/adoption/${sellerId.trim()}`)
      .then(r => safeJson(r))
      .then(d => { if (d.success) setResult(d.data); else setError(d.error) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const catColor = cat => cat === 'CORE' ? 'blue' : cat === 'GROWTH' ? 'green' : cat === 'ADVANCED' ? 'purple' : 'amber'

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Enter Seller ID (e.g. SLR-...)"
          value={sellerId}
          onChange={e => setSellerId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && analyze()}
          className="flex-1 bg-[#12121a] border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
        />
        <button
          onClick={analyze}
          disabled={loading}
          className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Analyze
        </button>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {result && (
        <div className="space-y-4">
          {/* Score + Maturity */}
          <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">Adoption Score</span>
              <Badge color={result.maturityLevel === 'EXPERT' ? 'green' : result.maturityLevel === 'ADVANCED' ? 'blue' : result.maturityLevel === 'INTERMEDIATE' ? 'amber' : 'gray'}>
                {result.maturityLevel}
              </Badge>
            </div>
            <div className="text-4xl font-bold text-white mb-3">{result.adoptionScore}%</div>
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${result.adoptionScore}%` }} />
            </div>
          </div>

          {/* Category breakdown */}
          {result.categories && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(result.categories).map(([cat, data]) => (
                <div key={cat} className="bg-[#12121a] border border-gray-800 rounded-lg p-4">
                  <Badge color={catColor(cat)}>{cat}</Badge>
                  <div className="text-lg font-bold text-white mt-2">{data.adopted}/{data.total}</div>
                  <div className="text-xs text-gray-500">{data.percentage}% adopted</div>
                </div>
              ))}
            </div>
          )}

          {/* Feature map */}
          {result.features?.length > 0 && (
            <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Feature Map</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {result.features.map(f => (
                  <div key={f.id} className="flex items-center gap-3 py-1.5">
                    {f.adopted
                      ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                      : <div className="w-4 h-4 rounded-full border border-gray-600 flex-shrink-0" />
                    }
                    <span className={`text-sm ${f.adopted ? 'text-white' : 'text-gray-500'}`}>{f.name}</span>
                    <Badge color={catColor(f.category)}>{f.category}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations?.length > 0 && (
            <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Recommended Features</h3>
              <div className="space-y-3">
                {result.recommendations.map((r, i) => (
                  <div key={i} className="p-3 border border-gray-800/50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">{r.featureName}</span>
                      <div className="flex gap-2">
                        <Badge color={catColor(r.category)}>{r.category}</Badge>
                        <span className="text-xs text-green-400">{r.estimatedLift}</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">{r.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Personalization Tab ─────────────────────────────────────────────────────

function PersonalizationTab() {
  const [sellerId, setSellerId] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const analyze = () => {
    if (!sellerId.trim()) return
    setLoading(true)
    setError(null)
    fetch(`${API}/personalize/${sellerId.trim()}`)
      .then(r => safeJson(r))
      .then(d => { if (d.success) setResult(d.data); else setError(d.error) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  const typeColor = t => ({ UPSELL: 'purple', RETENTION: 'red', ONBOARDING: 'blue', FEATURE: 'cyan', GROWTH: 'green', RECOGNITION: 'amber' }[t] || 'gray')

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Enter Seller ID (e.g. SLR-...)"
          value={sellerId}
          onChange={e => setSellerId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && analyze()}
          className="flex-1 bg-[#12121a] border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
        />
        <button
          onClick={analyze}
          disabled={loading}
          className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Personalize
        </button>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {result && (
        <div className="space-y-4">
          {/* Profile */}
          {result.profile && (
            <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Seller Profile</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-gray-500">Tier</div>
                  <div className="text-white font-medium capitalize">{result.profile.tier}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Engagement</div>
                  <Badge color={result.profile.engagementLevel === 'ACTIVE' ? 'green' : result.profile.engagementLevel === 'MODERATE' ? 'amber' : 'red'}>
                    {result.profile.engagementLevel}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Revenue</div>
                  <div className="text-white font-medium">${result.profile.totalRevenue?.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Account Age</div>
                  <div className="text-white font-medium">{result.profile.accountAgeDays} days</div>
                </div>
              </div>
            </div>
          )}

          {/* Next Best Actions */}
          <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Next Best Actions</h3>
              <span className="text-xs text-gray-500">{result.matchedCount} of {result.totalRulesEvaluated} rules matched</span>
            </div>
            {result.actions?.length > 0 ? (
              <div className="space-y-3">
                {result.actions.map((a, i) => (
                  <div key={i} className="p-4 border border-gray-800/50 rounded-lg hover:border-gray-700 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge color={typeColor(a.type)}>{a.type}</Badge>
                        <span className="text-sm font-medium text-white">{a.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge color="gray">{a.channel}</Badge>
                        <span className="text-xs text-gray-500">P{a.priority}</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">{a.description}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No personalized actions matched for this seller.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Campaigns Tab ───────────────────────────────────────────────────────────

function CampaignsTab() {
  const [templates, setTemplates] = useState([])
  const [active, setActive] = useState([])
  const [sellerId, setSellerId] = useState('')
  const [triggerResult, setTriggerResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API}/campaigns/templates`)
      .then(r => safeJson(r))
      .then(d => { if (d.success) setTemplates(d.data) })
      .catch(() => {})
    fetch(`${API}/campaigns/active`)
      .then(r => safeJson(r))
      .then(d => { if (d.success) setActive(d.data) })
      .catch(() => {})
  }, [])

  const triggerCampaign = () => {
    if (!sellerId.trim()) return
    setLoading(true)
    setError(null)
    fetch(`${API}/campaigns/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sellerId: sellerId.trim() }),
    })
      .then(r => safeJson(r))
      .then(d => {
        if (d.success) {
          setTriggerResult(d.data)
          // Refresh active
          fetch(`${API}/campaigns/active`).then(r => safeJson(r)).then(dd => { if (dd.success) setActive(dd.data) }).catch(() => {})
        } else { setError(d.error) }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  return (
    <div className="space-y-6">
      {/* Templates */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Campaign Templates ({templates.length})</h3>
        {templates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Channel</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2 pr-4">Steps</th>
                  <th className="pb-2">Expected Lift</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id} className="border-b border-gray-800/50">
                    <td className="py-2 pr-4 text-white">{t.name}</td>
                    <td className="py-2 pr-4"><Badge color="blue">{t.channel}</Badge></td>
                    <td className="py-2 pr-4 text-gray-400">{t.duration}</td>
                    <td className="py-2 pr-4 text-gray-400">{t.steps}</td>
                    <td className="py-2 text-green-400 text-xs">{t.expectedLift}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500 text-sm">Loading templates...</div>
        )}
      </div>

      {/* Trigger */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Trigger Campaign</h3>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Enter Seller ID"
            value={sellerId}
            onChange={e => setSellerId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && triggerCampaign()}
            className="flex-1 bg-[#0a0a12] border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none"
          />
          <button
            onClick={triggerCampaign}
            disabled={loading}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Trigger
          </button>
        </div>
        {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
        {triggerResult && (
          <div className="mt-4 space-y-2">
            <div className="text-sm text-gray-400">
              {triggerResult.totalTriggered} of {triggerResult.totalEvaluated} campaigns triggered
            </div>
            {triggerResult.campaigns?.map((c, i) => (
              <div key={i} className="p-3 border border-gray-800/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white font-medium">{c.name}</span>
                  <div className="flex gap-2">
                    <Badge color="blue">{c.channel}</Badge>
                    <Badge color="green">{c.status}</Badge>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {c.schedule?.startDate} to {c.schedule?.endDate} | {c.steps} steps | {c.expectedLift}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Campaigns */}
      {active.length > 0 && (
        <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Active Campaigns ({active.length})</h3>
          <div className="space-y-2">
            {active.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
                <div>
                  <div className="text-sm text-white">{c.name}</div>
                  <div className="text-xs text-gray-500">{c.campaignId}</div>
                </div>
                <div className="flex gap-2">
                  <Badge color="blue">{c.channel}</Badge>
                  <Badge color="green">{c.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GrowthPlatform() {
  const [activeTab, setActiveTab] = useState('Overview')

  return (
    <div className="min-h-screen bg-[#0a0a12] space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <TrendingUp className="w-7 h-7 text-green-400" />
          Growth & Engagement Platform
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Churn prediction, product adoption, personalization, and retention campaigns
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 pb-0">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab
                ? 'bg-[#12121a] text-green-400 border-b-2 border-green-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'Overview' && <OverviewTab />}
      {activeTab === 'Churn' && <ChurnTab />}
      {activeTab === 'Adoption' && <AdoptionTab />}
      {activeTab === 'Personalization' && <PersonalizationTab />}
      {activeTab === 'Campaigns' && <CampaignsTab />}
    </div>
  )
}
