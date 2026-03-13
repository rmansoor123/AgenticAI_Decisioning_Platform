import { useState, useEffect } from 'react'
import {
  CreditCard, DollarSign, FileText, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader, ArrowRight, Brain, Zap, Plus, RotateCcw
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'
import { useSellers } from '../hooks/useSellers'
import { safeJson } from '../utils/api'

const API_BASE = '/api'

const payoutMethods = ['BANK_TRANSFER', 'WIRE', 'CHECK', 'CRYPTO', 'PAYPAL']

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min


function generateRandomPayout() {
  const baseAmount = pick([2450, 18750.50, 5200, 45000, 890.25, 32000, 3100, 67500, 28900, 4200.75, 12300, 950])
  const variance = baseAmount * (Math.random() * 0.4 - 0.2)
  return {
    sellerId: '',
    amount: Math.round((baseAmount + variance) * 100) / 100,
    method: pick(payoutMethods)
  }
}

const getDecisionColor = (decision) => {
  switch (decision) {
    case 'APPROVE': return 'emerald'
    case 'REJECT': return 'red'
    case 'HOLD': return 'amber'
    default: return 'gray'
  }
}

const getDecisionIcon = (decision) => {
  switch (decision) {
    case 'APPROVE': return CheckCircle
    case 'REJECT': return XCircle
    case 'HOLD': return Clock
    default: return AlertTriangle
  }
}

export default function PayoutLive() {
  const [formData, setFormData] = useState(generateRandomPayout)
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
    if (!formData.amount || formData.amount <= 0) newErrors.amount = 'Must be > 0'
    if (!formData.method) newErrors.method = 'Required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNewSubmission = () => {
    const d = generateRandomPayout(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId
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
      const response = await fetch(`${API_BASE}/payout/payouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await safeJson(response)

      if (data.success) {
        if (data.correlationId) setCorrelationId(data.correlationId)
        setResult({
          success: true,
          pending: true,
          payoutId: data.payoutId,
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            Live Payout Review
          </h1>
          <p className="text-gray-400 mt-1">Submit payout requests and watch the agent evaluate risk in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/payout"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            View All Payouts
          </a>
          <button
            onClick={handleNewSubmission}
            disabled={submitting}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            New Payout
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-6" style={{ height: 'calc(100vh - 160px)' }}>
        {/* Left panel: Form */}
        <div className="w-[520px] flex-shrink-0 overflow-y-auto pr-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Payout Details */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <DollarSign className="w-4 h-4 text-amber-400" />
                Payout Details
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Seller *</label>
                  <select value={formData.sellerId} onChange={(e) => handleChange('sellerId', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.sellerId ? 'border-red-500' : 'border-gray-700'} focus:border-amber-500 focus:outline-none`}>
                    <option value="">Select seller</option>
                    {sellers.map(p => <option key={p.sellerId} value={p.sellerId}>{p.sellerId} — {p.name}</option>)}
                  </select>
                  {errors.sellerId && <p className="text-xs text-red-400 mt-1">{errors.sellerId}</p>}
                </div>
                <InputField label="Amount" field="amount" type="number" placeholder="1000.00" required prefix="$" />
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Payout Method *</label>
                  <select
                    value={formData.method}
                    onChange={(e) => handleChange('method', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${
                      errors.method ? 'border-red-500' : 'border-gray-700'
                    } focus:border-blue-500 focus:outline-none`}
                  >
                    <option value="">Select method</option>
                    {payoutMethods.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select>
                  {errors.method && <p className="text-xs text-red-400 mt-1">{errors.method}</p>}
                </div>
              </div>
            </div>

            {/* Generate Random */}
            <button
              type="button"
              onClick={() => { const d = generateRandomPayout(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId; setFormData(d) }}
              className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Generate Random Payout
            </button>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <Loader className="w-5 h-5 text-amber-400 animate-spin" />
                  <div>
                    <h4 className="font-semibold text-amber-400">Agent Evaluating...</h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Watch the flow panel for real-time progress. Payout: {result.payoutId}
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
                  {agentDecision.entityId && <span>Payout: {agentDecision.entityId}</span>}
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
