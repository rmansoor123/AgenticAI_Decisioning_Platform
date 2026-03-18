import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Brain, Activity, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Clock, Zap, GitBranch, Play, Pause, RefreshCw,
  ChevronRight, ChevronDown, BarChart3, Target, Cpu, Shield, Layers,
  Database
} from 'lucide-react'
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { safeJson } from '../utils/api'

const API_BASE = '/api'

export default function MLPlatform() {
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('models')
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)

  // Onboarding Risk Model state
  const [onboardingModel, setOnboardingModel] = useState(null)
  const [featureImportance, setFeatureImportance] = useState([])
  const [featuresExpanded, setFeaturesExpanded] = useState(false)
  const [featureSortBy, setFeatureSortBy] = useState('importance')
  const [testExpanded, setTestExpanded] = useState(false)
  const [cacheStats, setCacheStats] = useState(null)
  const [testForm, setTestForm] = useState({
    country: 'US',
    businessCategory: 'retail',
    businessAgeDays: 365,
    email: 'seller@example.com'
  })
  const [testResult, setTestResult] = useState(null)
  const [testRunning, setTestRunning] = useState(false)

  useEffect(() => {
    if (location.pathname.includes('/models')) setActiveTab('models')
    else if (location.pathname.includes('/inference')) setActiveTab('inference')
    else if (location.pathname.includes('/monitoring')) setActiveTab('monitoring')
  }, [location])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/ml/governance/models`)
        const data = await safeJson(res)
        if (data.success) setModels(data.data || [])
      } catch (error) {
        console.error('Error:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Fetch onboarding model data
  useEffect(() => {
    const fetchOnboardingData = async () => {
      try {
        const [modelRes, featuresRes, cacheRes] = await Promise.all([
          fetch(`${API_BASE}/ml/inference/models/onboarding-risk-v1`),
          fetch(`${API_BASE}/ml/inference/feature-importance/onboarding`),
          fetch(`${API_BASE}/ml/inference/cache/stats`)
        ])
        const modelData = await safeJson(modelRes)
        const featuresData = await safeJson(featuresRes)
        const cacheData = await safeJson(cacheRes)
        if (modelData.success) setOnboardingModel(modelData.data || modelData)
        if (featuresData.success) setFeatureImportance(featuresData.data || featuresData.features || [])
        if (cacheData.success) setCacheStats(cacheData.data || cacheData)
      } catch (error) {
        console.error('Error fetching onboarding model data:', error)
      }
    }
    fetchOnboardingData()
  }, [])

  const runTestInference = async () => {
    setTestRunning(true)
    try {
      const res = await fetch(`${API_BASE}/ml/inference/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testForm)
      })
      const data = await safeJson(res)
      if (data.success) setTestResult(data.data || data)
      else setTestResult(data)
    } catch (error) {
      console.error('Inference test error:', error)
    } finally {
      setTestRunning(false)
    }
  }

  const tabs = [
    { id: 'models', name: 'Model Registry', icon: GitBranch, href: '/ml/models' },
    { id: 'inference', name: 'Inference', icon: Zap, href: '/ml/inference' },
    { id: 'monitoring', name: 'Monitoring', icon: Activity, href: '/ml/monitoring' }
  ]

  const inferenceData = Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    requests: Math.floor(Math.random() * 5000) + 3000,
    latency: Math.floor(Math.random() * 20) + 15
  }))

  const driftData = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    featureDrift: Math.random() * 0.1,
    predictionDrift: Math.random() * 0.08
  }))

  const sortedFeatures = [...featureImportance].sort((a, b) => {
    if (featureSortBy === 'importance') return (b.importance || 0) - (a.importance || 0)
    if (featureSortBy === 'name') return (a.name || '').localeCompare(b.name || '')
    return 0
  })

  const getScoreColor = (score) => {
    if (score < 0.45) return 'text-emerald-400'
    if (score < 0.75) return 'text-amber-400'
    return 'text-red-400'
  }

  const getScoreBgColor = (score) => {
    if (score < 0.45) return 'bg-emerald-500'
    if (score < 0.75) return 'bg-amber-500'
    return 'bg-red-500'
  }

  const groupColors = {
    identity: 'bg-blue-500/20 text-blue-400',
    financial: 'bg-emerald-500/20 text-emerald-400',
    compliance: 'bg-amber-500/20 text-amber-400',
    behavioral: 'bg-purple-500/20 text-purple-400',
    network: 'bg-pink-500/20 text-pink-400'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
              <Brain className="w-6 h-6 text-white" />
            </div>
            ML Platform
          </h1>
          <p className="text-gray-400 mt-1">Model registry, inference, and monitoring</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-2">
        {tabs.map(tab => (
          <Link
            key={tab.id}
            to={tab.href}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.name}
          </Link>
        ))}
      </div>

      {activeTab === 'models' && (
        <div className="space-y-6">

          {/* ============================================================ */}
          {/* Onboarding Risk Model — Featured Section                     */}
          {/* ============================================================ */}
          <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/30 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Brain className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Onboarding Risk Model</h2>
                  <p className="text-sm text-gray-400">Neural network for seller onboarding fraud detection</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                onboardingModel?.status === 'LOADED'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}>
                {onboardingModel?.status || 'LOADING...'}
              </span>
            </div>

            {/* Model Card */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4 space-y-4">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  Model Details
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Model ID</span>
                    <div className="text-white font-mono">onboarding-risk-v1</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Framework</span>
                    <div className="text-white">TensorFlow.js</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Version</span>
                    <div className="text-white">{onboardingModel?.version || '1.0.0'}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Predictions</span>
                    <div className="text-white">{onboardingModel?.predictionCount ?? 0}</div>
                  </div>
                </div>
              </div>

              {/* Architecture Visualization */}
              <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
                <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
                  <Layers className="w-4 h-4 text-purple-400" />
                  Neural Network Architecture
                </h3>
                <div className="flex items-center justify-between px-2">
                  {[
                    { size: 25, label: 'Input', activation: 'none', color: 'blue' },
                    { size: 128, label: 'Dense', activation: 'ReLU', color: 'purple' },
                    { size: 64, label: 'Dense', activation: 'ReLU', color: 'purple' },
                    { size: 32, label: 'Dense', activation: 'ReLU', color: 'pink' },
                    { size: 1, label: 'Output', activation: 'Sigmoid', color: 'emerald' }
                  ].map((layer, i, arr) => (
                    <div key={i} className="flex items-center">
                      <div className="flex flex-col items-center">
                        <div className={`w-12 rounded-lg border border-${layer.color}-500/50 bg-${layer.color}-500/10 flex flex-col items-center justify-center py-2`}
                          style={{ height: `${Math.max(32, Math.min(80, layer.size * 0.6))}px` }}>
                          <span className="text-xs font-bold text-white">{layer.size}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1">{layer.label}</span>
                        {layer.activation !== 'none' && (
                          <span className={`text-[9px] text-${layer.color}-400`}>{layer.activation}</span>
                        )}
                      </div>
                      {i < arr.length - 1 && (
                        <div className="mx-1 flex items-center">
                          <div className="w-4 h-px bg-gray-600"></div>
                          <ChevronRight className="w-3 h-3 text-gray-500" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Decision Thresholds */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-amber-400" />
                Decision Thresholds
              </h3>
              <div className="relative h-16">
                {/* Score bar background */}
                <div className="absolute top-4 left-0 right-0 h-6 rounded-full overflow-hidden flex">
                  <div className="bg-emerald-500/30 flex-grow" style={{ flexBasis: '45%' }}></div>
                  <div className="bg-amber-500/30 flex-grow" style={{ flexBasis: '30%' }}></div>
                  <div className="bg-red-500/30 flex-grow" style={{ flexBasis: '25%' }}></div>
                </div>
                {/* Threshold markers */}
                {[
                  { pos: 45, label: '0.45', desc: 'APPROVE', color: 'emerald' },
                  { pos: 55, label: '0.55', desc: 'REVIEW Rule', color: 'amber' },
                  { pos: 75, label: '0.75', desc: 'REJECT', color: 'orange' },
                  { pos: 80, label: '0.80', desc: 'BLOCK Rule', color: 'red' }
                ].map(t => (
                  <div key={t.label} className="absolute" style={{ left: `${t.pos}%`, top: 0, bottom: 0 }}>
                    <div className={`w-0.5 h-full bg-${t.color}-400`}></div>
                    <div className={`absolute -top-0.5 left-1/2 -translate-x-1/2 text-[9px] text-${t.color}-400 whitespace-nowrap font-medium`}>
                      {t.label}
                    </div>
                    <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 text-[8px] text-${t.color}-400 whitespace-nowrap`}>
                      {t.desc}
                    </div>
                  </div>
                ))}
                {/* Scale labels */}
                <div className="absolute -bottom-4 left-0 text-[10px] text-gray-500">0.0</div>
                <div className="absolute -bottom-4 right-0 text-[10px] text-gray-500">1.0</div>
              </div>
              <div className="flex justify-between mt-8 text-xs text-gray-500">
                <span className="text-emerald-400">APPROVE Zone</span>
                <span className="text-amber-400">REVIEW Zone</span>
                <span className="text-red-400">REJECT/BLOCK Zone</span>
              </div>
            </div>

            {/* 25-Feature Table — Expandable */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
              <div
                className="px-4 py-3 border-b border-gray-800 flex items-center justify-between cursor-pointer hover:bg-gray-800/30"
                onClick={() => setFeaturesExpanded(!featuresExpanded)}
              >
                <div className="flex items-center gap-2">
                  {featuresExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <h3 className="font-semibold text-white">Feature Importance ({featureImportance.length} features)</h3>
                </div>
                {featuresExpanded && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Sort by:</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFeatureSortBy('importance') }}
                      className={`text-xs px-2 py-0.5 rounded ${featureSortBy === 'importance' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:text-white'}`}
                    >Importance</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFeatureSortBy('name') }}
                      className={`text-xs px-2 py-0.5 rounded ${featureSortBy === 'name' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:text-white'}`}
                    >Name</button>
                  </div>
                )}
              </div>
              {featuresExpanded && (
                <table className="w-full">
                  <thead className="bg-[#0d0d14]">
                    <tr className="text-xs text-gray-500">
                      <th className="px-4 py-2 text-left">Feature</th>
                      <th className="px-4 py-2 text-left">Description</th>
                      <th className="px-4 py-2 text-left">Importance</th>
                      <th className="px-4 py-2 text-left">Range</th>
                      <th className="px-4 py-2 text-left">Group</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFeatures.map((feature, i) => (
                      <tr key={i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                        <td className="px-4 py-2">
                          <span className="text-sm text-white font-mono">{feature.name}</span>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-400 max-w-[200px] truncate">
                          {feature.description || '-'}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(feature.importance || 0) * 100}%` }} />
                            </div>
                            <span className="text-xs text-gray-300">{((feature.importance || 0) * 100).toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-400 font-mono">
                          {feature.min != null ? `${feature.min} - ${feature.max}` : '-'}
                        </td>
                        <td className="px-4 py-2">
                          {feature.group && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${groupColors[feature.group] || 'bg-gray-500/20 text-gray-400'}`}>
                              {feature.group}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Test Inference — Collapsible */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
              <div
                className="px-4 py-3 border-b border-gray-800 flex items-center gap-2 cursor-pointer hover:bg-gray-800/30"
                onClick={() => setTestExpanded(!testExpanded)}
              >
                {testExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <Play className="w-4 h-4 text-purple-400" />
                <h3 className="font-semibold text-white">Test Inference</h3>
              </div>
              {testExpanded && (
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Country</label>
                      <select
                        value={testForm.country}
                        onChange={e => setTestForm(prev => ({ ...prev, country: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      >
                        <option value="US">United States</option>
                        <option value="GB">United Kingdom</option>
                        <option value="CN">China</option>
                        <option value="NG">Nigeria</option>
                        <option value="RU">Russia</option>
                        <option value="IN">India</option>
                        <option value="BR">Brazil</option>
                        <option value="DE">Germany</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Business Category</label>
                      <select
                        value={testForm.businessCategory}
                        onChange={e => setTestForm(prev => ({ ...prev, businessCategory: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      >
                        <option value="retail">Retail</option>
                        <option value="electronics">Electronics</option>
                        <option value="fashion">Fashion</option>
                        <option value="digital_goods">Digital Goods</option>
                        <option value="luxury">Luxury</option>
                        <option value="crypto">Crypto</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Business Age (days)</label>
                      <input
                        type="number"
                        value={testForm.businessAgeDays}
                        onChange={e => setTestForm(prev => ({ ...prev, businessAgeDays: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Email</label>
                      <input
                        type="text"
                        value={testForm.email}
                        onChange={e => setTestForm(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      />
                    </div>
                  </div>

                  <button
                    onClick={runTestInference}
                    disabled={testRunning}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg font-medium flex items-center gap-2 text-sm"
                  >
                    {testRunning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Run Inference
                      </>
                    )}
                  </button>

                  {testResult && (
                    <div className="border-t border-gray-800 pt-4 space-y-4">
                      {/* Score */}
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-xs text-gray-500">Risk Score</span>
                          <div className={`text-3xl font-bold ${getScoreColor(testResult.score ?? testResult.riskScore ?? 0)}`}>
                            {((testResult.score ?? testResult.riskScore ?? 0) * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${getScoreBgColor(testResult.score ?? testResult.riskScore ?? 0)}`}
                              style={{ width: `${(testResult.score ?? testResult.riskScore ?? 0) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          (testResult.decision || testResult.recommendation) === 'APPROVE' ? 'bg-emerald-500/20 text-emerald-400' :
                          (testResult.decision || testResult.recommendation) === 'REVIEW' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {testResult.decision || testResult.recommendation || 'N/A'}
                        </span>
                      </div>

                      {/* SHAP Contributors */}
                      {testResult.shapContributions && testResult.shapContributions.length > 0 && (
                        <div>
                          <span className="text-xs text-gray-500 block mb-2">Top SHAP Contributors</span>
                          <div className="space-y-1">
                            {testResult.shapContributions.slice(0, 5).map((shap, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-36 truncate font-mono">{shap.feature}</span>
                                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${shap.contribution > 0 ? 'bg-red-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${Math.min(Math.abs(shap.contribution) * 100, 100)}%` }}
                                  />
                                </div>
                                <span className={`text-xs ${shap.contribution > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {shap.contribution > 0 ? '+' : ''}{(shap.contribution * 100).toFixed(1)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Risk Breakdown */}
                      {testResult.riskBreakdown && (
                        <div>
                          <span className="text-xs text-gray-500 block mb-2">Risk Category Breakdown</span>
                          <div className="grid grid-cols-5 gap-2">
                            {Object.entries(testResult.riskBreakdown).map(([category, score]) => (
                              <div key={category} className="text-center">
                                <div className="w-full h-16 bg-gray-800 rounded-lg relative overflow-hidden">
                                  <div
                                    className={`absolute bottom-0 left-0 right-0 rounded-b-lg ${
                                      score > 0.7 ? 'bg-red-500/60' : score > 0.4 ? 'bg-amber-500/60' : 'bg-emerald-500/60'
                                    }`}
                                    style={{ height: `${score * 100}%` }}
                                  />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-xs font-bold text-white">{(score * 100).toFixed(0)}%</span>
                                  </div>
                                </div>
                                <span className="text-[10px] text-gray-400 mt-1 block capitalize">{category}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Prediction Cache Stats */}
            {cacheStats && (
              <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-4 h-4 text-blue-400" />
                  <h3 className="font-semibold text-white text-sm">Prediction Cache</h3>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Size</span>
                    <div className="text-white font-medium">{cacheStats.size ?? cacheStats.entries ?? 0}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Hit Rate</span>
                    <div className="text-emerald-400 font-medium">{cacheStats.hitRate != null ? `${(cacheStats.hitRate * 100).toFixed(1)}%` : 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Hits</span>
                    <div className="text-white font-medium">{cacheStats.hits ?? 0}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Misses</span>
                    <div className="text-white font-medium">{cacheStats.misses ?? 0}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* ============================================================ */}
          {/* End Onboarding Risk Model Section                            */}
          {/* ============================================================ */}

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Models', value: models.length || 15, icon: Brain, color: 'purple' },
              { label: 'In Production', value: models.filter(m => m.status === 'PRODUCTION').length || 8, icon: CheckCircle, color: 'emerald' },
              { label: 'Avg Accuracy', value: '98.7%', icon: Target, color: 'blue' },
              { label: 'Avg Latency', value: '23ms', icon: Zap, color: 'amber' }
            ].map(stat => (
              <div key={stat.label} className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <stat.icon className={`w-5 h-5 text-${stat.color}-400`} />
                  <span className="text-sm text-gray-400">{stat.label}</span>
                </div>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Model Cards */}
          <div className="grid grid-cols-3 gap-4">
            {(models.length > 0 ? models : [
              { modelId: 'fraud-detector-v3', name: 'Fraud Detector', version: '3.2.1', status: 'PRODUCTION', accuracy: 0.987, latency: 23, type: 'GRADIENT_BOOST' },
              { modelId: 'velocity-model-v2', name: 'Velocity Anomaly', version: '2.1.0', status: 'PRODUCTION', accuracy: 0.954, latency: 18, type: 'NEURAL_NETWORK' },
              { modelId: 'device-trust-v1', name: 'Device Trust', version: '1.5.2', status: 'PRODUCTION', accuracy: 0.978, latency: 12, type: 'RANDOM_FOREST' },
              { modelId: 'ato-detector-v2', name: 'ATO Detector', version: '2.0.0', status: 'STAGING', accuracy: 0.965, latency: 28, type: 'ENSEMBLE' },
              { modelId: 'seller-risk-v1', name: 'Seller Risk', version: '1.2.0', status: 'PRODUCTION', accuracy: 0.943, latency: 35, type: 'GRADIENT_BOOST' },
              { modelId: 'payment-anomaly-v1', name: 'Payment Anomaly', version: '1.0.3', status: 'CANARY', accuracy: 0.971, latency: 21, type: 'NEURAL_NETWORK' }
            ]).slice(0, 6).map(model => (
              <ModelCard key={model.modelId} model={model} />
            ))}
          </div>

          {/* Model Table */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-white">All Models</h3>
              <button className="px-3 py-1 text-xs bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30">
                + Register Model
              </button>
            </div>
            <table className="w-full">
              <thead className="bg-[#0d0d14]">
                <tr className="text-xs text-gray-500">
                  <th className="px-4 py-3 text-left">Model</th>
                  <th className="px-4 py-3 text-left">Version</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Accuracy</th>
                  <th className="px-4 py-3 text-left">Latency</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(models.length > 0 ? models : [
                  { modelId: 'fraud-detector-v3', name: 'Fraud Detector', version: '3.2.1', status: 'PRODUCTION', accuracy: 0.987, latency: 23, type: 'GRADIENT_BOOST' },
                  { modelId: 'velocity-model-v2', name: 'Velocity Anomaly', version: '2.1.0', status: 'PRODUCTION', accuracy: 0.954, latency: 18, type: 'NEURAL_NETWORK' },
                  { modelId: 'device-trust-v1', name: 'Device Trust', version: '1.5.2', status: 'PRODUCTION', accuracy: 0.978, latency: 12, type: 'RANDOM_FOREST' }
                ]).map((model, i) => (
                  <tr key={i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-purple-400" />
                        <span className="text-white font-medium">{model.name || model.modelId}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">v{model.version}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300">{model.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${
                        model.status === 'PRODUCTION' ? 'bg-emerald-500/20 text-emerald-400' :
                        model.status === 'STAGING' ? 'bg-amber-500/20 text-amber-400' :
                        model.status === 'CANARY' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>{model.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{(model.accuracy * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{model.latency}ms</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
                          <Play className="w-4 h-4" />
                        </button>
                        <button className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
                          <BarChart3 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'inference' && (
        <div className="space-y-6">
          {/* Inference Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Requests/sec', value: '4,250', trend: '+12%', up: true },
              { label: 'P99 Latency', value: '45ms', trend: '-8%', up: false },
              { label: 'Success Rate', value: '99.99%', trend: '+0.01%', up: true },
              { label: 'Active Endpoints', value: '8', trend: '', up: true }
            ].map(stat => (
              <div key={stat.label} className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-gray-400">{stat.label}</span>
                  {stat.trend && (
                    <span className={`text-xs flex items-center gap-1 ${stat.up ? 'text-emerald-400' : 'text-red-400'}`}>
                      {stat.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {stat.trend}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Inference Chart */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-4">Inference Traffic (24h)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={inferenceData}>
                  <defs>
                    <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="time" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <YAxis stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #374151', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="requests" stroke="#a855f7" fill="url(#colorRequests)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Try Inference */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-4">Test Inference</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Select Model</label>
                <select className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white">
                  <option>fraud-detector-v3 (Production)</option>
                  <option>velocity-model-v2 (Production)</option>
                  <option>device-trust-v1 (Production)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Input Features</label>
                <textarea
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-sm h-20"
                  defaultValue='{"amount": 2500, "isNewDevice": true, "velocity1h": 5}'
                />
              </div>
            </div>
            <button className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium flex items-center gap-2">
              <Play className="w-4 h-4" />
              Run Prediction
            </button>
          </div>
        </div>
      )}

      {activeTab === 'monitoring' && (
        <div className="space-y-6">
          {/* Monitoring Alerts */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#12121a] rounded-xl border border-emerald-500/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <span className="text-white font-medium">Model Health</span>
              </div>
              <div className="text-2xl font-bold text-emerald-400">All Healthy</div>
              <div className="text-sm text-gray-400 mt-1">8 models in production</div>
            </div>
            <div className="bg-[#12121a] rounded-xl border border-amber-500/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span className="text-white font-medium">Drift Alerts</span>
              </div>
              <div className="text-2xl font-bold text-amber-400">2 Warnings</div>
              <div className="text-sm text-gray-400 mt-1">Feature drift detected</div>
            </div>
            <div className="bg-[#12121a] rounded-xl border border-blue-500/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <span className="text-white font-medium">Last Retrain</span>
              </div>
              <div className="text-2xl font-bold text-blue-400">2h ago</div>
              <div className="text-sm text-gray-400 mt-1">Scheduled: hourly</div>
            </div>
          </div>

          {/* Drift Chart */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-4">Model Drift (30 days)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={driftData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="day" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <YAxis stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #374151', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="featureDrift" stroke="#f59e0b" name="Feature Drift" dot={false} />
                  <Line type="monotone" dataKey="predictionDrift" stroke="#ef4444" name="Prediction Drift" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Model Performance Table */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="font-semibold text-white">Performance Metrics</h3>
            </div>
            <table className="w-full">
              <thead className="bg-[#0d0d14]">
                <tr className="text-xs text-gray-500">
                  <th className="px-4 py-3 text-left">Model</th>
                  <th className="px-4 py-3 text-left">Accuracy</th>
                  <th className="px-4 py-3 text-left">Precision</th>
                  <th className="px-4 py-3 text-left">Recall</th>
                  <th className="px-4 py-3 text-left">F1 Score</th>
                  <th className="px-4 py-3 text-left">Drift Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Fraud Detector v3', accuracy: 0.987, precision: 0.982, recall: 0.991, f1: 0.986, drift: 'OK' },
                  { name: 'Velocity Anomaly v2', accuracy: 0.954, precision: 0.948, recall: 0.961, f1: 0.954, drift: 'WARNING' },
                  { name: 'Device Trust v1', accuracy: 0.978, precision: 0.972, recall: 0.984, f1: 0.978, drift: 'OK' },
                  { name: 'Seller Risk v1', accuracy: 0.943, precision: 0.938, recall: 0.949, f1: 0.943, drift: 'WARNING' }
                ].map((m, i) => (
                  <tr key={i} className="border-t border-gray-800/50">
                    <td className="px-4 py-3 text-white font-medium">{m.name}</td>
                    <td className="px-4 py-3 text-gray-300">{(m.accuracy * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-gray-300">{(m.precision * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-gray-300">{(m.recall * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-gray-300">{(m.f1 * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${
                        m.drift === 'OK' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>{m.drift}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ModelCard({ model }) {
  const statusColors = {
    PRODUCTION: 'border-emerald-500/30 bg-emerald-500/10',
    STAGING: 'border-amber-500/30 bg-amber-500/10',
    CANARY: 'border-blue-500/30 bg-blue-500/10',
    ARCHIVED: 'border-gray-500/30 bg-gray-500/10'
  }

  return (
    <div className={`rounded-xl border ${statusColors[model.status] || statusColors.ARCHIVED} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-400" />
          <span className="font-semibold text-white">{model.name || model.modelId}</span>
        </div>
        <span className={`text-xs px-2 py-1 rounded ${
          model.status === 'PRODUCTION' ? 'bg-emerald-500/20 text-emerald-400' :
          model.status === 'STAGING' ? 'bg-amber-500/20 text-amber-400' :
          'bg-blue-500/20 text-blue-400'
        }`}>{model.status}</span>
      </div>
      <div className="text-sm text-gray-400 mb-3">v{model.version} - {model.type}</div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-gray-500">Accuracy</div>
          <div className="text-lg font-semibold text-white">{(model.accuracy * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Latency</div>
          <div className="text-lg font-semibold text-white">{model.latency}ms</div>
        </div>
      </div>
    </div>
  )
}
