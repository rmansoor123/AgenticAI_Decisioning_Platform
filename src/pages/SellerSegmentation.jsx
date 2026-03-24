import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search, ChevronDown, ChevronUp, ChevronRight,
  TrendingUp, Globe, Grid3X3, Crown, Truck, Code,
  AlertTriangle, ArrowDownCircle, Calendar, Award,
  Users, BarChart3, ArrowUpDown, RefreshCw, Star,
  Shield, Clock, CheckCircle, Zap, Settings,
  ArrowUp, ArrowRight, ArrowDown, Activity, Cpu,
  AlertCircle, Play
} from 'lucide-react'
import { safeJson } from '../utils/api'

const TIERS = [
  { key: 'New', color: 'gray-500', bg: 'bg-gray-500', bgLight: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
  { key: 'Bronze', color: 'amber-500', bg: 'bg-amber-600', bgLight: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  { key: 'Silver', color: 'slate-400', bg: 'bg-slate-400', bgLight: 'bg-slate-400/20', text: 'text-slate-300', border: 'border-slate-400/30' },
  { key: 'Gold', color: 'yellow-500', bg: 'bg-yellow-500', bgLight: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  { key: 'Platinum', color: 'cyan-400', bg: 'bg-cyan-400', bgLight: 'bg-cyan-400/20', text: 'text-cyan-300', border: 'border-cyan-400/30' },
  { key: 'Enterprise', color: 'purple-500', bg: 'bg-purple-500', bgLight: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' }
]

const TIER_MAP = Object.fromEntries(TIERS.map(t => [t.key, t]))

const TAG_CONFIG = {
  'High-Growth':          { icon: TrendingUp, color: 'green', bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', desc: 'Revenue growth rate exceeds 50% month-over-month' },
  'International':        { icon: Globe, color: 'blue', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', desc: 'Sells across multiple international markets' },
  'Multi-Category':       { icon: Grid3X3, color: 'purple', bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', desc: 'Active listings across 3+ product categories' },
  'Premium Seller':       { icon: Crown, color: 'yellow', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', desc: 'Top-rated seller with consistently high satisfaction' },
  'Consistent Performer': { icon: CheckCircle, color: 'emerald', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', desc: 'Active for 60+ days with no suspensions' },
  'Established Veteran':  { icon: Star, color: 'cyan', bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', desc: 'Account age 180+ days with 50+ transactions' },
  'High-Return Risk':     { icon: AlertTriangle, color: 'red', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', desc: 'Return rate significantly above category average' },
  'Price Competitor':     { icon: ArrowDownCircle, color: 'orange', bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', desc: 'Consistently undercuts market pricing by 15%+' },
  'Seasonal':             { icon: Calendar, color: 'amber', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', desc: '50%+ of transactions concentrated in 2 months' },
  'Brand Registered':     { icon: Award, color: 'indigo', bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30', desc: 'Verified brand owner with trademark registration' }
}

const CLUSTER_COLORS = {
  'Rising Stars': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'Steady Performers': { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  'Power Sellers': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  'Premium Niche': { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  'At Risk': { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  'Dormant': { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
  'Growth Potential': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  'Market Leaders': { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  'Standard': { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30' }
}

const RISK_LEVEL_CONFIG = {
  PREMIUM: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  TRUSTED: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  STANDARD: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
  WATCH: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  ELEVATED: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
}

const DIMENSIONS = ['GMV', 'Volume', 'Age', 'Risk', 'Compliance', 'Satisfaction']
const DIM_KEYS = ['gmv', 'orderVolume', 'accountAge', 'riskScore', 'compliance', 'satisfaction']

function formatCurrency(val) {
  if (val == null) return '$0'
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`
  return `$${val.toFixed(0)}`
}

function riskLabel(riskScore) {
  if (riskScore == null) return { label: 'Low', color: 'text-emerald-400', bg: 'bg-emerald-500/20' }
  if (riskScore >= 70) return { label: 'High', color: 'text-red-400', bg: 'bg-red-500/20' }
  if (riskScore >= 40) return { label: 'Med', color: 'text-amber-400', bg: 'bg-amber-500/20' }
  return { label: 'Low', color: 'text-emerald-400', bg: 'bg-emerald-500/20' }
}

function scoreBarColor(score) {
  if (score > 70) return 'bg-emerald-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

function TierBadge({ tier }) {
  const t = TIER_MAP[tier] || TIER_MAP['New']
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.bgLight} ${t.text} border ${t.border}`}>
      {tier}
    </span>
  )
}

function RiskLevelBadge({ level }) {
  const cfg = RISK_LEVEL_CONFIG[level] || RISK_LEVEL_CONFIG['STANDARD']
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
      {level}
    </span>
  )
}

function ClusterBadge({ cluster }) {
  const name = cluster?.name || 'Standard'
  const colors = CLUSTER_COLORS[name] || CLUSTER_COLORS['Standard']
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${colors.bg} ${colors.text} border ${colors.border}`}>
      {name}
    </span>
  )
}

function TagBadge({ tag, small = false, onClick }) {
  const cfg = TAG_CONFIG[tag]
  if (!cfg) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">{tag}</span>
  const Icon = cfg.icon
  const cls = small
    ? `px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg} ${cfg.text} border ${cfg.border} inline-flex items-center gap-1`
    : `px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} border ${cfg.border} inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity`
  return (
    <span className={cls} onClick={onClick}>
      <Icon size={small ? 10 : 12} />
      {tag}
    </span>
  )
}

function TrendIndicator({ trends }) {
  if (!trends || trends.trend === 'INSUFFICIENT_DATA' || trends.trend === 'UNAVAILABLE') {
    return <span className="text-gray-600 text-xs">--</span>
  }
  const { trend, velocity } = trends
  if (trend === 'IMPROVING') {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-400" title={`Velocity: ${velocity}/day`}>
        <ArrowUp size={12} />
        <span className="text-[10px]">{velocity}</span>
      </span>
    )
  }
  if (trend === 'DECLINING') {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-400" title={`Velocity: ${velocity}/day`}>
        <ArrowDown size={12} />
        <span className="text-[10px]">{velocity}</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-gray-500" title={`Velocity: ${velocity}/day`}>
      <ArrowRight size={12} />
      <span className="text-[10px]">{velocity}</span>
    </span>
  )
}

export default function SellerSegmentation() {
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTiers, setSelectedTiers] = useState(new Set())
  const [selectedTags, setSelectedTags] = useState(new Set())
  const [sortCol, setSortCol] = useState('score')
  const [sortDir, setSortDir] = useState('desc')
  const [expandedRow, setExpandedRow] = useState(null)
  const [tierBenefits, setTierBenefits] = useState(null)
  const [selectedBenefitTier, setSelectedBenefitTier] = useState(null)
  const [clusterData, setClusterData] = useState([])
  const [recalculating, setRecalculating] = useState(false)
  const [sellerHistory, setSellerHistory] = useState({})
  const [alertsData, setAlertsData] = useState(null)
  const [actionsData, setActionsData] = useState(null)
  const [configData, setConfigData] = useState(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [configWeights, setConfigWeights] = useState(null)
  const [configSaving, setConfigSaving] = useState(false)
  const [configError, setConfigError] = useState(null)

  useEffect(() => {
    fetchSellers()
    fetchClusters()
    fetchBenefits()
    fetchAlerts()
    fetchActions()
    fetchConfig()
  }, [])

  async function fetchSellers() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/seller-tools/segmentation')
      const data = await safeJson(res)
      const list = data.sellers || data.data || data || []
      setSellers(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchClusters() {
    try {
      const res = await fetch('/api/seller-tools/segmentation/clusters')
      const data = await safeJson(res)
      setClusterData(data.clusters || [])
    } catch (_) {}
  }

  async function fetchBenefits() {
    try {
      const res = await fetch('/api/seller-tools/segmentation/benefits')
      const data = await safeJson(res)
      setTierBenefits(data.benefits || null)
    } catch (_) {}
  }

  async function fetchAlerts() {
    try {
      const res = await fetch('/api/seller-tools/segmentation/alerts')
      const data = await safeJson(res)
      setAlertsData(data)
    } catch (_) {}
  }

  async function fetchActions() {
    try {
      const res = await fetch('/api/seller-tools/segmentation/actions')
      const data = await safeJson(res)
      setActionsData(data)
    } catch (_) {}
  }

  async function fetchConfig() {
    try {
      const res = await fetch('/api/seller-tools/segmentation/config')
      const data = await safeJson(res)
      setConfigData(data.config || null)
      if (data.config?.weights) {
        setConfigWeights({ ...data.config.weights })
      }
    } catch (_) {}
  }

  async function fetchSellerHistory(sellerId) {
    try {
      const res = await fetch(`/api/seller-tools/segmentation/sellers/${sellerId}/history`)
      const data = await safeJson(res)
      setSellerHistory(prev => ({ ...prev, [sellerId]: data.data || [] }))
    } catch (_) {
      setSellerHistory(prev => ({ ...prev, [sellerId]: [] }))
    }
  }

  async function handleRecalculate() {
    setRecalculating(true)
    try {
      const res = await fetch('/api/seller-tools/segmentation/recalculate', { method: 'POST' })
      const data = await safeJson(res)
      const list = data.data || []
      setSellers(Array.isArray(list) ? list : [])
      fetchClusters()
      fetchAlerts()
      fetchActions()
    } catch (err) {
      console.error('Recalculate failed:', err.message)
    } finally {
      setRecalculating(false)
    }
  }

  async function handleSaveConfig() {
    if (!configWeights) return
    setConfigSaving(true)
    setConfigError(null)
    try {
      const res = await fetch('/api/seller-tools/segmentation/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights: configWeights })
      })
      const data = await safeJson(res)
      if (data.success === false) {
        setConfigError(data.error || 'Failed to save config')
      } else {
        setConfigData(data.config || null)
        setConfigError(null)
      }
    } catch (err) {
      setConfigError(err.message)
    } finally {
      setConfigSaving(false)
    }
  }

  const handleExpandRow = useCallback((sid) => {
    setExpandedRow(prev => {
      const next = prev === sid ? null : sid
      if (next && !sellerHistory[next]) {
        fetchSellerHistory(next)
      }
      return next
    })
  }, [sellerHistory])

  // Tier distribution
  const tierDistribution = useMemo(() => {
    const counts = {}
    TIERS.forEach(t => { counts[t.key] = 0 })
    sellers.forEach(s => {
      const tier = s.tier || 'New'
      if (counts[tier] !== undefined) counts[tier]++
      else counts[tier] = (counts[tier] || 0) + 1
    })
    const total = sellers.length || 1
    return TIERS.map(t => ({
      ...t,
      count: counts[t.key] || 0,
      pct: ((counts[t.key] || 0) / total * 100).toFixed(1)
    }))
  }, [sellers])

  // Tag counts
  const tagCounts = useMemo(() => {
    const counts = {}
    sellers.forEach(s => {
      const tags = s.tags || []
      tags.forEach(tag => {
        const name = typeof tag === 'string' ? tag : tag.name || tag.tag
        if (name) counts[name] = (counts[name] || 0) + 1
      })
    })
    return counts
  }, [sellers])

  // All unique tags
  const allTags = useMemo(() => {
    const tags = new Set()
    sellers.forEach(s => {
      (s.tags || []).forEach(tag => {
        const name = typeof tag === 'string' ? tag : tag.name || tag.tag
        if (name) tags.add(name)
      })
    })
    return Array.from(tags)
  }, [sellers])

  // Critical/high alert count for banner
  const criticalAlertCount = useMemo(() => {
    if (!alertsData?.summary) return 0
    return (alertsData.summary.critical || 0) + (alertsData.summary.high || 0)
  }, [alertsData])

  // Config weights sum
  const weightsSum = useMemo(() => {
    if (!configWeights) return 0
    return Math.round(Object.values(configWeights).reduce((a, b) => a + b, 0) * 100) / 100
  }, [configWeights])

  // Filtered sellers
  const filteredSellers = useMemo(() => {
    let list = [...sellers]

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      list = list.filter(s =>
        (s.sellerId || s.seller_id || '').toLowerCase().includes(term) ||
        (s.businessName || s.business_name || s.name || '').toLowerCase().includes(term)
      )
    }

    if (selectedTiers.size > 0) {
      list = list.filter(s => selectedTiers.has(s.tier || 'New'))
    }

    if (selectedTags.size > 0) {
      list = list.filter(s => {
        const tags = (s.tags || []).map(t => typeof t === 'string' ? t : t.name || t.tag)
        return tags.some(t => selectedTags.has(t))
      })
    }

    list.sort((a, b) => {
      let av, bv
      switch (sortCol) {
        case 'sellerId': av = a.sellerId || a.seller_id || ''; bv = b.sellerId || b.seller_id || ''; break
        case 'businessName': av = a.businessName || a.business_name || a.name || ''; bv = b.businessName || b.business_name || b.name || ''; break
        case 'tier': av = TIERS.findIndex(t => t.key === (a.tier || 'New')); bv = TIERS.findIndex(t => t.key === (b.tier || 'New')); break
        case 'score': av = a.compositeScore ?? a.score ?? a.sellerScore ?? 0; bv = b.compositeScore ?? b.score ?? b.sellerScore ?? 0; break
        case 'gmv': av = a.gmv ?? a.totalGmv ?? 0; bv = b.gmv ?? b.totalGmv ?? 0; break
        case 'orders': av = a.transactionCount ?? a.orders ?? a.orderCount ?? 0; bv = b.transactionCount ?? b.orders ?? b.orderCount ?? 0; break
        case 'risk': av = a.riskScore ?? a.risk_score ?? 0; bv = b.riskScore ?? b.risk_score ?? 0; break
        case 'age': av = a.ageDays ?? a.age ?? 0; bv = b.ageDays ?? b.age ?? 0; break
        case 'effectiveRisk': {
          const order = { ELEVATED: 4, WATCH: 3, STANDARD: 2, TRUSTED: 1, PREMIUM: 0 }
          av = order[a.effectiveRiskLevel] ?? 2; bv = order[b.effectiveRiskLevel] ?? 2; break
        }
        case 'mlScore': av = a.mlScore ?? -1; bv = b.mlScore ?? -1; break
        default: av = 0; bv = 0
      }
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })

    return list
  }, [sellers, searchTerm, selectedTiers, selectedTags, sortCol, sortDir])

  function toggleTier(tier) {
    setSelectedTiers(prev => {
      const next = new Set(prev)
      if (next.has(tier)) next.delete(tier)
      else next.add(tier)
      return next
    })
  }

  function toggleTag(tag) {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  function getSortIcon(col) {
    if (sortCol !== col) return <ArrowUpDown size={12} className="text-gray-600" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-cyan-400" />
      : <ChevronDown size={12} className="text-cyan-400" />
  }

  function getSellerTags(seller) {
    return (seller.tags || []).map(t => typeof t === 'string' ? t : t.name || t.tag).filter(Boolean)
  }

  function getSellerDimensions(seller) {
    if (seller.dimensions) return seller.dimensions
    return {
      gmv: Math.min(100, Math.round((seller.gmv ?? seller.totalGmv ?? 0) / 10000 * 100)),
      orderVolume: Math.min(100, Math.round((seller.orders ?? seller.orderCount ?? 0) / 500 * 100)),
      accountAge: Math.min(100, Math.round((seller.ageDays ?? seller.age ?? 0) / 365 * 100)),
      riskScore: Math.max(0, 100 - (seller.riskScore ?? seller.risk_score ?? 50)),
      compliance: seller.complianceScore ?? 75,
      satisfaction: seller.satisfactionScore ?? seller.satisfaction ?? 80
    }
  }

  function handleTierCardClick(tierKey) {
    toggleTier(tierKey)
    setSelectedBenefitTier(prev => prev === tierKey ? null : tierKey)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center">
        <div className="text-gray-400 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          Loading seller segmentation data...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a12] p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          <AlertTriangle size={16} className="inline mr-2" />
          {error}
        </div>
      </div>
    )
  }

  const benefitTier = selectedBenefitTier && tierBenefits ? tierBenefits[selectedBenefitTier] : null

  return (
    <div className="min-h-screen bg-[#0a0a12] text-gray-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users size={24} className="text-cyan-400" />
            Seller Segmentation
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Multi-dimensional seller analysis with tier placement, behavioral tagging, and clustering
          </p>
        </div>
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={recalculating ? 'animate-spin' : ''} />
          {recalculating ? 'Recalculating...' : 'Recalculate'}
        </button>
      </div>

      {/* Alerts Banner */}
      {criticalAlertCount > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-400 shrink-0" />
          <div className="flex-1">
            <span className="text-red-400 font-medium text-sm">
              {criticalAlertCount} seller{criticalAlertCount !== 1 ? 's' : ''} with critical or high severity alerts
            </span>
            {alertsData?.summary && (
              <span className="text-red-400/60 text-xs ml-2">
                ({alertsData.summary.critical || 0} critical, {alertsData.summary.high || 0} high)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Tier Distribution Cards */}
      <div className="grid grid-cols-6 gap-3">
        {tierDistribution.map(t => (
          <div
            key={t.key}
            className={`bg-[#12121a] border border-gray-800 rounded-lg p-3 cursor-pointer transition-all ${selectedBenefitTier === t.key ? `ring-2 ring-offset-0 ${t.border} ${t.bgLight}` : selectedTiers.has(t.key) ? `ring-1 ring-offset-0 ${t.border} ${t.bgLight}` : 'hover:border-gray-700'}`}
            onClick={() => handleTierCardClick(t.key)}
          >
            <div className={`text-xs font-medium ${t.text} uppercase tracking-wider`}>{t.key}</div>
            <div className="text-xl font-bold text-white mt-1">{t.count}</div>
            <div className="text-xs text-gray-500">{t.pct}%</div>
          </div>
        ))}
      </div>

      {/* Tier Benefits Panel */}
      {benefitTier && (
        <div className="bg-[#12121a] border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Shield size={14} className="text-cyan-400" />
            {selectedBenefitTier} Tier Benefits
          </h3>
          <div className="grid grid-cols-4 gap-4 mb-3">
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wider">Payout Frequency</div>
              <div className="text-sm text-gray-200 mt-0.5">{benefitTier.payoutFrequency}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wider">Listing Limit</div>
              <div className="text-sm text-gray-200 mt-0.5">{typeof benefitTier.listingLimit === 'number' ? benefitTier.listingLimit.toLocaleString() : benefitTier.listingLimit}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wider">Support Tier</div>
              <div className="text-sm text-gray-200 mt-0.5">{benefitTier.supportTier}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wider">Fee Discount</div>
              <div className="text-sm text-gray-200 mt-0.5">{benefitTier.feeDiscount}</div>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Features</div>
            <div className="flex flex-wrap gap-1.5">
              {benefitTier.features.map(f => (
                <span key={f} className="px-2 py-0.5 rounded-full text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Distribution Bar */}
      <div className="h-2 rounded-full overflow-hidden flex bg-gray-800">
        {tierDistribution.map(t => (
          t.count > 0 && (
            <div
              key={t.key}
              className={`${t.bg} transition-all`}
              style={{ width: `${t.pct}%` }}
              title={`${t.key}: ${t.count} (${t.pct}%)`}
            />
          )
        ))}
      </div>

      {/* Filters Row */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search by seller name or ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-[#0a0a12] border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          {/* Tier Checkboxes */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Tier:</span>
            {TIERS.map(t => (
              <label key={t.key} className="flex items-center gap-1.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={selectedTiers.has(t.key)}
                  onChange={() => toggleTier(t.key)}
                  className="sr-only"
                />
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${selectedTiers.has(t.key) ? `${t.bg} border-transparent` : 'border-gray-600 group-hover:border-gray-500'}`}>
                  {selectedTiers.has(t.key) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`text-xs ${selectedTiers.has(t.key) ? t.text : 'text-gray-400'}`}>{t.key}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Tag Filters */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 uppercase tracking-wider mr-1">Tags:</span>
            {allTags.map(tag => {
              const active = selectedTags.has(tag)
              return (
                <span
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`cursor-pointer transition-all ${active ? 'ring-1 ring-white/30 scale-105' : 'opacity-70 hover:opacity-100'}`}
                >
                  <TagBadge tag={tag} />
                </span>
              )
            })}
            {(selectedTiers.size > 0 || selectedTags.size > 0 || searchTerm) && (
              <button
                onClick={() => { setSelectedTiers(new Set()); setSelectedTags(new Set()); setSearchTerm('') }}
                className="text-xs text-gray-500 hover:text-gray-300 ml-2 underline"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="text-xs text-gray-500">
        Showing {filteredSellers.length} of {sellers.length} sellers
      </div>

      {/* Seller Table */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {[
                  { key: 'sellerId', label: 'Seller ID', w: 'w-28' },
                  { key: 'businessName', label: 'Business', w: '' },
                  { key: 'tier', label: 'Tier', w: 'w-24' },
                  { key: 'effectiveRisk', label: 'Risk Level', w: 'w-24' },
                  { key: 'score', label: 'Score', w: 'w-24' },
                  { key: 'trend', label: 'Trend', w: 'w-16', noSort: true },
                  { key: 'gmv', label: 'GMV', w: 'w-20' },
                  { key: 'orders', label: 'Orders', w: 'w-16' },
                  { key: 'mlScore', label: 'ML', w: 'w-16' },
                  { key: 'actions', label: 'Actions', w: 'w-16', noSort: true },
                  { key: 'cluster', label: 'Cluster', w: 'w-28', noSort: true },
                  { key: 'tags', label: 'Tags', w: 'w-40', noSort: true }
                ].map(col => (
                  <th
                    key={col.key}
                    className={`px-2 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider select-none ${col.w} ${col.noSort ? '' : 'cursor-pointer hover:text-gray-300'}`}
                    onClick={!col.noSort ? () => handleSort(col.key) : undefined}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {!col.noSort && getSortIcon(col.key)}
                    </div>
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filteredSellers.map(seller => {
                const sid = seller.sellerId || seller.seller_id || ''
                const bname = seller.businessName || seller.business_name || seller.name || ''
                const tier = seller.tier || 'New'
                const score = seller.compositeScore ?? seller.score ?? seller.sellerScore ?? 0
                const gmv = seller.gmv ?? seller.totalGmv ?? 0
                const orders = seller.transactionCount ?? seller.orders ?? seller.orderCount ?? 0
                const tags = getSellerTags(seller)
                const expanded = expandedRow === sid
                const cluster = seller.cluster

                return (
                  <SellerRow
                    key={sid}
                    sid={sid}
                    bname={bname}
                    tier={tier}
                    score={score}
                    gmv={gmv}
                    orders={orders}
                    tags={tags}
                    cluster={cluster}
                    expanded={expanded}
                    dimensions={getSellerDimensions(seller)}
                    seller={seller}
                    history={sellerHistory[sid] || null}
                    onToggle={() => handleExpandRow(sid)}
                  />
                )
              })}
              {filteredSellers.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-gray-500">
                    No sellers match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions Dashboard (Fix #7) */}
      {actionsData && actionsData.summary && actionsData.summary.total > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Play size={18} className="text-cyan-400" />
            Pending Actions
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {['HIGH', 'MEDIUM', 'LOW'].map(priority => {
              const items = actionsData.actions?.[priority] || []
              const bgMap = { HIGH: 'border-red-500/30', MEDIUM: 'border-amber-500/30', LOW: 'border-gray-600/30' }
              const textMap = { HIGH: 'text-red-400', MEDIUM: 'text-amber-400', LOW: 'text-gray-400' }
              const bgLightMap = { HIGH: 'bg-red-500/10', MEDIUM: 'bg-amber-500/10', LOW: 'bg-gray-500/10' }
              // Group by action type
              const grouped = {}
              items.forEach(item => {
                if (!grouped[item.action]) grouped[item.action] = []
                grouped[item.action].push(item)
              })
              return (
                <div key={priority} className={`bg-[#12121a] border ${bgMap[priority]} rounded-lg p-3`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium ${textMap[priority]} uppercase tracking-wider`}>{priority} Priority</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bgLightMap[priority]} ${textMap[priority]}`}>
                      {items.length}
                    </span>
                  </div>
                  {Object.entries(grouped).length > 0 ? (
                    <div className="space-y-1.5">
                      {Object.entries(grouped).map(([actionName, actionItems]) => (
                        <div key={actionName} className="flex items-center justify-between text-xs">
                          <span className="text-gray-300 truncate mr-2">{actionName.replace(/_/g, ' ')}</span>
                          <span className="text-gray-500 shrink-0">{actionItems.length} seller{actionItems.length !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600">No pending actions</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tag Analytics */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <BarChart3 size={18} className="text-cyan-400" />
          Tag Analytics
        </h2>
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(TAG_CONFIG).map(([tagName, cfg]) => {
            const Icon = cfg.icon
            const count = tagCounts[tagName] || 0
            const active = selectedTags.has(tagName)
            return (
              <div
                key={tagName}
                onClick={() => toggleTag(tagName)}
                className={`bg-[#12121a] border rounded-lg p-3 cursor-pointer transition-all ${active ? `${cfg.border} ${cfg.bg}` : 'border-gray-800 hover:border-gray-700'}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`p-1.5 rounded ${cfg.bg}`}>
                    <Icon size={14} className={cfg.text} />
                  </div>
                  <span className={`text-xs font-medium ${cfg.text}`}>{tagName}</span>
                </div>
                <div className="text-lg font-bold text-white">{count}</div>
                <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">{cfg.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Cluster Distribution */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Zap size={18} className="text-cyan-400" />
          Cluster Distribution
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {(clusterData.length > 0 ? clusterData : CLUSTERS_FALLBACK).map(cluster => {
            const name = cluster.name || 'Standard'
            const colors = CLUSTER_COLORS[name] || CLUSTER_COLORS['Standard']
            return (
              <div key={name} className={`bg-[#12121a] border ${colors.border} rounded-lg p-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                    {name}
                  </span>
                </div>
                <div className="text-lg font-bold text-white">{cluster.count || 0}</div>
                <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">
                  {cluster.description || ''}
                  {cluster.percentage != null && (
                    <span className="ml-1 text-gray-600">({cluster.percentage}%)</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Config Editor (Fix #6) */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg">
        <button
          onClick={() => setConfigOpen(prev => !prev)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Settings size={16} className="text-cyan-400" />
            Segmentation Config (Weights)
          </h2>
          {configOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>
        {configOpen && configWeights && (
          <div className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(configWeights).map(([key, value]) => {
                const labels = { gmv: 'GMV', orderVolume: 'Order Volume', accountAge: 'Account Age', riskScore: 'Risk Score', compliance: 'Compliance', satisfaction: 'Satisfaction' }
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-gray-400">{labels[key] || key}</label>
                      <span className="text-xs text-gray-300 font-mono">{(value * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(value * 100)}
                      onChange={e => {
                        setConfigWeights(prev => ({ ...prev, [key]: parseInt(e.target.value) / 100 }))
                      }}
                      className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-cyan-400"
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs">
                <span className="text-gray-500">Weight sum: </span>
                <span className={weightsSum === 1.0 ? 'text-emerald-400' : 'text-red-400'}>
                  {weightsSum.toFixed(2)}
                </span>
                {weightsSum !== 1.0 && (
                  <span className="text-red-400 ml-2">Weights must sum to 1.0</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {configError && <span className="text-xs text-red-400">{configError}</span>}
                <button
                  onClick={handleSaveConfig}
                  disabled={configSaving || weightsSum !== 1.0}
                  className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-medium hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
                >
                  {configSaving ? 'Saving...' : 'Save Config'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const CLUSTERS_FALLBACK = [
  { name: 'Rising Stars', count: 0, description: 'New sellers with strong early performance' },
  { name: 'Steady Performers', count: 0, description: 'Established sellers with consistent activity' },
  { name: 'Power Sellers', count: 0, description: 'High-volume, high-GMV sellers' },
  { name: 'Premium Niche', count: 0, description: 'Low-volume but high-value sellers' },
  { name: 'At Risk', count: 0, description: 'Sellers showing declining engagement' },
  { name: 'Dormant', count: 0, description: 'Inactive accounts' },
  { name: 'Growth Potential', count: 0, description: 'Active sellers not yet reaching potential' },
  { name: 'Market Leaders', count: 0, description: 'Top-tier sellers' }
]

function SellerRow({ sid, bname, tier, score, gmv, orders, tags, cluster, expanded, dimensions, seller, history, onToggle }) {
  const [actionsExpanded, setActionsExpanded] = useState(false)
  const effectiveRisk = seller.effectiveRiskLevel || 'STANDARD'
  const actionCount = (seller.actions || []).length
  const trends = seller.trends
  const mlScore = seller.mlScore
  const mlSource = seller.mlSource

  return (
    <>
      <tr
        className={`border-b border-gray-800/50 cursor-pointer transition-colors ${expanded ? 'bg-[#0a0a12]' : 'hover:bg-[#0e0e18]'}`}
        onClick={onToggle}
      >
        <td className="px-2 py-2.5 font-mono text-xs text-cyan-400">{sid}</td>
        <td className="px-2 py-2.5 text-gray-200 text-xs">{bname}</td>
        <td className="px-2 py-2.5"><TierBadge tier={tier} /></td>
        <td className="px-2 py-2.5"><RiskLevelBadge level={effectiveRisk} /></td>
        <td className="px-2 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-gray-200 font-medium text-xs w-7">{score}</span>
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden max-w-[60px]">
              <div className={`h-full rounded-full ${scoreBarColor(score)}`} style={{ width: `${Math.min(100, score)}%` }} />
            </div>
          </div>
        </td>
        <td className="px-2 py-2.5">
          <TrendIndicator trends={trends} />
        </td>
        <td className="px-2 py-2.5 text-gray-300 text-xs">{formatCurrency(gmv)}</td>
        <td className="px-2 py-2.5 text-gray-300 text-xs">{orders.toLocaleString()}</td>
        <td className="px-2 py-2.5">
          {mlScore != null ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-300 font-mono">{(mlScore * 100).toFixed(0)}</span>
              <span className={`text-[9px] px-1 py-0 rounded ${mlSource === 'live-inference' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                {mlSource === 'live-inference' ? 'ML' : 'FS'}
              </span>
            </div>
          ) : (
            <span className="text-gray-600 text-xs">--</span>
          )}
        </td>
        <td className="px-2 py-2.5">
          {actionCount > 0 ? (
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setActionsExpanded(prev => !prev) }}
            >
              {actionCount}
            </span>
          ) : (
            <span className="text-gray-600 text-xs">--</span>
          )}
        </td>
        <td className="px-2 py-2.5">
          <ClusterBadge cluster={cluster} />
        </td>
        <td className="px-2 py-2.5">
          <div className="flex items-center gap-1 flex-wrap">
            {tags.slice(0, 2).map(t => <TagBadge key={t} tag={t} small />)}
            {tags.length > 2 && <span className="text-[10px] text-gray-500">+{tags.length - 2}</span>}
          </div>
        </td>
        <td className="px-2 py-2.5 text-gray-500">
          <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </td>
      </tr>
      {/* Actions inline popover */}
      {actionsExpanded && actionCount > 0 && !expanded && (
        <tr className="bg-[#0e0e18]">
          <td colSpan={13} className="px-4 py-2">
            <div className="flex flex-wrap gap-2">
              {(seller.actions || []).map((act, i) => {
                const prioColors = { HIGH: 'text-red-400 bg-red-500/10', MEDIUM: 'text-amber-400 bg-amber-500/10', LOW: 'text-gray-400 bg-gray-500/10' }
                return (
                  <span key={i} className={`text-[10px] px-2 py-0.5 rounded ${prioColors[act.priority] || prioColors.MEDIUM}`}>
                    {act.action.replace(/_/g, ' ')} - {act.reason}
                  </span>
                )
              })}
            </div>
          </td>
        </tr>
      )}
      {expanded && (
        <tr className="bg-[#0a0a12]">
          <td colSpan={13} className="px-4 py-4">
            <div className="grid grid-cols-4 gap-6">
              {/* Dimension Breakdown */}
              <div>
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Dimension Breakdown</h4>
                <div className="space-y-2">
                  {DIMENSIONS.map((dim, idx) => {
                    const key = DIM_KEYS[idx]
                    const val = dimensions[key] ?? dimensions[dim] ?? 0
                    return (
                      <div key={dim} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-24">{dim}</span>
                        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${scoreBarColor(val)}`}
                            style={{ width: `${Math.min(100, val)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-300 w-8 text-right font-mono">{val}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Tags with descriptions */}
              <div>
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Applied Tags</h4>
                {tags.length > 0 ? (
                  <div className="space-y-2">
                    {tags.map(tag => {
                      const cfg = TAG_CONFIG[tag]
                      if (!cfg) return (
                        <div key={tag} className="flex items-center gap-2 text-xs text-gray-400">
                          <span className="px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-400">{tag}</span>
                        </div>
                      )
                      const Icon = cfg.icon
                      return (
                        <div key={tag} className="flex items-start gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} border ${cfg.border} inline-flex items-center gap-1 shrink-0`}>
                            <Icon size={10} />
                            {tag}
                          </span>
                          <span className="text-xs text-gray-500">{cfg.desc}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">No tags applied</p>
                )}
              </div>

              {/* Actions & Risk Overrides */}
              <div>
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Activity size={12} />
                  Actions & Overrides
                </h4>
                {(seller.riskOverrides || []).length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Risk Overrides</div>
                    {seller.riskOverrides.map((ro, i) => (
                      <div key={i} className="text-xs text-amber-400 mb-0.5">
                        {ro.signal}: {ro.from} -&gt; {ro.to}
                      </div>
                    ))}
                  </div>
                )}
                {(seller.actions || []).length > 0 ? (
                  <div className="space-y-1.5">
                    {seller.actions.map((act, i) => {
                      const prioColors = { HIGH: 'border-red-500/30 text-red-400', MEDIUM: 'border-amber-500/30 text-amber-400', LOW: 'border-gray-600/30 text-gray-400' }
                      return (
                        <div key={i} className={`text-xs border-l-2 pl-2 ${prioColors[act.priority] || prioColors.MEDIUM}`}>
                          <div className="font-medium">{act.action.replace(/_/g, ' ')}</div>
                          <div className="text-gray-500">{act.reason}</div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">No pending actions</p>
                )}
              </div>

              {/* Segment History & Trends */}
              <div>
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Clock size={12} />
                  History & Trends
                </h4>
                {/* Trend summary */}
                {trends && trends.trend !== 'UNAVAILABLE' && trends.trend !== 'INSUFFICIENT_DATA' && (
                  <div className="mb-3 p-2 bg-[#12121a] rounded border border-gray-800">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendIndicator trends={trends} />
                      <span className="text-xs text-gray-300">
                        {trends.trend} (velocity: {trends.velocity}/day)
                      </span>
                    </div>
                    {trends.previousScore != null && (
                      <div className="text-[10px] text-gray-500">
                        Previous: {trends.previousTier} / {trends.previousScore} pts
                      </div>
                    )}
                    {trends.alerts?.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {trends.alerts.map((alert, i) => (
                          <div key={i} className={`text-[10px] ${alert.severity === 'CRITICAL' ? 'text-red-400' : alert.severity === 'HIGH' ? 'text-amber-400' : 'text-gray-400'}`}>
                            [{alert.severity}] {alert.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {history === null ? (
                  <p className="text-xs text-gray-600">Loading...</p>
                ) : history.length === 0 ? (
                  <p className="text-xs text-gray-600">No history available</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left pb-1.5 font-medium">Date</th>
                        <th className="text-left pb-1.5 font-medium">Tier</th>
                        <th className="text-right pb-1.5 font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 5).map((snap, i) => (
                        <tr key={i} className="border-t border-gray-800/30">
                          <td className="py-1 text-gray-400">
                            {snap.computedAt ? new Date(snap.computedAt).toLocaleDateString() : '--'}
                          </td>
                          <td className="py-1"><TierBadge tier={snap.tier} /></td>
                          <td className="py-1 text-right text-gray-300 font-mono">{snap.compositeScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
