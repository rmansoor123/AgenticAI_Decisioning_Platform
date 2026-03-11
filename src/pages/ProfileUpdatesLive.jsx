import { useState, useEffect } from 'react'
import {
  UserCog, Shield, FileText, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader, ArrowRight, Brain, Zap, Plus, RotateCcw, Lock
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'

const API_BASE = '/api'

const updateTypes = [
  { value: 'bank_change', label: 'Bank Account Change' },
  { value: 'email_change', label: 'Email Address Change' },
  { value: 'phone_change', label: 'Phone Number Change' },
  { value: 'address_change', label: 'Address Change' },
  { value: 'business_name_change', label: 'Business Name Change' }
]

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const profileProfiles = [
  {
    sellerId: 'SLR-990ADB07', updateType: 'bank_change',
    changes: JSON.stringify({ bankName: 'New National Bank', accountNumber: '****7892', routingNumber: '021000021' }),
    signals: {}
  },
  {
    sellerId: 'SLR-FF1DB1A3', updateType: 'email_change',
    changes: JSON.stringify({ oldEmail: 'sarah@techflow-electronics.com', newEmail: 'sarah.chen@gmail.com' }),
    signals: { emailDomainDowngrade: true }
  },
  {
    sellerId: 'SLR-E23A5F9B', updateType: 'bank_change',
    changes: JSON.stringify({ bankName: 'Offshore Holdings Ltd', accountNumber: '****1234', routingNumber: '999000111' }),
    signals: { openDispute: true, newDevice: true }
  },
  {
    sellerId: 'SLR-2DF52FC8', updateType: 'phone_change',
    changes: JSON.stringify({ oldPhone: '+1-416-555-0123', newPhone: '+1-647-555-9876' }),
    signals: {}
  },
  {
    sellerId: 'SLR-9C3B40DE', updateType: 'bank_change',
    changes: JSON.stringify({ bankName: 'Crypto Exchange Wallet', accountNumber: '0x9f8e...3a2b', routingNumber: 'N/A' }),
    signals: { openDispute: true, newDevice: true, emailDomainDowngrade: true }
  },
  {
    sellerId: 'SLR-343DCA9E', updateType: 'address_change',
    changes: JSON.stringify({ oldAddress: '45 Marienplatz, Munich', newAddress: '12 Bahnhofstr, Zurich' }),
    signals: {}
  },
  {
    sellerId: 'SLR-33313A8E', updateType: 'business_name_change',
    changes: JSON.stringify({ oldName: 'Swaniawski, Jacobs and Ritchie Solutions', newName: 'SDS Global Trading Corp' }),
    signals: { newDevice: true }
  },
  {
    sellerId: 'SLR-BFBF2965', updateType: 'email_change',
    changes: JSON.stringify({ oldEmail: 'marco@romagourmet.it', newEmail: 'marco.rossi@romagourmet.it' }),
    signals: {}
  },
  {
    sellerId: 'SLR-9521EA9B', updateType: 'bank_change',
    changes: JSON.stringify({ bankName: 'HBL Pakistan', accountNumber: '****5678', routingNumber: 'HABBPKKA' }),
    signals: { openDispute: true, emailDomainDowngrade: true }
  },
  {
    sellerId: 'SLR-D0157140', updateType: 'phone_change',
    changes: JSON.stringify({ oldPhone: '+55-21-555-0101', newPhone: '+1-305-555-7777' }),
    signals: { newDevice: true }
  },
  {
    sellerId: 'SLR-036E8FB4', updateType: 'address_change',
    changes: JSON.stringify({ oldAddress: '8 Rue de Rivoli, Paris', newAddress: '15 Av des Champs-Elysees, Paris' }),
    signals: {}
  },
  {
    sellerId: 'SLR-8EAE5C93', updateType: 'email_change',
    changes: JSON.stringify({ oldEmail: 'thabo@capetowngifts.co.za', newEmail: 'thabo.nkosi@tempmail.com' }),
    signals: { emailDomainDowngrade: true }
  },
]

function generateRandomProfileUpdate() {
  const profile = pick(profileProfiles)
  return {
    sellerId: profile.sellerId,
    updateType: profile.updateType,
    changes: profile.changes,
    openDispute: profile.signals.openDispute || false,
    newDevice: profile.signals.newDevice || false,
    emailDomainDowngrade: profile.signals.emailDomainDowngrade || false
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
    if (!formData.updateType) newErrors.updateType = 'Required'
    if (!formData.changes) newErrors.changes = 'Required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNewSubmission = () => {
    setFormData(generateRandomProfileUpdate())
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

      const data = await response.json()

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
                <InputField label="Seller ID" field="sellerId" placeholder="SLR-XXXXX" required />
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
              onClick={() => setFormData(generateRandomProfileUpdate())}
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
          {result?.pending && !agentDecision && (
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
          {agentDecision && agentDecision.decision !== 'ERROR' && (
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
