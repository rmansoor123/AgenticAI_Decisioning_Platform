import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  FlaskConical, Database, Play, BarChart3, FileText, Plus,
  CheckCircle, XCircle, Clock, Loader2, ChevronRight, RefreshCw
} from 'lucide-react'

const API = '/api/training-lab'

const TABS = [
  { id: 'pipeline', label: 'Pipeline', path: '/training-lab' },
  { id: 'environments', label: 'Environments', path: '/training-lab/environments' },
  { id: 'evaluation', label: 'Evaluation', path: '/training-lab/evaluation' },
  { id: 'datasets', label: 'Datasets', path: '/training-lab/datasets' }
]

function useTab() {
  const location = useLocation()
  if (location.pathname.includes('/environments')) return 'environments'
  if (location.pathname.includes('/evaluation')) return 'evaluation'
  if (location.pathname.includes('/datasets')) return 'datasets'
  return 'pipeline'
}

// ─── Pipeline Tab ───────────────────────────────────────────────────────────

function PipelineTab() {
  const [content, setContent] = useState('Sample document content for ingestion testing.\nThis contains potential fraud indicators.')
  const [format, setFormat] = useState('text')
  const [sourceId, setSourceId] = useState('manual-upload')
  const [ingestResult, setIngestResult] = useState(null)
  const [stages, setStages] = useState(null)
  const [quality, setQuality] = useState(null)
  const [labelResult, setLabelResult] = useState(null)
  const [loading, setLoading] = useState('')

  useEffect(() => {
    fetch(`${API}/pipeline/stages`).then(r => r.json()).then(d => d.success && setStages(d.data)).catch(() => {})
  }, [])

  const handleIngest = async () => {
    setLoading('ingest')
    try {
      const res = await fetch(`${API}/pipeline/ingest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, format, sourceId })
      })
      const data = await res.json()
      setIngestResult(data)
    } catch (e) { setIngestResult({ success: false, error: e.message }) }
    setLoading('')
  }

  const handleQuality = async () => {
    setLoading('quality')
    try {
      const res = await fetch(`${API}/pipeline/quality`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: [{ content, format, sourceId }] })
      })
      const data = await res.json()
      setQuality(data)
    } catch (e) { setQuality({ success: false, error: e.message }) }
    setLoading('')
  }

  const handleLabel = async () => {
    setLoading('label')
    try {
      const res = await fetch(`${API}/pipeline/label`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, format, sourceId })
      })
      const data = await res.json()
      setLabelResult(data)
    } catch (e) { setLabelResult({ success: false, error: e.message }) }
    setLoading('')
  }

  return (
    <div className="space-y-6">
      {/* Ingest Form */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Document Ingestion</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Content</label>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              rows={4} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Format</label>
              <select value={format} onChange={e => setFormat(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-gray-200">
                <option value="text">Text</option>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="html">HTML</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Source ID</label>
              <input value={sourceId} onChange={e => setSourceId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleIngest} disabled={loading === 'ingest'}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
              {loading === 'ingest' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Ingest
            </button>
            <button onClick={handleQuality} disabled={loading === 'quality'}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
              {loading === 'quality' ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} Quality Check
            </button>
            <button onClick={handleLabel} disabled={loading === 'label'}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
              {loading === 'label' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Auto-Label
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {ingestResult && (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Ingestion Result</h4>
            <pre className="text-xs text-gray-400 overflow-auto max-h-60">{JSON.stringify(ingestResult.data || ingestResult, null, 2)}</pre>
          </div>
        )}
        {quality && (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Quality Metrics</h4>
            <pre className="text-xs text-gray-400 overflow-auto max-h-60">{JSON.stringify(quality.data || quality, null, 2)}</pre>
          </div>
        )}
        {labelResult && (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Label Result</h4>
            <pre className="text-xs text-gray-400 overflow-auto max-h-60">{JSON.stringify(labelResult.data || labelResult, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* Pipeline Stages */}
      {stages && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Pipeline Stages</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {(Array.isArray(stages) ? stages : Object.keys(stages)).map((stage, i, arr) => (
              <div key={i} className="flex items-center gap-2">
                <div className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300">
                  {typeof stage === 'string' ? stage : stage.name || stage.stage || `Stage ${i + 1}`}
                </div>
                {i < arr.length - 1 && <ChevronRight className="w-4 h-4 text-gray-600" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Environments Tab ───────────────────────────────────────────────────────

function EnvironmentsTab() {
  const [environments, setEnvironments] = useState([])
  const [episodes, setEpisodes] = useState({})
  const [runningEnv, setRunningEnv] = useState(null)
  const [taskDomain, setTaskDomain] = useState('fraud_investigation')
  const [taskDifficulty, setTaskDifficulty] = useState('MEDIUM')
  const [taskCount, setTaskCount] = useState(5)
  const [tasks, setTasks] = useState(null)
  const [domains, setDomains] = useState(null)

  useEffect(() => {
    fetch(`${API}/environments`).then(r => r.json()).then(d => d.success && setEnvironments(d.data)).catch(() => {})
    fetch(`${API}/tasks/domains`).then(r => r.json()).then(d => d.success && setDomains(d.data)).catch(() => {})
  }, [])

  const runEpisode = async (envId) => {
    setRunningEnv(envId)
    try {
      const res = await fetch(`${API}/environments/${envId}/run`, { method: 'POST' })
      const data = await res.json()
      if (data.success) setEpisodes(prev => ({ ...prev, [envId]: data.data }))
    } catch (e) { console.error(e) }
    setRunningEnv(null)
  }

  const generateTasks = async () => {
    try {
      const res = await fetch(`${API}/tasks/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: taskDomain, difficulty: taskDifficulty, count: taskCount })
      })
      const data = await res.json()
      if (data.success) setTasks(data.data)
    } catch (e) { console.error(e) }
  }

  const difficultyColor = (d) => {
    if (d === 'EASY') return 'text-emerald-400 bg-emerald-400/10'
    if (d === 'MEDIUM') return 'text-amber-400 bg-amber-400/10'
    if (d === 'HARD') return 'text-red-400 bg-red-400/10'
    return 'text-gray-400 bg-gray-400/10'
  }

  return (
    <div className="space-y-6">
      {/* Environments List */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">RL Environments</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {environments.map(env => (
            <div key={env.envId} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-white">{env.name}</h4>
                <span className={`text-xs px-2 py-0.5 rounded-full ${difficultyColor(env.difficulty)}`}>{env.difficulty}</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{env.domain} | Runs: {env.runCount} | Avg Reward: {env.avgReward}</p>
              <button onClick={() => runEpisode(env.envId)} disabled={runningEnv === env.envId}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded text-xs font-medium flex items-center gap-1.5 disabled:opacity-50">
                {runningEnv === env.envId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Run Episode
              </button>

              {episodes[env.envId] && (
                <div className="mt-3 border-t border-gray-700 pt-3">
                  <div className="flex items-center gap-4 text-xs text-gray-400 mb-2">
                    <span>Reward: <span className={episodes[env.envId].totalReward >= 0 ? 'text-emerald-400' : 'text-red-400'}>{episodes[env.envId].totalReward}</span></span>
                    <span>Steps: {episodes[env.envId].steps}</span>
                    <span>Completed: {episodes[env.envId].completed ? 'Yes' : 'No'}</span>
                    <span>{episodes[env.envId].latencyMs}ms</span>
                  </div>
                  <div className="max-h-40 overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500">
                          <th className="text-left py-1 pr-2">Step</th>
                          <th className="text-left py-1 pr-2">Action</th>
                          <th className="text-right py-1 pr-2">Reward</th>
                          <th className="text-left py-1">Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {episodes[env.envId].trajectory?.map((t, i) => (
                          <tr key={i} className="border-t border-gray-700/50">
                            <td className="py-1 pr-2 text-gray-500">{t.step}</td>
                            <td className="py-1 pr-2 text-gray-300 font-mono">{t.action}</td>
                            <td className={`py-1 pr-2 text-right ${t.reward >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{t.reward}</td>
                            <td className="py-1 text-gray-500">{t.info?.outcome || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Task Generator */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Task Generator</h3>
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Domain</label>
            <select value={taskDomain} onChange={e => setTaskDomain(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-gray-200">
              {(domains?.domains || ['fraud_investigation', 'credit_underwriting', 'seller_onboarding', 'payment_processing']).map(d => (
                <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Difficulty</label>
            <select value={taskDifficulty} onChange={e => setTaskDifficulty(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-gray-200">
              {(domains?.difficulties || ['EASY', 'MEDIUM', 'HARD', 'EXPERT']).map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Count</label>
            <input type="number" min={1} max={50} value={taskCount} onChange={e => setTaskCount(parseInt(e.target.value) || 1)}
              className="w-20 bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-gray-200" />
          </div>
          <button onClick={generateTasks} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium">
            Generate Tasks
          </button>
        </div>

        {tasks && (
          <div className="mt-4 overflow-auto max-h-80">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-2 pr-3">Task ID</th>
                  <th className="text-left py-2 pr-3">Description</th>
                  <th className="text-left py-2 pr-3">Expected</th>
                  <th className="text-right py-2">Risk</th>
                </tr>
              </thead>
              <tbody>
                {tasks.tasks?.map(t => (
                  <tr key={t.taskId} className="border-t border-gray-700/50">
                    <td className="py-2 pr-3 text-gray-400 font-mono">{t.taskId}</td>
                    <td className="py-2 pr-3 text-gray-300 max-w-md truncate">{t.description}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        t.expectedAction === 'APPROVE' ? 'text-emerald-400 bg-emerald-400/10' :
                        t.expectedAction === 'REJECT' ? 'text-red-400 bg-red-400/10' : 'text-amber-400 bg-amber-400/10'
                      }`}>{t.expectedAction}</span>
                    </td>
                    <td className="py-2 text-right text-gray-400">{t.riskScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Evaluation Tab ─────────────────────────────────────────────────────────

function EvaluationTab() {
  const [rewardConfigs, setRewardConfigs] = useState(null)
  const [trajectoryJson, setTrajectoryJson] = useState('[\n  { "step": 0, "action": "CHECK_IDENTITY", "reward": 1, "info": {} },\n  { "step": 1, "action": "CHECK_FRAUD_DB", "reward": 1, "info": {} },\n  { "step": 2, "action": "REJECT", "reward": 10, "info": { "outcome": "TRUE_POSITIVE" }, "terminated": true }\n]')
  const [verifyResult, setVerifyResult] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`${API}/rewards/configs`).then(r => r.json()).then(d => d.success && setRewardConfigs(d.data)).catch(() => {})
  }, [])

  const handleVerify = async () => {
    setLoading(true)
    try {
      const trajectory = JSON.parse(trajectoryJson)
      const res = await fetch(`${API}/rewards/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trajectory, rubric: { requireEvidence: true, requireTerminal: true } })
      })
      const data = await res.json()
      setVerifyResult(data)
    } catch (e) { setVerifyResult({ success: false, error: e.message }) }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      {/* Reward Configs */}
      {rewardConfigs && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Reward Configurations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(rewardConfigs).map(([domain, config]) => (
              <div key={domain} className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <h4 className="text-sm font-semibold text-indigo-400 mb-3">{config.name || domain.replace(/_/g, ' ')}</h4>
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(config.rewards || config).map(([key, val]) => (
                      <tr key={key} className="border-t border-gray-700/50">
                        <td className="py-1 text-gray-400">{key}</td>
                        <td className={`py-1 text-right font-mono ${(val?.value ?? val) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {val?.value ?? val}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trajectory Verifier */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Trajectory Verifier</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Trajectory JSON</label>
            <textarea value={trajectoryJson} onChange={e => setTrajectoryJson(e.target.value)}
              rows={8} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-200 focus:border-indigo-500 focus:outline-none" />
          </div>
          <button onClick={handleVerify} disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Verify Trajectory
          </button>
        </div>

        {verifyResult && (
          <div className="mt-4 bg-gray-800 rounded-lg border border-gray-700 p-4">
            <div className="flex items-center gap-3 mb-3">
              {verifyResult.data?.passed ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <span className={`text-sm font-semibold ${verifyResult.data?.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                {verifyResult.data?.passed ? 'PASSED' : 'FAILED'} ({verifyResult.data?.passRate ?? verifyResult.data?.score ?? 0}%)
              </span>
            </div>
            {verifyResult.data?.checks?.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1">
                {c.passed ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                <span className="text-gray-300">{c.check}</span>
                {c.detail && <span className="text-gray-500 ml-2">{c.detail}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Datasets Tab ───────────────────────────────────────────────────────────

function DatasetsTab() {
  const [datasets, setDatasets] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', domain: 'fraud_detection', format: 'csv', recordCount: 1000, features: 10, quality: 80 })

  const loadDatasets = () => {
    fetch(`${API}/datasets`).then(r => r.json()).then(d => d.success && setDatasets(d.data)).catch(() => {})
  }

  useEffect(() => { loadDatasets() }, [])

  const handleRegister = async () => {
    try {
      await fetch(`${API}/datasets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      setShowForm(false)
      setForm({ name: '', domain: 'fraud_detection', format: 'csv', recordCount: 1000, features: 10, quality: 80 })
      loadDatasets()
    } catch (e) { console.error(e) }
  }

  const qualityColor = (q) => {
    if (q >= 90) return 'text-emerald-400'
    if (q >= 80) return 'text-amber-400'
    return 'text-red-400'
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Dataset Registry</h3>
          <div className="flex gap-2">
            <button onClick={loadDatasets} className="p-2 hover:bg-gray-800 rounded-lg">
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
            <button onClick={() => setShowForm(!showForm)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Register Dataset
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mb-6 bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">Register New Dataset</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200" placeholder="My Dataset" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Domain</label>
                <select value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200">
                  <option value="fraud_detection">Fraud Detection</option>
                  <option value="seller_onboarding">Seller Onboarding</option>
                  <option value="credit_underwriting">Credit Underwriting</option>
                  <option value="payment_processing">Payment Processing</option>
                  <option value="rl_training">RL Training</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Format</label>
                <select value={form.format} onChange={e => setForm({ ...form, format: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200">
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                  <option value="parquet">Parquet</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Records</label>
                <input type="number" value={form.recordCount} onChange={e => setForm({ ...form, recordCount: parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Features</label>
                <input type="number" value={form.features} onChange={e => setForm({ ...form, features: parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Quality (%)</label>
                <input type="number" min={0} max={100} value={form.quality} onChange={e => setForm({ ...form, quality: parseInt(e.target.value) || 0 })}
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={handleRegister} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-sm font-medium">Register</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">Cancel</button>
            </div>
          </div>
        )}

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700 text-xs">
                <th className="text-left py-2 pr-3">ID</th>
                <th className="text-left py-2 pr-3">Name</th>
                <th className="text-left py-2 pr-3">Domain</th>
                <th className="text-left py-2 pr-3">Version</th>
                <th className="text-right py-2 pr-3">Records</th>
                <th className="text-left py-2 pr-3">Format</th>
                <th className="text-right py-2 pr-3">Features</th>
                <th className="text-right py-2">Quality</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map(ds => (
                <tr key={ds.datasetId} className="border-t border-gray-700/50">
                  <td className="py-2 pr-3 text-gray-400 font-mono text-xs">{ds.datasetId}</td>
                  <td className="py-2 pr-3 text-gray-200">{ds.name}</td>
                  <td className="py-2 pr-3 text-gray-400">{ds.domain?.replace(/_/g, ' ')}</td>
                  <td className="py-2 pr-3 text-gray-400">{ds.version}</td>
                  <td className="py-2 pr-3 text-right text-gray-300">{ds.recordCount?.toLocaleString()}</td>
                  <td className="py-2 pr-3 text-gray-400 uppercase">{ds.format}</td>
                  <td className="py-2 pr-3 text-right text-gray-400">{ds.features}</td>
                  <td className={`py-2 text-right font-medium ${qualityColor(ds.quality)}`}>{ds.quality}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TrainingLab() {
  const activeTab = useTab()
  const [tab, setTab] = useState(activeTab)
  const [stats, setStats] = useState(null)

  useEffect(() => { setTab(activeTab) }, [activeTab])

  useEffect(() => {
    fetch(`${API}/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg">
            <FlaskConical className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">AI Training Lab</h1>
            <p className="text-sm text-gray-400">Data pipeline, RL environments, evaluation, and dataset management</p>
          </div>
        </div>

        {stats && (
          <div className="flex gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-white">{stats.datasets?.totalDatasets || 0}</div>
              <div className="text-xs text-gray-500">Datasets</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-white">{stats.environments?.activeEnvironments || 0}</div>
              <div className="text-xs text-gray-500">Environments</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-white">{stats.environments?.runs || 0}</div>
              <div className="text-xs text-gray-500">Episodes</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-white">{stats.evaluation?.evals || 0}</div>
              <div className="text-xs text-gray-500">Evals</div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 p-1 rounded-lg border border-gray-800 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'pipeline' && <PipelineTab />}
      {tab === 'environments' && <EnvironmentsTab />}
      {tab === 'evaluation' && <EvaluationTab />}
      {tab === 'datasets' && <DatasetsTab />}
    </div>
  )
}
