import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  FlaskConical, Play, Pause, Plus, TrendingUp, TrendingDown,
  CheckCircle, Clock, Users, BarChart3, Target, Percent,
  ChevronRight, AlertTriangle, Sliders
} from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const API_BASE = '/api'

export default function Experimentation() {
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('ab')
  const [experiments, setExperiments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (location.pathname.includes('/ab')) setActiveTab('ab')
    else if (location.pathname.includes('/simulation')) setActiveTab('simulation')
  }, [location])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/experiments/experiments`)
        const data = await res.json()
        if (data.success) setExperiments(data.data || [])
      } catch (error) {
        console.error('Error:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const tabs = [
    { id: 'ab', name: 'A/B Tests', icon: FlaskConical, href: '/experiments/ab' },
    { id: 'simulation', name: 'Simulation', icon: Sliders, href: '/experiments/simulation' }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl">
              <FlaskConical className="w-6 h-6 text-white" />
            </div>
            Experimentation
          </h1>
          <p className="text-gray-400 mt-1">A/B testing and rule simulation engine</p>
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
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.name}
          </Link>
        ))}
      </div>

      {activeTab === 'ab' && <ABTesting experiments={experiments} />}
      {activeTab === 'simulation' && <Simulation />}
    </div>
  )
}

function ABTesting({ experiments }) {
  const [selectedExperiment, setSelectedExperiment] = useState(null)

  const experimentData = Array.from({ length: 14 }, (_, i) => ({
    day: `Day ${i + 1}`,
    control: 97 + Math.random() * 2,
    treatment: 97.5 + Math.random() * 2.5
  }))

  const defaultExperiments = [
    {
      experimentId: 'EXP-001',
      name: 'New Fraud Model v4',
      type: 'CHAMPION_CHALLENGER',
      status: 'RUNNING',
      trafficAllocation: 20,
      startDate: '2024-01-10',
      metrics: { catchRate: { control: 97.2, treatment: 98.5 }, fpRate: { control: 0.32, treatment: 0.28 } }
    },
    {
      experimentId: 'EXP-002',
      name: 'Threshold Optimization',
      type: 'A/B_TEST',
      status: 'RUNNING',
      trafficAllocation: 15,
      startDate: '2024-01-12',
      metrics: { catchRate: { control: 97.2, treatment: 97.8 }, fpRate: { control: 0.32, treatment: 0.35 } }
    },
    {
      experimentId: 'EXP-003',
      name: 'Velocity Rule Enhancement',
      type: 'SHADOW_MODE',
      status: 'RUNNING',
      trafficAllocation: 100,
      startDate: '2024-01-08',
      metrics: { catchRate: { control: 97.2, treatment: 98.1 }, fpRate: { control: 0.32, treatment: 0.30 } }
    },
    {
      experimentId: 'EXP-004',
      name: 'Device Trust Model',
      type: 'A/B_TEST',
      status: 'COMPLETED',
      trafficAllocation: 25,
      startDate: '2024-01-01',
      metrics: { catchRate: { control: 96.5, treatment: 97.8 }, fpRate: { control: 0.35, treatment: 0.29 } }
    }
  ]

  const displayExperiments = experiments.length > 0 ? experiments : defaultExperiments

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Experiments', value: displayExperiments.filter(e => e.status === 'RUNNING').length, icon: FlaskConical, color: 'emerald' },
          { label: 'Traffic Allocated', value: '35%', icon: Users, color: 'blue' },
          { label: 'Avg Lift', value: '+1.3%', icon: TrendingUp, color: 'purple' },
          { label: 'Completed', value: displayExperiments.filter(e => e.status === 'COMPLETED').length, icon: CheckCircle, color: 'amber' }
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

      <div className="grid grid-cols-3 gap-6">
        {/* Experiment List */}
        <div className="col-span-2 bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <h3 className="font-semibold text-white">Experiments</h3>
            <button className="px-3 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 flex items-center gap-1">
              <Plus className="w-3 h-3" />
              New Experiment
            </button>
          </div>
          <div className="divide-y divide-gray-800">
            {displayExperiments.map(exp => (
              <div
                key={exp.experimentId}
                className={`px-4 py-4 hover:bg-gray-800/30 cursor-pointer transition-colors ${
                  selectedExperiment?.experimentId === exp.experimentId ? 'bg-gray-800/50' : ''
                }`}
                onClick={() => setSelectedExperiment(exp)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-white">{exp.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      exp.status === 'RUNNING' ? 'bg-emerald-500/20 text-emerald-400' :
                      exp.status === 'COMPLETED' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>{exp.status}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-gray-400">Type: <span className="text-gray-300">{exp.type?.replace(/_/g, ' ')}</span></span>
                  <span className="text-gray-400">Traffic: <span className="text-emerald-400">{exp.trafficAllocation}%</span></span>
                  <span className="text-gray-400">Started: <span className="text-gray-300">{exp.startDate}</span></span>
                </div>
                {exp.metrics && (
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Catch Rate:</span>
                      <span className="text-xs text-gray-400">{exp.metrics.catchRate.control}%</span>
                      <span className="text-xs text-gray-500">vs</span>
                      <span className={`text-xs ${exp.metrics.catchRate.treatment > exp.metrics.catchRate.control ? 'text-emerald-400' : 'text-red-400'}`}>
                        {exp.metrics.catchRate.treatment}%
                      </span>
                      {exp.metrics.catchRate.treatment > exp.metrics.catchRate.control && (
                        <TrendingUp className="w-3 h-3 text-emerald-400" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Experiment Details */}
        <div className="space-y-4">
          {selectedExperiment ? (
            <>
              <div className="bg-[#12121a] rounded-xl border border-emerald-500/30 p-4">
                <h3 className="font-semibold text-white mb-3">{selectedExperiment.name}</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Type</span>
                    <span className="text-white">{selectedExperiment.type?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Traffic</span>
                    <span className="text-emerald-400">{selectedExperiment.trafficAllocation}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status</span>
                    <span className={selectedExperiment.status === 'RUNNING' ? 'text-emerald-400' : 'text-blue-400'}>
                      {selectedExperiment.status}
                    </span>
                  </div>
                </div>
              </div>

              {selectedExperiment.metrics && (
                <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
                  <h4 className="font-medium text-white mb-3">Results</h4>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400">Fraud Catch Rate</span>
                        <span className={`${
                          selectedExperiment.metrics.catchRate.treatment > selectedExperiment.metrics.catchRate.control
                            ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {selectedExperiment.metrics.catchRate.treatment > selectedExperiment.metrics.catchRate.control ? '+' : ''}
                          {(selectedExperiment.metrics.catchRate.treatment - selectedExperiment.metrics.catchRate.control).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div className="bg-gray-500 h-full rounded-full" style={{ width: `${selectedExperiment.metrics.catchRate.control}%` }} />
                        </div>
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${selectedExperiment.metrics.catchRate.treatment}%` }} />
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>Control: {selectedExperiment.metrics.catchRate.control}%</span>
                        <span>Treatment: {selectedExperiment.metrics.catchRate.treatment}%</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400">False Positive Rate</span>
                        <span className={`${
                          selectedExperiment.metrics.fpRate.treatment < selectedExperiment.metrics.fpRate.control
                            ? 'text-emerald-400' : 'text-red-400'
                        }`}>
                          {selectedExperiment.metrics.fpRate.treatment < selectedExperiment.metrics.fpRate.control ? '' : '+'}
                          {(selectedExperiment.metrics.fpRate.treatment - selectedExperiment.metrics.fpRate.control).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div className="bg-amber-500 h-full rounded-full" style={{ width: `${selectedExperiment.metrics.fpRate.control * 100}%` }} />
                        </div>
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${selectedExperiment.metrics.fpRate.treatment * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {selectedExperiment.status === 'RUNNING' ? (
                  <>
                    <button className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Graduate
                    </button>
                    <button className="flex-1 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg font-medium flex items-center justify-center gap-2">
                      <Pause className="w-4 h-4" />
                      Stop
                    </button>
                  </>
                ) : (
                  <button className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium flex items-center justify-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    View Report
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-8 text-center">
              <FlaskConical className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Select an experiment to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Experiment Performance Chart */}
      <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
        <h3 className="font-semibold text-white mb-4">Fraud Catch Rate Over Time</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={experimentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="day" stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis domain={[96, 101]} stroke="#6b7280" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #374151', borderRadius: '8px' }} />
              <Legend />
              <Line type="monotone" dataKey="control" stroke="#6b7280" name="Control" dot={false} />
              <Line type="monotone" dataKey="treatment" stroke="#10b981" name="Treatment" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function Simulation() {
  const [simConfig, setSimConfig] = useState({
    ruleId: '',
    thresholdChange: 0,
    dateRange: '7d'
  })
  const [simResult, setSimResult] = useState(null)
  const [running, setRunning] = useState(false)

  const runSimulation = async () => {
    setRunning(true)
    await new Promise(resolve => setTimeout(resolve, 2000))

    setSimResult({
      transactionsAnalyzed: 125000,
      currentMetrics: { blocked: 3850, reviewed: 5200, approved: 115950, catchRate: 97.2, fpRate: 0.32 },
      simulatedMetrics: { blocked: 4120, reviewed: 4800, approved: 116080, catchRate: 97.8, fpRate: 0.35 },
      impact: {
        additionalFraudCaught: 75,
        additionalFalsePositives: 38,
        revenueProtected: 125000,
        customerFriction: '+2.1%'
      }
    })
    setRunning(false)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        {/* Simulation Config */}
        <div className="col-span-2 space-y-4">
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h3 className="font-semibold text-white mb-4">Simulation Configuration</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Select Rule to Simulate</label>
                <select
                  value={simConfig.ruleId}
                  onChange={e => setSimConfig(prev => ({ ...prev, ruleId: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                >
                  <option value="">Select a rule...</option>
                  <option value="high-amount">High Amount Transaction</option>
                  <option value="new-device">New Device High Risk</option>
                  <option value="velocity">Velocity Check 1h</option>
                  <option value="geo-mismatch">Geo Mismatch</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Date Range</label>
                <select
                  value={simConfig.dateRange}
                  onChange={e => setSimConfig(prev => ({ ...prev, dateRange: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                >
                  <option value="1d">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm text-gray-400 mb-2">
                Threshold Adjustment: <span className="text-emerald-400">{simConfig.thresholdChange > 0 ? '+' : ''}{simConfig.thresholdChange}%</span>
              </label>
              <input
                type="range"
                min="-50"
                max="50"
                value={simConfig.thresholdChange}
                onChange={e => setSimConfig(prev => ({ ...prev, thresholdChange: parseInt(e.target.value) }))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>More Lenient (-50%)</span>
                <span>Current (0)</span>
                <span>More Strict (+50%)</span>
              </div>
            </div>

            <button
              onClick={runSimulation}
              disabled={running || !simConfig.ruleId}
              className="mt-4 w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 rounded-lg font-medium flex items-center justify-center gap-2"
            >
              {running ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Running Simulation...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run Simulation
                </>
              )}
            </button>
          </div>

          {/* Results */}
          {simResult && (
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Simulation Results</h3>
                <span className="text-sm text-gray-400">{simResult.transactionsAnalyzed.toLocaleString()} transactions analyzed</span>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Current vs Simulated */}
                <div>
                  <h4 className="text-sm text-gray-400 mb-3">Metrics Comparison</h4>
                  <div className="space-y-3">
                    {[
                      { label: 'Blocked', current: simResult.currentMetrics.blocked, simulated: simResult.simulatedMetrics.blocked },
                      { label: 'Reviewed', current: simResult.currentMetrics.reviewed, simulated: simResult.simulatedMetrics.reviewed },
                      { label: 'Catch Rate', current: `${simResult.currentMetrics.catchRate}%`, simulated: `${simResult.simulatedMetrics.catchRate}%` },
                      { label: 'FP Rate', current: `${simResult.currentMetrics.fpRate}%`, simulated: `${simResult.simulatedMetrics.fpRate}%` }
                    ].map(m => (
                      <div key={m.label} className="flex items-center gap-4">
                        <span className="w-24 text-sm text-gray-400">{m.label}</span>
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-sm text-gray-500">{m.current}</span>
                          <ChevronRight className="w-4 h-4 text-gray-600" />
                          <span className="text-sm text-white">{m.simulated}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Impact */}
                <div>
                  <h4 className="text-sm text-gray-400 mb-3">Projected Impact</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                      <div className="text-lg font-bold text-emerald-400">+{simResult.impact.additionalFraudCaught}</div>
                      <div className="text-xs text-gray-400">Additional fraud caught</div>
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                      <div className="text-lg font-bold text-amber-400">+{simResult.impact.additionalFalsePositives}</div>
                      <div className="text-xs text-gray-400">Additional false positives</div>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                      <div className="text-lg font-bold text-blue-400">${(simResult.impact.revenueProtected / 1000).toFixed(0)}K</div>
                      <div className="text-xs text-gray-400">Revenue protected</div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                      <div className="text-lg font-bold text-red-400">{simResult.impact.customerFriction}</div>
                      <div className="text-xs text-gray-400">Customer friction</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-700 flex gap-3">
                <button className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium">
                  Apply Changes
                </button>
                <button className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium">
                  Create A/B Test
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <h4 className="font-medium text-white mb-3">Simulation Types</h4>
            <div className="space-y-3">
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <div className="font-medium text-white text-sm">Threshold Testing</div>
                <div className="text-xs text-gray-400 mt-1">Adjust rule thresholds and see impact</div>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <div className="font-medium text-white text-sm">Shadow Mode</div>
                <div className="text-xs text-gray-400 mt-1">Run new rules without affecting decisions</div>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <div className="font-medium text-white text-sm">What-If Analysis</div>
                <div className="text-xs text-gray-400 mt-1">Test multiple rule combinations</div>
              </div>
            </div>
          </div>

          <div className="bg-[#12121a] rounded-xl border border-amber-500/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="font-medium text-white text-sm">Best Practices</span>
            </div>
            <ul className="text-xs text-gray-400 space-y-2">
              <li>- Always test on historical data first</li>
              <li>- Consider seasonal variations</li>
              <li>- Monitor false positive impact</li>
              <li>- Run A/B test before full rollout</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
