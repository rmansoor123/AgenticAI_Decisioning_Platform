import { useState, useEffect } from 'react'
import {
  Package, Tag, FileText, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader, ArrowRight, Brain, Zap, Plus, RotateCcw, Flag
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'
import { useSellers } from '../hooks/useSellers'
import { safeJson } from '../utils/api'

const API_BASE = '/api'

const categories = [
  'Electronics', 'Fashion', 'Home & Garden', 'Sports & Outdoors',
  'Automotive', 'Health & Beauty', 'Toys & Games', 'Books & Media',
  'Jewelry', 'Gift Cards', 'Digital Products', 'Other'
]

const conditions = [
  { value: 'NEW', label: 'New' },
  { value: 'USED_GOOD', label: 'Used - Good' },
  { value: 'USED_FAIR', label: 'Used - Fair' },
  { value: 'REFURBISHED', label: 'Refurbished' }
]

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const listingTitles = [
  'Handcrafted Beach House Wind Chimes',
  'iPhone 15 Pro Max 256GB - Brand New Sealed',
  'Professional Hiking Backpack 65L',
  'Louis Vuitton Neverfull MM Monogram',
  'Wooden Train Set - 80 Piece Deluxe',
  'RTX 4090 Graphics Card - BNIB',
  'Authentic Italian Extra Virgin Olive Oil 1L',
  'Bulk Wholesale Electronics Lot - 500 Units',
  'Premium Noise Cancelling Headphones Pro',
  'Brazilian Emerald Pendant - 2ct Sterling Silver',
  'Vintage Chanel No. 5 Perfume 100ml',
  'South African Rooibos Tea Gift Set'
]

const listingDescriptions = [
  'Beautiful coastal-themed wind chimes made from natural driftwood and shells.',
  'Factory sealed Apple iPhone 15 Pro Max. Full warranty included.',
  'Waterproof hiking backpack with ergonomic frame. Perfect for multi-day treks.',
  'Authentic LV Neverfull handbag. Comes with dust bag and receipt.',
  'Premium wooden train set with bridges, tunnels, and accessories. Ages 3+.',
  'NVIDIA GeForce RTX 4090 24GB. Brand new in box, never opened.',
  'Cold-pressed olive oil from Tuscany. DOP certified, harvest 2024.',
  'Mixed electronics lot: earbuds, chargers, cables, phone cases. Great for resellers.',
  'AirPods Max alternative. Active noise cancelling, premium audio quality.',
  'Natural emerald pendant set in .925 sterling silver. Includes certificate of authenticity.',
  'Classic Chanel fragrance. Sealed box with batch code verification.',
  'Premium organic rooibos tea collection. 6 varieties in decorative box.'
]

function generateRandomListing() {
  const idx = Math.floor(Math.random() * listingTitles.length)
  return {
    sellerId: '',
    title: listingTitles[idx],
    description: listingDescriptions[idx] || '',
    category: pick(categories),
    price: Math.round((Math.random() * 800 + 2) * 100) / 100,
    quantity: randInt(1, 500),
    condition: pick(conditions).value,
    priceAnomaly: Math.random() < 0.3,
    prohibitedContent: Math.random() < 0.1,
    counterfeitRisk: Math.random() < 0.25,
    duplicateListing: Math.random() < 0.15
  }
}

const getDecisionColor = (decision) => {
  switch (decision) {
    case 'APPROVE': return 'emerald'
    case 'REJECT': return 'red'
    case 'FLAG': return 'amber'
    default: return 'gray'
  }
}

const getDecisionIcon = (decision) => {
  switch (decision) {
    case 'APPROVE': return CheckCircle
    case 'REJECT': return XCircle
    case 'FLAG': return Flag
    default: return AlertTriangle
  }
}

export default function ListingLive() {
  const [formData, setFormData] = useState(generateRandomListing)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState({})
  const [correlationId, setCorrelationId] = useState(null)

  const { events, isConnected, isAgentRunning, agentDecision, pollingDone, clearEvents } = useAgentFlow(correlationId)
  const showDecision = !!(agentDecision && pollingDone)
  const { sellers, loading: sellersLoading, urlSellerId } = useSellers()

  useEffect(() => {
    if (showDecision) setSubmitting(false)
  }, [showDecision])

  useEffect(() => { if (urlSellerId) handleChange('sellerId', urlSellerId) }, [urlSellerId])
  useEffect(() => {
    if (sellers.length && !urlSellerId && !formData.sellerId) {
      const s = sellers[Math.floor(Math.random() * sellers.length)]
      handleChange('sellerId', s.sellerId)
    }
  }, [sellers])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }))
  }

  const validateForm = () => {
    const newErrors = {}
    if (!formData.sellerId) newErrors.sellerId = 'Required'
    if (!formData.title) newErrors.title = 'Required'
    if (!formData.category) newErrors.category = 'Required'
    if (!formData.price || formData.price <= 0) newErrors.price = 'Must be > 0'
    if (!formData.quantity || formData.quantity <= 0) newErrors.quantity = 'Must be > 0'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNewSubmission = () => {
    const d = generateRandomListing(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId
    setFormData(d)
    clearEvents()
    setCorrelationId(null)
    setSubmitting(false)
    setResult(null)
    setErrors({})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    clearEvents()
    setCorrelationId(null)
    setSubmitting(true)
    setResult(null)

    try {
      const payload = {
        sellerId: formData.sellerId,
        title: formData.title,
        description: formData.description,
        category: formData.category,
        price: formData.price,
        quantity: formData.quantity,
        condition: formData.condition,
        riskFlags: {
          priceAnomaly: formData.priceAnomaly,
          prohibitedContent: formData.prohibitedContent,
          counterfeitRisk: formData.counterfeitRisk,
          duplicateListing: formData.duplicateListing
        }
      }

      const response = await fetch(`${API_BASE}/listing/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await safeJson(response)

      if (data.success) {
        if (data.correlationId) setCorrelationId(data.correlationId)
        setResult({
          success: true,
          pending: true,
          listingId: data.listingId,
          message: data.message || 'Agent evaluation in progress...'
        })
      } else {
        setResult({ success: false, error: data.error || 'Failed to start evaluation' })
        setSubmitting(false)
      }
    } catch (error) {
      setResult({ success: false, error: error.message || 'Network error occurred' })
      setSubmitting(false)
    }
  }

  const InputField = ({ label, field, type = 'text', placeholder, required, prefix }) => (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">{label}{required && ' *'}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-2 text-gray-500 text-sm">{prefix}</span>}
        <input
          type={type}
          value={formData[field]}
          onChange={(e) => handleChange(field, type === 'number' ? parseFloat(e.target.value) || '' : e.target.value)}
          className={`w-full ${prefix ? 'pl-7' : 'px-3'} py-2 bg-gray-800 border rounded-lg text-white text-sm ${
            errors[field] ? 'border-red-500' : 'border-gray-700'
          } focus:border-purple-500 focus:outline-none`}
          placeholder={placeholder}
          step={type === 'number' ? '0.01' : undefined}
        />
      </div>
      {errors[field] && <p className="text-xs text-red-400 mt-1">{errors[field]}</p>}
    </div>
  )

  const CheckboxField = ({ label, field }) => (
    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
      <input
        type="checkbox"
        checked={formData[field] || false}
        onChange={(e) => handleChange(field, e.target.checked)}
        className="w-4 h-4 rounded bg-gray-800 border-gray-600 text-purple-500 focus:ring-purple-500"
      />
      {label}
    </label>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-xl">
              <Package className="w-6 h-6 text-white" />
            </div>
            Live Listing Review
          </h1>
          <p className="text-gray-400 mt-1">Submit listings and watch the agent evaluate content risk in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/listing"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            View All Listings
          </a>
          <button
            onClick={handleNewSubmission}
            disabled={submitting}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            New Listing
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-6" style={{ height: 'calc(100vh - 160px)' }}>
        {/* Left panel: Form */}
        <div className="w-[520px] flex-shrink-0 overflow-y-auto pr-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Listing Details */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <Tag className="w-4 h-4 text-purple-400" />
                Listing Details
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Seller *</label>
                  <select value={formData.sellerId} onChange={(e) => handleChange('sellerId', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.sellerId ? 'border-red-500' : 'border-gray-700'} focus:border-purple-500 focus:outline-none`}>
                    <option value="">Select seller</option>
                    {sellers.map(p => <option key={p.sellerId} value={p.sellerId}>{p.sellerId} — {p.name}</option>)}
                  </select>
                  {errors.sellerId && <p className="text-xs text-red-400 mt-1">{errors.sellerId}</p>}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleChange('category', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${
                      errors.category ? 'border-red-500' : 'border-gray-700'
                    } focus:border-purple-500 focus:outline-none`}
                  >
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {errors.category && <p className="text-xs text-red-400 mt-1">{errors.category}</p>}
                </div>
                <div className="col-span-2">
                  <InputField label="Title" field="title" placeholder="Product title" required />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none resize-none"
                    placeholder="Describe the product..."
                  />
                </div>
                <InputField label="Price" field="price" type="number" placeholder="99.99" required prefix="$" />
                <InputField label="Quantity" field="quantity" type="number" placeholder="10" required />
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Condition</label>
                  <select
                    value={formData.condition}
                    onChange={(e) => handleChange('condition', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
                  >
                    {conditions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Risk Flags */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-purple-400" />
                Risk Flags
              </h3>
              <div className="space-y-2.5">
                <CheckboxField label="Price Anomaly (significantly below market)" field="priceAnomaly" />
                <CheckboxField label="Prohibited Content (restricted items)" field="prohibitedContent" />
                <CheckboxField label="Counterfeit Risk (brand/authenticity concern)" field="counterfeitRisk" />
                <CheckboxField label="Duplicate Listing (same product listed multiple times)" field="duplicateListing" />
              </div>
            </div>

            {/* Generate Random */}
            <button
              type="button"
              onClick={() => { const d = generateRandomListing(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId; setFormData(d) }}
              className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Generate Random Listing
            </button>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Agent Evaluating...
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5" />
                  Submit for AI Evaluation
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Error */}
          {result && !result.success && (
            <div className="mt-4">
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-400">
                  <XCircle className="w-5 h-5" />
                  <span className="font-semibold">Error</span>
                </div>
                <p className="text-sm text-gray-300 mt-1">{result.error}</p>
              </div>
            </div>
          )}

          {/* Pending */}
          {result?.pending && !showDecision && (
            <div className="mt-4">
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <Loader className="w-5 h-5 text-purple-400 animate-spin" />
                  <div>
                    <h4 className="font-semibold text-purple-400">Agent Evaluating...</h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Watch the flow panel for real-time progress. Listing: {result.listingId}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Final Decision */}
          {showDecision && agentDecision.decision !== 'ERROR' && (
            <div className="mt-4">
              <div className={`bg-[#12121a] rounded-xl border p-4 ${
                agentDecision.decision === 'APPROVE' ? 'border-emerald-500/30' :
                agentDecision.decision === 'REJECT' ? 'border-red-500/30' :
                'border-amber-500/30'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  {(() => {
                    const Icon = getDecisionIcon(agentDecision.decision)
                    const color = getDecisionColor(agentDecision.decision)
                    return (
                      <>
                        <Icon className={`w-6 h-6 text-${color}-400`} />
                        <div>
                          <h4 className={`font-bold text-${color}-400 text-lg`}>
                            {agentDecision.decision}
                          </h4>
                          <p className="text-xs text-gray-400">
                            Confidence: {((agentDecision.confidence || 0) * 100).toFixed(0)}%
                          </p>
                        </div>
                      </>
                    )
                  })()}
                </div>
                {agentDecision.reasoning && (
                  <p className="text-sm text-gray-300 mb-2">{typeof agentDecision.reasoning === 'string' ? agentDecision.reasoning : JSON.stringify(agentDecision.reasoning)}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>Risk Score: {agentDecision.riskScore || 0}/100</span>
                  <span>Seller: {agentDecision.sellerId}</span>
                  {agentDecision.entityId && <span>Listing: {agentDecision.entityId}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Agent Error */}
          {showDecision && agentDecision?.decision === 'ERROR' && (
            <div className="mt-4">
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-400">
                  <XCircle className="w-5 h-5" />
                  <span className="font-semibold">Agent Error</span>
                </div>
                <p className="text-sm text-gray-300 mt-1">{agentDecision.error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right panel: Agent Flow Viewer */}
        <div className="flex-1 min-w-0">
          <AgentFlowViewer
            events={correlationId ? events : []}
            isConnected={isConnected}
            isRunning={correlationId ? (isAgentRunning || submitting) : false}
            correlationId={correlationId}
          />
        </div>
      </div>
    </div>
  )
}
