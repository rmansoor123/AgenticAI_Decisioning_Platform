import { useState, useEffect, useCallback, Fragment } from 'react'
import {
  RefreshCw, Database, Globe, Webhook, Server, FileText,
  Activity, ChevronDown, ChevronRight, Search, Plus, X,
  CheckCircle, AlertCircle, Clock, Loader2, Plug
} from 'lucide-react'
import { safeJson } from '../utils/api'

const API_BASE = '/api'

const TYPE_COLORS = {
  'rest-api': { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  'database': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'webhook': { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  'kafka': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  'file': { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  'graphql': { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30' },
  'mock': { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' }
}

const STATUS_COLORS = {
  'REGISTERED': { bg: 'bg-gray-500/20', text: 'text-gray-400', dot: 'bg-gray-400' },
  'HEALTHY': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  'SYNCING': { bg: 'bg-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-400' },
  'ERROR': { bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-400' }
}

const FRESHNESS_OPTIONS = [
  { label: '1 minute', value: '1m' },
  { label: '5 minutes', value: '5m' },
  { label: '15 minutes', value: '15m' },
  { label: '1 hour', value: '1h' },
  { label: '1 day', value: '1d' }
]

function sanitizeConfig(config) {
  if (!config || typeof config !== 'object') return config
  const sanitized = { ...config }
  const sensitiveKeys = ['apiKey', 'api_key', 'secret', 'password', 'token', 'authorization']
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
      sanitized[key] = '••••••••'
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeConfig(sanitized[key])
    }
  }
  return sanitized
}

export default function DataConnectors() {
  const [stats, setStats] = useState(null)
  const [connectorTypes, setConnectorTypes] = useState([])
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState(null)
  const [syncingIds, setSyncingIds] = useState(new Set())
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  // Query panel state
  const [queryEntity, setQueryEntity] = useState('seller')
  const [queryEntityId, setQueryEntityId] = useState('')
  const [querySources, setQuerySources] = useState([])
  const [queryFreshness, setQueryFreshness] = useState('5m')
  const [queryResults, setQueryResults] = useState(null)
  const [querying, setQuerying] = useState(false)
  const [queryError, setQueryError] = useState(null)

  // Register form state
  const [showRegister, setShowRegister] = useState(false)
  const [registerForm, setRegisterForm] = useState({
    sourceId: '', name: '', type: 'rest-api', description: '',
    config: '{}', schemaFields: '', pollInterval: 300
  })
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState(null)
  const [registerSuccess, setRegisterSuccess] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, typesRes, sourcesRes] = await Promise.all([
        fetch(`${API_BASE}/data-platform/connectors/stats`).then(r => safeJson(r)),
        fetch(`${API_BASE}/data-platform/connectors/types`).then(r => safeJson(r)),
        fetch(`${API_BASE}/data-platform/connectors/sources`).then(r => safeJson(r))
      ])
      if (statsRes.success) setStats(statsRes.data)
      if (typesRes.success) setConnectorTypes(typesRes.data || [])
      if (sourcesRes.success) setSources(sourcesRes.data || [])
    } catch (err) {
      console.error('Failed to fetch connector data:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSync = async (sourceId) => {
    setSyncingIds(prev => new Set(prev).add(sourceId))
    try {
      const res = await fetch(`${API_BASE}/data-platform/connectors/sources/${sourceId}/sync`, { method: 'POST' })
      await safeJson(res)
      await fetchData()
    } catch (err) {
      console.error('Sync failed:', err)
    }
    setSyncingIds(prev => {
      const next = new Set(prev)
      next.delete(sourceId)
      return next
    })
  }

  const handleQuery = async () => {
    setQuerying(true)
    setQueryError(null)
    setQueryResults(null)
    try {
      const body = {
        entityType: queryEntity,
        entityId: queryEntityId,
        sources: querySources.length > 0 ? querySources : 'all',
        freshness: queryFreshness
      }
      const res = await fetch(`${API_BASE}/data-platform/connectors/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await safeJson(res)
      if (data.success) {
        setQueryResults(data.data)
      } else {
        setQueryError(data.error || 'Query failed')
      }
    } catch (err) {
      setQueryError(err.message)
    }
    setQuerying(false)
  }

  const handleRegister = async () => {
    setRegistering(true)
    setRegisterError(null)
    setRegisterSuccess(null)
    try {
      let config
      try {
        config = JSON.parse(registerForm.config)
      } catch {
        setRegisterError('Invalid JSON in config field')
        setRegistering(false)
        return
      }
      const body = {
        sourceId: registerForm.sourceId,
        name: registerForm.name,
        type: registerForm.type,
        description: registerForm.description,
        config,
        schema: {
          fields: registerForm.schemaFields.split(',').map(f => f.trim()).filter(Boolean)
        },
        pollInterval: Number(registerForm.pollInterval)
      }
      const res = await fetch(`${API_BASE}/data-platform/connectors/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await safeJson(res)
      if (data.success) {
        setRegisterSuccess(`Source "${registerForm.name}" registered successfully`)
        setRegisterForm({ sourceId: '', name: '', type: 'rest-api', description: '', config: '{}', schemaFields: '', pollInterval: 300 })
        await fetchData()
      } else {
        setRegisterError(data.error || 'Registration failed')
      }
    } catch (err) {
      setRegisterError(err.message)
    }
    setRegistering(false)
  }

  const sortedSources = [...sources].sort((a, b) => {
    const aVal = a[sortField] || ''
    const bVal = b[sortField] || ''
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    }
    return sortDir === 'asc'
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal))
  })

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const SortHeader = ({ field, children }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortField === field && (
          <span className="text-indigo-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-indigo-400" />
          <p className="text-gray-400">Loading data connectors...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a12] space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Plug className="w-7 h-7 text-indigo-400" />
          Data Connectors
        </h1>
        <p className="text-gray-400 mt-1">
          Connect to external systems and federate data across your agent network
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#12121a] border border-gray-800 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Total Sources</div>
          <div className="text-2xl font-bold text-white">{stats?.totalSources ?? 0}</div>
        </div>
        <div className="bg-[#12121a] border border-gray-800 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Healthy</div>
          <div className="text-2xl font-bold text-emerald-400">{stats?.healthy ?? 0}</div>
        </div>
        <div className="bg-[#12121a] border border-gray-800 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Error</div>
          <div className="text-2xl font-bold text-red-400">{stats?.error ?? 0}</div>
        </div>
        <div className="bg-[#12121a] border border-gray-800 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Total Records Ingested</div>
          <div className="text-2xl font-bold text-white">
            {(stats?.totalRecords ?? 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Connector Type Reference */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Connector Types</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {connectorTypes.map(ct => {
            const colors = TYPE_COLORS[ct.type] || TYPE_COLORS['mock']
            return (
              <div key={ct.type} className={`border ${colors.border} ${colors.bg} rounded-lg p-3`}>
                <div className={`text-sm font-semibold ${colors.text} mb-1`}>{ct.type}</div>
                <div className="text-xs text-gray-400 mb-2">{ct.description}</div>
                {ct.configFields && ct.configFields.length > 0 && (
                  <div className="text-xs text-gray-500">
                    Config: {ct.configFields.join(', ')}
                  </div>
                )}
              </div>
            )
          })}
          {connectorTypes.length === 0 && (
            <div className="col-span-full text-gray-500 text-sm">No connector types available</div>
          )}
        </div>
      </div>

      {/* Registered Sources Table */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Registered Sources</h2>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#0a0a12]">
              <tr>
                <SortHeader field="sourceId">Source ID</SortHeader>
                <SortHeader field="name">Name</SortHeader>
                <SortHeader field="type">Type</SortHeader>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Description</th>
                <SortHeader field="status">Status</SortHeader>
                <SortHeader field="records">Records</SortHeader>
                <SortHeader field="lastSync">Last Sync</SortHeader>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {sortedSources.map(source => {
                const typeColor = TYPE_COLORS[source.type] || TYPE_COLORS['mock']
                const statusColor = STATUS_COLORS[source.status] || STATUS_COLORS['REGISTERED']
                const isExpanded = expandedRow === source.sourceId
                const isSyncing = syncingIds.has(source.sourceId)

                return (
                  <Fragment key={source.sourceId}>
                    <tr
                      className="hover:bg-gray-800/30 cursor-pointer transition-colors"
                      onClick={() => setExpandedRow(isExpanded ? null : source.sourceId)}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-gray-300">{source.sourceId}</td>
                      <td className="px-4 py-3 text-sm text-white">{source.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${typeColor.bg} ${typeColor.text}`}>
                          {source.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400 max-w-[200px] truncate">
                        {source.description || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded ${statusColor.bg} ${statusColor.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusColor.dot}`} />
                          {source.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {(source.records ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {source.lastSync
                          ? new Date(source.lastSync).toLocaleString()
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSync(source.sourceId) }}
                          disabled={isSyncing}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-400 border border-indigo-500/30 rounded hover:bg-indigo-500/10 transition-colors disabled:opacity-50"
                        >
                          {isSyncing ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          Sync
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="px-4 py-4 bg-[#0e0e16]">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h4 className="text-sm font-medium text-gray-300 mb-2">Description</h4>
                              <p className="text-sm text-gray-400">{source.description || 'No description'}</p>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-gray-300 mb-2">Schema Fields</h4>
                              <div className="flex flex-wrap gap-1">
                                {(source.schema?.fields || []).map(f => (
                                  <span key={f} className="px-2 py-0.5 text-xs bg-gray-800 text-gray-300 rounded">
                                    {f}
                                  </span>
                                ))}
                                {(!source.schema?.fields || source.schema.fields.length === 0) && (
                                  <span className="text-xs text-gray-500">No schema defined</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-gray-300 mb-2">Config (sanitized)</h4>
                              <pre className="text-xs text-gray-400 bg-[#0a0a12] p-3 rounded overflow-x-auto max-h-40">
                                {JSON.stringify(sanitizeConfig(source.config), null, 2)}
                              </pre>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-gray-300 mb-2">Sync History</h4>
                              {source.syncHistory && source.syncHistory.length > 0 ? (
                                <div className="space-y-1">
                                  {source.syncHistory.slice(0, 5).map((entry, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                      {entry.status === 'success' ? (
                                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                                      ) : (
                                        <AlertCircle className="w-3 h-3 text-red-400" />
                                      )}
                                      <span className="text-gray-400">
                                        {new Date(entry.timestamp).toLocaleString()}
                                      </span>
                                      <span className="text-gray-500">
                                        {entry.records ?? 0} records
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-500">No sync history</span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {sortedSources.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    No sources registered yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unified Query Panel */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-indigo-400" />
          Unified Query
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Entity Type</label>
            <input
              type="text"
              value={queryEntity}
              onChange={e => setQueryEntity(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#0a0a12] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="seller"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Entity ID</label>
            <input
              type="text"
              value={queryEntityId}
              onChange={e => setQueryEntityId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#0a0a12] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="SLR-ABC123"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Sources</label>
            <select
              multiple
              value={querySources}
              onChange={e => setQuerySources(Array.from(e.target.selectedOptions, o => o.value))}
              className="w-full px-3 py-2 text-sm bg-[#0a0a12] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 min-h-[38px]"
            >
              {sources.map(s => (
                <option key={s.sourceId} value={s.sourceId}>{s.name}</option>
              ))}
            </select>
            <div className="text-[10px] text-gray-500 mt-0.5">Hold Ctrl/Cmd to multi-select. Empty = all.</div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Freshness</label>
            <select
              value={queryFreshness}
              onChange={e => setQueryFreshness(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#0a0a12] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              {FRESHNESS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleQuery}
              disabled={querying || !queryEntityId}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Query
            </button>
          </div>
        </div>

        {queryError && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {queryError}
          </div>
        )}

        {queryResults && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-4 text-sm">
              <span className="text-gray-400">Sources queried: <span className="text-white font-medium">{queryResults.sourcesQueried ?? 0}</span></span>
              <span className="text-gray-400">Total records: <span className="text-white font-medium">{queryResults.totalRecords ?? 0}</span></span>
            </div>

            {/* Data lineage */}
            {queryResults.lineage && queryResults.lineage.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">Data Lineage</h4>
                <div className="flex flex-wrap gap-2">
                  {queryResults.lineage.map((l, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded ${l.cached ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {l.source}: {l.records ?? 0} records
                      <span className="text-gray-500">({l.cached ? 'cached' : 'fresh'})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Per-source results */}
            {queryResults.results && (
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">Results by Source</h4>
                <div className="space-y-2">
                  {(Array.isArray(queryResults.results) ? queryResults.results : Object.entries(queryResults.results).map(([k, v]) => ({ source: k, ...v }))).map((result, i) => (
                    <SourceResult key={i} result={result} />
                  ))}
                </div>
              </div>
            )}

            {/* Raw results fallback */}
            {!queryResults.results && (
              <pre className="text-xs text-gray-400 bg-[#0a0a12] p-3 rounded overflow-x-auto max-h-60">
                {JSON.stringify(queryResults, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Register New Source */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg">
        <button
          onClick={() => setShowRegister(!showRegister)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-400" />
            Register New Source
          </h2>
          {showRegister ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
        </button>
        {showRegister && (
          <div className="px-6 pb-6 border-t border-gray-800 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Source ID</label>
                <input
                  type="text"
                  value={registerForm.sourceId}
                  onChange={e => setRegisterForm(f => ({ ...f, sourceId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-[#0a0a12] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="my-rest-source"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={registerForm.name}
                  onChange={e => setRegisterForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-[#0a0a12] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="My REST Source"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Type</label>
                <select
                  value={registerForm.type}
                  onChange={e => setRegisterForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-[#0a0a12] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  {Object.keys(TYPE_COLORS).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-xs text-gray-400 mb-1">Description</label>
                <input
                  type="text"
                  value={registerForm.description}
                  onChange={e => setRegisterForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-[#0a0a12] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Description of the data source"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Config (JSON)</label>
                <textarea
                  value={registerForm.config}
                  onChange={e => setRegisterForm(f => ({ ...f, config: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 text-sm bg-[#0a0a12] border border-gray-700 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500"
                  placeholder='{"url": "https://api.example.com/data"}'
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Schema Fields (comma-separated)</label>
                <input
                  type="text"
                  value={registerForm.schemaFields}
                  onChange={e => setRegisterForm(f => ({ ...f, schemaFields: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-[#0a0a12] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="seller_id, name, risk_score"
                />
                <div className="mt-3">
                  <label className="block text-xs text-gray-400 mb-1">Poll Interval (seconds)</label>
                  <input
                    type="number"
                    value={registerForm.pollInterval}
                    onChange={e => setRegisterForm(f => ({ ...f, pollInterval: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-[#0a0a12] border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    min={10}
                  />
                </div>
              </div>
            </div>

            {registerError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                {registerError}
              </div>
            )}
            {registerSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">
                {registerSuccess}
              </div>
            )}

            <button
              onClick={handleRegister}
              disabled={registering || !registerForm.sourceId || !registerForm.name}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Register
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SourceResult({ result }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-800/30 transition-colors"
      >
        <span className="text-sm text-white font-medium">{result.source || result.sourceId || 'Unknown'}</span>
        <span className="flex items-center gap-2 text-xs text-gray-400">
          {result.records ?? result.count ?? 0} records
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>
      {open && (
        <div className="p-3 border-t border-gray-800 bg-[#0a0a12]">
          <pre className="text-xs text-gray-400 overflow-x-auto max-h-48">
            {JSON.stringify(result.data || result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
