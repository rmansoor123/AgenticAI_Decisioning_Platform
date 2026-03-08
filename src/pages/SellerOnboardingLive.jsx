import { useState, useEffect } from 'react'
import {
  User, Building, Mail, Phone, MapPin, CreditCard, FileText,
  Shield, CheckCircle, XCircle, Clock, AlertTriangle, Loader,
  ArrowRight, Brain, Zap
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'

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
  const [formData, setFormData] = useState({
    businessName: 'Coastal Home Goods LLC',
    businessCategory: 'Home & Garden',
    businessRegistrationNumber: 'REG-2022-45891',
    businessAge: '4',
    taxId: 'TAX-84-2931567',
    email: 'info@coastalhomegoods.com',
    phone: '+1-858-555-0234',
    country: 'US',
    address: '1200 Pacific Highway, San Diego, CA 92101',
    documentType: 'DRIVERS_LICENSE',
    documentNumber: 'D1234567',
    bankName: 'Wells Fargo',
    accountNumber: '9876543210',
    routingNumber: '121042882',
    accountHolderName: 'Maria Santos',
    ipAddress: '8.8.4.4',
    website: 'https://coastalhomegoods.com'
  })

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState({})
  const [correlationId, setCorrelationId] = useState(null)

  const { events, isConnected, isAgentRunning, agentDecision, clearEvents } = useAgentFlow(correlationId)

  // Stop submitting state when agent decision arrives
  useEffect(() => {
    if (agentDecision) {
      setSubmitting(false)
    }
  }, [agentDecision])

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

      const data = await response.json()

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
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-xl">
            <Zap className="w-6 h-6 text-white" />
          </div>
          Live Seller Onboarding
        </h1>
        <p className="text-gray-400 mt-1">Submit seller data and watch the agent pipeline in real-time</p>
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
          {result?.pending && !agentDecision && (
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
            events={events}
            isConnected={isConnected}
            isRunning={isAgentRunning || submitting}
            correlationId={correlationId}
          />
        </div>
      </div>
    </div>
  )
}
