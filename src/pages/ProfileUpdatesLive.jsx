import { useState, useEffect } from 'react'
import {
  UserCog, Shield, FileText, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader, ArrowRight, Brain, Zap, Plus, RotateCcw, Lock
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'
import { useSellers } from '../hooks/useSellers'
import { safeJson } from '../utils/api'

const API_BASE = '/api'

const updateTypes = [
  { value: 'bank_change', label: 'Bank Account Change' },
  { value: 'email_change', label: 'Email Address Change' },
  { value: 'phone_change', label: 'Phone Number Change' },
  { value: 'address_change', label: 'Address Change' },
  { value: 'business_name_change', label: 'Business Name Change' }
]

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]


function generateRandomProfileUpdate() {
  const updateType = pick(updateTypes).value
  const changesMap = {
    bank_change: JSON.stringify({ bankName: 'New National Bank', accountNumber: '****' + Math.floor(1000 + Math.random() * 9000), routingNumber: '021000021' }),
    email_change: JSON.stringify({ oldEmail: 'user@company.com', newEmail: 'user@gmail.com' }),
    phone_change: JSON.stringify({ oldPhone: '+1-555-0100', newPhone: '+1-555-' + Math.floor(1000 + Math.random() * 9000) }),
    address_change: JSON.stringify({ oldAddress: '123 Main St', newAddress: '456 New Ave' }),
    business_name_change: JSON.stringify({ oldName: 'Old Corp', newName: 'New Trading LLC' })
  }
  return {
    sellerId: '',
    updateType,
    changes: changesMap[updateType] || '{}',
    openDispute: Math.random() > 0.7,
    newDevice: Math.random() > 0.6,
    emailDomainDowngrade: Math.random() > 0.7
  }
}

const getDecisionColor = (decision) => {
  switch (decision) {
    case 'ALLOW': return 'emerald'
    case 'LOCK': return 'red'
    case 'STEP_UP': return 'amber'
    default: return 'gray'
  }
}

const getDecisionIcon = (decision) => {
  switch (decision) {
    case 'ALLOW': return CheckCircle
    case 'LOCK': return Lock
    case 'STEP_UP': return Shield
    default: return AlertTriangle
  }
}

export default function ProfileUpdatesLive() {
  const [formData, setFormData] = useState(generateRandomProfileUpdate)
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
    if (!formData.updateType) newErrors.updateType = 'Required'
    if (!formData.changes) newErrors.changes = 'Required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNewSubmission = () => {
    const d = generateRandomProfileUpdate(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId
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
      // Parse changes if it's a string
      let changes = formData.changes
      try { changes = JSON.parse(changes) } catch {}

      const response = await fetch(`${API_BASE}/profile-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          changes
        })
      })

      const data = await safeJson(response)

      if (data.success) {
        if (data.correlationId) setCorrelationId(data.correlationId)
        setResult({
          success: true,
          pending: true,
          updateId: data.updateId,
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

  const InputField = ({ label, field, type = 'text', placeholder, required }) => (
    <div>
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

  const CheckboxField = ({ label, field }) => (
    <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
      <input
        type="checkbox"
        checked={formData[field] || false}
        onChange={(e) => handleChange(field, e.target.checked)}
        className="w-4 h-4 rounded bg-gray-800 border-gray-600 text-orange-500 focus:ring-orange-500"
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
            <div className="p-2 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl">
              <UserCog className="w-6 h-6 text-white" />
            </div>
            Live Profile Review
          </h1>
          <p className="text-gray-400 mt-1">Submit profile changes and watch the agent evaluate mutation risk in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/profile-updates"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            View All Updates
          </a>
          <button
            onClick={handleNewSubmission}
            disabled={submitting}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            New Update
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-6" style={{ height: 'calc(100vh - 160px)' }}>
        {/* Left panel: Form */}
        <div className="w-[520px] flex-shrink-0 overflow-y-auto pr-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Update Details */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <UserCog className="w-4 h-4 text-orange-400" />
                Update Details
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Seller *</label>
                  <select value={formData.sellerId} onChange={(e) => handleChange('sellerId', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.sellerId ? 'border-red-500' : 'border-gray-700'} focus:border-orange-500 focus:outline-none`}>
                    <option value="">Select seller</option>
                    {sellers.map(p => <option key={p.sellerId} value={p.sellerId}>{p.sellerId} — {p.name}</option>)}
                  </select>
                  {errors.sellerId && <p className="text-xs text-red-400 mt-1">{errors.sellerId}</p>}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Update Type *</label>
                  <select
                    value={formData.updateType}
                    onChange={(e) => handleChange('updateType', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${
                      errors.updateType ? 'border-red-500' : 'border-gray-700'
                    } focus:border-blue-500 focus:outline-none`}
                  >
                    <option value="">Select type</option>
                    {updateTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {errors.updateType && <p className="text-xs text-red-400 mt-1">{errors.updateType}</p>}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Changes (JSON) *</label>
                  <textarea
                    value={formData.changes}
                    onChange={(e) => handleChange('changes', e.target.value)}
                    rows={4}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm font-mono ${
                      errors.changes ? 'border-red-500' : 'border-gray-700'
                    } focus:border-blue-500 focus:outline-none resize-none`}
                    placeholder='{"field": "newValue"}'
                  />
                  {errors.changes && <p className="text-xs text-red-400 mt-1">{errors.changes}</p>}
                </div>
              </div>
            </div>

            {/* Risk Signals */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                Risk Signals
              </h3>
              <div className="space-y-2.5">
                <CheckboxField label="Open Dispute (active dispute on account)" field="openDispute" />
                <CheckboxField label="New Device (unrecognized device fingerprint)" field="newDevice" />
                <CheckboxField label="Email Domain Downgrade (business → free email)" field="emailDomainDowngrade" />
              </div>
            </div>

            {/* Generate Random */}
            <button
              type="button"
              onClick={() => { const d = generateRandomProfileUpdate(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId; setFormData(d) }}
              className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Generate Random Profile Update
            </button>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <Loader className="w-5 h-5 text-orange-400 animate-spin" />
                  <div>
                    <h4 className="font-semibold text-orange-400">Agent Evaluating...</h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Watch the flow panel for real-time progress. Update: {result.updateId}
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
                agentDecision.decision === 'ALLOW' ? 'border-emerald-500/30' :
                agentDecision.decision === 'LOCK' ? 'border-red-500/30' :
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
                  {agentDecision.entityId && <span>Update: {agentDecision.entityId}</span>}
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
