import { useState, useEffect } from 'react'
import {
  Globe, FileText, CheckCircle, XCircle, Clock,
  AlertTriangle, Loader, ArrowRight, Brain, Plus, RotateCcw
} from 'lucide-react'
import AgentFlowViewer from '../components/AgentFlowViewer'
import { useAgentFlow } from '../hooks/useAgentFlow'
import { useSellers } from '../hooks/useSellers'
import { safeJson } from '../utils/api'

const API_BASE = '/api'

const scanTypes = ['ring_detection', 'mule_network', 'collusion', 'entity_resolution', 'dormant_reactivation']
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

function generateRandom() {
  const fpCount = Math.floor(Math.random() * 3) + 1
  const fingerprints = Array.from({ length: fpCount }, () => `FP-${Math.random().toString(36).substr(2, 8).toUpperCase()}`)
  return {
    sellerId: '',
    scanType: pick(scanTypes),
    linkedSellers: String(Math.floor(Math.random() * 9)),
    sharedInfrastructure: String(Math.floor(Math.random() * 4)),
    deviceFingerprints: fingerprints.join(', ')
  }
}

const getDecisionColor = (d) => d === 'CLEAR' ? 'emerald' : d === 'BLOCK' ? 'red' : d === 'FLAG' ? 'amber' : 'gray'
const getDecisionIcon = (d) => d === 'CLEAR' ? CheckCircle : d === 'BLOCK' ? XCircle : d === 'FLAG' ? Clock : AlertTriangle

export default function NetworkLive() {
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

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }))
  }

  const validateForm = () => {
    const e = {}
    if (!formData.sellerId) e.sellerId = 'Required'
    if (!formData.scanType) e.scanType = 'Required'
    if (!formData.deviceFingerprints) e.deviceFingerprints = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleNewSubmission = () => { const d = generateRandom(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId; setFormData(d); clearEvents(); setCorrelationId(null); setSubmitting(false); setResult(null); setErrors({}) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return
    clearEvents(); setCorrelationId(null); setSubmitting(true); setResult(null)
    try {
      const response = await fetch(`${API_BASE}/network/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: formData.sellerId,
          scanType: formData.scanType,
          linkedSellers: parseInt(formData.linkedSellers),
          sharedInfrastructure: parseInt(formData.sharedInfrastructure),
          deviceFingerprints: formData.deviceFingerprints.split(',').map(s => s.trim()).filter(Boolean)
        })
      })
      const data = await safeJson(response)
      if (data.success) {
        if (data.correlationId) setCorrelationId(data.correlationId)
        setResult({ success: true, pending: true, entityId: data.entityId || data.scanId, message: data.message || 'Agent evaluation in progress...' })
      } else { setResult({ success: false, error: data.error || 'Failed' }); setSubmitting(false) }
    } catch (error) { setResult({ success: false, error: error.message }); setSubmitting(false) }
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
            <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
              <Globe className="w-6 h-6 text-white" />
            </div>
            Live Network Analysis
          </h1>
          <p className="text-gray-400 mt-1">Submit network scans and watch the agent detect fraud rings in real-time</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/network" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition-colors flex items-center gap-2">
            <FileText className="w-4 h-4" /> View All Scans
          </a>
          <button onClick={handleNewSubmission} disabled={submitting} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
            <Plus className="w-4 h-4" /> New Scan
          </button>
        </div>
      </div>

      <div className="flex gap-6" style={{ height: 'calc(100vh - 160px)' }}>
        <div className="w-[520px] flex-shrink-0 overflow-y-auto pr-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2 text-sm">
                <Globe className="w-4 h-4 text-purple-400" /> Network Scan Details
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Seller *</label>
                  <select value={formData.sellerId} onChange={(e) => handleChange('sellerId', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.sellerId ? 'border-red-500' : 'border-gray-700'} focus:border-purple-500 focus:outline-none`}>
                    <option value="">Select seller</option>
                    {sellers.map(p => <option key={p.sellerId} value={p.sellerId}>{p.sellerId} — {p.name}</option>)}
                  </select>
                  {errors.sellerId && <p className="text-xs text-red-400 mt-1">{errors.sellerId}</p>}
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Scan Type *</label>
                  <select value={formData.scanType} onChange={(e) => handleChange('scanType', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.scanType ? 'border-red-500' : 'border-gray-700'} focus:border-purple-500 focus:outline-none`}>
                    {scanTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                  </select>
                  {errors.scanType && <p className="text-xs text-red-400 mt-1">{errors.scanType}</p>}
                </div>
                <InputField label="Linked Sellers" field="linkedSellers" placeholder="0" />
                <InputField label="Shared Infrastructure" field="sharedInfrastructure" placeholder="0" />
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1.5">Device Fingerprints (comma-separated) *</label>
                  <input type="text" value={formData.deviceFingerprints} onChange={(e) => handleChange('deviceFingerprints', e.target.value)}
                    className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm ${errors.deviceFingerprints ? 'border-red-500' : 'border-gray-700'} focus:border-purple-500 focus:outline-none`}
                    placeholder="FP-XXXXX, FP-YYYYY" />
                  {errors.deviceFingerprints && <p className="text-xs text-red-400 mt-1">{errors.deviceFingerprints}</p>}
                </div>
              </div>
            </div>

            <button type="button" onClick={() => { const d = generateRandom(); if (sellers.length) d.sellerId = sellers[Math.floor(Math.random() * sellers.length)].sellerId; setFormData(d) }} className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-colors">
              <RotateCcw className="w-4 h-4" /> Generate Random Scan
            </button>

            <button type="submit" disabled={submitting} className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
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
            <div className="mt-4"><div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3"><Loader className="w-5 h-5 text-purple-400 animate-spin" /><div>
                <h4 className="font-semibold text-purple-400">Agent Evaluating...</h4>
                <p className="text-xs text-gray-400 mt-0.5">Scan: {result.entityId}</p>
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
