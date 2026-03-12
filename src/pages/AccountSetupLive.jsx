import { useState, useEffect } from 'react'
import {
  UserCog, FileText, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader, ArrowRight, Brain, Plus, RotateCcw
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'

const API_BASE = '/api'
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const acctProfiles = [
  { sellerId: 'SLR-990ADB07', name: 'Turcotte, Daniel and Quigley' },
  { sellerId: 'SLR-FF1DB1A3', name: 'Quigley - Raynor' },
  { sellerId: 'SLR-343DCA9E', name: 'Emard - Emard' },
  { sellerId: 'SLR-E23A5F9B', name: 'Carroll, Price and Torp' },
  { sellerId: 'SLR-2DF52FC8', name: 'Rodriguez Group' },
  { sellerId: 'SLR-9C3B40DE', name: 'Mraz, Grant and Ankunding' },
]

const categories = ['Electronics', 'Clothing', 'Home', 'Sports', 'Jewelry', 'Books', 'Toys']

function generateRandom() {
  const p = pick(acctProfiles)
  return {
    sellerId: p.sellerId,
    bankAccount: { last4: String(Math.floor(1000 + Math.random() * 9000)) },
    routingNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
    bankCountry: pick(['US', 'US', 'US', 'GB', 'NG', 'DE']),
    taxId: `${Math.floor(10 + Math.random() * 90)}-${Math.floor(1000000 + Math.random() * 9000000)}`,
    storeCategory: pick(categories)
  }
}

const getDecisionColor = (d) => d === 'APPROVE' ? 'emerald' : d === 'REJECT' ? 'red' : d === 'REVIEW' ? 'amber' : 'gray'
const getDecisionIcon = (d) => d === 'APPROVE' ? CheckCircle : d === 'REJECT' ? XCircle : d === 'REVIEW' ? Clock : AlertTriangle

export default function AccountSetupLive() {
  const [formData, setFormData] = useState(generateRandom)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState({})
  const [correlationId, setCorrelationId] = useState(null)
  const { events, isConnected, isAgentRunning, agentDecision, clearEvents } = useAgentFlow(correlationId)
  useEffect(() => { if (agentDecision) setSubmitting(false) }, [agentDecision])
  const handleChange = (f, v) => { setFormData(p => ({ ...p, [f]: v })); if (errors[f]) setErrors(p => ({ ...p, [f]: null })) }
  const validateForm = () => { const e = {}; if (!formData.sellerId) e.sellerId = 'Required'; setErrors(e); return Object.keys(e).length === 0 }
  const handleNewSubmission = () => { setFormData(generateRandom()); clearEvents(); setCorrelationId(null); setSubmitting(false); setResult(null); setErrors({}) }

  const handleSubmit = async (e) => {
    e.preventDefault(); if (!validateForm()) return
    clearEvents(); setCorrelationId(null); setSubmitting(true); setResult(null)
    try {
      const res = await fetch(`${API_BASE}/account-setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      const data = await res.json()
      if (data.success) { if (data.correlationId) setCorrelationId(data.correlationId); setResult({ success: true, pending: true, entityId: data.entityId, message: data.message }) }
      else { setResult({ success: false, error: data.error }); setSubmitting(false) }
    } catch (err) { setResult({ success: false, error: err.message }); setSubmitting(false) }
  }

  const InputField = ({ label, field, placeholder, required }) => (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">{label}{required && ' *'}</label>
      <input type="text" value={formData[field]} onChange={(e) => handleChange(field, e.target.value)}
        className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors[field] ? 'border-red-500' : 'border-gray-700'} focus:border-purple-500 focus:outline-none`}
        placeholder={placeholder} />
      {errors[field] && <p className="text-xs text-red-400 mt-1">{errors[field]}</p>}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl"><UserCog className="w-6 h-6 text-white" /></div>
            Live Account Setup Review
          </h1>
          <p className="text-gray-400 mt-1">Submit account setups and watch the agent evaluate risk in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/account-setup" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors flex items-center gap-2"><FileText className="w-4 h-4" /> View All</a>
          <button onClick={handleNewSubmission} disabled={submitting} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"><Plus className="w-4 h-4" /> New Setup</button>
        </div>
      </div>

      <div className="flex gap-6" style={{ height: 'calc(100vh - 160px)' }}>
        <div className="w-[520px] flex-shrink-0 overflow-y-auto pr-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm"><UserCog className="w-4 h-4 text-indigo-400" /> Account Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Seller ID" field="sellerId" placeholder="SLR-XXXXX" required />
                <InputField label="Routing Number" field="routingNumber" placeholder="12345678" />
                <InputField label="Bank Country" field="bankCountry" placeholder="US" />
                <InputField label="Tax ID" field="taxId" placeholder="XX-XXXXXXX" />
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Store Category</label>
                  <select value={formData.storeCategory} onChange={(e) => handleChange('storeCategory', e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none">
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <button type="button" onClick={() => setFormData(generateRandom())} className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-colors"><RotateCcw className="w-4 h-4" /> Generate Random</button>
            <button type="submit" disabled={submitting} className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
              {submitting ? (<><Loader className="w-5 h-5 animate-spin" /> Agent Evaluating...</>) : (<><Brain className="w-5 h-5" /> Submit for AI Evaluation <ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>

          {result && !result.success && <div className="mt-4"><div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4"><div className="flex items-center gap-2 text-red-400"><XCircle className="w-5 h-5" /><span className="font-semibold">Error</span></div><p className="text-sm text-gray-300 mt-1">{result.error}</p></div></div>}
          {result?.pending && !agentDecision && <div className="mt-4"><div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4"><div className="flex items-center gap-3"><Loader className="w-5 h-5 text-indigo-400 animate-spin" /><div><h4 className="font-semibold text-indigo-400">Agent Evaluating...</h4><p className="text-xs text-gray-400 mt-0.5">Setup: {result.entityId}</p></div></div></div></div>}

          {agentDecision && agentDecision.decision !== 'ERROR' && (() => {
            const Icon = getDecisionIcon(agentDecision.decision); const color = getDecisionColor(agentDecision.decision)
            return (<div className="mt-4"><div className={`bg-[#12121a] rounded-xl border p-4 border-${color}-500/30`}>
              <div className="flex items-center gap-3 mb-3"><Icon className={`w-6 h-6 text-${color}-400`} /><div><h4 className={`font-bold text-${color}-400 text-lg`}>{agentDecision.decision}</h4><p className="text-xs text-gray-400">Confidence: {((agentDecision.confidence || 0) * 100).toFixed(0)}%</p></div></div>
              {agentDecision.reasoning && <p className="text-sm text-gray-300 mb-2">{typeof agentDecision.reasoning === 'string' ? agentDecision.reasoning : JSON.stringify(agentDecision.reasoning)}</p>}
              <div className="flex items-center gap-4 text-xs text-gray-500"><span>Risk: {agentDecision.riskScore || 0}/100</span><span>Seller: {agentDecision.sellerId}</span></div>
            </div></div>)
          })()}
          {agentDecision?.decision === 'ERROR' && <div className="mt-4"><div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4"><div className="flex items-center gap-2 text-red-400"><XCircle className="w-5 h-5" /><span className="font-semibold">Agent Error</span></div><p className="text-sm text-gray-300 mt-1">{agentDecision.error}</p></div></div>}
        </div>
        <div className="flex-1 min-w-0"><AgentFlowViewer events={correlationId ? events : []} isConnected={isConnected} isRunning={correlationId ? (isAgentRunning || submitting) : false} correlationId={correlationId} /></div>
      </div>
    </div>
  )
}
