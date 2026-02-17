import { useState, useEffect } from 'react'
import {
  UserPlus, ShoppingCart, CreditCard, Package, Truck, AlertTriangle,
  Shield, TrendingUp, TrendingDown, Activity, Clock, CheckCircle,
  XCircle, Eye, Filter, Search, Calendar
} from 'lucide-react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

const API_BASE = '/api'

export default function SellerRiskLifecycle() {
  const [selectedStage, setSelectedStage] = useState('onboarding')
  const [sellers, setSellers] = useState([])
  const [riskMetrics, setRiskMetrics] = useState(null)

  useEffect(() => {
    fetchSellers()
    fetchRiskMetrics()
  }, [])

  const fetchSellers = async () => {
    try {
      const res = await fetch(`${API_BASE}/onboarding/sellers?limit=100`)
      const data = await res.json()
      if (data.success) {
        setSellers(data.data || [])
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const fetchRiskMetrics = async () => {
    // Simulated risk metrics across lifecycle
    setRiskMetrics({
      onboarding: { total: 1250, highRisk: 45, mediumRisk: 180, lowRisk: 1025 },
      active: { total: 8500, highRisk: 120, mediumRisk: 450, lowRisk: 7930 },
      transactions: { total: 125000, flagged: 1250, blocked: 320, approved: 123430 },
      payouts: { total: 8500, held: 125, released: 8375 },
      listings: { total: 45000, flagged: 890, removed: 45, active: 44065 }
    })
  }

  const lifecycleStages = [
    {
      id: 'onboarding',
      name: 'Onboarding',
      icon: UserPlus,
      color: 'blue',
      description: 'Initial seller registration and KYC verification',
      risks: [
        { name: 'Identity Fraud', severity: 'HIGH', description: 'Fake or stolen identity documents', impact: 'Account takeover, chargebacks' },
        { name: 'Business Legitimacy', severity: 'MEDIUM', description: 'Unregistered or shell companies', impact: 'Regulatory violations, fraud' },
        { name: 'High-Risk Geography', severity: 'MEDIUM', description: 'Sellers from high-fraud countries', impact: 'Increased fraud rates' },
        { name: 'Duplicate Accounts', severity: 'HIGH', description: 'Multiple accounts by same entity', impact: 'Policy violations, fraud' },
        { name: 'Disposable Email', severity: 'MEDIUM', description: 'Temporary email addresses', impact: 'Account abandonment, fraud' }
      ],
      metrics: riskMetrics?.onboarding
    },
    {
      id: 'active',
      name: 'Active Selling',
      icon: ShoppingCart,
      color: 'emerald',
      description: 'Ongoing seller activity and transaction monitoring',
      risks: [
        { name: 'Transaction Velocity', severity: 'HIGH', description: 'Unusual transaction patterns', impact: 'Fraud, money laundering' },
        { name: 'Price Anomalies', severity: 'MEDIUM', description: 'Suspicious pricing patterns', impact: 'Market manipulation, fraud' },
        { name: 'Account Takeover', severity: 'CRITICAL', description: 'Unauthorized account access', impact: 'Financial loss, data breach' },
        { name: 'Device Changes', severity: 'MEDIUM', description: 'Frequent device/IP changes', impact: 'Account compromise' },
        { name: 'Behavioral Anomalies', severity: 'MEDIUM', description: 'Unusual seller behavior', impact: 'Fraud indicators' }
      ],
      metrics: riskMetrics?.active
    },
    {
      id: 'transactions',
      name: 'Transaction Processing',
      icon: CreditCard,
      color: 'purple',
      description: 'Payment processing and fraud detection',
      risks: [
        { name: 'Payment Fraud', severity: 'CRITICAL', description: 'Stolen cards, chargebacks', impact: 'Financial loss, disputes' },
        { name: 'Refund Abuse', severity: 'HIGH', description: 'Excessive refunds or returns', impact: 'Revenue loss, fraud' },
        { name: 'Chargeback Risk', severity: 'HIGH', description: 'High chargeback rates', impact: 'Financial penalties, account closure' },
        { name: 'Payment Method Changes', severity: 'MEDIUM', description: 'Frequent payment method updates', impact: 'Account compromise' },
        { name: 'Cross-Border Fraud', severity: 'MEDIUM', description: 'International fraud patterns', impact: 'Regulatory issues' }
      ],
      metrics: riskMetrics?.transactions
    },
    {
      id: 'payouts',
      name: 'Payout Management',
      icon: Package,
      color: 'amber',
      description: 'Seller payout processing and risk assessment',
      risks: [
        { name: 'Payout Velocity', severity: 'HIGH', description: 'Unusual payout patterns', impact: 'Money laundering, fraud' },
        { name: 'Bank Account Changes', severity: 'HIGH', description: 'Frequent bank account updates', impact: 'Account takeover, fraud' },
        { name: 'Payout Hold Triggers', severity: 'MEDIUM', description: 'Risk-based payout holds', impact: 'Cash flow issues' },
        { name: 'Reserve Requirements', severity: 'MEDIUM', description: 'Insufficient reserves', impact: 'Chargeback exposure' },
        { name: 'Tax Compliance', severity: 'LOW', description: 'Tax reporting issues', impact: 'Regulatory compliance' }
      ],
      metrics: riskMetrics?.payouts
    },
    {
      id: 'listings',
      name: 'Product Listings',
      icon: Package,
      color: 'indigo',
      description: 'Product listing fraud and policy compliance',
      risks: [
        { name: 'Counterfeit Products', severity: 'CRITICAL', description: 'Fake or unauthorized products', impact: 'Legal liability, brand damage' },
        { name: 'Prohibited Items', severity: 'HIGH', description: 'Items violating platform policies', impact: 'Regulatory violations' },
        { name: 'Misleading Descriptions', severity: 'MEDIUM', description: 'Inaccurate product information', impact: 'Customer disputes, returns' },
        { name: 'Price Manipulation', severity: 'MEDIUM', description: 'Suspicious pricing strategies', impact: 'Market manipulation' },
        { name: 'Listing Velocity', severity: 'LOW', description: 'Unusual listing patterns', impact: 'Policy violations' }
      ],
      metrics: riskMetrics?.listings
    },
    {
      id: 'shipping',
      name: 'Shipping & Fulfillment',
      icon: Truck,
      color: 'cyan',
      description: 'Shipping fraud and address verification',
      risks: [
        { name: 'Address Fraud', severity: 'HIGH', description: 'Invalid or high-risk addresses', impact: 'Delivery failures, fraud' },
        { name: 'Reshipping Schemes', severity: 'HIGH', description: 'Reshipping to fraudsters', impact: 'Chargeback fraud' },
        { name: 'Carrier Fraud', severity: 'MEDIUM', description: 'Fake tracking numbers', impact: 'Customer disputes' },
        { name: 'Delivery Anomalies', severity: 'MEDIUM', description: 'Unusual delivery patterns', impact: 'Fraud indicators' },
        { name: 'International Shipping Risk', severity: 'LOW', description: 'High-risk shipping destinations', impact: 'Regulatory issues' }
      ],
      metrics: null
    }
  ]

  const selectedStageData = lifecycleStages.find(s => s.id === selectedStage)

  // Risk trend data
  const riskTrendData = [
    { month: 'Jan', onboarding: 45, active: 120, transactions: 1250 },
    { month: 'Feb', onboarding: 52, active: 135, transactions: 1380 },
    { month: 'Mar', onboarding: 48, active: 128, transactions: 1320 },
    { month: 'Apr', onboarding: 55, active: 142, transactions: 1450 },
    { month: 'May', onboarding: 50, active: 138, transactions: 1400 },
    { month: 'Jun', onboarding: 58, active: 150, transactions: 1520 }
  ]

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'CRITICAL': return 'red'
      case 'HIGH': return 'orange'
      case 'MEDIUM': return 'amber'
      case 'LOW': return 'yellow'
      default: return 'gray'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
            <Shield className="w-6 h-6 text-white" />
          </div>
          Seller Risk Lifecycle
        </h1>
        <p className="text-gray-400 mt-1">Comprehensive risk analysis across seller lifecycle stages</p>
      </div>

      {/* Lifecycle Stages */}
      <div className="grid grid-cols-6 gap-3">
        {lifecycleStages.map(stage => {
          const StageIcon = stage.icon
          const isSelected = selectedStage === stage.id
          return (
            <button
              key={stage.id}
              onClick={() => setSelectedStage(stage.id)}
              className={`p-4 rounded-xl border transition-all ${
                isSelected
                  ? `border-${stage.color}-500/50 bg-${stage.color}-500/10 ring-2 ring-${stage.color}-500/20`
                  : 'border-gray-800 bg-[#12121a] hover:border-gray-700'
              }`}
            >
              <div className={`p-2 rounded-lg bg-${stage.color}-500/20 mb-3 inline-block`}>
                <StageIcon className={`w-5 h-5 text-${stage.color}-400`} />
              </div>
              <div className="text-sm font-medium text-white">{stage.name}</div>
              {stage.metrics && (
                <div className="text-xs text-gray-400 mt-1">
                  {stage.metrics.highRisk || 0} high risk
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected Stage Details */}
      {selectedStageData && (
        <div className="grid grid-cols-3 gap-6">
          {/* Risks */}
          <div className="col-span-2 space-y-4">
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className={`w-5 h-5 text-${selectedStageData.color}-400`} />
                  Risk Factors - {selectedStageData.name}
                </h3>
                <span className="text-xs text-gray-400">{selectedStageData.description}</span>
              </div>

              <div className="space-y-3">
                {selectedStageData.risks.map((risk, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-lg border bg-${getSeverityColor(risk.severity)}-500/10 border-${getSeverityColor(risk.severity)}-500/30`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-white">{risk.name}</div>
                      <span className={`text-xs px-2 py-1 rounded bg-${getSeverityColor(risk.severity)}-500/20 text-${getSeverityColor(risk.severity)}-400`}>
                        {risk.severity}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400 mb-2">{risk.description}</div>
                    <div className="text-xs text-gray-500">
                      <span className="text-gray-400">Impact: </span>
                      {risk.impact}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Trends */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4">Risk Trends (6 Months)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={riskTrendData}>
                    <defs>
                      <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="month" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                    <YAxis stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #374151', borderRadius: '8px' }} />
                    <Area
                      type="monotone"
                      dataKey={selectedStage === 'onboarding' ? 'onboarding' : selectedStage === 'active' ? 'active' : 'transactions'}
                      stroke="#ef4444"
                      fill="url(#colorRisk)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Metrics & Stats */}
          <div className="space-y-4">
            {selectedStageData.metrics && (
              <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
                <h3 className="font-semibold text-white mb-4">Current Metrics</h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Total</div>
                    <div className="text-2xl font-bold text-white">
                      {selectedStageData.metrics.total?.toLocaleString()}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 bg-red-500/10 border border-red-500/30 rounded">
                      <div className="text-xs text-red-400">High</div>
                      <div className="text-sm font-bold text-white">
                        {selectedStageData.metrics.highRisk}
                      </div>
                    </div>
                    <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded">
                      <div className="text-xs text-amber-400">Medium</div>
                      <div className="text-sm font-bold text-white">
                        {selectedStageData.metrics.mediumRisk}
                      </div>
                    </div>
                    <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded">
                      <div className="text-xs text-emerald-400">Low</div>
                      <div className="text-sm font-bold text-white">
                        {selectedStageData.metrics.lowRisk}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AI Agent Coverage */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4">AI Agent Coverage</h3>
              <div className="space-y-3">
                {[
                  { agent: 'Onboarding Agent', coverage: selectedStage === 'onboarding' ? '100%' : '0%' },
                  { agent: 'Fraud Investigation Agent', coverage: ['active', 'transactions'].includes(selectedStage) ? '85%' : '0%' },
                  { agent: 'Rule Optimization Agent', coverage: ['transactions', 'payouts'].includes(selectedStage) ? '70%' : '0%' },
                  { agent: 'Alert Triage Agent', coverage: ['active', 'transactions'].includes(selectedStage) ? '90%' : '0%' }
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{item.agent}</span>
                    <span className={`text-sm font-medium ${
                      parseFloat(item.coverage) > 50 ? 'text-emerald-400' : 'text-gray-400'
                    }`}>
                      {item.coverage}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Score Distribution */}
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4">Risk Distribution</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'Low', value: selectedStageData.metrics?.lowRisk || 0 },
                    { name: 'Medium', value: selectedStageData.metrics?.mediumRisk || 0 },
                    { name: 'High', value: selectedStageData.metrics?.highRisk || 0 }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="name" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                    <YAxis stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #374151', borderRadius: '8px' }} />
                    <Bar dataKey="value" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

