import { useState, useEffect } from 'react'
import {
  Package, Tag, FileText, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader, ArrowRight, Brain, Zap, Plus, RotateCcw, Flag
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'

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

const listingProfiles = [
  {
    sellerId: 'SLR-990ADB07', title: 'Handcrafted Beach House Wind Chimes', desc: 'Beautiful coastal-themed wind chimes made from natural driftwood and shells.', cat: 'Home & Garden',
    price: 49.99, qty: 25, condition: 'NEW', flags: {}
  },
  {
    sellerId: 'SLR-FF1DB1A3', title: 'iPhone 15 Pro Max 256GB - Brand New Sealed', desc: 'Factory sealed Apple iPhone 15 Pro Max. Full warranty included.', cat: 'Electronics',
    price: 399.00, qty: 50, condition: 'NEW', flags: { priceAnomaly: true, counterfeitRisk: true }
  },
  {
    sellerId: 'SLR-343DCA9E', title: 'Professional Hiking Backpack 65L', desc: 'Waterproof hiking backpack with ergonomic frame. Perfect for multi-day treks.', cat: 'Sports & Outdoors',
    price: 189.95, qty: 15, condition: 'NEW', flags: {}
  },
  {
    sellerId: 'SLR-E23A5F9B', title: 'Louis Vuitton Neverfull MM Monogram', desc: 'Authentic LV Neverfull handbag. Comes with dust bag and receipt.', cat: 'Fashion',
    price: 450.00, qty: 200, condition: 'NEW', flags: { counterfeitRisk: true, priceAnomaly: true, duplicateListing: true }
  },
  {
    sellerId: 'SLR-2DF52FC8', title: 'Wooden Train Set - 80 Piece Deluxe', desc: 'Premium wooden train set with bridges, tunnels, and accessories. Ages 3+.', cat: 'Toys & Games',
    price: 34.99, qty: 100, condition: 'NEW', flags: {}
  },
  {
    sellerId: 'SLR-9C3B40DE', title: 'RTX 4090 Graphics Card - BNIB', desc: 'NVIDIA GeForce RTX 4090 24GB. Brand new in box, never opened.', cat: 'Electronics',
    price: 800.00, qty: 30, condition: 'NEW', flags: { priceAnomaly: true }
  },
  {
    sellerId: 'SLR-BFBF2965', title: 'Authentic Italian Extra Virgin Olive Oil 1L', desc: 'Cold-pressed olive oil from Tuscany. DOP certified, harvest 2024.', cat: 'Home & Garden',
    price: 28.50, qty: 200, condition: 'NEW', flags: {}
  },
  {
    sellerId: 'SLR-33313A8E', title: 'Bulk Wholesale Electronics Lot - 500 Units', desc: 'Mixed electronics lot: earbuds, chargers, cables, phone cases. Great for resellers.', cat: 'Electronics',
    price: 2.99, qty: 500, condition: 'NEW', flags: { prohibitedContent: true, priceAnomaly: true }
  },
  {
    sellerId: 'SLR-9521EA9B', title: 'Premium Noise Cancelling Headphones Pro', desc: 'AirPods Max alternative. Active noise cancelling, premium audio quality.', cat: 'Electronics',
    price: 29.99, qty: 1000, condition: 'NEW', flags: { counterfeitRisk: true, priceAnomaly: true, duplicateListing: true }
  },
  {
    sellerId: 'SLR-D0157140', title: 'Brazilian Emerald Pendant - 2ct Sterling Silver', desc: 'Natural emerald pendant set in .925 sterling silver. Includes certificate of authenticity.', cat: 'Jewelry',
    price: 299.00, qty: 10, condition: 'NEW', flags: {}
  },
  {
    sellerId: 'SLR-036E8FB4', title: 'Vintage Chanel No. 5 Perfume 100ml', desc: 'Classic Chanel fragrance. Sealed box with batch code verification.', cat: 'Health & Beauty',
    price: 85.00, qty: 40, condition: 'NEW', flags: { counterfeitRisk: true }
  },
  {
    sellerId: 'SLR-8EAE5C93', title: 'South African Rooibos Tea Gift Set', desc: 'Premium organic rooibos tea collection. 6 varieties in decorative box.', cat: 'Home & Garden',
    price: 24.99, qty: 50, condition: 'NEW', flags: {}
  },
]

function generateRandomListing() {
  const profile = pick(listingProfiles)
  return {
    sellerId: profile.sellerId,
    title: profile.title,
    description: profile.desc,
    category: profile.cat,
    price: profile.price,
    quantity: profile.qty,
    condition: profile.condition,
    priceAnomaly: profile.flags.priceAnomaly || false,
    prohibitedContent: profile.flags.prohibitedContent || false,
    counterfeitRisk: profile.flags.counterfeitRisk || false,
    duplicateListing: profile.flags.duplicateListing || false
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

  const { events, isConnected, isAgentRunning, agentDecision, clearEvents } = useAgentFlow(correlationId)

  useEffect(() => {
    if (agentDecision) setSubmitting(false)
  }, [agentDecision])

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
    setFormData(generateRandomListing())
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

      const data = await response.json()

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
          } focus:border-blue-500 focus:outline-none`}
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
                <InputField label="Seller ID" field="sellerId" placeholder="SLR-XXXXX" required />
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleChange('category', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${
                      errors.category ? 'border-red-500' : 'border-gray-700'
                    } focus:border-blue-500 focus:outline-none`}
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
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none resize-none"
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
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
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
              onClick={() => setFormData(generateRandomListing())}
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
          {result?.pending && !agentDecision && (
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
          {agentDecision && agentDecision.decision !== 'ERROR' && (
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
          {agentDecision?.decision === 'ERROR' && (
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
