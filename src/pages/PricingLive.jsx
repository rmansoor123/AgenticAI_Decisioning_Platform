import { useState, useEffect } from 'react'
import {
  Tag, FileText, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader, ArrowRight, Brain, Plus, RotateCcw
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'
import { useSellers } from '../hooks/useSellers'
import { safeJson } from '../utils/api'

const API_BASE = '/api'
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const categories = ['Electronics', 'Clothing', 'Home', 'Sports', 'Jewelry', 'Books']

function generateRandom() {
  const currentPrice = Math.round((Math.random() * 500 + 10) * 100) / 100
  const change = (Math.random() - 0.3) * currentPrice // can go negative (below cost)
  return {
    sellerId: '',
    listingId: `LST-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
    category: pick(categories),
    currentPrice,
    newPrice: Math.round(Math.max(0.01, currentPrice + change) * 100) / 100
  }
}

const getDecisionColor = (d) => d === 'APPROVE' ? 'emerald' : d === 'REJECT' ? 'red' : d === 'FLAG' ? 'amber' : 'gray'
const getDecisionIcon = (d) => d === 'APPROVE' ? CheckCircle : d === 'REJECT' ? XCircle : d === 'FLAG' ? Clock : AlertTriangle

export default function PricingLive() {
  const [formData, setFormData] = useState(generateRandom)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState({})
  const [correlationId, setCorrelationId] = useState(null)
  const { events, isConnected, isAgentRunning, agentDecision, pollingDone, clearEvents } = useAgentFlow(correlationId)
  const showDecision = !!(agentDecision && pollingDone)
  const { sellers, loading: sellersLoading, urlSellerId } = useSellers()
  useEffect(() => { if (showDecision) setSubmitting(false) }, [showDecision])
  useEffect(() => { if (urlSellerId) handleChange('sellerId', urlSellerId) }, [urlSellerId])
  useEffect(() => {
    if (sellers.length && !urlSellerId && !formData.sellerId) {
      const s = sellers[Math.floor(Math.random() * sellers.length)]
      handleChange('sellerId', s.sellerId)
    }
  }, [sellers])
  const handleChange = (f, v) => { setFormData(p => ({ ...p, [f]: v })); if (errors[f]) setErrors(p => ({ ...p, [f]: null })) }
  const validateForm = () => { const e = {}; if (!formData.sellerId) e.sellerId = 'Required'; if (!formData.newPrice) e.newPrice = 'Required'; setErrors(e); return Object.keys(e).length === 0 }
  const handleNewSubmission = () => { const d = generateRandom(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId; setFormData(d); clearEvents(); setCorrelationId(null); setSubmitting(false); setResult(null); setErrors({}) }

  const handleSubmit = async (e) => {
    e.preventDefault(); if (!validateForm()) return
    clearEvents(); setCorrelationId(null); setSubmitting(true); setResult(null)
    try {
      const res = await fetch(`${API_BASE}/pricing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      const data = await safeJson(res)
      if (data.success) { if (data.correlationId) setCorrelationId(data.correlationId); setResult({ success: true, pending: true, entityId: data.entityId, message: data.message }) }
      else { setResult({ success: false, error: data.error }); setSubmitting(false) }
    } catch (err) { setResult({ success: false, error: err.message }); setSubmitting(false) }
  }

  const InputField = ({ label, field, type = 'text', placeholder, required, prefix }) => (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">{label}{required && ' *'}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-2 text-gray-500 text-sm">{prefix}</span>}
        <input type={type} value={formData[field]} onChange={(e) => handleChange(field, type === 'number' ? parseFloat(e.target.value) || '' : e.target.value)}
          className={`w-full ${prefix ? 'pl-7' : 'px-3'} py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors[field] ? 'border-red-500' : 'border-gray-700'} focus:border-amber-500 focus:outline-none`}
          placeholder={placeholder} step={type === 'number' ? '0.01' : undefined} />
      </div>
      {errors[field] && <p className="text-xs text-red-400 mt-1">{errors[field]}</p>}
    </div>
  )

  const priceChange = formData.currentPrice && formData.newPrice ? ((formData.newPrice - formData.currentPrice) / formData.currentPrice * 100).toFixed(1) : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-yellow-500 rounded-xl"><Tag className="w-6 h-6 text-white" /></div>
            Live Pricing Review
          </h1>
          <p className="text-gray-400 mt-1">Submit price changes and watch the agent evaluate pricing risk in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/pricing" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors flex items-center gap-2"><FileText className="w-4 h-4" /> View All</a>
          <button onClick={handleNewSubmission} disabled={submitting} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"><Plus className="w-4 h-4" /> New Price</button>
        </div>
      </div>

      <div className="flex gap-6" style={{ height: 'calc(100vh - 160px)' }}>
        <div className="w-[520px] flex-shrink-0 overflow-y-auto pr-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm"><Tag className="w-4 h-4 text-amber-400" /> Pricing Details</h3>
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
                <InputField label="Listing ID" field="listingId" placeholder="LST-XXXXX" />
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Category</label>
                  <select value={formData.category} onChange={(e) => handleChange('category', e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none">
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <InputField label="Current Price" field="currentPrice" type="number" placeholder="49.99" prefix="$" />
                <InputField label="New Price" field="newPrice" type="number" placeholder="29.99" required prefix="$" />
              </div>
              {priceChange && (
                <div className={`mt-3 text-sm font-medium ${parseFloat(priceChange) < -50 ? 'text-red-400' : parseFloat(priceChange) < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  Price change: {priceChange > 0 ? '+' : ''}{priceChange}%
                </div>
              )}
            </div>
            <button type="button" onClick={() => { const d = generateRandom(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId; setFormData(d) }} className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-colors"><RotateCcw className="w-4 h-4" /> Generate Random</button>
            <button type="submit" disabled={submitting} className="w-full py-3 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
              {submitting ? (<><Loader className="w-5 h-5 animate-spin" /> Agent Evaluating...</>) : (<><Brain className="w-5 h-5" /> Submit for AI Evaluation <ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>

          {result && !result.success && <div className="mt-4"><div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4"><div className="flex items-center gap-2 text-red-400"><XCircle className="w-5 h-5" /><span className="font-semibold">Error</span></div><p className="text-sm text-gray-300 mt-1">{result.error}</p></div></div>}
          {result?.pending && !showDecision && <div className="mt-4"><div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4"><div className="flex items-center gap-3"><Loader className="w-5 h-5 text-amber-400 animate-spin" /><div><h4 className="font-semibold text-amber-400">Agent Evaluating...</h4><p className="text-xs text-gray-400 mt-0.5">Pricing: {result.entityId}</p></div></div></div></div>}

          {showDecision && agentDecision.decision !== 'ERROR' && (() => {
            const Icon = getDecisionIcon(agentDecision.decision); const color = getDecisionColor(agentDecision.decision)
            return (<div className="mt-4"><div className={`bg-[#12121a] rounded-xl border p-4 border-${color}-500/30`}>
              <div className="flex items-center gap-3 mb-3"><Icon className={`w-6 h-6 text-${color}-400`} /><div><h4 className={`font-bold text-${color}-400 text-lg`}>{agentDecision.decision}</h4><p className="text-xs text-gray-400">Confidence: {((agentDecision.confidence || 0) * 100).toFixed(0)}%</p></div></div>
              {agentDecision.reasoning && <p className="text-sm text-gray-300 mb-2">{typeof agentDecision.reasoning === 'string' ? agentDecision.reasoning : JSON.stringify(agentDecision.reasoning)}</p>}
              <div className="flex items-center gap-4 text-xs text-gray-500"><span>Risk: {agentDecision.riskScore || 0}/100</span><span>Seller: {agentDecision.sellerId}</span></div>
            </div></div>)
          })()}
          {showDecision && agentDecision?.decision === 'ERROR' && <div className="mt-4"><div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4"><div className="flex items-center gap-2 text-red-400"><XCircle className="w-5 h-5" /><span className="font-semibold">Agent Error</span></div><p className="text-sm text-gray-300 mt-1">{agentDecision.error}</p></div></div>}
        </div>
        <div className="flex-1 min-w-0"><AgentFlowViewer events={correlationId ? events : []} isConnected={isConnected} isRunning={correlationId ? (isAgentRunning || submitting) : false} correlationId={correlationId} /></div>
      </div>
    </div>
  )
}
