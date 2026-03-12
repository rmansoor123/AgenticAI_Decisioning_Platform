import { useState, useEffect } from 'react'
import {
  CreditCard, FileText, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader, ArrowRight, Brain, Plus, RotateCcw
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'

const API_BASE = '/api'

const paymentTypes = ['credit', 'debit', 'prepaid', 'virtual']
const currencies = ['USD', 'EUR', 'GBP']
const countries = ['US', 'GB', 'DE', 'JP']
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const sellerProfiles = [
  { sellerId: 'SLR-990ADB07', name: 'Turcotte, Daniel and Quigley', risk: 'low' },
  { sellerId: 'SLR-FF1DB1A3', name: 'Quigley - Raynor', risk: 'medium' },
  { sellerId: 'SLR-343DCA9E', name: 'Emard - Emard', risk: 'low' },
  { sellerId: 'SLR-E23A5F9B', name: 'Carroll, Price and Torp', risk: 'high' },
  { sellerId: 'SLR-2DF52FC8', name: 'Rodriguez Group', risk: 'low' },
  { sellerId: 'SLR-9C3B40DE', name: 'Mraz, Grant and Ankunding', risk: 'high' },
]

function generateRandom() {
  const profile = pick(sellerProfiles)
  return {
    sellerId: profile.sellerId,
    amount: (Math.random() * 1995 + 5).toFixed(2),
    cardBin: String(Math.floor(Math.random() * 900000) + 100000),
    cardLast4: String(Math.floor(Math.random() * 9000) + 1000),
    paymentType: pick(paymentTypes),
    currency: pick(currencies),
    billingCountry: pick(countries),
    deviceFingerprint: `FP-${Math.random().toString(36).substr(2, 8).toUpperCase()}`
  }
}

const getDecisionColor = (d) => d === 'APPROVE' ? 'emerald' : d === 'BLOCK' ? 'red' : d === 'CHALLENGE' ? 'amber' : 'gray'
const getDecisionIcon = (d) => d === 'APPROVE' ? CheckCircle : d === 'BLOCK' ? XCircle : d === 'CHALLENGE' ? Clock : AlertTriangle

export default function PaymentLive() {
  const [formData, setFormData] = useState(generateRandom)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [errors, setErrors] = useState({})
  const [correlationId, setCorrelationId] = useState(null)

  const { events, isConnected, isAgentRunning, agentDecision, clearEvents } = useAgentFlow(correlationId)

  useEffect(() => { if (agentDecision) setSubmitting(false) }, [agentDecision])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }))
  }

  const validateForm = () => {
    const e = {}
    if (!formData.sellerId) e.sellerId = 'Required'
    if (!formData.amount) e.amount = 'Required'
    if (!formData.cardBin) e.cardBin = 'Required'
    if (!formData.cardLast4) e.cardLast4 = 'Required'
    if (!formData.paymentType) e.paymentType = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleNewSubmission = () => { setFormData(generateRandom()); clearEvents(); setCorrelationId(null); setSubmitting(false); setResult(null); setErrors({}) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return
    clearEvents(); setCorrelationId(null); setSubmitting(true); setResult(null)
    try {
      const response = await fetch(`${API_BASE}/payment/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: formData.sellerId,
          amount: parseFloat(formData.amount),
          cardBin: formData.cardBin,
          cardLast4: formData.cardLast4,
          paymentType: formData.paymentType,
          currency: formData.currency,
          billingCountry: formData.billingCountry,
          deviceFingerprint: formData.deviceFingerprint
        })
      })
      const data = await response.json()
      if (data.success) {
        if (data.correlationId) setCorrelationId(data.correlationId)
        setResult({ success: true, pending: true, entityId: data.entityId || data.paymentId, message: data.message || 'Agent evaluation in progress...' })
      } else { setResult({ success: false, error: data.error || 'Failed' }); setSubmitting(false) }
    } catch (error) { setResult({ success: false, error: error.message }); setSubmitting(false) }
  }

  const InputField = ({ label, field, placeholder, required }) => (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">{label}{required && ' *'}</label>
      <input type="text" value={formData[field]} onChange={(e) => handleChange(field, e.target.value)}
        className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors[field] ? 'border-red-500' : 'border-gray-700'} focus:border-green-500 focus:outline-none`}
        placeholder={placeholder} />
      {errors[field] && <p className="text-xs text-red-400 mt-1">{errors[field]}</p>}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            Live Payment Risk
          </h1>
          <p className="text-gray-400 mt-1">Submit payment details and watch the agent evaluate risk in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/payments" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors flex items-center gap-2">
            <FileText className="w-4 h-4" /> View All Payments
          </a>
          <button onClick={handleNewSubmission} disabled={submitting} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
            <Plus className="w-4 h-4" /> New Payment
          </button>
        </div>
      </div>

      <div className="flex gap-6" style={{ height: 'calc(100vh - 160px)' }}>
        <div className="w-[520px] flex-shrink-0 overflow-y-auto pr-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <CreditCard className="w-4 h-4 text-green-400" /> Payment Details
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Seller *</label>
                  <select value={formData.sellerId} onChange={(e) => handleChange('sellerId', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.sellerId ? 'border-red-500' : 'border-gray-700'} focus:border-green-500 focus:outline-none`}>
                    <option value="">Select seller</option>
                    {sellerProfiles.map(p => <option key={p.sellerId} value={p.sellerId}>{p.sellerId} — {p.name}</option>)}
                  </select>
                  {errors.sellerId && <p className="text-xs text-red-400 mt-1">{errors.sellerId}</p>}
                </div>
                <InputField label="Amount ($)" field="amount" placeholder="0.00" required />
                <InputField label="Card BIN (6 digits)" field="cardBin" placeholder="411111" required />
                <InputField label="Card Last 4" field="cardLast4" placeholder="1234" required />
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Payment Type *</label>
                  <select value={formData.paymentType} onChange={(e) => handleChange('paymentType', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.paymentType ? 'border-red-500' : 'border-gray-700'} focus:border-green-500 focus:outline-none`}>
                    {paymentTypes.map(t => <option key={t} value={t}>{t.replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                  </select>
                  {errors.paymentType && <p className="text-xs text-red-400 mt-1">{errors.paymentType}</p>}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Currency</label>
                  <select value={formData.currency} onChange={(e) => handleChange('currency', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-green-500 focus:outline-none">
                    {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Billing Country</label>
                  <select value={formData.billingCountry} onChange={(e) => handleChange('billingCountry', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-green-500 focus:outline-none">
                    {countries.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <InputField label="Device Fingerprint" field="deviceFingerprint" placeholder="FP-XXXXX" />
              </div>
            </div>

            <button type="button" onClick={() => setFormData(generateRandom())} className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-colors">
              <RotateCcw className="w-4 h-4" /> Generate Random Payment
            </button>

            <button type="submit" disabled={submitting} className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {submitting ? (<><Loader className="w-5 h-5 animate-spin" /> Agent Evaluating...</>) : (<><Brain className="w-5 h-5" /> Submit for AI Evaluation <ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>

          {result && !result.success && (
            <div className="mt-4"><div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-400"><XCircle className="w-5 h-5" /><span className="font-semibold">Error</span></div>
              <p className="text-sm text-gray-300 mt-1">{result.error}</p>
            </div></div>
          )}

          {result?.pending && !agentDecision && (
            <div className="mt-4"><div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3"><Loader className="w-5 h-5 text-green-400 animate-spin" /><div>
                <h4 className="font-semibold text-green-400">Agent Evaluating...</h4>
                <p className="text-xs text-gray-400 mt-0.5">Payment: {result.entityId}</p>
              </div></div>
            </div></div>
          )}

          {agentDecision && agentDecision.decision !== 'ERROR' && (() => {
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

          {agentDecision?.decision === 'ERROR' && (
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
