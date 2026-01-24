import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield, Activity, AlertTriangle, CheckCircle, XCircle,
  Database, Brain, Cog, FlaskConical, TrendingUp, TrendingDown,
  Clock, Zap, Eye, Filter, ChevronRight, Server, Layers, Play,
  Users, CreditCard, Package, Truck
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'

const API_BASE = 'http://localhost:3001/api'

export default function Dashboard({ transactions, metrics, wsConnected }) {
  const [models, setModels] = useState([])
  const [rules, setRules] = useState([])
  const [experiments, setExperiments] = useState([])
  const [metricsHistory, setMetricsHistory] = useState([])
  const [activeLayer, setActiveLayer] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [modelsRes, rulesRes, expRes, historyRes] = await Promise.all([
          fetch(`${API_BASE}/ml/governance/models?status=PRODUCTION`),
          fetch(`${API_BASE}/rules?status=ACTIVE&limit=10`),
          fetch(`${API_BASE}/experiments/experiments?status=RUNNING`),
          fetch(`${API_BASE}/metrics/history?hours=24`)
        ])

        const [modelsData, rulesData, expData, historyData] = await Promise.all([
          modelsRes.json(),
          rulesRes.json(),
          expRes.json(),
          historyRes.json()
        ])

        if (modelsData.success) setModels(modelsData.data)
        if (rulesData.success) setRules(rulesData.data)
        if (expData.success) setExperiments(expData.data)
        if (historyData.success) {
          const formatted = historyData.data.map((m, i) => ({
            time: `${i}:00`,
            transactions: m.transactions?.total || 0,
            fraudBlocked: m.fraud?.detected || 0,
            falsePositives: Math.floor((m.fraud?.detected || 0) * (m.fraud?.falsePositiveRate || 0.01))
          }))
          setMetricsHistory(formatted)
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      }
    }
    fetchData()
  }, [])

  const layers = [
    {
      id: 'data',
      name: 'Data Foundation',
      icon: Database,
      color: 'from-blue-500 to-cyan-500',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
      description: 'Real-time data ingestion & feature engineering',
      stats: { dataSources: 47, features: 2840, latency: '< 5ms' },
      capabilities: ['Real-time streaming', 'Batch processing', 'Feature store', 'Data lineage'],
      href: '/data'
    },
    {
      id: 'ml',
      name: 'ML Models',
      icon: Brain,
      color: 'from-purple-500 to-pink-500',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
      description: 'Ensemble of specialized detection models',
      stats: { models: 15, accuracy: '98.7%', retraining: 'Hourly' },
      capabilities: ['Model training', 'Real-time inference', 'Drift detection', 'Model registry'],
      href: '/ml'
    },
    {
      id: 'engine',
      name: 'Decision Engine',
      icon: Cog,
      color: 'from-amber-500 to-orange-500',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
      description: 'Rules engine with ML score aggregation',
      stats: { rules: 50, decisions: '< 50ms', uptime: '99.99%' },
      capabilities: ['Rule management', 'Real-time evaluation', 'Action routing', 'Audit trail'],
      href: '/decisions'
    },
    {
      id: 'experiment',
      name: 'Experimentation',
      icon: FlaskConical,
      color: 'from-emerald-500 to-teal-500',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
      description: 'A/B testing and model performance tracking',
      stats: { experiments: 12, simulations: 'Unlimited', rolloutControl: '100%' },
      capabilities: ['Shadow mode', 'Champion/Challenger', 'Threshold testing', 'Impact analysis'],
      href: '/experiments'
    }
  ]

  const businessServices = [
    { id: 'onboarding', name: 'Seller Onboarding', icon: Users, endpoint: '/api/onboarding' },
    { id: 'ato', name: 'Account Takeover', icon: Shield, endpoint: '/api/ato' },
    { id: 'payout', name: 'Seller Payout', icon: CreditCard, endpoint: '/api/payout' },
    { id: 'listing', name: 'Listing Management', icon: Package, endpoint: '/api/listing' },
    { id: 'shipping', name: 'Shipping', icon: Truck, endpoint: '/api/shipping' }
  ]

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'text-emerald-400'
      case 'blocked': return 'text-red-400'
      case 'review': return 'text-amber-400'
      default: return 'text-gray-400'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-4 h-4" />
      case 'blocked': return <XCircle className="w-4 h-4" />
      case 'review': return <Eye className="w-4 h-4" />
      default: return null
    }
  }

  const getRiskColor = (score) => {
    if (score >= 70) return 'bg-red-500'
    if (score >= 30) return 'bg-amber-500'
    return 'bg-emerald-500'
  }

  const riskDistribution = [
    { name: 'Low (0-30)', value: 65, color: '#10b981' },
    { name: 'Medium (31-70)', value: 25, color: '#f59e0b' },
    { name: 'High (71-100)', value: 10, color: '#ef4444' }
  ]

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-6 gap-4">
        <MetricCard
          label="Fraud Catch Rate"
          value={`${((metrics?.fraud?.catchRate || 0.987) * 100).toFixed(1)}%`}
          trend="+0.3%"
          trendUp={true}
          icon={<Shield className="w-5 h-5" />}
          color="emerald"
        />
        <MetricCard
          label="False Positive Rate"
          value={`${((metrics?.fraud?.falsePositiveRate || 0.003) * 100).toFixed(2)}%`}
          trend="-0.05%"
          trendUp={false}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="amber"
        />
        <MetricCard
          label="Avg Latency"
          value={`${metrics?.models?.avgLatencyMs || 23}ms`}
          trend="-2ms"
          trendUp={false}
          icon={<Zap className="w-5 h-5" />}
          color="blue"
        />
        <MetricCard
          label="Blocked Amount"
          value={`$${((metrics?.fraud?.amountBlocked || 2847392) / 1000000).toFixed(2)}M`}
          trend="+$127K"
          trendUp={true}
          icon={<XCircle className="w-5 h-5" />}
          color="red"
        />
        <MetricCard
          label="Review Queue"
          value={metrics?.sellers?.underReview || 127}
          trend="+12"
          trendUp={true}
          icon={<Eye className="w-5 h-5" />}
          color="purple"
        />
        <MetricCard
          label="Active Rules"
          value={metrics?.rules?.active || rules.length || 50}
          trend="+3"
          trendUp={true}
          icon={<Cog className="w-5 h-5" />}
          color="indigo"
        />
      </div>

      {/* 4-Layer Architecture */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            4-Layer Decisioning Architecture
          </h2>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="w-4 h-4" />
            <span>Click any layer to drill down</span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-blue-500/20 via-purple-500/20 via-amber-500/20 to-emerald-500/20 transform -translate-y-1/2 rounded-full" />

          <div className="grid grid-cols-4 gap-4 relative">
            {layers.map((layer, index) => (
              <Link
                key={layer.id}
                to={layer.href}
                className={`relative p-4 rounded-xl border ${layer.borderColor} ${layer.bgColor} backdrop-blur-sm cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:ring-2 hover:ring-white/20`}
                onMouseEnter={() => setActiveLayer(layer.id)}
                onMouseLeave={() => setActiveLayer(null)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${layer.color}`}>
                    <layer.icon className="w-5 h-5 text-white" />
                  </div>
                  {index < 3 && (
                    <ChevronRight className="w-5 h-5 text-gray-600 absolute -right-4 top-1/2 transform -translate-y-1/2 z-10" />
                  )}
                </div>

                <h3 className="font-semibold text-white mb-1">{layer.name}</h3>
                <p className="text-xs text-gray-400 mb-3">{layer.description}</p>

                <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                  {Object.entries(layer.stats).slice(0, 3).map(([key, value]) => (
                    <div key={key} className="bg-black/30 rounded-lg p-2">
                      <div className="text-sm font-semibold text-white">{value}</div>
                      <div className="text-[10px] text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-1">
                  {layer.capabilities.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                      <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${layer.color}`} />
                      {item}
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Business Services */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
          <Server className="w-4 h-4" />
          Connected Business Services
        </h3>
        <div className="flex gap-3">
          {businessServices.map(service => (
            <Link
              key={service.id}
              to="/services"
              className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <service.icon className="w-4 h-4 text-indigo-400" />
              <span className="text-sm text-gray-300">{service.name}</span>
              <div className="w-2 h-2 bg-emerald-400 rounded-full" />
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Transaction Stream */}
        <div className="col-span-2 bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              <h3 className="font-semibold text-white">Live Transaction Stream</h3>
              <div className={`w-2 h-2 ${wsConnected ? 'bg-emerald-400' : 'bg-amber-400'} rounded-full pulse-glow ml-2`} />
            </div>
            <Link to="/flow" className="px-3 py-1 text-xs bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-lg transition-colors">
              View Flow
            </Link>
          </div>

          <div className="overflow-auto max-h-[400px]">
            <table className="w-full">
              <thead className="bg-[#0d0d14] sticky top-0">
                <tr className="text-xs text-gray-500">
                  <th className="px-4 py-3 text-left font-medium">Transaction ID</th>
                  <th className="px-4 py-3 text-left font-medium">Merchant</th>
                  <th className="px-4 py-3 text-left font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Risk Score</th>
                  <th className="px-4 py-3 text-left font-medium">Decision</th>
                  <th className="px-4 py-3 text-left font-medium">Country</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, i) => (
                  <tr
                    key={tx.id + i}
                    className={`border-t border-gray-800/50 hover:bg-gray-800/30 transition-colors ${i === 0 ? 'bg-indigo-500/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-300">{tx.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-300">{tx.merchant}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-white">${tx.amount?.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getRiskColor(tx.riskScore)} transition-all duration-500`}
                            style={{ width: `${tx.riskScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-gray-400">{tx.riskScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 text-xs font-medium ${getStatusColor(tx.status)}`}>
                        {getStatusIcon(tx.status)}
                        {tx.status?.charAt(0).toUpperCase() + tx.status?.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-400">{tx.country}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Risk Distribution */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              Risk Distribution
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {riskDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a2e',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#e5e7eb'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-2">
              {riskDistribution.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: item.color }} />
                    <span className="text-gray-400">{item.name}</span>
                  </div>
                  <span className="font-medium text-white">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Active Experiments */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-emerald-400" />
                Active Experiments
              </h3>
              <Link to="/experiments" className="text-xs text-indigo-400 hover:text-indigo-300">View All</Link>
            </div>
            <div className="space-y-3">
              {(experiments.length > 0 ? experiments.slice(0, 4) : [
                { name: 'New Fraud Model A/B', type: 'A/B_TEST', trafficAllocation: 20 },
                { name: 'Threshold Optimization', type: 'SHADOW_MODE', trafficAllocation: 10 },
                { name: 'Velocity Rule Test', type: 'CHAMPION_CHALLENGER', trafficAllocation: 15 }
              ]).map((exp, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg">
                  <div>
                    <div className="text-sm text-white">{exp.name}</div>
                    <div className="text-xs text-gray-500">{exp.type?.replace(/_/g, ' ')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-400">{exp.trafficAllocation}%</span>
                    <Play className="w-3 h-3 text-emerald-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Transaction Volume (24h)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metricsHistory.length > 0 ? metricsHistory : Array.from({ length: 24 }, (_, i) => ({
                time: `${i}:00`,
                transactions: Math.floor(Math.random() * 5000) + 3000
              }))}>
                <defs>
                  <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#e5e7eb'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="transactions"
                  stroke="#6366f1"
                  fillOpacity={1}
                  fill="url(#colorTx)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            Fraud Blocked vs False Positives (24h)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metricsHistory.length > 0 ? metricsHistory : Array.from({ length: 24 }, (_, i) => ({
                time: `${i}:00`,
                fraudBlocked: Math.floor(Math.random() * 50) + 20,
                falsePositives: Math.floor(Math.random() * 10) + 2
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#e5e7eb'
                  }}
                />
                <Bar dataKey="fraudBlocked" fill="#10b981" radius={[4, 4, 0, 0]} name="Fraud Blocked" />
                <Bar dataKey="falsePositives" fill="#f59e0b" radius={[4, 4, 0, 0]} name="False Positives" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, trend, trendUp, icon, color }) {
  const colorClasses = {
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-400',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-400',
    blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-400',
    red: 'from-red-500/20 to-red-500/5 border-red-500/30 text-red-400',
    purple: 'from-purple-500/20 to-purple-500/5 border-purple-500/30 text-purple-400',
    indigo: 'from-indigo-500/20 to-indigo-500/5 border-indigo-500/30 text-indigo-400'
  }

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-4`}>
      <div className="flex items-start justify-between mb-2">
        <span className={colorClasses[color].split(' ').pop()}>{icon}</span>
        <div className={`flex items-center gap-1 text-xs ${trendUp ? 'text-emerald-400' : 'text-red-400'}`}>
          {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {trend}
        </div>
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}
