import { useState, useEffect } from 'react'
import {
  RefreshCw, Activity, Database, Radio, ArrowRight,
  Layers, Users, Zap, BarChart3, HardDrive
} from 'lucide-react'

const API_BASE = '/api'

export default function StreamingPipeline() {
  const [topics, setTopics] = useState([])
  const [consumerGroups, setConsumerGroups] = useState([])
  const [featureStore, setFeatureStore] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    try {
      const [topicsRes, groupsRes, featureRes] = await Promise.all([
        fetch(`${API_BASE}/streaming/topics`).then(r => r.json()),
        fetch(`${API_BASE}/streaming/consumer-groups`).then(r => r.json()),
        fetch(`${API_BASE}/streaming/feature-store/stats`).then(r => r.json())
      ])
      if (topicsRes.success) setTopics(topicsRes.data)
      if (groupsRes.success) setConsumerGroups(groupsRes.data)
      if (featureRes.success) setFeatureStore(featureRes.data)
    } catch (err) {
      console.error('Failed to fetch streaming data:', err)
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  const getHitRateColor = (rate) => {
    if (rate > 0.8) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' }
    if (rate > 0.5) return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' }
    return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
  }

  const getTotalLag = (group) => {
    if (!group.partitions) return 0
    return group.partitions.reduce((sum, p) => sum + (p.lag || 0), 0)
  }

  const getStatusColor = (status) => {
    if (status === 'active' || status === 'stable') return 'bg-emerald-500/20 text-emerald-400'
    if (status === 'rebalancing' || status === 'warning') return 'bg-amber-500/20 text-amber-400'
    return 'bg-gray-500/20 text-gray-400'
  }

  // Pipeline stages for the flow diagram
  const pipelineStages = [
    { key: 'received', label: 'Received', topic: 'transactions.received', color: 'cyan' },
    { key: 'enriched', label: 'Enriched', topic: 'transactions.enriched', color: 'blue' },
    { key: 'scored', label: 'Scored', topic: 'transactions.scored', color: 'purple' },
    { key: 'decided', label: 'Decided', topic: 'transactions.decided', color: 'emerald' }
  ]

  const getTopicByName = (name) => topics.find(t => t.name === name || t.topic === name)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-20 text-gray-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-cyan-400" />
          Loading streaming pipeline data...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl">
              <Radio className="w-6 h-6 text-white" />
            </div>
            Streaming Pipeline
          </h1>
          <p className="text-gray-400 mt-1">In-process event streaming with topics, partitions, and consumer groups</p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs text-cyan-400">Auto-refresh 5s</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center gap-2 text-gray-300 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Pipeline Flow Diagram */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-6 flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          Pipeline Flow
        </h3>
        <div className="flex items-center justify-between px-4">
          {pipelineStages.map((stage, idx) => {
            const topic = getTopicByName(stage.topic)
            const messageCount = topic?.messageCount ?? topic?.messages ?? 0
            const throughput = topic?.throughput ?? topic?.messagesPerSec ?? 0

            const colorMap = {
              cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/40', text: 'text-cyan-400', dot: 'bg-cyan-400' },
              blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/40', text: 'text-blue-400', dot: 'bg-blue-400' },
              purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/40', text: 'text-purple-400', dot: 'bg-purple-400' },
              emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-400', dot: 'bg-emerald-400' }
            }
            const c = colorMap[stage.color]

            return (
              <div key={stage.key} className="flex items-center">
                {/* Stage Node */}
                <div className={`${c.bg} border ${c.border} rounded-xl p-4 min-w-[160px] text-center`}>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${c.dot} ${topic ? 'animate-pulse' : 'opacity-30'}`} />
                    <span className={`text-sm font-medium ${c.text}`}>{stage.label}</span>
                  </div>
                  <p className="text-lg font-bold text-white">{messageCount.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">messages</p>
                  {throughput > 0 && (
                    <p className="text-xs text-gray-400 mt-1">{throughput.toFixed(1)} msg/s</p>
                  )}
                </div>

                {/* Arrow between stages */}
                {idx < pipelineStages.length - 1 && (
                  <div className="flex items-center mx-3">
                    <div className="w-8 h-px bg-gray-600" />
                    <ArrowRight className="w-4 h-4 text-gray-500 -ml-1" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Topic Cards */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          Topics ({topics.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {topics.map(topic => {
            const name = topic.name || topic.topic
            const messageCount = topic.messageCount ?? topic.messages ?? 0
            const partitions = topic.partitions ?? topic.partitionCount ?? 0
            const throughput = topic.throughput ?? topic.messagesPerSec ?? 0
            const isActive = throughput > 0

            return (
              <div
                key={name}
                className="bg-[#12121a] rounded-xl border border-gray-800 hover:border-gray-700 p-4 transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                    <h4 className="text-sm font-medium text-white truncate" title={name}>{name}</h4>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Messages</span>
                    <span className="text-white font-mono">{messageCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Partitions</span>
                    <span className="text-gray-300">{partitions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Throughput</span>
                    <span className={isActive ? 'text-emerald-400' : 'text-gray-500'}>
                      {throughput.toFixed(1)} msg/s
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-800">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {isActive ? 'Active' : 'Idle'}
                  </span>
                </div>
              </div>
            )
          })}

          {topics.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-400">
              No topics available
            </div>
          )}
        </div>
      </div>

      {/* Consumer Group Table */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-400" />
          Consumer Groups ({consumerGroups.length})
        </h3>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="text-left p-3 text-gray-400 font-medium">Group ID</th>
                <th className="text-left p-3 text-gray-400 font-medium">Topic</th>
                <th className="text-left p-3 text-gray-400 font-medium">Consumers</th>
                <th className="text-left p-3 text-gray-400 font-medium">Total Lag</th>
                <th className="text-left p-3 text-gray-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {consumerGroups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-400">
                    No consumer groups available
                  </td>
                </tr>
              ) : consumerGroups.map(group => {
                const totalLag = getTotalLag(group)
                const status = group.status || (totalLag > 100 ? 'warning' : 'stable')

                return (
                  <tr key={group.groupId} className="hover:bg-gray-800/30">
                    <td className="p-3 text-cyan-400 font-mono text-xs">{group.groupId}</td>
                    <td className="p-3 text-white">{group.topic || group.subscribedTopics?.join(', ') || '-'}</td>
                    <td className="p-3 text-gray-300">{group.consumers ?? group.members ?? 0}</td>
                    <td className="p-3">
                      <span className={`font-mono ${totalLag > 100 ? 'text-amber-400' : totalLag > 0 ? 'text-gray-300' : 'text-emerald-400'}`}>
                        {totalLag.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(status)}`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feature Store Panel */}
      {featureStore && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            Feature Store
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Hit Rate Card */}
            {(() => {
              const hitRate = featureStore.hitRate ?? 0
              const colors = getHitRateColor(hitRate)
              return (
                <div className={`bg-gray-900/50 border ${colors.border} rounded-xl p-6`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Cache Hit Rate</p>
                    <Zap className={`w-4 h-4 ${colors.text}`} />
                  </div>
                  <p className={`text-3xl font-bold ${colors.text}`}>
                    {(hitRate * 100).toFixed(1)}%
                  </p>
                  <div className="mt-3 w-full bg-gray-800 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        hitRate > 0.8 ? 'bg-emerald-400' : hitRate > 0.5 ? 'bg-amber-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${Math.min(hitRate * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>Hits: {(featureStore.hits ?? 0).toLocaleString()}</span>
                    <span>Misses: {(featureStore.misses ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              )
            })()}

            {/* Reads & Writes Card */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Operations</p>
                <BarChart3 className="w-4 h-4 text-blue-400" />
              </div>
              <div className="space-y-4 mt-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Total Reads</span>
                    <span className="text-white font-mono">{(featureStore.reads ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-blue-400"
                      style={{
                        width: `${Math.min(
                          ((featureStore.reads ?? 0) / Math.max((featureStore.reads ?? 0) + (featureStore.writes ?? 0), 1)) * 100,
                          100
                        )}%`
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Total Writes</span>
                    <span className="text-white font-mono">{(featureStore.writes ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-purple-400"
                      style={{
                        width: `${Math.min(
                          ((featureStore.writes ?? 0) / Math.max((featureStore.reads ?? 0) + (featureStore.writes ?? 0), 1)) * 100,
                          100
                        )}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Feature Groups Card */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Feature Groups</p>
                <HardDrive className="w-4 h-4 text-emerald-400" />
              </div>
              {featureStore.groups && featureStore.groups.length > 0 ? (
                <div className="space-y-3 mt-4">
                  {featureStore.groups.map(group => (
                    <div key={group.name || group.groupName} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="text-white">{group.name || group.groupName}</p>
                        <p className="text-xs text-gray-500">
                          {group.features ?? group.featureCount ?? 0} features
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">
                          {group.freshness || group.lastUpdated
                            ? `Updated ${group.freshness || new Date(group.lastUpdated).toLocaleTimeString()}`
                            : 'No data'}
                        </p>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          group.status === 'fresh' || group.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : group.status === 'stale'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {group.status || 'unknown'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm mt-4">No feature groups available</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
