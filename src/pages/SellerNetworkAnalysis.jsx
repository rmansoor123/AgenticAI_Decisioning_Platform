import { useState, useEffect, useRef } from 'react'
import {
  Network, Search, Filter, Users, Link2, Mail, Phone, MapPin,
  Building, CreditCard, Globe, AlertTriangle, X, ZoomIn, ZoomOut,
  RefreshCw, Eye, Info, FileText
} from 'lucide-react'
import ForceGraph2D from 'react-force-graph-2d'

const API_BASE = 'http://localhost:3001/api'

export default function SellerNetworkAnalysis() {
  const [sellers, setSellers] = useState([])
  const [selectedSeller, setSelectedSeller] = useState(null)
  const [graphData, setGraphData] = useState({ nodes: [], links: [] })
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    connectionTypes: ['email', 'phone', 'address', 'business', 'bank', 'ip', 'device'],
    minConnections: 1,
    showIsolated: false
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedNode, setHighlightedNode] = useState(null)
  const graphRef = useRef()

  useEffect(() => {
    fetchSellers()
  }, [])

  useEffect(() => {
    if (sellers.length > 0) {
      buildGraph()
    }
  }, [sellers, filters, selectedSeller])

  const fetchSellers = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/onboarding/sellers?limit=500`)
      const data = await res.json()
      if (data.success) {
        setSellers(data.data || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const buildGraph = () => {
    const nodes = []
    const links = []
    const nodeMap = new Map()
    const processedPairs = new Set()

    // Create nodes for all sellers (we'll filter by connections later)
    sellers.forEach(seller => {
      const nodeId = seller.sellerId
      if (!nodeMap.has(nodeId)) {
        nodes.push({
          id: nodeId,
          label: seller.businessName || seller.sellerId,
          sellerId: seller.sellerId,
          businessName: seller.businessName,
          email: seller.email,
          phone: seller.phone,
          country: seller.country,
          status: seller.status,
          riskTier: seller.riskTier,
          riskScore: seller.riskScore || seller.onboardingRiskAssessment?.riskScore || 0,
          group: getNodeGroup(seller),
          size: getNodeSize(seller)
        })
        nodeMap.set(nodeId, nodes.length - 1)
      }
    })

    // Create links based on connection types
    sellers.forEach((seller1, i) => {
      sellers.slice(i + 1).forEach(seller2 => {
        const connections = findConnections(seller1, seller2)
        
        if (connections.length > 0) {
          const pairKey = `${seller1.sellerId}-${seller2.sellerId}`
          if (!processedPairs.has(pairKey)) {
            processedPairs.add(pairKey)

            // Check if any connection type matches filters
            const matchingConnections = connections.filter(conn => 
              filters.connectionTypes.includes(conn.type)
            )

            if (matchingConnections.length >= filters.minConnections) {
              const node1Idx = nodeMap.get(seller1.sellerId)
              const node2Idx = nodeMap.get(seller2.sellerId)

              if (node1Idx !== undefined && node2Idx !== undefined) {
                links.push({
                  source: seller1.sellerId,
                  target: seller2.sellerId,
                  connections: matchingConnections,
                  connectionCount: matchingConnections.length,
                  strength: matchingConnections.length,
                  type: matchingConnections[0].type, // Primary connection type
                  label: `${matchingConnections.length} connection${matchingConnections.length > 1 ? 's' : ''}`
                })
              }
            }
          }
        }
      })
    })

    // Filter nodes based on connections (unless showing isolated or searching)
    const connectedNodeIds = new Set()
    links.forEach(link => {
      connectedNodeIds.add(link.source)
      connectedNodeIds.add(link.target)
    })

    const filteredNodes = (filters.showIsolated || searchTerm)
      ? nodes  // Show all nodes if showing isolated or searching
      : nodes.filter(node => connectedNodeIds.has(node.id))  // Only show connected nodes

    // Filter by selected seller
    let finalNodes = filteredNodes
    let finalLinks = links

    if (selectedSeller) {
      const selectedNodeId = selectedSeller.sellerId
      const relatedNodeIds = new Set([selectedNodeId])
      
      links.forEach(link => {
        if (link.source === selectedNodeId) relatedNodeIds.add(link.target)
        if (link.target === selectedNodeId) relatedNodeIds.add(link.source)
      })

      finalNodes = filteredNodes.filter(node => relatedNodeIds.has(node.id))
      finalLinks = links.filter(link => 
        relatedNodeIds.has(link.source) && relatedNodeIds.has(link.target)
      )
    }

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase().trim()
      const matchingIds = new Set()
      
      // Search through ALL sellers to find matches
      sellers.forEach(seller => {
        const matches = 
          (seller.sellerId && seller.sellerId.toLowerCase().includes(searchLower)) ||
          (seller.businessName && seller.businessName.toLowerCase().includes(searchLower)) ||
          (seller.email && seller.email.toLowerCase().includes(searchLower)) ||
          (seller.phone && seller.phone.toLowerCase().includes(searchLower))
        
        if (matches) {
          matchingIds.add(seller.sellerId)
        }
      })

      // If we found matches, show them and their connections
      if (matchingIds.size > 0) {
        // Include connected nodes
        const connectedIds = new Set(matchingIds)
        links.forEach(link => {
          if (matchingIds.has(link.source)) connectedIds.add(link.target)
          if (matchingIds.has(link.target)) connectedIds.add(link.source)
        })
        
        // Create nodes for matching sellers and their connections
        const searchNodes = []
        const searchNodeMap = new Map()
        
        // Add matching sellers and their connected sellers
        sellers.forEach(seller => {
          if (connectedIds.has(seller.sellerId)) {
            const nodeId = seller.sellerId
            if (!searchNodeMap.has(nodeId)) {
              // Check if node already exists in nodes array
              const existingNode = nodes.find(n => n.id === nodeId)
              if (existingNode) {
                searchNodes.push(existingNode)
              } else {
                // Create new node for seller
                const riskScore = seller.riskScore || seller.onboardingRiskAssessment?.riskScore || 0
                const status = seller.status || 'PENDING'
                const riskTier = seller.riskTier || 'MEDIUM'
                
                searchNodes.push({
                  id: nodeId,
                  label: seller.businessName || seller.sellerId,
                  sellerId: seller.sellerId,
                  businessName: seller.businessName,
                  email: seller.email,
                  phone: seller.phone,
                  country: seller.country,
                  status: status,
                  riskTier: riskTier,
                  riskScore: riskScore,
                  group: status === 'BLOCKED' ? 1 : status === 'UNDER_REVIEW' ? 2 : (riskTier === 'HIGH' || riskTier === 'CRITICAL') ? 3 : 0,
                  size: Math.max(5, Math.min(20, 5 + (riskScore / 10)))
                })
              }
              searchNodeMap.set(nodeId, searchNodes.length - 1)
            }
          }
        })
        
        finalNodes = searchNodes
        finalLinks = links.filter(link => 
          connectedIds.has(link.source) && connectedIds.has(link.target)
        )
        
        // Auto-select first matching seller
        const firstMatch = sellers.find(s => matchingIds.has(s.sellerId))
        if (firstMatch) {
          // Use setTimeout to avoid state update during render
          setTimeout(() => {
            setSelectedSeller(firstMatch)
            setHighlightedNode(firstMatch.sellerId)
          }, 0)
        }
      } else {
        // No matches found - show empty graph
        finalNodes = []
        finalLinks = []
      }
    }

    setGraphData({ nodes: finalNodes, links: finalLinks })
  }

  const findConnections = (seller1, seller2) => {
    const connections = []

    // Email match
    if (seller1.email && seller2.email && seller1.email.toLowerCase() === seller2.email.toLowerCase()) {
      connections.push({ type: 'email', value: seller1.email, description: 'Same email address' })
    }

    // Phone match
    if (seller1.phone && seller2.phone && normalizePhone(seller1.phone) === normalizePhone(seller2.phone)) {
      connections.push({ type: 'phone', value: seller1.phone, description: 'Same phone number' })
    }

    // Address match (similar addresses)
    if (seller1.address && seller2.address && areAddressesSimilar(seller1.address, seller2.address)) {
      connections.push({ type: 'address', value: seller1.address, description: 'Similar address' })
    }

    // Business name match (similar names)
    if (seller1.businessName && seller2.businessName && areBusinessNamesSimilar(seller1.businessName, seller2.businessName)) {
      connections.push({ type: 'business', value: seller1.businessName, description: 'Similar business name' })
    }

    // Tax ID match
    if (seller1.taxId && seller2.taxId && seller1.taxId === seller2.taxId) {
      connections.push({ type: 'tax', value: seller1.taxId, description: 'Same tax ID' })
    }

    // Bank account match (last 4 digits)
    if (seller1.accountNumber && seller2.accountNumber) {
      const acc1 = seller1.accountNumber.replace(/\D/g, '').slice(-4)
      const acc2 = seller2.accountNumber.replace(/\D/g, '').slice(-4)
      if (acc1 && acc2 && acc1 === acc2) {
        connections.push({ type: 'bank', value: `****${acc1}`, description: 'Same bank account (last 4)' })
      }
    }

    // IP address match
    if (seller1.ipAddress && seller2.ipAddress && seller1.ipAddress === seller2.ipAddress) {
      connections.push({ type: 'ip', value: seller1.ipAddress, description: 'Same IP address' })
    }

    // Country match (if combined with other factors)
    if (seller1.country === seller2.country && connections.length > 0) {
      // Only add country as connection if there are other connections
      connections.push({ type: 'country', value: seller1.country, description: 'Same country + other matches' })
    }

    return connections
  }

  const normalizePhone = (phone) => {
    return phone.replace(/\D/g, '').slice(-10)
  }

  const areAddressesSimilar = (addr1, addr2) => {
    const normalize = (addr) => addr.toLowerCase().replace(/[^a-z0-9]/g, '')
    const norm1 = normalize(addr1)
    const norm2 = normalize(addr2)
    
    // Check if addresses share significant portion
    const minLength = Math.min(norm1.length, norm2.length)
    if (minLength < 10) return false
    
    const similarity = calculateSimilarity(norm1, norm2)
    return similarity > 0.7
  }

  const areBusinessNamesSimilar = (name1, name2) => {
    const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
    const norm1 = normalize(name1)
    const norm2 = normalize(name2)
    
    if (norm1 === norm2) return true
    
    const similarity = calculateSimilarity(norm1, norm2)
    return similarity > 0.8
  }

  const calculateSimilarity = (str1, str2) => {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1
    
    if (longer.length === 0) return 1.0
    
    const editDistance = levenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
  }

  const levenshteinDistance = (str1, str2) => {
    const matrix = []
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }
    return matrix[str2.length][str1.length]
  }

  const getNodeGroup = (seller) => {
    if (seller.status === 'BLOCKED') return 1 // Red
    if (seller.status === 'UNDER_REVIEW') return 2 // Amber
    if (seller.riskTier === 'HIGH' || seller.riskTier === 'CRITICAL') return 3 // Orange
    return 0 // Green/Blue
  }

  const getNodeSize = (seller) => {
    const riskScore = seller.riskScore || seller.onboardingRiskAssessment?.riskScore || 0
    return Math.max(5, Math.min(20, 5 + (riskScore / 10)))
  }

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
    const seller = sellers.find(s => s.sellerId === node.id)
    setSelectedSeller(seller || null)
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
            onClick={fetchSellers}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Filters & Controls */}
        <div className="space-y-4">
          {/* Search */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-400" />
                Search
              </h3>
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('')
                    setSelectedSeller(null)
                    setHighlightedNode(null)
                  }}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, ID, email..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            />
            {searchTerm && graphData.nodes.length === 0 && (
              <div className="mt-2 text-xs text-amber-400">
                No sellers found matching "{searchTerm}"
              </div>
            )}
            {searchTerm && graphData.nodes.length > 0 && (
              <div className="mt-2 text-xs text-emerald-400">
                Found {graphData.nodes.length} seller(s)
              </div>
            )}
          </div>

          {/* Connection Type Filters */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-400" />
              Connection Types
            </h3>
            <div className="space-y-2">
              {[
                { type: 'email', label: 'Email', icon: Mail },
                { type: 'phone', label: 'Phone', icon: Phone },
                { type: 'address', label: 'Address', icon: MapPin },
                { type: 'business', label: 'Business Name', icon: Building },
                { type: 'bank', label: 'Bank Account', icon: CreditCard },
                { type: 'ip', label: 'IP Address', icon: Globe },
                { type: 'tax', label: 'Tax ID', icon: FileText }
              ].map(item => {
                const Icon = item.icon
                const isSelected = filters.connectionTypes.includes(item.type)
                return (
                  <label
                    key={item.type}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition ${
                      isSelected ? 'bg-blue-500/20 border border-blue-500/30' : 'hover:bg-gray-800/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFilters(prev => ({
                            ...prev,
                            connectionTypes: [...prev.connectionTypes, item.type]
                          }))
                        } else {
                          setFilters(prev => ({
                            ...prev,
                            connectionTypes: prev.connectionTypes.filter(t => t !== item.type)
                          }))
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-700 bg-gray-800"
                    />
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-gray-400'}`} />
                    <span className={`text-sm ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                      {item.label}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Other Filters */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-3">Filters</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Min Connections</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={filters.minConnections}
                  onChange={(e) => setFilters(prev => ({ ...prev, minConnections: parseInt(e.target.value) || 1 }))}
                  className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.showIsolated}
                  onChange={(e) => setFilters(prev => ({ ...prev, showIsolated: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-700 bg-gray-800"
                />
                <span className="text-sm text-gray-400">Show isolated nodes</span>
              </label>
            </div>
          </div>

          {/* Selected Seller Info */}
          {selectedSeller && (
            <div className="bg-[#12121a] rounded-xl border border-blue-500/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white">Selected Seller</h3>
                <button
                  onClick={() => setSelectedSeller(null)}
                  className="p-1 hover:bg-gray-800 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-gray-400">Business</div>
                  <div className="text-white font-medium">{selectedSeller.businessName}</div>
                </div>
                <div>
                  <div className="text-gray-400">Seller ID</div>
                  <div className="text-white font-mono text-xs">{selectedSeller.sellerId}</div>
                </div>
                <div>
                  <div className="text-gray-400">Status</div>
                  <div className={`text-sm ${
                    selectedSeller.status === 'BLOCKED' ? 'text-red-400' :
                    selectedSeller.status === 'UNDER_REVIEW' ? 'text-amber-400' :
                    'text-emerald-400'
                  }`}>
                    {selectedSeller.status}
                  </div>
                </div>
                {selectedSeller.email && (
                  <div>
                    <div className="text-gray-400">Email</div>
                    <div className="text-white text-xs">{selectedSeller.email}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-3">Network Stats</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Nodes</span>
                <span className="text-white font-medium">{graphData.nodes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Connections</span>
                <span className="text-white font-medium">{graphData.links.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Clusters</span>
                <span className="text-white font-medium">
                  {new Set(graphData.nodes.map(n => n.group)).size}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Graph Visualization */}
        <div className="col-span-3">
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Network Graph</h3>
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
                    {searchTerm ? `No sellers found matching "${searchTerm}"` : 'No connections found'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {searchTerm ? 'Try a different search term' : 'Try adjusting filters or create sellers with matching attributes'}
                  </div>
                  {searchTerm && (
                    <div className="mt-4 text-xs text-gray-500">
                      <div>Total sellers in database: {sellers.length}</div>
                      <div>Try searching for: SLR-CONN-ALPHA, SLR-EMAIL-1, SLR-IP-1</div>
                    </div>
                  )}
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
              <h3 className="font-semibold text-white mb-3">Connections for {selectedSeller.businessName}</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {graphData.links
                  .filter(link => link.source === selectedSeller.sellerId || link.target === selectedSeller.sellerId)
                  .map((link, i) => {
                    const connectedSellerId = link.source === selectedSeller.sellerId ? link.target : link.source
                    const connectedSeller = sellers.find(s => s.sellerId === connectedSellerId)
                    return (
                      <div key={i} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium text-white">
                            {connectedSeller?.businessName || connectedSellerId}
                          </div>
                          <span className="text-xs text-gray-400">
                            {link.connectionCount} connection{link.connectionCount > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {link.connections.map((conn, j) => {
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

