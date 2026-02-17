import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Network, Search, Users, Link2, Mail, Phone, MapPin,
  Building, CreditCard, Globe, AlertTriangle, X,
  RefreshCw, FileText, Activity
} from 'lucide-react'
import ForceGraph2D from 'react-force-graph-2d'

const API_BASE = '/api'
const GRAPH_API = `${API_BASE}/graph`

export default function SellerNetworkAnalysis() {
  const [selectedSeller, setSelectedSeller] = useState(null)
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'fraud-rings' | 'risk-propagation'
  const [graphStats, setGraphStats] = useState({ nodeCount: 0, edgeCount: 0, clusterCount: 0 })
  const [clusters, setClusters] = useState([])
  const [fraudRings, setFraudRings] = useState([])
  const [riskPropagation, setRiskPropagation] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedNode, setHighlightedNode] = useState(null)
  const graphRef = useRef()

  // Fetch graph stats and clusters for the overview tab
  const fetchOverviewData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [statsRes, clustersRes] = await Promise.all([
        fetch(`${GRAPH_API}/stats`),
        fetch(`${GRAPH_API}/clusters`)
      ])
      if (!statsRes.ok) throw new Error(`Stats API returned ${statsRes.status}`)
      if (!clustersRes.ok) throw new Error(`Clusters API returned ${clustersRes.status}`)
      const statsData = await statsRes.json()
      const clustersData = await clustersRes.json()
      setGraphStats({
        nodeCount: statsData.nodeCount ?? statsData.nodes ?? 0,
        edgeCount: statsData.edgeCount ?? statsData.edges ?? 0,
        clusterCount: statsData.clusterCount ?? statsData.clusters ?? 0
      })
      const clusterList = clustersData.clusters ?? clustersData.data ?? clustersData ?? []
      setClusters(Array.isArray(clusterList) ? clusterList : [])

      // Build graph data from clusters for the overview visualization
      const nodes = []
      const links = []
      const nodeIds = new Set()
      ;(Array.isArray(clusterList) ? clusterList : []).forEach(cluster => {
        const members = cluster.members ?? cluster.nodes ?? []
        members.forEach(member => {
          const id = member.sellerId ?? member.id
          if (id && !nodeIds.has(id)) {
            nodeIds.add(id)
            nodes.push({
              id,
              label: member.businessName ?? member.label ?? id,
              sellerId: id,
              businessName: member.businessName ?? member.label ?? id,
              email: member.email,
              phone: member.phone,
              country: member.country,
              status: member.status ?? 'ACTIVE',
              riskTier: member.riskTier ?? 'LOW',
              riskScore: member.riskScore ?? 0,
              group: member.status === 'BLOCKED' ? 1 : member.status === 'UNDER_REVIEW' ? 2 : (member.riskTier === 'HIGH' || member.riskTier === 'CRITICAL') ? 3 : 0,
              size: Math.max(5, Math.min(20, 5 + ((member.riskScore ?? 0) / 10))),
              cluster: cluster.id ?? cluster.clusterId
            })
          }
        })
        const edges = cluster.edges ?? cluster.links ?? []
        edges.forEach(edge => {
          links.push({
            source: edge.source ?? edge.from,
            target: edge.target ?? edge.to,
            connections: edge.connections ?? [{ type: edge.type ?? 'link' }],
            connectionCount: edge.connectionCount ?? edge.weight ?? 1,
            strength: edge.weight ?? 1,
            type: edge.type ?? (edge.connections?.[0]?.type) ?? 'link',
            label: edge.label ?? `${edge.connectionCount ?? 1} connection(s)`
          })
        })
      })
      setGraphData({ nodes, links })
    } catch (err) {
      console.error('Error fetching overview data:', err)
      setError(`Failed to load network overview. ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch ego network for a selected seller
  const fetchSellerNetwork = useCallback(async (sellerId) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${GRAPH_API}/seller/${encodeURIComponent(sellerId)}/network?depth=2`)
      if (!res.ok) throw new Error(`Seller network API returned ${res.status}`)
      const data = await res.json()
      const rawNodes = data.nodes ?? data.seller ? [data.seller, ...(data.neighbors ?? [])] : []
      const rawEdges = data.edges ?? data.links ?? []
      const nodes = rawNodes.map(n => ({
        id: n.sellerId ?? n.id,
        label: n.businessName ?? n.label ?? n.sellerId ?? n.id,
        sellerId: n.sellerId ?? n.id,
        businessName: n.businessName ?? n.label ?? n.sellerId ?? n.id,
        email: n.email,
        phone: n.phone,
        country: n.country,
        status: n.status ?? 'ACTIVE',
        riskTier: n.riskTier ?? 'LOW',
        riskScore: n.riskScore ?? 0,
        group: n.status === 'BLOCKED' ? 1 : n.status === 'UNDER_REVIEW' ? 2 : (n.riskTier === 'HIGH' || n.riskTier === 'CRITICAL') ? 3 : 0,
        size: Math.max(5, Math.min(20, 5 + ((n.riskScore ?? 0) / 10)))
      }))
      const links = rawEdges.map(e => ({
        source: e.source ?? e.from,
        target: e.target ?? e.to,
        connections: e.connections ?? [{ type: e.type ?? 'link' }],
        connectionCount: e.connectionCount ?? e.weight ?? 1,
        strength: e.weight ?? 1,
        type: e.type ?? (e.connections?.[0]?.type) ?? 'link',
        label: e.label ?? `${e.connectionCount ?? 1} connection(s)`
      }))
      setGraphData({ nodes, links })
    } catch (err) {
      console.error('Error fetching seller network:', err)
      setError(`Failed to load network for seller ${sellerId}. ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch fraud rings
  const fetchFraudRings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${GRAPH_API}/rings`)
      if (!res.ok) throw new Error(`Fraud rings API returned ${res.status}`)
      const data = await res.json()
      const rings = data.rings ?? data.data ?? data ?? []
      setFraudRings(Array.isArray(rings) ? rings : [])

      // Build graph from fraud rings
      const nodes = []
      const links = []
      const nodeIds = new Set()
      ;(Array.isArray(rings) ? rings : []).forEach(ring => {
        const members = ring.members ?? ring.nodes ?? []
        members.forEach(member => {
          const id = member.sellerId ?? member.id
          if (id && !nodeIds.has(id)) {
            nodeIds.add(id)
            nodes.push({
              id,
              label: member.businessName ?? member.label ?? id,
              sellerId: id,
              businessName: member.businessName ?? member.label ?? id,
              email: member.email,
              status: member.status ?? 'ACTIVE',
              riskTier: member.riskTier ?? 'HIGH',
              riskScore: member.riskScore ?? 0,
              group: 1, // Fraud rings shown as red
              size: Math.max(8, Math.min(20, 8 + ((member.riskScore ?? 0) / 10))),
              ring: ring.id ?? ring.ringId
            })
          }
        })
        const edges = ring.edges ?? ring.links ?? []
        edges.forEach(edge => {
          links.push({
            source: edge.source ?? edge.from,
            target: edge.target ?? edge.to,
            connections: edge.connections ?? [{ type: edge.type ?? 'link' }],
            connectionCount: edge.connectionCount ?? edge.weight ?? 1,
            strength: edge.weight ?? 1,
            type: edge.type ?? 'link',
            label: edge.label ?? `${edge.connectionCount ?? 1} connection(s)`
          })
        })
      })
      setGraphData({ nodes, links })
    } catch (err) {
      console.error('Error fetching fraud rings:', err)
      setError(`Failed to load fraud rings. ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch risk propagation for a seller
  const fetchRiskPropagation = useCallback(async (sellerId) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${GRAPH_API}/seller/${encodeURIComponent(sellerId)}/risk-propagation`)
      if (!res.ok) throw new Error(`Risk propagation API returned ${res.status}`)
      const data = await res.json()
      setRiskPropagation(data)

      // If the response includes graph data, use it for visualization
      const rawNodes = data.nodes ?? data.affectedSellers ?? []
      const rawEdges = data.edges ?? data.propagationPaths ?? data.links ?? []
      if (rawNodes.length > 0) {
        const nodes = rawNodes.map(n => ({
          id: n.sellerId ?? n.id,
          label: n.businessName ?? n.label ?? n.sellerId ?? n.id,
          sellerId: n.sellerId ?? n.id,
          businessName: n.businessName ?? n.label ?? n.sellerId ?? n.id,
          status: n.status ?? 'ACTIVE',
          riskTier: n.riskTier ?? 'LOW',
          riskScore: n.riskScore ?? n.propagatedRisk ?? 0,
          group: (n.riskScore ?? n.propagatedRisk ?? 0) > 70 ? 1 : (n.riskScore ?? n.propagatedRisk ?? 0) > 40 ? 2 : 0,
          size: Math.max(5, Math.min(20, 5 + ((n.riskScore ?? n.propagatedRisk ?? 0) / 10)))
        }))
        const links = rawEdges.map(e => ({
          source: e.source ?? e.from,
          target: e.target ?? e.to,
          connections: e.connections ?? [{ type: 'risk-propagation' }],
          connectionCount: 1,
          strength: e.weight ?? 1,
          type: 'risk-propagation',
          label: e.label ?? 'risk propagation'
        }))
        setGraphData({ nodes, links })
      }
    } catch (err) {
      console.error('Error fetching risk propagation:', err)
      setError(`Failed to load risk propagation for seller ${sellerId}. ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchOverviewData()
  }, [fetchOverviewData])

  // Handle tab changes
  useEffect(() => {
    if (activeTab === 'overview') {
      fetchOverviewData()
    } else if (activeTab === 'fraud-rings') {
      fetchFraudRings()
    } else if (activeTab === 'risk-propagation' && selectedSeller) {
      fetchRiskPropagation(selectedSeller.sellerId ?? selectedSeller.id)
    }
  }, [activeTab, fetchOverviewData, fetchFraudRings, fetchRiskPropagation, selectedSeller])

  // When a seller is selected, fetch their ego network (unless on risk-propagation tab)
  useEffect(() => {
    if (selectedSeller && activeTab !== 'risk-propagation') {
      fetchSellerNetwork(selectedSeller.sellerId ?? selectedSeller.id)
    }
  }, [selectedSeller, fetchSellerNetwork, activeTab])

  const getConnectionTypeIcon = (type) => {
    switch (type) {
      case 'email': return Mail
      case 'phone': return Phone
      case 'address': return MapPin
      case 'business': return Building
      case 'bank': return CreditCard
      case 'ip': return Globe
      case 'tax': return FileText
      default: return Link2
    }
  }

  const getConnectionTypeColor = (type) => {
    switch (type) {
      case 'email': return '#3b82f6' // blue
      case 'phone': return '#10b981' // emerald
      case 'address': return '#f59e0b' // amber
      case 'business': return '#8b5cf6' // purple
      case 'bank': return '#ef4444' // red
      case 'ip': return '#06b6d4' // cyan
      case 'tax': return '#ec4899' // pink
      default: return '#6b7280' // gray
    }
  }

  const handleNodeClick = (node) => {
    setSelectedSeller(node)
    setHighlightedNode(node.id)
  }

  const handleNodeHover = (node) => {
    if (node) {
      setHighlightedNode(node.id)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
              <Network className="w-6 h-6 text-white" />
            </div>
            Seller Network Analysis
          </h1>
          <p className="text-gray-400 mt-1">Visualize account linking and relationships between sellers</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (activeTab === 'overview') fetchOverviewData()
              else if (activeTab === 'fraud-rings') fetchFraudRings()
              else if (activeTab === 'risk-propagation' && selectedSeller) fetchRiskPropagation(selectedSeller.sellerId ?? selectedSeller.id)
            }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center gap-2 text-gray-300"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-[#12121a] p-1 rounded-xl border border-gray-800 w-fit">
        {[
          { id: 'overview', label: 'Overview', icon: Network },
          { id: 'fraud-rings', label: 'Fraud Rings', icon: AlertTriangle },
          { id: 'risk-propagation', label: 'Risk Propagation', icon: Activity }
        ].map(tab => {
          const TabIcon = tab.icon
          const isActive = activeTab === tab.id
          const isDisabled = tab.id === 'risk-propagation' && !selectedSeller
          return (
            <button
              key={tab.id}
              onClick={() => !isDisabled && setActiveTab(tab.id)}
              disabled={isDisabled}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : isDisabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
              title={isDisabled ? 'Select a seller first to view risk propagation' : ''}
            >
              <TabIcon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-red-400 font-medium">Error loading data</div>
            <div className="text-red-300/70 text-sm mt-1">{error}</div>
          </div>
          <button onClick={() => setError(null)} className="p-1 hover:bg-red-500/20 rounded">
            <X className="w-4 h-4 text-red-400" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-6">
        {/* Sidebar Controls */}
        <div className="space-y-4">
          {/* Search */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-400" />
                Search Seller
              </h3>
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('')
                    setSelectedSeller(null)
                    setHighlightedNode(null)
                    if (activeTab === 'overview') fetchOverviewData()
                  }}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            <form onSubmit={(e) => {
              e.preventDefault()
              if (searchTerm.trim()) {
                // Use the search term as a sellerId to fetch the ego network
                const sellerId = searchTerm.trim()
                setSelectedSeller({ sellerId: sellerId, id: sellerId, businessName: sellerId })
                setHighlightedNode(sellerId)
              }
            }}>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Enter seller ID to explore..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              />
              <button
                type="submit"
                className="mt-2 w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition"
              >
                Load Network
              </button>
            </form>
          </div>

          {/* Selected Seller Info */}
          {selectedSeller && (
            <div className="bg-[#12121a] rounded-xl border border-blue-500/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white">Selected Seller</h3>
                <button
                  onClick={() => {
                    setSelectedSeller(null)
                    setHighlightedNode(null)
                    if (activeTab === 'risk-propagation') setActiveTab('overview')
                    fetchOverviewData()
                  }}
                  className="p-1 hover:bg-gray-800 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-gray-400">Business</div>
                  <div className="text-white font-medium">{selectedSeller.businessName || selectedSeller.label || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-gray-400">Seller ID</div>
                  <div className="text-white font-mono text-xs">{selectedSeller.sellerId || selectedSeller.id}</div>
                </div>
                <div>
                  <div className="text-gray-400">Status</div>
                  <div className={`text-sm ${
                    selectedSeller.status === 'BLOCKED' ? 'text-red-400' :
                    selectedSeller.status === 'UNDER_REVIEW' ? 'text-amber-400' :
                    'text-emerald-400'
                  }`}>
                    {selectedSeller.status || 'ACTIVE'}
                  </div>
                </div>
                {selectedSeller.email && (
                  <div>
                    <div className="text-gray-400">Email</div>
                    <div className="text-white text-xs">{selectedSeller.email}</div>
                  </div>
                )}
                {selectedSeller.riskScore != null && (
                  <div>
                    <div className="text-gray-400">Risk Score</div>
                    <div className="text-white text-xs">{selectedSeller.riskScore}/100</div>
                  </div>
                )}
                <button
                  onClick={() => {
                    setActiveTab('risk-propagation')
                  }}
                  className="mt-2 w-full px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-lg text-purple-300 text-xs font-medium transition flex items-center justify-center gap-2"
                >
                  <Activity className="w-3 h-3" />
                  View Risk Propagation
                </button>
              </div>
            </div>
          )}

          {/* Network Stats from API */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-3">Network Stats</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Nodes</span>
                <span className="text-white font-medium">{graphStats.nodeCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total Edges</span>
                <span className="text-white font-medium">{graphStats.edgeCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Clusters</span>
                <span className="text-white font-medium">{graphStats.clusterCount}</span>
              </div>
              <div className="border-t border-gray-800 my-2 pt-2">
                <div className="text-xs text-gray-500 mb-1">Current View</div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Visible Nodes</span>
                <span className="text-white font-medium">{graphData.nodes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Visible Edges</span>
                <span className="text-white font-medium">{graphData.links.length}</span>
              </div>
            </div>
          </div>

          {/* Clusters list (overview tab) */}
          {activeTab === 'overview' && clusters.length > 0 && (
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                Clusters ({clusters.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {clusters.map((cluster, i) => (
                  <div key={cluster.id ?? cluster.clusterId ?? i} className="p-2 bg-gray-800/50 rounded-lg border border-gray-700 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-medium text-xs">
                        {cluster.name ?? cluster.label ?? `Cluster ${i + 1}`}
                      </span>
                      {cluster.riskScore != null && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          cluster.riskScore > 70 ? 'bg-red-500/20 text-red-400' :
                          cluster.riskScore > 40 ? 'bg-amber-500/20 text-amber-400' :
                          'bg-green-500/20 text-green-400'
                        }`}>
                          Risk: {cluster.riskScore}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {(cluster.members ?? cluster.nodes ?? []).length} members
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fraud Rings list (fraud-rings tab) */}
          {activeTab === 'fraud-rings' && fraudRings.length > 0 && (
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Detected Rings ({fraudRings.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {fraudRings.map((ring, i) => (
                  <div key={ring.id ?? ring.ringId ?? i} className="p-2 bg-red-500/5 rounded-lg border border-red-500/20 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-medium text-xs">
                        {ring.name ?? ring.label ?? `Ring ${i + 1}`}
                      </span>
                      {ring.riskScore != null && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                          Risk: {ring.riskScore}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {(ring.members ?? ring.nodes ?? []).length} members
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk Propagation details */}
          {activeTab === 'risk-propagation' && riskPropagation && (
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                Propagation Details
              </h3>
              <div className="space-y-2 text-sm">
                {riskPropagation.sourceRisk != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Source Risk</span>
                    <span className="text-white font-medium">{riskPropagation.sourceRisk}</span>
                  </div>
                )}
                {riskPropagation.affectedCount != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Affected Sellers</span>
                    <span className="text-white font-medium">{riskPropagation.affectedCount}</span>
                  </div>
                )}
                {riskPropagation.maxDepth != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Max Depth</span>
                    <span className="text-white font-medium">{riskPropagation.maxDepth}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Graph Visualization */}
        <div className="col-span-3">
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">
                {activeTab === 'overview' && 'Network Graph — Cluster Overview'}
                {activeTab === 'fraud-rings' && 'Network Graph — Fraud Rings'}
                {activeTab === 'risk-propagation' && `Network Graph — Risk Propagation${selectedSeller ? ` (${selectedSeller.businessName || selectedSeller.sellerId || selectedSeller.id})` : ''}`}
              </h3>
              <div className="flex items-center gap-2">
                <div className="text-xs text-gray-400">
                  {graphData.nodes.length} sellers, {graphData.links.length} connections
                </div>
              </div>
            </div>

            {loading ? (
              <div className="h-[600px] flex items-center justify-center">
                <div className="text-gray-400">Loading network data...</div>
              </div>
            ) : graphData.nodes.length === 0 ? (
              <div className="h-[600px] flex items-center justify-center">
                <div className="text-center">
                  <Network className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                  <div className="text-gray-400">
                    {activeTab === 'fraud-rings' ? 'No fraud rings detected' :
                     activeTab === 'risk-propagation' ? 'Select a seller to view risk propagation' :
                     'No connections found in the network'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {activeTab === 'overview' ? 'The graph backend found no clusters to display' :
                     activeTab === 'fraud-rings' ? 'No suspicious ring patterns were detected' :
                     'Enter a seller ID and click Load Network'}
                  </div>
                </div>
              </div>
            ) : ForceGraph2D ? (
              <div className="h-[600px] border border-gray-800 rounded-lg overflow-hidden" key={`graph-${graphData.nodes.length}-${searchTerm || 'all'}`}>
                <ForceGraph2D
                  ref={graphRef}
                  graphData={graphData}
                  key={`force-graph-${graphData.nodes.length}-${Date.now()}`}
                  nodeLabel={node => `
                    ${node.businessName || node.sellerId}
                    ${node.email ? `\nEmail: ${node.email}` : ''}
                    ${node.riskScore ? `\nRisk: ${node.riskScore}/100` : ''}
                    Status: ${node.status}
                  `}
                  nodeColor={node => {
                    if (highlightedNode === node.id) return '#3b82f6'
                    if (node.group === 1) return '#ef4444' // Blocked - red
                    if (node.group === 2) return '#f59e0b' // Under review - amber
                    if (node.group === 3) return '#f97316' // High risk - orange
                    return '#10b981' // Active - green
                  }}
                  nodeVal={node => node.size || 8}
                  linkLabel={link => link.label}
                  linkColor={link => getConnectionTypeColor(link.type)}
                  linkWidth={link => Math.max(1, link.connectionCount)}
                  linkDirectionalArrowLength={6}
                  linkDirectionalArrowRelPos={1}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  nodeCanvasObject={(node, ctx, globalScale) => {
                    const label = node.businessName || node.sellerId
                    const fontSize = 12 / globalScale
                    ctx.font = `${fontSize}px Sans-Serif`
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillStyle = node.id === highlightedNode ? '#3b82f6' : '#ffffff'
                    ctx.fillText(label, node.x, node.y + 15)
                  }}
                  cooldownTicks={100}
                  onEngineStop={() => graphRef.current?.zoomToFit(400)}
                />
              </div>
            ) : (
              <div className="h-[600px] border border-gray-800 rounded-lg overflow-hidden bg-gray-900/50 flex items-center justify-center">
                <div className="text-center">
                  <Network className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                  <div className="text-gray-400 mb-2">Graph visualization requires react-force-graph-2d</div>
                  <div className="text-xs text-gray-500">Run: npm install react-force-graph-2d</div>
                  <div className="mt-4 p-4 bg-gray-800 rounded-lg text-left text-sm text-gray-300 max-w-md">
                    <div className="font-medium mb-2">Network Data Available:</div>
                    <div>Nodes: {graphData.nodes.length}</div>
                    <div>Connections: {graphData.links.length}</div>
                    {graphData.links.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="font-medium">Sample Connections:</div>
                        {graphData.links.slice(0, 5).map((link, i) => (
                          <div key={i} className="text-xs">
                            {link.source} ↔ {link.target} ({link.connectionCount} matches: {link.connections.map(c => c.type).join(', ')})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Connection Type Legend */}
            <div className="mt-4 pt-4 border-t border-gray-800">
              <div className="text-xs text-gray-400 mb-2">Connection Types</div>
              <div className="flex flex-wrap gap-3">
                {['email', 'phone', 'address', 'business', 'bank', 'ip', 'tax'].map(type => {
                  const Icon = getConnectionTypeIcon(type)
                  return (
                    <div key={type} className="flex items-center gap-1.5 text-xs">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: getConnectionTypeColor(type) }}
                      />
                      <Icon className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-400 capitalize">{type}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Connection Details */}
          {selectedSeller && (
            <div className="mt-4 bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h3 className="font-semibold text-white mb-3">Connections for {selectedSeller.businessName || selectedSeller.sellerId || selectedSeller.id}</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {graphData.links
                  .filter(link => {
                    const sellerId = selectedSeller.sellerId || selectedSeller.id
                    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
                    const targetId = typeof link.target === 'object' ? link.target.id : link.target
                    return sourceId === sellerId || targetId === sellerId
                  })
                  .map((link, i) => {
                    const sellerId = selectedSeller.sellerId || selectedSeller.id
                    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
                    const targetId = typeof link.target === 'object' ? link.target.id : link.target
                    const connectedSellerId = sourceId === sellerId ? targetId : sourceId
                    const connectedNode = graphData.nodes.find(n => n.id === connectedSellerId)
                    return (
                      <div key={i} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium text-white">
                            {connectedNode?.businessName || connectedNode?.label || connectedSellerId}
                          </div>
                          <span className="text-xs text-gray-400">
                            {link.connectionCount} connection{link.connectionCount > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(link.connections || []).map((conn, j) => {
                            const ConnIcon = getConnectionTypeIcon(conn.type)
                            return (
                              <div
                                key={j}
                                className="flex items-center gap-1 px-2 py-1 bg-gray-700/50 rounded text-xs"
                                style={{ borderLeft: `3px solid ${getConnectionTypeColor(conn.type)}` }}
                              >
                                <ConnIcon className="w-3 h-3 text-gray-400" />
                                <span className="text-gray-300 capitalize">{conn.type}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

