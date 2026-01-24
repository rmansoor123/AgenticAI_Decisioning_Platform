import { useState } from 'react'
import {
  User, Building, Mail, Phone, MapPin, CreditCard, FileText,
  Shield, CheckCircle, XCircle, Clock, AlertTriangle, Loader,
  ArrowRight, Sparkles, Brain, TrendingUp
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

export default function SellerOnboardingForm() {
  const [formData, setFormData] = useState({
    // Business Information
    businessName: '',
    businessCategory: '',
    businessRegistrationNumber: '',
    businessAge: '',
    taxId: '',
    
    // Contact Information
    email: '',
    phone: '',
    country: '',
    address: '',
    
    // Identity & Verification
    documentType: '',
    documentNumber: '',
    kycVerified: false,
    bankVerified: false,
    
    // Financial Information
    bankName: '',
    accountNumber: '',
    routingNumber: '',
    accountHolderName: '',
    
    // Additional
    ipAddress: '',
    website: ''
  })

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState({})

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

  const documentTypes = [
    'Passport', 'Driver License', 'National ID', 'Business License'
  ]

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.businessName) newErrors.businessName = 'Business name is required'
    if (!formData.email) newErrors.email = 'Email is required'
    if (!formData.country) newErrors.country = 'Country is required'
    if (!formData.businessCategory) newErrors.businessCategory = 'Business category is required'
    if (!formData.phone) newErrors.phone = 'Phone is required'
    if (!formData.address) newErrors.address = 'Address is required'

    if (formData.email && !formData.email.includes('@')) {
      newErrors.email = 'Invalid email format'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setSubmitting(true)
    setResult(null)

    try {
      // Generate seller ID if not provided
      const sellerId = `SLR-${Date.now().toString(36).toUpperCase()}`
      
      // Prepare seller data
      const sellerData = {
        sellerId,
        ...formData,
        kycVerified: formData.kycVerified || false,
        bankVerified: formData.bankVerified || false,
        createdAt: new Date().toISOString()
      }

      // Call onboarding API
      const response = await fetch(`${API_BASE}/onboarding/sellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sellerData)
      })

      const data = await response.json()

      if (data.success) {
        setResult({
          success: true,
          seller: data.data,
          evaluation: data.agentEvaluation,
          riskAssessment: data.data.onboardingRiskAssessment
        })
      } else {
        setResult({
          success: false,
          error: data.error || 'Failed to evaluate seller'
        })
      }
    } catch (error) {
      setResult({
        success: false,
        error: error.message || 'Network error occurred'
      })
    } finally {
      setSubmitting(false)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl">
            <User className="w-6 h-6 text-white" />
          </div>
          Seller Onboarding Form
        </h1>
        <p className="text-gray-400 mt-1">Submit seller information for AI-powered risk evaluation</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Form */}
        <div className="col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Business Information */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Building className="w-5 h-5 text-blue-400" />
                Business Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Business Name *</label>
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => handleChange('businessName', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white ${
                      errors.businessName ? 'border-red-500' : 'border-gray-700'
                    }`}
                    placeholder="Acme Corporation"
                  />
                  {errors.businessName && (
                    <p className="text-xs text-red-400 mt-1">{errors.businessName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Business Category *</label>
                  <select
                    value={formData.businessCategory}
                    onChange={(e) => handleChange('businessCategory', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white ${
                      errors.businessCategory ? 'border-red-500' : 'border-gray-700'
                    }`}
                  >
                    <option value="">Select category</option>
                    {businessCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {errors.businessCategory && (
                    <p className="text-xs text-red-400 mt-1">{errors.businessCategory}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Registration Number</label>
                  <input
                    type="text"
                    value={formData.businessRegistrationNumber}
                    onChange={(e) => handleChange('businessRegistrationNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="REG-123456"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Tax ID</label>
                  <input
                    type="text"
                    value={formData.taxId}
                    onChange={(e) => handleChange('taxId', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="TAX-123456"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Business Age (years)</label>
                  <input
                    type="number"
                    value={formData.businessAge}
                    onChange={(e) => handleChange('businessAge', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="5"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Website</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => handleChange('website', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="https://example.com"
                  />
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-400" />
                Contact Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white ${
                      errors.email ? 'border-red-500' : 'border-gray-700'
                    }`}
                    placeholder="seller@example.com"
                  />
                  {errors.email && (
                    <p className="text-xs text-red-400 mt-1">{errors.email}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Phone *</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white ${
                      errors.phone ? 'border-red-500' : 'border-gray-700'
                    }`}
                    placeholder="+1-555-123-4567"
                  />
                  {errors.phone && (
                    <p className="text-xs text-red-400 mt-1">{errors.phone}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Country *</label>
                  <select
                    value={formData.country}
                    onChange={(e) => handleChange('country', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white ${
                      errors.country ? 'border-red-500' : 'border-gray-700'
                    }`}
                  >
                    <option value="">Select country</option>
                    {countries.map(country => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                  {errors.country && (
                    <p className="text-xs text-red-400 mt-1">{errors.country}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">IP Address</label>
                  <input
                    type="text"
                    value={formData.ipAddress}
                    onChange={(e) => handleChange('ipAddress', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="192.168.1.1"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-2">Address *</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white ${
                      errors.address ? 'border-red-500' : 'border-gray-700'
                    }`}
                    placeholder="123 Main St, City, State, ZIP"
                  />
                  {errors.address && (
                    <p className="text-xs text-red-400 mt-1">{errors.address}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Financial Information */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-400" />
                Financial Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Bank Name</label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => handleChange('bankName', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="Chase Bank"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Account Holder Name</label>
                  <input
                    type="text"
                    value={formData.accountHolderName}
                    onChange={(e) => handleChange('accountHolderName', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Account Number</label>
                  <input
                    type="text"
                    value={formData.accountNumber}
                    onChange={(e) => handleChange('accountNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="****1234"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Routing Number</label>
                  <input
                    type="text"
                    value={formData.routingNumber}
                    onChange={(e) => handleChange('routingNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="123456789"
                  />
                </div>
              </div>
            </div>

            {/* Identity Verification */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                Identity Verification
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Document Type</label>
                  <select
                    value={formData.documentType}
                    onChange={(e) => handleChange('documentType', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  >
                    <option value="">Select document type</option>
                    {documentTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Document Number</label>
                  <input
                    type="text"
                    value={formData.documentNumber}
                    onChange={(e) => handleChange('documentNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    placeholder="DOC123456"
                  />
                </div>
                <div className="col-span-2 flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.kycVerified}
                      onChange={(e) => handleChange('kycVerified', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-700 bg-gray-800"
                    />
                    <span className="text-sm text-gray-300">KYC Verified</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.bankVerified}
                      onChange={(e) => handleChange('bankVerified', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-700 bg-gray-800"
                    />
                    <span className="text-sm text-gray-300">Bank Verified</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-lg flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Submit for AI Evaluation
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Result Panel */}
        <div className="space-y-4">
          {result && (
            <div className={`bg-[#12121a] rounded-xl border p-6 ${
              result.success 
                ? result.evaluation?.decision === 'APPROVE' ? 'border-emerald-500/30' :
                  result.evaluation?.decision === 'REJECT' ? 'border-red-500/30' :
                  'border-amber-500/30'
                : 'border-red-500/30'
            }`}>
              {result.success ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Brain className="w-5 h-5 text-blue-400" />
                      Agent Decision
                    </h3>
                    {(() => {
                      const DecisionIcon = getDecisionIcon(result.evaluation?.decision || 'REVIEW')
                      const color = getDecisionColor(result.evaluation?.decision || 'REVIEW')
                      return (
                        <div className={`p-2 rounded-lg bg-${color}-500/20`}>
                          <DecisionIcon className={`w-6 h-6 text-${color}-400`} />
                        </div>
                      )
                    })()}
                  </div>

                  <div className={`p-4 rounded-lg mb-4 bg-${getDecisionColor(result.evaluation?.decision || 'REVIEW')}-500/10 border border-${getDecisionColor(result.evaluation?.decision || 'REVIEW')}-500/30`}>
                    <div className="text-2xl font-bold text-white mb-1">
                      {result.evaluation?.decision || 'REVIEW'}
                    </div>
                    <div className="text-sm text-gray-400">
                      Confidence: {((result.evaluation?.confidence || 0) * 100).toFixed(0)}%
                    </div>
                  </div>

                  {result.riskAssessment && (
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Risk Score</div>
                        <div className="text-xl font-bold text-white">
                          {result.riskAssessment.riskScore}/100
                        </div>
                      </div>
                      {result.riskAssessment.signals && result.riskAssessment.signals.length > 0 && (
                        <div>
                          <div className="text-xs text-gray-400 mb-2">Risk Signals</div>
                          <div className="space-y-1">
                            {result.riskAssessment.signals.slice(0, 5).map((signal, i) => (
                              <div key={i} className="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded">
                                {signal.signal || signal}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.riskAssessment.agentEvaluation && (
                        <div className="pt-3 border-t border-gray-700">
                          <div className="text-xs text-gray-400 mb-1">Agent Analysis</div>
                          <div className="text-xs text-gray-300">
                            {result.riskAssessment.agentEvaluation.evidenceGathered} checks performed
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-1">Seller ID</div>
                    <div className="text-xs font-mono text-white">
                      {result.seller?.sellerId}
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <div className="text-red-400 font-medium mb-2">Error</div>
                  <div className="text-sm text-gray-400">{result.error}</div>
                </div>
              )}
            </div>
          )}

          {/* Info Card */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              AI Evaluation Process
            </h4>
            <div className="text-xs text-gray-400 space-y-1">
              <p>• Agent performs 15+ verification checks</p>
              <p>• Analyzes risk factors and patterns</p>
              <p>• Makes decision with confidence score</p>
              <p>• Provides full reasoning chain</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

