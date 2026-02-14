import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Cog, Play, Pause, Plus, Edit, Trash2, Copy, CheckCircle,
  XCircle, AlertTriangle, Clock, Zap, Filter, Search,
  ChevronRight, ChevronDown, Code, Database, Brain
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const API_BASE = 'http://localhost:3005/api'

export default function DecisionEngine() {
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('rules')
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRule, setExpandedRule] = useState(null)

  useEffect(() => {
    if (location.pathname.includes('/rules')) setActiveTab('rules')
    else if (location.pathname.includes('/builder')) setActiveTab('builder')
    else if (location.pathname.includes('/execution')) setActiveTab('execution')
  }, [location])

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const res = await fetch(`${API_BASE}/rules`)
        const data = await res.json()
        if (data.success) setRules(data.data || [])
      } catch (error) {
        console.error('Error:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchRules()
  }, [])

  const tabs = [
    { id: 'rules', name: 'Rules', icon: Cog, href: '/decisions/rules' },
    { id: 'builder', name: 'Rule Builder', icon: Code, href: '/decisions/builder' },
    { id: 'execution', name: 'Execution', icon: Play, href: '/decisions/execution' }
  ]

  const rulePerformanceData = [
    { name: 'High Amount', triggered: 1250, blocked: 890 },
    { name: 'New Device', triggered: 2100, blocked: 1450 },
    { name: 'Velocity', triggered: 890, blocked: 620 },
    { name: 'Geo Mismatch', triggered: 450, blocked: 380 },
    { name: 'ATO Risk', triggered: 320, blocked: 280 }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl">
              <Cog className="w-6 h-6 text-white" />
            </div>
            Decision Engine
          </h1>
          <p className="text-gray-400 mt-1">Rules management and real-time decision execution</p>
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
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.name}
          </Link>
        ))}
      </div>

      {activeTab === 'rules' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Rules', value: rules.length || 50, icon: Cog, color: 'amber' },
              { label: 'Active Rules', value: rules.filter(r => r.status === 'ACTIVE').length || 42, icon: CheckCircle, color: 'emerald' },
              { label: 'Avg Trigger Rate', value: '4.2%', icon: Zap, color: 'blue' },
              { label: 'Avg Latency', value: '8ms', icon: Clock, color: 'purple' }
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

          {/* Rule Performance Chart */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-4">Top Rules by Trigger Count (24h)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rulePerformanceData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis type="number" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #374151', borderRadius: '8px' }} />
                  <Bar dataKey="triggered" fill="#f59e0b" name="Triggered" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="blocked" fill="#ef4444" name="Blocked" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Rules List */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="font-semibold text-white">All Rules</h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search rules..."
                    className="pl-9 pr-4 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <Link
                to="/decisions/builder"
                className="px-3 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Create Rule
              </Link>
            </div>
            <div className="divide-y divide-gray-800">
              {(rules.length > 0 ? rules : [
                { ruleId: 'RULE-001', name: 'High Amount Transaction', type: 'THRESHOLD', status: 'ACTIVE', action: 'REVIEW', triggerRate: 5.2, description: 'Flag transactions over $5000' },
                { ruleId: 'RULE-002', name: 'New Device High Risk', type: 'ML_THRESHOLD', status: 'ACTIVE', action: 'BLOCK', triggerRate: 3.8, description: 'Block new devices with high ML score' },
                { ruleId: 'RULE-003', name: 'Velocity Check 1h', type: 'VELOCITY', status: 'ACTIVE', action: 'REVIEW', triggerRate: 2.1, description: 'Review if >5 transactions in 1 hour' },
                { ruleId: 'RULE-004', name: 'Geo Mismatch', type: 'ATTRIBUTE', status: 'ACTIVE', action: 'BLOCK', triggerRate: 1.5, description: 'Block if IP country != billing country' },
                { ruleId: 'RULE-005', name: 'ATO Risk Score', type: 'ML_THRESHOLD', status: 'INACTIVE', action: 'BLOCK', triggerRate: 0, description: 'Block if ATO model score > 0.8' }
              ]).slice(0, 10).map(rule => (
                <div key={rule.ruleId} className="hover:bg-gray-800/30">
                  <div
                    className="px-4 py-3 flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedRule(expandedRule === rule.ruleId ? null : rule.ruleId)}
                  >
                    <div className="flex items-center gap-4">
                      <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedRule === rule.ruleId ? 'rotate-90' : ''}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{rule.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            rule.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
                          }`}>{rule.status}</span>
                        </div>
                        <div className="text-sm text-gray-400 mt-0.5">{rule.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-sm text-gray-400">Trigger Rate</div>
                        <div className="text-white font-medium">{rule.triggerRate}%</div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        rule.action === 'BLOCK' ? 'bg-red-500/20 text-red-400' :
                        rule.action === 'REVIEW' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>{rule.action}</span>
                      <div className="flex gap-1">
                        <button className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {expandedRule === rule.ruleId && (
                    <div className="px-4 pb-4 pl-12">
                      <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Rule ID</span>
                            <div className="text-white font-mono">{rule.ruleId}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Type</span>
                            <div className="text-white">{rule.type}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Priority</span>
                            <div className="text-white">{rule.priority || 50}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Created</span>
                            <div className="text-white">2 weeks ago</div>
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-500 text-sm">Condition</span>
                          <code className="block mt-1 p-2 bg-[#0d0d14] rounded text-sm text-amber-400 font-mono">
                            {rule.condition || 'amount > 5000 AND risk_score > 70'}
                          </code>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'builder' && (
        <RuleBuilder />
      )}

      {activeTab === 'execution' && (
        <div className="space-y-6">
          {/* Execution Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Decisions/sec', value: '2,450', color: 'amber' },
              { label: 'Avg Latency', value: '12ms', color: 'blue' },
              { label: 'Approved', value: '94.2%', color: 'emerald' },
              { label: 'Blocked', value: '3.1%', color: 'red' }
            ].map(stat => (
              <div key={stat.label} className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Recent Decisions */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="font-semibold text-white">Recent Decisions</h3>
            </div>
            <table className="w-full">
              <thead className="bg-[#0d0d14]">
                <tr className="text-xs text-gray-500">
                  <th className="px-4 py-3 text-left">Transaction</th>
                  <th className="px-4 py-3 text-left">Risk Score</th>
                  <th className="px-4 py-3 text-left">Rules Triggered</th>
                  <th className="px-4 py-3 text-left">Decision</th>
                  <th className="px-4 py-3 text-left">Latency</th>
                  <th className="px-4 py-3 text-left">Time</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { txn: 'TXN-A1B2C3', risk: 82, rules: 3, decision: 'BLOCK', latency: 8, time: '2s ago' },
                  { txn: 'TXN-D4E5F6', risk: 45, rules: 1, decision: 'REVIEW', latency: 11, time: '5s ago' },
                  { txn: 'TXN-G7H8I9', risk: 12, rules: 0, decision: 'APPROVE', latency: 6, time: '8s ago' },
                  { txn: 'TXN-J0K1L2', risk: 67, rules: 2, decision: 'REVIEW', latency: 14, time: '12s ago' },
                  { txn: 'TXN-M3N4O5', risk: 91, rules: 4, decision: 'BLOCK', latency: 9, time: '15s ago' }
                ].map((d, i) => (
                  <tr key={i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-mono text-sm text-gray-300">{d.txn}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full ${d.risk >= 70 ? 'bg-red-500' : d.risk >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${d.risk}%` }} />
                        </div>
                        <span className="text-sm text-gray-300">{d.risk}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{d.rules}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 w-fit ${
                        d.decision === 'BLOCK' ? 'bg-red-500/20 text-red-400' :
                        d.decision === 'REVIEW' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {d.decision === 'BLOCK' ? <XCircle className="w-3 h-3" /> :
                         d.decision === 'REVIEW' ? <AlertTriangle className="w-3 h-3" /> :
                         <CheckCircle className="w-3 h-3" />}
                        {d.decision}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{d.latency}ms</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{d.time}</td>
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

function RuleBuilder() {
  const [rule, setRule] = useState({
    name: '',
    description: '',
    conditions: [{ field: '', operator: 'gt', value: '', type: 'attribute' }],
    action: 'REVIEW',
    priority: 50
  })
  const [testResult, setTestResult] = useState(null)

  const fields = [
    { value: 'amount', label: 'Transaction Amount', type: 'number' },
    { value: 'risk_score', label: 'Risk Score', type: 'number' },
    { value: 'ml_fraud_score', label: 'ML Fraud Score', type: 'number' },
    { value: 'velocity_1h', label: 'Velocity (1h)', type: 'number' },
    { value: 'velocity_24h', label: 'Velocity (24h)', type: 'number' },
    { value: 'device_age_days', label: 'Device Age (days)', type: 'number' },
    { value: 'is_new_device', label: 'Is New Device', type: 'boolean' },
    { value: 'country', label: 'Country', type: 'string' },
    { value: 'payment_method', label: 'Payment Method', type: 'string' }
  ]

  const operators = [
    { value: 'gt', label: '>' },
    { value: 'gte', label: '>=' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '<=' },
    { value: 'eq', label: '=' },
    { value: 'neq', label: '!=' },
    { value: 'in', label: 'IN' },
    { value: 'not_in', label: 'NOT IN' }
  ]

  const addCondition = () => {
    setRule(prev => ({
      ...prev,
      conditions: [...prev.conditions, { field: '', operator: 'gt', value: '', type: 'attribute' }]
    }))
  }

  const removeCondition = (index) => {
    setRule(prev => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index)
    }))
  }

  const updateCondition = (index, updates) => {
    setRule(prev => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => i === index ? { ...c, ...updates } : c)
    }))
  }

  const testRule = async () => {
    // Simulate rule test
    setTestResult({
      matchingTransactions: Math.floor(Math.random() * 500) + 100,
      estimatedTriggerRate: (Math.random() * 5 + 1).toFixed(2),
      sampleMatches: [
        { txn: 'TXN-TEST001', amount: 5200, risk: 78 },
        { txn: 'TXN-TEST002', amount: 8100, risk: 85 },
        { txn: 'TXN-TEST003', amount: 6500, risk: 72 }
      ]
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        {/* Rule Configuration */}
        <div className="col-span-2 space-y-4">
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-4">Rule Configuration</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Rule Name</label>
                <input
                  type="text"
                  value={rule.name}
                  onChange={e => setRule(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., High Amount New Device"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <textarea
                  value={rule.description}
                  onChange={e => setRule(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this rule does..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-amber-500 focus:outline-none h-20"
                />
              </div>
            </div>
          </div>

          {/* Conditions */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Conditions</h3>
              <span className="text-xs text-gray-400">All conditions must match (AND)</span>
            </div>

            <div className="space-y-3">
              {rule.conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-3">
                  <select
                    value={condition.type}
                    onChange={e => updateCondition(index, { type: e.target.value })}
                    className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                  >
                    <option value="attribute">Attribute</option>
                    <option value="ml_model">ML Model</option>
                    <option value="dataset">Dataset Lookup</option>
                  </select>

                  {condition.type === 'ml_model' ? (
                    <>
                      <select
                        value={condition.field}
                        onChange={e => updateCondition(index, { field: e.target.value })}
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      >
                        <option value="">Select Model...</option>
                        <option value="fraud-detector-v3">Fraud Detector v3</option>
                        <option value="velocity-model-v2">Velocity Model v2</option>
                        <option value="device-trust-v1">Device Trust v1</option>
                      </select>
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-purple-400" />
                        <span className="text-sm text-gray-400">score</span>
                      </div>
                    </>
                  ) : condition.type === 'dataset' ? (
                    <>
                      <select
                        value={condition.field}
                        onChange={e => updateCondition(index, { field: e.target.value })}
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      >
                        <option value="">Select Dataset...</option>
                        <option value="blocklist">Blocklist</option>
                        <option value="high_risk_countries">High Risk Countries</option>
                        <option value="trusted_devices">Trusted Devices</option>
                      </select>
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-gray-400">lookup</span>
                      </div>
                    </>
                  ) : (
                    <select
                      value={condition.field}
                      onChange={e => updateCondition(index, { field: e.target.value })}
                      className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                    >
                      <option value="">Select Field...</option>
                      {fields.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  )}

                  <select
                    value={condition.operator}
                    onChange={e => updateCondition(index, { operator: e.target.value })}
                    className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                  >
                    {operators.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={condition.value}
                    onChange={e => updateCondition(index, { value: e.target.value })}
                    placeholder="Value"
                    className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-amber-500 focus:outline-none"
                  />

                  {rule.conditions.length > 1 && (
                    <button
                      onClick={() => removeCondition(index)}
                      className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              <button
                onClick={addCondition}
                className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300"
              >
                <Plus className="w-4 h-4" />
                Add Condition
              </button>
            </div>
          </div>

          {/* Action */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-4">Action</h3>
            <div className="flex gap-4">
              {['APPROVE', 'REVIEW', 'BLOCK'].map(action => (
                <button
                  key={action}
                  onClick={() => setRule(prev => ({ ...prev, action }))}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    rule.action === action
                      ? action === 'BLOCK' ? 'bg-red-500/20 text-red-400 border border-red-500/50' :
                        action === 'REVIEW' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' :
                        'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                      : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                  }`}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="space-y-4">
          {/* Generated Rule */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-3">Generated Rule</h3>
            <pre className="bg-[#0d0d14] rounded-lg p-3 text-sm font-mono text-amber-400 overflow-x-auto">
{`IF ${rule.conditions.map(c => {
  if (c.type === 'ml_model') return `ML(${c.field}).score ${operators.find(o => o.value === c.operator)?.label || '>'} ${c.value}`
  if (c.type === 'dataset') return `LOOKUP(${c.field}, ${c.field === 'blocklist' ? 'user_id' : 'value'})`
  return `${c.field || 'field'} ${operators.find(o => o.value === c.operator)?.label || '>'} ${c.value || '?'}`
}).join('\n   AND ')}
THEN ${rule.action}`}
            </pre>
          </div>

          {/* Test Rule */}
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-3">Test Rule</h3>
            <button
              onClick={testRule}
              className="w-full py-2 bg-amber-600 hover:bg-amber-700 rounded-lg font-medium flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              Run Against Historical Data
            </button>

            {testResult && (
              <div className="mt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Matching Transactions</span>
                  <span className="text-white font-medium">{testResult.matchingTransactions}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Est. Trigger Rate</span>
                  <span className="text-amber-400 font-medium">{testResult.estimatedTriggerRate}%</span>
                </div>
                <div className="pt-2 border-t border-gray-700">
                  <div className="text-xs text-gray-500 mb-2">Sample Matches</div>
                  {testResult.sampleMatches.map((m, i) => (
                    <div key={i} className="flex justify-between text-xs py-1">
                      <span className="text-gray-400 font-mono">{m.txn}</span>
                      <span className="text-white">${m.amount} / {m.risk}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Save */}
          <button className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl font-semibold flex items-center justify-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Save Rule
          </button>
        </div>
      </div>
    </div>
  )
}
