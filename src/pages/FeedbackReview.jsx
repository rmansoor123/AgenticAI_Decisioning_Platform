import { useState, useEffect, useCallback } from 'react'
import {
  MessageSquare, ThumbsUp, ThumbsDown, BarChart3, Clock, Filter,
  CheckCircle, XCircle, Send
} from 'lucide-react'

const API_BASE = '/api'

const AGENTS = [
  { value: '', label: 'All Agents' },
  { value: 'seller-onboarding', label: 'Seller Onboarding' },
  { value: 'fraud-investigation', label: 'Fraud Investigation' },
  { value: 'alert-triage', label: 'Alert Triage' },
  { value: 'rule-optimization', label: 'Rule Optimization' }
]

const REASONS = [
  { value: '', label: 'Select reason...' },
  { value: 'false_positive', label: 'False Positive' },
  { value: 'false_negative', label: 'False Negative' },
  { value: 'wrong_severity', label: 'Wrong Severity' },
  { value: 'missing_evidence', label: 'Missing Evidence' },
  { value: 'good_decision', label: 'Good Decision' },
  { value: 'other', label: 'Other' }
]

const DATE_RANGES = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'all', label: 'All Time' }
]

export default function FeedbackReview() {
  const [queue, setQueue] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedDecision, setSelectedDecision] = useState(null)
  const [feedbackForm, setFeedbackForm] = useState({ label: null, reason: '', notes: '' })
  const [filters, setFilters] = useState({ agentId: '', minConfidence: 0, maxConfidence: 1, dateRange: '30d' })
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filters.agentId) params.set('agentId', filters.agentId)
      params.set('minConfidence', filters.minConfidence)
      params.set('maxConfidence', filters.maxConfidence)
      if (filters.dateRange !== 'all') params.set('dateRange', filters.dateRange)

      const [queueRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/feedback/queue?${params}`),
        fetch(`${API_BASE}/feedback/stats`)
      ])

      const queueData = await queueRes.json()
      const statsData = await statsRes.json()

      if (queueData.success) setQueue(queueData.data || [])
      if (statsData.success) setStats(statsData.data)
    } catch (error) {
      console.error('Error fetching feedback data:', error)
      // Fallback data
      setStats({
        totalReviews: 342,
        accuracyRate: 0.891,
        pendingQueue: 28,
        last24h: 47
      })
      setQueue([
        { decisionId: 'DEC-FRAUD-001', agentId: 'fraud-investigation', riskScore: 78, confidence: 0.42, decision: 'BLOCK', createdAt: new Date(Date.now() - 3600000).toISOString() },
        { decisionId: 'DEC-SELLER-002', agentId: 'seller-onboarding', riskScore: 55, confidence: 0.51, decision: 'REVIEW', createdAt: new Date(Date.now() - 7200000).toISOString() },
        { decisionId: 'DEC-TRIAGE-003', agentId: 'alert-triage', riskScore: 92, confidence: 0.55, decision: 'ESCALATE', createdAt: new Date(Date.now() - 10800000).toISOString() },
        { decisionId: 'DEC-RULE-004', agentId: 'rule-optimization', riskScore: 34, confidence: 0.58, decision: 'APPROVE', createdAt: new Date(Date.now() - 14400000).toISOString() },
        { decisionId: 'DEC-FRAUD-005', agentId: 'fraud-investigation', riskScore: 67, confidence: 0.61, decision: 'REVIEW', createdAt: new Date(Date.now() - 18000000).toISOString() },
        { decisionId: 'DEC-SELLER-006', agentId: 'seller-onboarding', riskScore: 88, confidence: 0.63, decision: 'REJECT', createdAt: new Date(Date.now() - 21600000).toISOString() },
        { decisionId: 'DEC-TRIAGE-007', agentId: 'alert-triage', riskScore: 45, confidence: 0.67, decision: 'MONITOR', createdAt: new Date(Date.now() - 25200000).toISOString() },
        { decisionId: 'DEC-FRAUD-008', agentId: 'fraud-investigation', riskScore: 71, confidence: 0.70, decision: 'BLOCK', createdAt: new Date(Date.now() - 28800000).toISOString() }
      ])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { fetchData() }, [fetchData])

  const submitFeedback = async (decisionId) => {
    if (!feedbackForm.label || !feedbackForm.reason) return
    setSubmitting(true)
    try {
      await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionId,
          label: feedbackForm.label,
          reason: feedbackForm.reason,
          notes: feedbackForm.notes,
          reviewer: 'analyst@fraud-team.com'
        })
      })
      setQueue(prev => prev.filter(d => d.decisionId !== decisionId))
      setSelectedDecision(null)
      setFeedbackForm({ label: null, reason: '', notes: '' })
      if (stats) {
        setStats(prev => ({
          ...prev,
          totalReviews: (prev.totalReviews || 0) + 1,
          pendingQueue: Math.max(0, (prev.pendingQueue || 0) - 1),
          last24h: (prev.last24h || 0) + 1
        }))
      }
    } catch (error) {
      console.error('Error submitting feedback:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleLabelClick = (decisionId, label) => {
    if (selectedDecision === decisionId && feedbackForm.label === label) {
      setSelectedDecision(null)
      setFeedbackForm({ label: null, reason: '', notes: '' })
    } else {
      setSelectedDecision(decisionId)
      setFeedbackForm({ label, reason: '', notes: '' })
    }
  }

  const getAgentLabel = (agentId) => {
    const agent = AGENTS.find(a => a.value === agentId)
    return agent ? agent.label : agentId
  }

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    const hours = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60))
    if (hours < 1) return '< 1h ago'
    if (hours < 24) return `${hours}h ago`
    return `${Math.round(hours / 24)}d ago`
  }

  const filteredQueue = queue
    .filter(d => {
      if (filters.agentId && d.agentId !== filters.agentId) return false
      if (d.confidence < filters.minConfidence || d.confidence > filters.maxConfidence) return false
      return true
    })
    .sort((a, b) => a.confidence - b.confidence)

  if (loading) {
    return <div className="text-gray-400 text-center py-20">Loading feedback queue...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          Feedback Review
        </h1>
        <p className="text-gray-400 mt-1">Review agent decisions and provide human feedback for continuous learning</p>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <span className="text-sm text-gray-400">Total Reviews</span>
            </div>
            <div className="text-2xl font-bold text-white">{(stats.totalReviews || 0).toLocaleString()}</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <span className="text-sm text-gray-400">Accuracy Rate</span>
            </div>
            <div className="text-2xl font-bold text-white">{((stats.accuracyRate || 0) * 100).toFixed(1)}%</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <MessageSquare className="w-5 h-5 text-amber-400" />
              <span className="text-sm text-gray-400">Pending Queue</span>
            </div>
            <div className="text-2xl font-bold text-white">{stats.pendingQueue || 0}</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-purple-400" />
              <span className="text-sm text-gray-400">24h Reviews</span>
            </div>
            <div className="text-2xl font-bold text-white">{stats.last24h || 0}</div>
          </div>
        </div>
      )}

      {/* Filters Row */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-400">Filters</span>
          </div>

          <select
            value={filters.agentId}
            onChange={e => setFilters(f => ({ ...f, agentId: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
          >
            {AGENTS.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Confidence</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={filters.minConfidence}
              onChange={e => setFilters(f => ({ ...f, minConfidence: parseFloat(e.target.value) || 0 }))}
              className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
            <span className="text-gray-500">-</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={filters.maxConfidence}
              onChange={e => setFilters(f => ({ ...f, maxConfidence: parseFloat(e.target.value) || 1 }))}
              className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1">
            {DATE_RANGES.map(dr => (
              <button
                key={dr.value}
                onClick={() => setFilters(f => ({ ...f, dateRange: dr.value }))}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  filters.dateRange === dr.value
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-white'
                }`}
              >
                {dr.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-gray-500 ml-auto">{filteredQueue.length} decisions pending</span>
        </div>
      </div>

      {/* Decision Queue Table */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Decision ID</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Agent</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Risk Score</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Confidence</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Decision</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Created</th>
              <th className="text-left text-xs text-gray-500 font-medium px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredQueue.map(d => (
              <tr key={d.decisionId} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3 text-sm font-mono text-cyan-400">{d.decisionId}</td>
                <td className="px-4 py-3 text-sm text-gray-300">{getAgentLabel(d.agentId)}</td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-mono ${d.riskScore > 70 ? 'text-red-400' : d.riskScore > 40 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {d.riskScore}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          d.confidence > 0.7 ? 'bg-emerald-400' : d.confidence > 0.4 ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${d.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono text-gray-300">{(d.confidence * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    d.decision === 'BLOCK' || d.decision === 'REJECT' ? 'bg-red-500/20 text-red-400' :
                    d.decision === 'REVIEW' || d.decision === 'ESCALATE' ? 'bg-amber-500/20 text-amber-400' :
                    d.decision === 'MONITOR' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {d.decision}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">{formatDate(d.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleLabelClick(d.decisionId, 'correct')}
                      className={`p-1.5 rounded-lg transition-colors ${
                        selectedDecision === d.decisionId && feedbackForm.label === 'correct'
                          ? 'bg-emerald-500/30 text-emerald-400'
                          : 'hover:bg-emerald-500/10 text-gray-500 hover:text-emerald-400'
                      }`}
                      title="Mark as correct"
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleLabelClick(d.decisionId, 'incorrect')}
                      className={`p-1.5 rounded-lg transition-colors ${
                        selectedDecision === d.decisionId && feedbackForm.label === 'incorrect'
                          ? 'bg-red-500/30 text-red-400'
                          : 'hover:bg-red-500/10 text-gray-500 hover:text-red-400'
                      }`}
                      title="Mark as incorrect"
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredQueue.length === 0 && (
          <div className="text-center text-gray-500 py-12">No decisions pending review</div>
        )}
      </div>

      {/* Feedback Submission Panel */}
      {selectedDecision && feedbackForm.label && (
        <div className={`border rounded-xl p-6 ${
          feedbackForm.label === 'correct'
            ? 'bg-emerald-500/5 border-emerald-500/30'
            : 'bg-red-500/5 border-red-500/30'
        }`}>
          <div className="flex items-center gap-3 mb-4">
            {feedbackForm.label === 'correct' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            <span className="font-medium text-white">
              Marking {selectedDecision} as{' '}
              <span className={feedbackForm.label === 'correct' ? 'text-emerald-400' : 'text-red-400'}>
                {feedbackForm.label}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Reason</label>
              <select
                value={feedbackForm.reason}
                onChange={e => setFeedbackForm(f => ({ ...f, reason: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
              >
                {REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
              <textarea
                value={feedbackForm.notes}
                onChange={e => setFeedbackForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Additional context for this feedback..."
                rows={1}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-4">
            <button
              onClick={() => { setSelectedDecision(null); setFeedbackForm({ label: null, reason: '', notes: '' }) }}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => submitFeedback(selectedDecision)}
              disabled={!feedbackForm.reason || submitting}
              className="px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
