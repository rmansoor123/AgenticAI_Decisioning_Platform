import { useState, useEffect } from 'react'
import {
  Server, Users, Shield, CreditCard, Package, Truck,
  CheckCircle, AlertTriangle, Clock, Activity, Zap,
  ChevronRight, ExternalLink, RefreshCw
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const API_BASE = 'http://localhost:3001/api'

export default function Services() {
  const [selectedService, setSelectedService] = useState(null)
  const [serviceHealth, setServiceHealth] = useState({})

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`)
        const data = await res.json()
        setServiceHealth(data.services || {})
      } catch (error) {
        console.error('Error:', error)
      }
    }
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  const services = [
    {
      id: 'onboarding',
      name: 'Seller Onboarding',
      icon: Users,
      endpoint: '/api/onboarding',
      color: 'blue',
      description: 'New seller registration and KYC verification',
      metrics: { requests: '1.2K/min', latency: '45ms', errorRate: '0.02%' },
      features: ['KYC Verification', 'Risk Assessment', 'Document Validation', 'Watchlist Check'],
      recentActivity: [
        { action: 'New seller registered', time: '2s ago', status: 'success' },
        { action: 'KYC approved', time: '15s ago', status: 'success' },
        { action: 'Risk assessment completed', time: '32s ago', status: 'warning' }
      ]
    },
    {
      id: 'ato',
      name: 'Account Takeover Prevention',
      icon: Shield,
      endpoint: '/api/ato',
      color: 'red',
      description: 'Detect and prevent account takeover attempts',
      metrics: { requests: '3.5K/min', latency: '12ms', errorRate: '0.01%' },
      features: ['Login Anomaly Detection', 'Device Fingerprinting', 'Session Analysis', 'MFA Triggers'],
      recentActivity: [
        { action: 'Suspicious login blocked', time: '5s ago', status: 'danger' },
        { action: 'Device trust updated', time: '28s ago', status: 'success' },
        { action: 'Session validated', time: '45s ago', status: 'success' }
      ]
    },
    {
      id: 'payout',
      name: 'Seller Payout',
      icon: CreditCard,
      endpoint: '/api/payout',
      color: 'emerald',
      description: 'Manage seller payouts and fraud prevention',
      metrics: { requests: '850/min', latency: '38ms', errorRate: '0.03%' },
      features: ['Payout Risk Scoring', 'Velocity Checks', 'Bank Verification', 'Hold Management'],
      recentActivity: [
        { action: 'Payout approved', time: '8s ago', status: 'success' },
        { action: 'High-risk payout held', time: '1m ago', status: 'warning' },
        { action: 'Bank verified', time: '2m ago', status: 'success' }
      ]
    },
    {
      id: 'listing',
      name: 'Listing Management',
      icon: Package,
      endpoint: '/api/listing',
      color: 'purple',
      description: 'Product listing fraud and policy compliance',
      metrics: { requests: '2.1K/min', latency: '28ms', errorRate: '0.05%' },
      features: ['Content Moderation', 'Price Anomaly', 'Counterfeit Detection', 'Policy Compliance'],
      recentActivity: [
        { action: 'Listing approved', time: '3s ago', status: 'success' },
        { action: 'Suspicious listing flagged', time: '22s ago', status: 'warning' },
        { action: 'Price anomaly detected', time: '55s ago', status: 'danger' }
      ]
    },
    {
      id: 'shipping',
      name: 'Shipping & Fulfillment',
      icon: Truck,
      endpoint: '/api/shipping',
      color: 'amber',
      description: 'Address verification and shipping fraud prevention',
      metrics: { requests: '1.8K/min', latency: '22ms', errorRate: '0.02%' },
      features: ['Address Verification', 'Delivery Risk', 'Carrier Fraud', 'Reshipping Detection'],
      recentActivity: [
        { action: 'Shipment verified', time: '4s ago', status: 'success' },
        { action: 'Address corrected', time: '18s ago', status: 'success' },
        { action: 'Reshipping pattern detected', time: '1m ago', status: 'warning' }
      ]
    }
  ]

  const trafficData = Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    onboarding: Math.floor(Math.random() * 500) + 800,
    ato: Math.floor(Math.random() * 1000) + 3000,
    payout: Math.floor(Math.random() * 300) + 600,
    listing: Math.floor(Math.random() * 800) + 1500,
    shipping: Math.floor(Math.random() * 600) + 1200
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl">
              <Server className="w-6 h-6 text-white" />
            </div>
            Business Services
          </h1>
          <p className="text-gray-400 mt-1">Connected microservices and their health status</p>
        </div>
        <button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center gap-2 text-gray-300">
          <RefreshCw className="w-4 h-4" />
          Refresh Status
        </button>
      </div>

      {/* Service Cards */}
      <div className="grid grid-cols-5 gap-4">
        {services.map(service => {
          const isHealthy = serviceHealth[service.id.replace('onboarding', 'seller-onboarding').replace('ato', 'seller-ato').replace('payout', 'seller-payout').replace('listing', 'seller-listing').replace('shipping', 'seller-shipping')] === 'running'

          return (
            <div
              key={service.id}
              onClick={() => setSelectedService(selectedService?.id === service.id ? null : service)}
              className={`bg-[#12121a] rounded-xl border p-4 cursor-pointer transition-all hover:scale-[1.02] ${
                selectedService?.id === service.id
                  ? `border-${service.color}-500/50 ring-2 ring-${service.color}-500/20`
                  : 'border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg bg-${service.color}-500/20`}>
                  <service.icon className={`w-5 h-5 text-${service.color}-400`} />
                </div>
                <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-400' : 'bg-red-400'}`} />
              </div>
              <div className="font-medium text-white text-sm">{service.name}</div>
              <div className="text-xs text-gray-500 mt-1">{service.metrics.requests}</div>
            </div>
          )
        })}
      </div>

      {/* Service Details */}
      {selectedService && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            {/* Overview */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl bg-${selectedService.color}-500/20`}>
                    <selectedService.icon className={`w-6 h-6 text-${selectedService.color}-400`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{selectedService.name}</h3>
                    <p className="text-sm text-gray-400">{selectedService.description}</p>
                  </div>
                </div>
                <a
                  href={`http://localhost:3001${selectedService.endpoint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300"
                >
                  <code className="text-xs">{selectedService.endpoint}</code>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <Activity className="w-4 h-4" />
                    <span className="text-sm">Requests</span>
                  </div>
                  <div className="text-xl font-bold text-white">{selectedService.metrics.requests}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <Zap className="w-4 h-4" />
                    <span className="text-sm">Latency</span>
                  </div>
                  <div className="text-xl font-bold text-white">{selectedService.metrics.latency}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-400 mb-1">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm">Error Rate</span>
                  </div>
                  <div className="text-xl font-bold text-white">{selectedService.metrics.errorRate}</div>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h4 className="font-medium text-white mb-3">Capabilities</h4>
              <div className="grid grid-cols-2 gap-3">
                {selectedService.features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-gray-300">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Traffic Chart */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h4 className="font-medium text-white mb-4">Request Volume (24h)</h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficData}>
                    <defs>
                      <linearGradient id={`color-${selectedService.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={
                          selectedService.color === 'blue' ? '#3b82f6' :
                          selectedService.color === 'red' ? '#ef4444' :
                          selectedService.color === 'emerald' ? '#10b981' :
                          selectedService.color === 'purple' ? '#a855f7' :
                          '#f59e0b'
                        } stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={
                          selectedService.color === 'blue' ? '#3b82f6' :
                          selectedService.color === 'red' ? '#ef4444' :
                          selectedService.color === 'emerald' ? '#10b981' :
                          selectedService.color === 'purple' ? '#a855f7' :
                          '#f59e0b'
                        } stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="time" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                    <YAxis stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #374151', borderRadius: '8px' }} />
                    <Area
                      type="monotone"
                      dataKey={selectedService.id}
                      stroke={
                        selectedService.color === 'blue' ? '#3b82f6' :
                        selectedService.color === 'red' ? '#ef4444' :
                        selectedService.color === 'emerald' ? '#10b981' :
                        selectedService.color === 'purple' ? '#a855f7' :
                        '#f59e0b'
                      }
                      fill={`url(#color-${selectedService.id})`}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="space-y-4">
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h4 className="font-medium text-white mb-3">Recent Activity</h4>
              <div className="space-y-3">
                {selectedService.recentActivity.map((activity, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      activity.status === 'success' ? 'bg-emerald-400' :
                      activity.status === 'warning' ? 'bg-amber-400' :
                      'bg-red-400'
                    }`} />
                    <div className="flex-1">
                      <div className="text-sm text-gray-300">{activity.action}</div>
                      <div className="text-xs text-gray-500">{activity.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h4 className="font-medium text-white mb-3">API Endpoints</h4>
              <div className="space-y-2">
                {[
                  { method: 'GET', path: '/', desc: 'List all' },
                  { method: 'POST', path: '/', desc: 'Create new' },
                  { method: 'GET', path: '/:id', desc: 'Get by ID' },
                  { method: 'POST', path: '/risk-assessment', desc: 'Run risk check' }
                ].map((endpoint, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                      endpoint.method === 'GET' ? 'bg-blue-500/20 text-blue-400' :
                      endpoint.method === 'POST' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>{endpoint.method}</span>
                    <code className="text-gray-400 text-xs">{selectedService.endpoint}{endpoint.path}</code>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <h4 className="font-medium text-white mb-3">Dependencies</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Data Platform</span>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">ML Inference</span>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Decision Engine</span>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Services Traffic */}
      {!selectedService && (
        <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
          <h3 className="font-semibold text-white mb-4">All Services Traffic (24h)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <YAxis stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #374151', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="onboarding" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Onboarding" />
                <Area type="monotone" dataKey="ato" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="ATO" />
                <Area type="monotone" dataKey="payout" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Payout" />
                <Area type="monotone" dataKey="listing" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.3} name="Listing" />
                <Area type="monotone" dataKey="shipping" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} name="Shipping" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
