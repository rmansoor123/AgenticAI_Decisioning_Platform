import { useState, useEffect } from 'react'
import {
  Shield, FileText, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader, ArrowRight, Brain, Plus, RotateCcw
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'
import { useSellers } from '../hooks/useSellers'
import { safeJson } from '../utils/api'

const API_BASE = '/api'

const checkTypes = ['aml_screening', 'sanctions_check', 'pep_screening', 'tax_compliance', 'crypto_monitoring']
const jurisdictions = ['US', 'GB', 'DE', 'NG', 'RO', 'IR', 'KP']
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

function generateRandom() {
  return {
    sellerId: '',
    checkType: pick(checkTypes),
    transactionVolume: String(Math.floor(Math.random() * 499000) + 1000),
    jurisdiction: pick(jurisdictions),
    linkedAccounts: String(Math.floor(Math.random() * 6))
  }
}

const getDecisionColor = (d) => d === 'APPROVE' ? 'emerald' : d === 'BLOCK' ? 'red' : d === 'REVIEW' ? 'amber' : 'gray'
const getDecisionIcon = (d) => d === 'APPROVE' ? CheckCircle : d === 'BLOCK' ? XCircle : d === 'REVIEW' ? Clock : AlertTriangle

export default function ComplianceLive() {
  const [formData, setFormData] = useState(generateRandom)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState({})
  const [correlationId, setCorrelationId] = useState(null)

  const { events, isConnected, isAgentRunning, agentDecision, pollingDone, clearEvents } = useAgentFlow(correlationId)
  const showDecision = !!(agentDecision && pollingDone)
  const { sellers, loading: sellersLoading, urlSellerId } = useSellers()

  useEffect(() => { if (showDecision) setSubmitting(false) }, [showDecision])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }))
  }

  useEffect(() => { if (urlSellerId) handleChange('sellerId', urlSellerId) }, [urlSellerId])
  useEffect(() => {
    if (sellers.length && !urlSellerId && !formData.sellerId) {
      const s = sellers[Math.floor(Math.random() * sellers.length)]
      handleChange('sellerId', s.sellerId)
    }
  }, [sellers])

  const validateForm = () => {
    const e = {}
    if (!formData.sellerId) e.sellerId = 'Required'
    if (!formData.checkType) e.checkType = 'Required'
    if (!formData.transactionVolume) e.transactionVolume = 'Required'
    if (!formData.jurisdiction) e.jurisdiction = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleNewSubmission = () => { const d = generateRandom(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId; setFormData(d); clearEvents(); setCorrelationId(null); setSubmitting(false); setResult(null); setErrors({}) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return
    clearEvents(); setCorrelationId(null); setSubmitting(true); setResult(null)
    try {
      const response = await fetch(`${API_BASE}/compliance/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: formData.sellerId,
          checkType: formData.checkType,
          transactionVolume: parseInt(formData.transactionVolume),
          jurisdiction: formData.jurisdiction,
          linkedAccounts: parseInt(formData.linkedAccounts)
        })
      })
      const data = await safeJson(response)
      if (data.success) {
        if (data.correlationId) setCorrelationId(data.correlationId)
        setResult({ success: true, pending: true, entityId: data.entityId || data.checkId, message: data.message || 'Agent evaluation in progress...' })
      } else { setResult({ success: false, error: data.error || 'Failed' }); setSubmitting(false) }
    } catch (error) { setResult({ success: false, error: error.message }); setSubmitting(false) }
  }

  const InputField = ({ label, field, placeholder, required }) => (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">{label}{required && ' *'}</label>
      <input type="text" value={formData[field]} onChange={(e) => handleChange(field, e.target.value)}
        className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors[field] ? 'border-red-500' : 'border-gray-700'} focus:border-yellow-500 focus:outline-none`}
        placeholder={placeholder} />
      {errors[field] && <p className="text-xs text-red-400 mt-1">{errors[field]}</p>}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl">
              <Shield className="w-6 h-6 text-white" />
            </div>
            Live Compliance Check
          </h1>
          <p className="text-gray-400 mt-1">Submit compliance checks and watch the agent evaluate regulatory risk in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/compliance" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors flex items-center gap-2">
            <FileText className="w-4 h-4" /> View All Checks
          </a>
          <button onClick={handleNewSubmission} disabled={submitting} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
            <Plus className="w-4 h-4" /> New Check
          </button>
        </div>
      </div>

      <div className="flex gap-6" style={{ height: 'calc(100vh - 160px)' }}>
        <div className="w-[520px] flex-shrink-0 overflow-y-auto pr-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <Shield className="w-4 h-4 text-yellow-400" /> Compliance Details
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Seller *</label>
                  <select value={formData.sellerId} onChange={(e) => handleChange('sellerId', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.sellerId ? 'border-red-500' : 'border-gray-700'} focus:border-yellow-500 focus:outline-none`}>
                    <option value="">Select seller</option>
                    {sellers.map(p => <option key={p.sellerId} value={p.sellerId}>{p.sellerId} — {p.name}</option>)}
                  </select>
                  {errors.sellerId && <p className="text-xs text-red-400 mt-1">{errors.sellerId}</p>}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Check Type *</label>
                  <select value={formData.checkType} onChange={(e) => handleChange('checkType', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.checkType ? 'border-red-500' : 'border-gray-700'} focus:border-yellow-500 focus:outline-none`}>
                    {checkTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                  </select>
                  {errors.checkType && <p className="text-xs text-red-400 mt-1">{errors.checkType}</p>}
                </div>
                <InputField label="Transaction Volume ($)" field="transactionVolume" placeholder="100000" required />
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Jurisdiction *</label>
                  <select value={formData.jurisdiction} onChange={(e) => handleChange('jurisdiction', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.jurisdiction ? 'border-red-500' : 'border-gray-700'} focus:border-yellow-500 focus:outline-none`}>
                    {jurisdictions.map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                  {errors.jurisdiction && <p className="text-xs text-red-400 mt-1">{errors.jurisdiction}</p>}
                </div>
                <InputField label="Linked Accounts" field="linkedAccounts" placeholder="0" />
              </div>
            </div>

            <button type="button" onClick={() => { const d = generateRandom(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId; setFormData(d) }} className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-colors">
              <RotateCcw className="w-4 h-4" /> Generate Random Check
            </button>

            <button type="submit" disabled={submitting} className="w-full py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {submitting ? (<><Loader className="w-5 h-5 animate-spin" /> Agent Evaluating...</>) : (<><Brain className="w-5 h-5" /> Submit for AI Evaluation <ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>

          {result && !result.success && (
            <div className="mt-4"><div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-400"><XCircle className="w-5 h-5" /><span className="font-semibold">Error</span></div>
              <p className="text-sm text-gray-300 mt-1">{result.error}</p>
            </div></div>
          )}

          {result?.pending && !showDecision && (
            <div className="mt-4"><div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3"><Loader className="w-5 h-5 text-yellow-400 animate-spin" /><div>
                <h4 className="font-semibold text-yellow-400">Agent Evaluating...</h4>
                <p className="text-xs text-gray-400 mt-0.5">Check: {result.entityId}</p>
              </div></div>
            </div></div>
          )}

          {showDecision && agentDecision.decision !== 'ERROR' && (() => {
            const Icon = getDecisionIcon(agentDecision.decision)
            const color = getDecisionColor(agentDecision.decision)
            return (
              <div className="mt-4"><div className={`bg-[#12121a] rounded-xl border p-4 border-${color}-500/30`}>
                <div className="flex items-center gap-3 mb-3">
                  <Icon className={`w-6 h-6 text-${color}-400`} />
                  <div><h4 className={`font-bold text-${color}-400 text-lg`}>{agentDecision.decision}</h4>
                    <p className="text-xs text-gray-400">Confidence: {((agentDecision.confidence || 0) * 100).toFixed(0)}%</p></div>
                </div>
                {agentDecision.reasoning && <p className="text-sm text-gray-300 mb-2">{typeof agentDecision.reasoning === 'string' ? agentDecision.reasoning : JSON.stringify(agentDecision.reasoning)}</p>}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>Risk Score: {agentDecision.riskScore || 0}/100</span>
                  <span>Seller: {agentDecision.sellerId}</span>
                </div>
              </div></div>
            )
          })()}

          {showDecision && agentDecision?.decision === 'ERROR' && (
            <div className="mt-4"><div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-400"><XCircle className="w-5 h-5" /><span className="font-semibold">Agent Error</span></div>
              <p className="text-sm text-gray-300 mt-1">{agentDecision.error}</p>
            </div></div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <AgentFlowViewer events={correlationId ? events : []} isConnected={isConnected} isRunning={correlationId ? (isAgentRunning || submitting) : false} correlationId={correlationId} />
        </div>
      </div>
    </div>
  )
}
