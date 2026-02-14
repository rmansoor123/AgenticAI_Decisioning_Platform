import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Database, Upload, Clock, Zap, GitBranch, Search,
  FileText, Table, ArrowRight, CheckCircle, AlertCircle,
  Play, Pause, RefreshCw, Filter, ChevronRight
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const API_BASE = 'http://localhost:3005/api'

export default function DataPlatform() {
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('ingestion')
  const [pipelines, setPipelines] = useState([])
  const [datasets, setDatasets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (location.pathname.includes('/ingestion')) setActiveTab('ingestion')
    else if (location.pathname.includes('/catalog')) setActiveTab('catalog')
    else if (location.pathname.includes('/query')) setActiveTab('query')
  }, [location])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pipelinesRes, datasetsRes] = await Promise.all([
          fetch(`${API_BASE}/data/ingestion/pipelines`),
          fetch(`${API_BASE}/data/catalog/datasets`)
        ])
        const pipelinesData = await pipelinesRes.json()
        const datasetsData = await datasetsRes.json()
        if (pipelinesData.success) setPipelines(pipelinesData.data || [])
        if (datasetsData.success) setDatasets(datasetsData.data || [])
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const tabs = [
    { id: 'ingestion', name: 'Data Ingestion', icon: Upload, href: '/data/ingestion' },
    { id: 'catalog', name: 'Data Catalog', icon: FileText, href: '/data/catalog' },
    { id: 'query', name: 'Query Federation', icon: Search, href: '/data/query' }
  ]

  const ingestionStats = [
    { label: 'Events/sec', value: '12.5K', trend: '+8%' },
    { label: 'Pipelines Active', value: pipelines.filter(p => p.status === 'RUNNING').length || 8, trend: '' },
    { label: 'Avg Latency', value: '3.2ms', trend: '-12%' },
    { label: 'Data Sources', value: '47', trend: '+2' }
  ]

  const throughputData = Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    realtime: Math.floor(Math.random() * 15000) + 10000,
    batch: Math.floor(Math.random() * 5000) + 2000
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl">
              <Database className="w-6 h-6 text-white" />
            </div>
            Data Foundation
          </h1>
          <p className="text-gray-400 mt-1">Real-time data ingestion, processing, and feature engineering</p>
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
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.name}
          </Link>
        ))}
      </div>

      {activeTab === 'ingestion' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            {ingestionStats.map(stat => (
              <div key={stat.label} className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-gray-400">{stat.label}</span>
                  {stat.trend && <span className="text-xs text-emerald-400">{stat.trend}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Throughput Chart */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-4">Ingestion Throughput (24h)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={throughputData}>
                  <defs>
                    <linearGradient id="colorRealtime" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorBatch" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="time" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <YAxis stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #374151', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="realtime" stroke="#3b82f6" fill="url(#colorRealtime)" name="Real-time" />
                  <Area type="monotone" dataKey="batch" stroke="#8b5cf6" fill="url(#colorBatch)" name="Batch" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pipeline Types */}
          <div className="grid grid-cols-3 gap-4">
            <PipelineCard
              title="Real-time Streaming"
              icon={Zap}
              color="blue"
              description="Kafka-based event streaming with sub-10ms latency"
              stats={{ events: '12.5K/s', latency: '3ms', uptime: '99.99%' }}
              pipelines={['Transaction Events', 'Session Events', 'Device Signals']}
            />
            <PipelineCard
              title="Near Real-time"
              icon={Clock}
              color="purple"
              description="Micro-batch processing with 1-5 minute windows"
              stats={{ events: '2.1K/s', latency: '2min', uptime: '99.95%' }}
              pipelines={['Aggregations', 'Feature Updates', 'Score Refresh']}
            />
            <PipelineCard
              title="Batch Processing"
              icon={Database}
              color="amber"
              description="Scheduled batch jobs for historical analysis"
              stats={{ jobs: '24/day', size: '2.4TB', uptime: '99.9%' }}
              pipelines={['Daily Rollups', 'Model Training', 'Report Generation']}
            />
          </div>

          {/* Active Pipelines */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-white">Active Pipelines</h3>
              <button className="px-3 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30">
                + Create Pipeline
              </button>
            </div>
            <table className="w-full">
              <thead className="bg-[#0d0d14]">
                <tr className="text-xs text-gray-500">
                  <th className="px-4 py-3 text-left">Pipeline</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Throughput</th>
                  <th className="px-4 py-3 text-left">Latency</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(pipelines.length > 0 ? pipelines : [
                  { name: 'Transaction Stream', type: 'REALTIME', status: 'RUNNING', throughput: '8.2K/s', latency: '2ms' },
                  { name: 'Session Aggregator', type: 'NEAR_REALTIME', status: 'RUNNING', throughput: '1.5K/s', latency: '45s' },
                  { name: 'Daily Features', type: 'BATCH', status: 'SCHEDULED', throughput: '-', latency: '-' },
                  { name: 'Device Fingerprints', type: 'REALTIME', status: 'RUNNING', throughput: '5.1K/s', latency: '5ms' }
                ]).slice(0, 6).map((pipeline, i) => (
                  <tr key={i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">{pipeline.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${
                        pipeline.type === 'REALTIME' ? 'bg-blue-500/20 text-blue-400' :
                        pipeline.type === 'NEAR_REALTIME' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>{pipeline.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 text-xs ${
                        pipeline.status === 'RUNNING' ? 'text-emerald-400' : 'text-gray-400'
                      }`}>
                        {pipeline.status === 'RUNNING' ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                        {pipeline.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{pipeline.throughput}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{pipeline.latency}</td>
                    <td className="px-4 py-3">
                      <button className="p-1 hover:bg-gray-700 rounded">
                        <RefreshCw className="w-4 h-4 text-gray-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Search */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search datasets, tables, features..."
                className="w-full pl-10 pr-4 py-3 bg-[#12121a] border border-gray-800 rounded-xl text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl flex items-center gap-2 text-gray-300 hover:bg-gray-700">
              <Filter className="w-4 h-4" />
              Filters
            </button>
          </div>

          {/* Dataset Categories */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { name: 'Transaction Data', count: 12, icon: Table, color: 'blue' },
              { name: 'User Profiles', count: 8, icon: FileText, color: 'purple' },
              { name: 'Feature Store', count: 156, icon: Database, color: 'emerald' },
              { name: 'ML Datasets', count: 24, icon: GitBranch, color: 'amber' }
            ].map(cat => (
              <div key={cat.name} className={`bg-[#12121a] rounded-xl border border-gray-800 p-4 hover:border-${cat.color}-500/50 cursor-pointer transition-colors`}>
                <div className={`p-2 rounded-lg bg-${cat.color}-500/20 w-fit mb-3`}>
                  <cat.icon className={`w-5 h-5 text-${cat.color}-400`} />
                </div>
                <div className="text-white font-medium">{cat.name}</div>
                <div className="text-sm text-gray-400">{cat.count} datasets</div>
              </div>
            ))}
          </div>

          {/* Datasets Table */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="font-semibold text-white">All Datasets</h3>
            </div>
            <table className="w-full">
              <thead className="bg-[#0d0d14]">
                <tr className="text-xs text-gray-500">
                  <th className="px-4 py-3 text-left">Dataset</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Schema</th>
                  <th className="px-4 py-3 text-left">Records</th>
                  <th className="px-4 py-3 text-left">Last Updated</th>
                  <th className="px-4 py-3 text-left">Quality</th>
                </tr>
              </thead>
              <tbody>
                {(datasets.length > 0 ? datasets : [
                  { name: 'transactions_raw', type: 'TABLE', schema: 'fraud_detection', records: '1.2B', updated: '2 min ago', quality: 98 },
                  { name: 'user_features', type: 'FEATURE_GROUP', schema: 'feature_store', records: '25M', updated: '5 min ago', quality: 99 },
                  { name: 'device_fingerprints', type: 'TABLE', schema: 'fraud_detection', records: '45M', updated: '1 min ago', quality: 97 },
                  { name: 'velocity_features', type: 'FEATURE_GROUP', schema: 'feature_store', records: '25M', updated: '30s ago', quality: 100 },
                  { name: 'historical_labels', type: 'DATASET', schema: 'ml_training', records: '5M', updated: '1 day ago', quality: 95 }
                ]).slice(0, 8).map((ds, i) => (
                  <tr key={i} className="border-t border-gray-800/50 hover:bg-gray-800/30 cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-blue-400" />
                        <span className="text-white font-medium">{ds.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300">{ds.type}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{ds.schema}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{ds.records}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{ds.updated}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${ds.quality}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{ds.quality}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'query' && (
        <div className="space-y-6">
          {/* Query Editor */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-white">Query Playground</h3>
              <div className="flex gap-2">
                <select className="px-3 py-1 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300">
                  <option>fraud_detection</option>
                  <option>feature_store</option>
                  <option>ml_training</option>
                </select>
                <button className="px-4 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Run Query
                </button>
              </div>
            </div>
            <div className="p-4">
              <textarea
                className="w-full h-40 bg-[#0d0d14] border border-gray-800 rounded-lg p-4 font-mono text-sm text-gray-300 focus:border-blue-500 focus:outline-none"
                placeholder="SELECT * FROM transactions WHERE risk_score > 70 LIMIT 100"
                defaultValue={`SELECT
  t.transaction_id,
  t.amount,
  t.risk_score,
  f.velocity_1h,
  f.device_trust_score
FROM transactions t
JOIN user_features f ON t.user_id = f.user_id
WHERE t.risk_score > 70
  AND t.created_at > NOW() - INTERVAL '1 hour'
ORDER BY t.risk_score DESC
LIMIT 100`}
              />
            </div>
          </div>

          {/* Query History */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-4">Recent Queries</h3>
            <div className="space-y-3">
              {[
                { query: 'SELECT COUNT(*) FROM transactions WHERE decision = \'BLOCKED\'', time: '2 min ago', duration: '234ms', rows: '1' },
                { query: 'SELECT * FROM user_features WHERE user_id = \'USR-123\'', time: '15 min ago', duration: '45ms', rows: '1' },
                { query: 'SELECT AVG(risk_score) FROM transactions GROUP BY hour', time: '1 hour ago', duration: '1.2s', rows: '24' }
              ].map((q, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 cursor-pointer">
                  <div className="flex-1">
                    <code className="text-sm text-gray-300 font-mono">{q.query.substring(0, 60)}...</code>
                    <div className="text-xs text-gray-500 mt-1">{q.time}</div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{q.duration}</span>
                    <span>{q.rows} rows</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PipelineCard({ title, icon: Icon, color, description, stats, pipelines }) {
  const colorClasses = {
    blue: 'border-blue-500/30 bg-blue-500/10',
    purple: 'border-purple-500/30 bg-purple-500/10',
    amber: 'border-amber-500/30 bg-amber-500/10'
  }

  return (
    <div className={`rounded-xl border ${colorClasses[color]} p-4`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg bg-${color}-500/20`}>
          <Icon className={`w-5 h-5 text-${color}-400`} />
        </div>
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      <p className="text-sm text-gray-400 mb-4">{description}</p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {Object.entries(stats).map(([key, value]) => (
          <div key={key} className="text-center">
            <div className="text-sm font-semibold text-white">{value}</div>
            <div className="text-xs text-gray-500 capitalize">{key}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {pipelines.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            {p}
          </div>
        ))}
      </div>
    </div>
  )
}
