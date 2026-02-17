import { useState, useEffect } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Brain, Activity, Target, Shield, RefreshCw, TrendingUp } from 'lucide-react'

const EVAL_API = 'http://localhost:8000'

function ScoreCard({ title, score, icon: Icon, color }) {
  const pct = (score * 100).toFixed(1)
  const bgColor = score >= 0.8 ? 'bg-green-900/30 border-green-700' : score >= 0.6 ? 'bg-yellow-900/30 border-yellow-700' : 'bg-red-900/30 border-red-700'
  const textColor = score >= 0.8 ? 'text-green-400' : score >= 0.6 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className={`${bgColor} border rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">{title}</span>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className={`text-3xl font-bold ${textColor}`}>{pct}%</div>
      <div className="mt-1 w-full bg-gray-700 rounded-full h-2">
        <div className={`h-2 rounded-full ${score >= 0.8 ? 'bg-green-500' : score >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function RAGEvaluation() {
  const [metrics, setMetrics] = useState(null)
  const [history, setHistory] = useState([])
  const [evaluations, setEvaluations] = useState([])
  const [loading, setLoading] = useState(true)
  const [evalRunning, setEvalRunning] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [metricsRes, historyRes, evalsRes] = await Promise.all([
        fetch(`${EVAL_API}/metrics`).then(r => r.json()).catch(() => null),
        fetch(`${EVAL_API}/metrics/history?limit=100`).then(r => r.json()).catch(() => null),
        fetch(`${EVAL_API}/metrics/evaluations?limit=50`).then(r => r.json()).catch(() => null),
      ])
      if (metricsRes?.success) setMetrics(metricsRes.data)
      if (historyRes?.success) setHistory(historyRes.data)
      if (evalsRes?.success) setEvaluations(evalsRes.data)
    } catch (e) {
      console.error('Failed to fetch eval data:', e)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const runManualEval = async () => {
    setEvalRunning(true)
    try {
      await fetch(`${EVAL_API}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Evaluate electronics seller from Nigeria with disposable email',
          retrieved_contexts: [
            'Fraud case: ELECTRONICS seller from NG. Risk score: 82. Decision: REJECT. Risk factors: disposable email domain, high-risk geography.',
            'Pattern: ELECTRONICS sellers from NG with disposable email domain have 78% fraud rate',
          ],
          agent_response: 'Decision: REJECT. Risk Score: 82. High risk due to disposable email and high-risk geography combination.',
          use_case: 'onboarding_decision',
          agent_id: 'seller-onboarding-agent',
        }),
      })
      await fetchData()
    } catch (e) {
      console.error('Manual eval failed:', e)
    }
    setEvalRunning(false)
  }

  const getScoreColor = (score) => {
    if (score >= 0.8) return 'text-green-400'
    if (score >= 0.6) return 'text-yellow-400'
    return 'text-red-400'
  }

  // Prepare use-case chart data
  const useCaseData = metrics?.by_use_case ? Object.entries(metrics.by_use_case).map(([uc, scores]) => ({
    name: uc.replace(/_/g, ' '),
    'Answer Relevance': (scores.answer_relevance * 100).toFixed(1),
    'Context Precision': (scores.context_precision * 100).toFixed(1),
    'Groundedness': (scores.groundedness * 100).toFixed(1),
    'Faithfulness': (scores.faithfulness * 100).toFixed(1),
  })) : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">RAG Evaluation Dashboard</h1>
          <p className="text-gray-400 mt-1">TruLens + RAGAS metrics for retrieval-augmented generation quality</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={runManualEval} disabled={evalRunning} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition disabled:opacity-50">
            <Brain className="w-4 h-4" /> {evalRunning ? 'Running...' : 'Run Evaluation'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-20">Loading evaluation data...</div>
      ) : !metrics ? (
        <div className="text-center py-20">
          <Brain className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl text-gray-300 mb-2">No Evaluations Yet</h2>
          <p className="text-gray-500 mb-4">Run an evaluation or wait for auto-evaluation to trigger.</p>
          <button onClick={runManualEval} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500">
            Run First Evaluation
          </button>
        </div>
      ) : (
        <>
          {/* Score Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ScoreCard title="Answer Relevance" score={metrics.answer_relevance} icon={Target} color="text-blue-400" />
            <ScoreCard title="Context Precision" score={metrics.context_precision} icon={Activity} color="text-purple-400" />
            <ScoreCard title="Groundedness" score={metrics.groundedness} icon={Shield} color="text-green-400" />
            <ScoreCard title="Faithfulness" score={metrics.faithfulness} icon={Brain} color="text-amber-400" />
          </div>

          {/* Total evaluations badge */}
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <TrendingUp className="w-4 h-4" />
            <span>{metrics.total_evaluations} total evaluations</span>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Score Trends */}
            {history.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Score Trends</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={history.slice().reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickFormatter={t => new Date(t).toLocaleTimeString()} />
                    <YAxis domain={[0, 1]} tick={{ fill: '#9CA3AF' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }} />
                    <Legend />
                    <Line type="monotone" dataKey="answer_relevance" name="Answer Relevance" stroke="#60A5FA" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="groundedness" name="Groundedness" stroke="#34D399" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="coherence" name="Coherence" stroke="#FBBF24" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Use Case Breakdown */}
            {useCaseData.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Use Case Breakdown</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={useCaseData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#9CA3AF' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="Answer Relevance" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Groundedness" fill="#34D399" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Faithfulness" fill="#FBBF24" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Evaluations Table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">Recent Evaluations</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left p-3">Query</th>
                    <th className="text-left p-3">Use Case</th>
                    <th className="text-center p-3">Relevance</th>
                    <th className="text-center p-3">Grounded</th>
                    <th className="text-center p-3">Coherence</th>
                    <th className="text-left p-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((ev) => {
                    const scoreMap = {}
                    ev.scores.forEach(s => { scoreMap[s.metric] = s.score })
                    return (
                      <tr
                        key={ev.evaluation_id}
                        className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition"
                        onClick={() => setExpanded(expanded === ev.evaluation_id ? null : ev.evaluation_id)}
                      >
                        <td className="p-3 text-gray-300 max-w-xs truncate">{ev.query}</td>
                        <td className="p-3">
                          <span className="px-2 py-1 bg-indigo-900/50 text-indigo-300 text-xs rounded-full">
                            {ev.use_case.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className={`p-3 text-center font-mono ${getScoreColor(scoreMap.answer_relevance || 0)}`}>
                          {((scoreMap.answer_relevance || 0) * 100).toFixed(0)}%
                        </td>
                        <td className={`p-3 text-center font-mono ${getScoreColor(scoreMap.groundedness || 0)}`}>
                          {((scoreMap.groundedness || 0) * 100).toFixed(0)}%
                        </td>
                        <td className={`p-3 text-center font-mono ${getScoreColor(scoreMap.coherence || 0)}`}>
                          {((scoreMap.coherence || 0) * 100).toFixed(0)}%
                        </td>
                        <td className="p-3 text-gray-500 text-xs">{new Date(ev.timestamp).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                  {evaluations.length === 0 && (
                    <tr><td colSpan="6" className="p-8 text-center text-gray-500">No evaluations yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expanded Detail */}
          {expanded && evaluations.find(e => e.evaluation_id === expanded) && (() => {
            const ev = evaluations.find(e => e.evaluation_id === expanded)
            return (
              <div className="bg-gray-800 rounded-xl border border-indigo-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Evaluation Detail: {ev.evaluation_id}</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-400 text-sm">Query:</span>
                    <p className="text-gray-200 mt-1">{ev.query}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">Agent Response:</span>
                    <p className="text-gray-200 mt-1">{ev.agent_response}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-sm">All Scores:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {ev.scores.map((s, i) => (
                        <span key={i} className={`px-3 py-1 rounded-full text-xs font-mono ${getScoreColor(s.score)} bg-gray-700`}>
                          {s.metric}: {(s.score * 100).toFixed(1)}%
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
