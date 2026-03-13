import { useState, useEffect } from 'react'
import {
  User, Building, Mail, Phone, MapPin, CreditCard, FileText,
  Shield, CheckCircle, XCircle, Clock, AlertTriangle, Loader,
  ArrowRight, Brain, Zap, Plus, RotateCcw
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'
import { safeJson } from '../utils/api'

const API_BASE = '/api'

const businessCategories = [
  'Electronics', 'Fashion', 'Home & Garden', 'Sports & Outdoors',
  'Automotive', 'Health & Beauty', 'Toys & Games', 'Books & Media',
  'Food & Beverage', 'Jewelry', 'Gift Cards', 'Tickets',
  'Digital Products', 'Services', 'Other'
]

const countries = [
  'US', 'UK', 'CA', 'DE', 'FR', 'IT', 'ES', 'AU', 'JP', 'CN',
  'NG', 'RO', 'PK', 'BD', 'IN', 'BR', 'MX', 'RU', 'ZA', 'EG'
]

// --- Random seller data generation ---
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const randDigits = (n) => Array.from({ length: n }, () => randInt(0, 9)).join('')

const sellerProfiles = [
  { name: 'Coastal Home Goods LLC', cat: 'Home & Garden', country: 'US', city: 'San Diego, CA', owner: 'Maria Santos', domain: 'coastalhomegoods.com' },
  { name: 'TechFlow Electronics Inc', cat: 'Electronics', country: 'US', city: 'San Jose, CA', owner: 'Sarah Chen', domain: 'techflow-electronics.com' },
  { name: 'Alpine Sports Gear GmbH', cat: 'Sports & Outdoors', country: 'DE', city: 'Munich, Bavaria', owner: 'Hans Mueller', domain: 'alpinesportsgear.de' },
  { name: 'Sakura Beauty Tokyo', cat: 'Health & Beauty', country: 'JP', city: 'Shibuya, Tokyo', owner: 'Yuki Tanaka', domain: 'sakurabeauty.jp' },
  { name: 'Lagos Fashion House', cat: 'Fashion', country: 'NG', city: 'Victoria Island, Lagos', owner: 'Adebayo Okonkwo', domain: 'lagosfashionhouse.ng' },
  { name: 'Maple Leaf Toys Co', cat: 'Toys & Games', country: 'CA', city: 'Toronto, ON', owner: 'Emily Tremblay', domain: 'mapleleaftoys.ca' },
  { name: 'British Book Emporium', cat: 'Books & Media', country: 'UK', city: 'Kensington, London', owner: 'James Whitfield', domain: 'britishbookemporium.co.uk' },
  { name: 'Outback Auto Parts', cat: 'Automotive', country: 'AU', city: 'Sydney, NSW', owner: 'Liam McAllister', domain: 'outbackautoparts.com.au' },
  { name: 'Roma Gourmet Imports', cat: 'Food & Beverage', country: 'IT', city: 'Rome, Lazio', owner: 'Marco Rossi', domain: 'romagourmet.it' },
  { name: 'Shanghai Digital Solutions', cat: 'Digital Products', country: 'CN', city: 'Pudong, Shanghai', owner: 'Wei Zhang', domain: 'shanghaidigital.cn' },
  { name: 'Rio Jewelry Designs', cat: 'Jewelry', country: 'BR', city: 'Copacabana, Rio de Janeiro', owner: 'Ana Oliveira', domain: 'riojewelry.com.br' },
  { name: 'Paris Luxe Boutique', cat: 'Fashion', country: 'FR', city: 'Le Marais, Paris', owner: 'Sophie Dubois', domain: 'parisluxe.fr' },
  { name: 'Seoul K-Beauty Hub', cat: 'Health & Beauty', country: 'IN', city: 'New Delhi', owner: 'Priya Sharma', domain: 'kbeautyhub.in' },
  { name: 'Bucharest Tech Traders', cat: 'Electronics', country: 'RO', city: 'Sector 1, Bucharest', owner: 'Andrei Popescu', domain: 'bucharesttech.ro' },
  { name: 'Cape Town Gift Bazaar', cat: 'Gift Cards', country: 'ZA', city: 'Cape Town, WC', owner: 'Thabo Nkosi', domain: 'capetowngifts.co.za' },
  { name: 'Mexico City Event Tickets', cat: 'Tickets', country: 'MX', city: 'Polanco, CDMX', owner: 'Carlos Hernandez', domain: 'mxeventtickets.com.mx' },
  { name: 'Dhaka Handcraft Exports', cat: 'Home & Garden', country: 'BD', city: 'Gulshan, Dhaka', owner: 'Fatima Rahman', domain: 'dhakahandcraft.com.bd' },
  { name: 'Moscow Premium Services', cat: 'Services', country: 'RU', city: 'Tverskoy, Moscow', owner: 'Alexei Ivanov', domain: 'moscowpremium.ru' },
  { name: 'Karachi Wholesale Mart', cat: 'Electronics', country: 'PK', city: 'Clifton, Karachi', owner: 'Ahmed Khan', domain: 'karachiwholesale.pk' },
  { name: 'Barcelona Outdoor Living', cat: 'Home & Garden', country: 'ES', city: 'Eixample, Barcelona', owner: 'Lucia Martinez', domain: 'bcnoutdoor.es' },
]

const bankNames = ['Wells Fargo', 'Chase Bank', 'Bank of America', 'Citibank', 'HSBC', 'Deutsche Bank', 'Barclays', 'BNP Paribas', 'Santander', 'Standard Chartered', 'TD Bank', 'Commonwealth Bank']
const docTypes = ['PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID']

function generateRandomSeller() {
  const profile = pick(sellerProfiles)
  const phone = `+${randInt(1, 99)}-${randDigits(3)}-${randDigits(3)}-${randDigits(4)}`
  return {
    businessName: profile.name,
    businessCategory: profile.cat,
    businessRegistrationNumber: `REG-${randInt(2015, 2025)}-${randDigits(5)}`,
    businessAge: String(randInt(1, 20)),
    taxId: `TAX-${randDigits(2)}-${randDigits(7)}`,
    email: `${profile.owner.split(' ')[0].toLowerCase()}@${profile.domain}`,
    phone,
    country: profile.country,
    address: `${randInt(100, 9999)} ${pick(['Main St', 'Commerce Blvd', 'Market Ave', 'Enterprise Rd', 'Trade Lane', 'Innovation Dr'])}, ${profile.city}`,
    documentType: pick(docTypes),
    documentNumber: `${String.fromCharCode(65 + randInt(0, 25))}${randDigits(7)}`,
    bankName: pick(bankNames),
    accountNumber: randDigits(10),
    routingNumber: randDigits(9),
    accountHolderName: profile.owner,
    ipAddress: `${randInt(1, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`,
    website: `https://${profile.domain}`
  }
}

const getDecisionColor = (decision) => {
  switch (decision) {
    case 'APPROVE': return 'emerald'
    case 'REJECT': return 'red'
    case 'REVIEW': return 'amber'
    default: return 'gray'
  }
}

const getDecisionIcon = (decision) => {
  switch (decision) {
    case 'APPROVE': return CheckCircle
    case 'REJECT': return XCircle
    case 'REVIEW': return Clock
    default: return AlertTriangle
  }
}

export default function SellerOnboardingLive() {
  const [formData, setFormData] = useState(generateRandomSeller)

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState({})
  const [correlationId, setCorrelationId] = useState(null)

  const { events, isConnected, isAgentRunning, agentDecision, pollingDone, clearEvents } = useAgentFlow(correlationId)

  // Show decision only after polling has collected all events
  const showDecision = !!(agentDecision && pollingDone)

  useEffect(() => {
    if (showDecision) {
      setSubmitting(false)
    }
  }, [showDecision])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  const validateForm = () => {
    const newErrors = {}
    if (!formData.businessName) newErrors.businessName = 'Required'
    if (!formData.email) newErrors.email = 'Required'
    if (!formData.country) newErrors.country = 'Required'
    if (!formData.businessCategory) newErrors.businessCategory = 'Required'
    if (!formData.phone) newErrors.phone = 'Required'
    if (!formData.address) newErrors.address = 'Required'
    if (formData.email && !formData.email.includes('@')) {
      newErrors.email = 'Invalid format'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNewApplication = () => {
    setFormData(generateRandomSeller())
    clearEvents()
    setCorrelationId(null)
    setSubmitting(false)
    setResult(null)
    setErrors({})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    // Reset state
    clearEvents()
    setCorrelationId(null)
    setSubmitting(true)
    setResult(null)

    try {
      const sellerId = `SLR-${Date.now().toString(36).toUpperCase()}`
      const sellerData = {
        sellerId,
        ...formData,
        kycVerified: false,
        bankVerified: false,
        createdAt: new Date().toISOString()
      }

      const response = await fetch(`${API_BASE}/onboarding/sellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sellerData)
      })

      const data = await safeJson(response)

      if (data.success) {
        // Set correlationId to trigger backfill + live filtering
        if (data.correlationId) {
          setCorrelationId(data.correlationId)
        }

        // Agent is running async — don't show final result yet
        // The result will come via the agent:decision:complete WebSocket event
        setResult({
          success: true,
          pending: true,
          sellerId: data.sellerId,
          message: data.message || 'Agent evaluation in progress...'
        })
      } else {
        setResult({
          success: false,
          error: data.error || 'Failed to start evaluation'
        })
        setSubmitting(false)
      }
    } catch (error) {
      setResult({
        success: false,
        error: error.message || 'Network error occurred'
      })
      setSubmitting(false)
    }
  }

  const InputField = ({ label, field, type = 'text', placeholder, required, colSpan }) => (
    <div className={colSpan ? `col-span-${colSpan}` : ''}>
      <label className="block text-sm text-gray-400 mb-1.5">{label}{required && ' *'}</label>
      <input
        type={type}
        value={formData[field]}
        onChange={(e) => handleChange(field, e.target.value)}
        className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${
          errors[field] ? 'border-red-500' : 'border-gray-700'
        } focus:border-blue-500 focus:outline-none`}
        placeholder={placeholder}
      />
      {errors[field] && <p className="text-xs text-red-400 mt-1">{errors[field]}</p>}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-xl">
              <Zap className="w-6 h-6 text-white" />
            </div>
            Live Seller Onboarding
          </h1>
          <p className="text-gray-400 mt-1">Submit seller data and watch the agent pipeline in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/onboarding"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            View All Sellers
          </a>
          <button
            onClick={handleNewApplication}
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            New Application
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-6" style={{ height: 'calc(100vh - 160px)' }}>
        {/* Left panel: Form */}
        <div className="w-[520px] flex-shrink-0 overflow-y-auto pr-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Business Information */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <Building className="w-4 h-4 text-blue-400" />
                Business Information
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Business Name" field="businessName" placeholder="Acme Corporation" required />
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Business Category *</label>
                  <select
                    value={formData.businessCategory}
                    onChange={(e) => handleChange('businessCategory', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${
                      errors.businessCategory ? 'border-red-500' : 'border-gray-700'
                    } focus:border-blue-500 focus:outline-none`}
                  >
                    <option value="">Select category</option>
                    {businessCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  {errors.businessCategory && <p className="text-xs text-red-400 mt-1">{errors.businessCategory}</p>}
                </div>
                <InputField label="Registration #" field="businessRegistrationNumber" placeholder="REG-123456" />
                <InputField label="Tax ID" field="taxId" placeholder="TAX-123456" />
                <InputField label="Business Age (yrs)" field="businessAge" type="number" placeholder="5" />
                <InputField label="Website" field="website" placeholder="https://example.com" />
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-blue-400" />
                Contact Information
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Email" field="email" type="email" placeholder="seller@example.com" required />
                <InputField label="Phone" field="phone" type="tel" placeholder="+1-555-123-4567" required />
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Country *</label>
                  <select
                    value={formData.country}
                    onChange={(e) => handleChange('country', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${
                      errors.country ? 'border-red-500' : 'border-gray-700'
                    } focus:border-blue-500 focus:outline-none`}
                  >
                    <option value="">Select country</option>
                    {countries.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {errors.country && <p className="text-xs text-red-400 mt-1">{errors.country}</p>}
                </div>
                <InputField label="IP Address" field="ipAddress" placeholder="8.8.8.8" />
                <div className="col-span-2">
                  <InputField label="Address" field="address" placeholder="123 Main St, City, State" required />
                </div>
              </div>
            </div>

            {/* Identity Verification */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-blue-400" />
                Identity Document
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Document Type</label>
                  <select
                    value={formData.documentType}
                    onChange={(e) => handleChange('documentType', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Select type</option>
                    <option value="PASSPORT">Passport</option>
                    <option value="DRIVERS_LICENSE">Driver License</option>
                    <option value="NATIONAL_ID">National ID</option>
                  </select>
                </div>
                <InputField label="Document Number" field="documentNumber" placeholder="A12345678" />
              </div>
            </div>

            {/* Bank Information */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <CreditCard className="w-4 h-4 text-blue-400" />
                Bank Information
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Bank Name" field="bankName" placeholder="Chase Bank" />
                <InputField label="Account Number" field="accountNumber" placeholder="1234567890" />
                <InputField label="Routing Number" field="routingNumber" placeholder="021000021" />
                <InputField label="Account Holder" field="accountHolderName" placeholder="John Doe" />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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

          {/* Result Card */}
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

          {/* Pending indicator */}
          {result?.pending && !showDecision && (
            <div className="mt-4">
              <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <Loader className="w-5 h-5 text-indigo-400 animate-spin" />
                  <div>
                    <h4 className="font-semibold text-indigo-400">Agent Evaluating...</h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Watch the flow panel for real-time progress. Seller: {result.sellerId}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Final Decision from Agent */}
          {showDecision && agentDecision && agentDecision.decision !== 'ERROR' && (
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
                </div>
              </div>
            </div>
          )}

          {/* Continue Seller Journey */}
          {showDecision && result?.sellerId && agentDecision?.decision !== 'ERROR' && (
            <div className="mt-4 bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h4 className="text-sm font-semibold text-white mb-3">Continue Seller Journey</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Account Setup', path: '/account-setup/live' },
                  { label: 'Item Setup', path: '/item-setup/live' },
                  { label: 'Listing', path: '/listing/live' },
                  { label: 'Pricing', path: '/pricing/live' },
                  { label: 'Transaction', path: '/transaction/live' },
                  { label: 'Shipping', path: '/shipping/live' },
                  { label: 'Payout', path: '/payout/live' },
                  { label: 'Returns', path: '/returns/live' },
                  { label: 'Profile Updates', path: '/profile-updates/live' },
                  { label: 'ATO Detection', path: '/ato/live' },
                  { label: 'Compliance', path: '/compliance/live' },
                  { label: 'Network', path: '/network/live' },
                  { label: 'Review', path: '/review/live' },
                  { label: 'Behavioral', path: '/behavioral/live' },
                  { label: 'Buyer Trust', path: '/buyer-trust/live' },
                  { label: 'Policy', path: '/policy/live' },
                  { label: 'Payment', path: '/payment/live' },
                ].map(s => (
                  <a key={s.path} href={`${s.path}?sellerId=${result.sellerId}`}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg border border-gray-700 text-center transition-colors">
                    {s.label}
                  </a>
                ))}
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
