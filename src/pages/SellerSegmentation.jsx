import { useState, useEffect, useMemo } from 'react'
import {
  Search, ChevronDown, ChevronUp, ChevronRight,
  TrendingUp, Globe, Grid3X3, Crown, Truck, Code,
  AlertTriangle, ArrowDownCircle, Calendar, Award,
  Users, BarChart3, ArrowUpDown
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
  'High-Growth':      { icon: TrendingUp, color: 'green', bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', desc: 'Revenue growth rate exceeds 50% month-over-month' },
  'International':    { icon: Globe, color: 'blue', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', desc: 'Sells across multiple international markets' },
  'Multi-Category':   { icon: Grid3X3, color: 'purple', bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', desc: 'Active listings across 3+ product categories' },
  'Premium Seller':   { icon: Crown, color: 'yellow', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', desc: 'Top-rated seller with consistently high satisfaction' },
  'Fast Shipper':     { icon: Truck, color: 'emerald', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', desc: 'Average ship time under 24 hours' },
  'API Power User':   { icon: Code, color: 'cyan', bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', desc: 'Heavy API integration usage for automation' },
  'High-Return Risk': { icon: AlertTriangle, color: 'red', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', desc: 'Return rate significantly above category average' },
  'Price Competitor': { icon: ArrowDownCircle, color: 'orange', bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', desc: 'Consistently undercuts market pricing by 15%+' },
  'Seasonal':         { icon: Calendar, color: 'amber', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', desc: 'Sales volume heavily tied to seasonal patterns' },
  'Brand Registered': { icon: Award, color: 'indigo', bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30', desc: 'Verified brand owner with trademark registration' }
}

const DIMENSIONS = ['GMV', 'Volume', 'Age', 'Risk', 'Compliance', 'Satisfaction']

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

  useEffect(() => {
    fetchSellers()
  }, [])

  async function fetchSellers() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/seller-tools/segmentation/sellers')
      const data = await safeJson(res)
      const list = data.sellers || data.data || data || []
      setSellers(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

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
        case 'score': av = a.score ?? a.sellerScore ?? 0; bv = b.score ?? b.sellerScore ?? 0; break
        case 'gmv': av = a.gmv ?? a.totalGmv ?? 0; bv = b.gmv ?? b.totalGmv ?? 0; break
        case 'orders': av = a.orders ?? a.orderCount ?? 0; bv = b.orders ?? b.orderCount ?? 0; break
        case 'risk': av = a.riskScore ?? a.risk_score ?? 0; bv = b.riskScore ?? b.risk_score ?? 0; break
        case 'age': av = a.ageDays ?? a.age ?? 0; bv = b.ageDays ?? b.age ?? 0; break
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
      GMV: Math.min(100, Math.round((seller.gmv ?? seller.totalGmv ?? 0) / 10000 * 100)),
      Volume: Math.min(100, Math.round((seller.orders ?? seller.orderCount ?? 0) / 500 * 100)),
      Age: Math.min(100, Math.round((seller.ageDays ?? seller.age ?? 0) / 365 * 100)),
      Risk: Math.max(0, 100 - (seller.riskScore ?? seller.risk_score ?? 50)),
      Compliance: seller.complianceScore ?? 75,
      Satisfaction: seller.satisfactionScore ?? seller.satisfaction ?? 80
    }
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

  return (
    <div className="min-h-screen bg-[#0a0a12] text-gray-200 p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Users size={24} className="text-cyan-400" />
          Seller Segmentation
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Multi-dimensional seller analysis with tier placement and behavioral tagging
        </p>
      </div>

      {/* Tier Distribution Cards */}
      <div className="grid grid-cols-6 gap-3">
        {tierDistribution.map(t => (
          <div
            key={t.key}
            className={`bg-[#12121a] border border-gray-800 rounded-lg p-3 cursor-pointer transition-all ${selectedTiers.has(t.key) ? `ring-1 ring-offset-0 ${t.border} ${t.bgLight}` : 'hover:border-gray-700'}`}
            onClick={() => toggleTier(t.key)}
          >
            <div className={`text-xs font-medium ${t.text} uppercase tracking-wider`}>{t.key}</div>
            <div className="text-xl font-bold text-white mt-1">{t.count}</div>
            <div className="text-xs text-gray-500">{t.pct}%</div>
          </div>
        ))}
      </div>

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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {[
                { key: 'sellerId', label: 'Seller ID', w: 'w-32' },
                { key: 'businessName', label: 'Business Name', w: '' },
                { key: 'tier', label: 'Tier', w: 'w-28' },
                { key: 'score', label: 'Score', w: 'w-24' },
                { key: 'gmv', label: 'GMV', w: 'w-24' },
                { key: 'orders', label: 'Orders', w: 'w-20' },
                { key: 'risk', label: 'Risk', w: 'w-20' },
                { key: 'age', label: 'Age', w: 'w-20' },
                { key: 'tags', label: 'Tags', w: 'w-48' }
              ].map(col => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-300 select-none ${col.w}`}
                  onClick={col.key !== 'tags' ? () => handleSort(col.key) : undefined}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.key !== 'tags' && getSortIcon(col.key)}
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
              const score = seller.score ?? seller.sellerScore ?? 0
              const gmv = seller.gmv ?? seller.totalGmv ?? 0
              const orders = seller.orders ?? seller.orderCount ?? 0
              const rs = seller.riskScore ?? seller.risk_score ?? 0
              const age = seller.ageDays ?? seller.age ?? 0
              const tags = getSellerTags(seller)
              const risk = riskLabel(rs)
              const expanded = expandedRow === sid

              return (
                <SellerRow
                  key={sid}
                  sid={sid}
                  bname={bname}
                  tier={tier}
                  score={score}
                  gmv={gmv}
                  orders={orders}
                  risk={risk}
                  age={age}
                  tags={tags}
                  expanded={expanded}
                  dimensions={getSellerDimensions(seller)}
                  seller={seller}
                  onToggle={() => setExpandedRow(expanded ? null : sid)}
                />
              )
            })}
            {filteredSellers.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-gray-500">
                  No sellers match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
    </div>
  )
}

function SellerRow({ sid, bname, tier, score, gmv, orders, risk, age, tags, expanded, dimensions, seller, onToggle }) {
  return (
    <>
      <tr
        className={`border-b border-gray-800/50 cursor-pointer transition-colors ${expanded ? 'bg-[#0a0a12]' : 'hover:bg-[#0e0e18]'}`}
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 font-mono text-xs text-cyan-400">{sid}</td>
        <td className="px-3 py-2.5 text-gray-200">{bname}</td>
        <td className="px-3 py-2.5"><TierBadge tier={tier} /></td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-gray-200 font-medium text-xs w-7">{score}</span>
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden max-w-[60px]">
              <div className={`h-full rounded-full ${scoreBarColor(score)}`} style={{ width: `${Math.min(100, score)}%` }} />
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-gray-300 text-xs">{formatCurrency(gmv)}</td>
        <td className="px-3 py-2.5 text-gray-300 text-xs">{orders.toLocaleString()}</td>
        <td className="px-3 py-2.5">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${risk.bg} ${risk.color}`}>
            {risk.label}
          </span>
        </td>
        <td className="px-3 py-2.5 text-gray-400 text-xs">{age}d</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1 flex-wrap">
            {tags.slice(0, 3).map(t => <TagBadge key={t} tag={t} small />)}
            {tags.length > 3 && <span className="text-[10px] text-gray-500">+{tags.length - 3}</span>}
          </div>
        </td>
        <td className="px-3 py-2.5 text-gray-500">
          <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-[#0a0a12]">
          <td colSpan={10} className="px-4 py-4">
            <div className="grid grid-cols-2 gap-6">
              {/* Dimension Breakdown */}
              <div>
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Dimension Breakdown</h4>
                <div className="space-y-2">
                  {DIMENSIONS.map(dim => {
                    const val = dimensions[dim] ?? 0
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
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
