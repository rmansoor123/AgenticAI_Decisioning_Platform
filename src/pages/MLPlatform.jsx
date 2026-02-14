import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Brain, Activity, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Clock, Zap, GitBranch, Play, Pause, RefreshCw,
  ChevronRight, BarChart3, Target, Cpu
} from 'lucide-react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const API_BASE = 'http://localhost:3005/api'

export default function MLPlatform() {
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('models')
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (location.pathname.includes('/models')) setActiveTab('models')
    else if (location.pathname.includes('/inference')) setActiveTab('inference')
    else if (location.pathname.includes('/monitoring')) setActiveTab('monitoring')
  }, [location])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/ml/governance/models`)
        const data = await res.json()
        if (data.success) setModels(data.data || [])
      } catch (error) {
        console.error('Error:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

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
