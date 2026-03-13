import { useState, useEffect } from 'react'
import {
  MessageSquare, FileText, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader, ArrowRight, Brain, Plus, RotateCcw
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'
import { useSellers } from '../hooks/useSellers'
import { safeJson } from '../utils/api'

const API_BASE = '/api'

const reviewTexts = [
  'Great seller!',
  'Fast shipping amazing product',
  'Exactly as described highly recommend',
  'Best deal ever',
  'Five stars perfect transaction',
  'Would buy again'
]

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

function generateRandom() {
  const now = new Date()
  const daysAgo = Math.floor(Math.random() * 30) + 1
  const purchaseDate = new Date(now.getTime() - daysAgo * 86400000).toISOString().split('T')[0]
  return {
    sellerId: '',
    reviewerAccount: `BUYER-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
    rating: Math.floor(Math.random() * 5) + 1,
    reviewText: pick(reviewTexts),
    purchaseDate
  }
}

const getDecisionColor = (d) => d === 'APPROVE' ? 'emerald' : d === 'FLAG' ? 'amber' : d === 'REMOVE' ? 'red' : 'gray'
const getDecisionIcon = (d) => d === 'APPROVE' ? CheckCircle : d === 'FLAG' ? Clock : d === 'REMOVE' ? XCircle : AlertTriangle

export default function ReviewLive() {
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
    if (!formData.reviewText) e.reviewText = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleNewSubmission = () => {
    const d = generateRandom()
    if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId
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
    clearEvents(); setCorrelationId(null); setSubmitting(true); setResult(null)
    try {
      const response = await fetch(`${API_BASE}/review/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: formData.sellerId,
          reviewerAccount: formData.reviewerAccount,
          rating: formData.rating,
          reviewText: formData.reviewText,
          purchaseDate: formData.purchaseDate
        })
      })
      const data = await safeJson(response)
      if (data.success) {
        if (data.correlationId) setCorrelationId(data.correlationId)
        setResult({ success: true, pending: true, entityId: data.entityId, message: data.message || 'Agent evaluation in progress...' })
      } else {
        setResult({ success: false, error: data.error || 'Failed' })
        setSubmitting(false)
      }
    } catch (error) {
      setResult({ success: false, error: error.message })
      setSubmitting(false)
    }
  }

  const InputField = ({ label, field, placeholder, required }) => (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">{label}{required && ' *'}</label>
      <input type="text" value={formData[field]} onChange={(e) => handleChange(field, e.target.value)}
        className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors[field] ? 'border-red-500' : 'border-gray-700'} focus:border-teal-500 focus:outline-none`}
        placeholder={placeholder} />
      {errors[field] && <p className="text-xs text-red-400 mt-1">{errors[field]}</p>}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            Live Review Integrity
          </h1>
          <p className="text-gray-400 mt-1">Submit reviews and watch the agent detect manipulation in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/review" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors flex items-center gap-2">
            <FileText className="w-4 h-4" /> View All Reviews
          </a>
          <button onClick={handleNewSubmission} disabled={submitting} className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
            <Plus className="w-4 h-4" /> New Review
          </button>
        </div>
      </div>

      <div className="flex gap-6" style={{ height: 'calc(100vh - 160px)' }}>
        <div className="w-[520px] flex-shrink-0 overflow-y-auto pr-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <MessageSquare className="w-4 h-4 text-teal-400" /> Review Details
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Seller *</label>
                  <select value={formData.sellerId} onChange={(e) => handleChange('sellerId', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.sellerId ? 'border-red-500' : 'border-gray-700'} focus:border-teal-500 focus:outline-none`}>
                    <option value="">Select seller</option>
                    {sellers.map(p => <option key={p.sellerId} value={p.sellerId}>{p.sellerId} — {p.name}</option>)}
                  </select>
                  {errors.sellerId && <p className="text-xs text-red-400 mt-1">{errors.sellerId}</p>}
                </div>
                <InputField label="Reviewer Account" field="reviewerAccount" placeholder="BUYER-XXXXX" />
                <InputField label="Rating (1-5)" field="rating" placeholder="1-5" />
                <InputField label="Purchase Date" field="purchaseDate" placeholder="YYYY-MM-DD" />
              </div>
              <div className="mt-3">
                <label className="block text-sm text-gray-400 mb-1.5">Review Text *</label>
                <textarea value={formData.reviewText} onChange={(e) => handleChange('reviewText', e.target.value)}
                  rows={3}
                  className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.reviewText ? 'border-red-500' : 'border-gray-700'} focus:border-teal-500 focus:outline-none resize-none`}
                  placeholder="Enter review text..." />
                {errors.reviewText && <p className="text-xs text-red-400 mt-1">{errors.reviewText}</p>}
              </div>
            </div>

            <button type="button" onClick={() => { const d = generateRandom(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId; setFormData(d) }} className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-colors">
              <RotateCcw className="w-4 h-4" /> Generate Random Review
            </button>

            <button type="submit" disabled={submitting} className="w-full py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
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
            <div className="mt-4"><div className="bg-teal-500/10 border border-teal-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3"><Loader className="w-5 h-5 text-teal-400 animate-spin" /><div>
                <h4 className="font-semibold text-teal-400">Agent Evaluating...</h4>
                <p className="text-xs text-gray-400 mt-0.5">Review: {result.entityId}</p>
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
