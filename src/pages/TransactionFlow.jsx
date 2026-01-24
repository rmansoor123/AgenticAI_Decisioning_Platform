import { useState } from 'react'
import {
  Play, Database, Brain, Cog, FlaskConical, CheckCircle, XCircle,
  AlertTriangle, ChevronRight, Clock, Zap, RefreshCw
} from 'lucide-react'

const API_BASE = 'http://localhost:3001/api'

export default function TransactionFlow() {
  const [transaction, setTransaction] = useState({
    amount: 2500,
    sellerId: 'SLR-TEST001',
    buyerId: 'BYR-TEST001',
    country: 'US',
    deviceIsNew: true,
    paymentMethod: 'CREDIT_CARD'
  })

  const [flowState, setFlowState] = useState({
    running: false,
    currentStep: null,
    completedSteps: [],
    results: {}
  })

  const steps = [
    {
      id: 'ingestion',
      layer: 'Data Foundation',
      name: 'Data Ingestion',
      icon: Database,
      color: 'blue',
      description: 'Ingest transaction data, extract features'
    },
    {
      id: 'features',
      layer: 'Data Foundation',
      name: 'Feature Engineering',
      icon: Database,
      color: 'blue',
      description: 'Compute real-time and historical features'
    },
    {
      id: 'ml_inference',
      layer: 'ML Models',
      name: 'ML Inference',
      icon: Brain,
      color: 'purple',
      description: 'Run fraud detection models'
    },
    {
      id: 'rule_evaluation',
      layer: 'Decision Engine',
      name: 'Rule Evaluation',
      icon: Cog,
      color: 'amber',
      description: 'Evaluate against risk rules'
    },
    {
      id: 'decision',
      layer: 'Decision Engine',
      name: 'Final Decision',
      icon: Cog,
      color: 'amber',
      description: 'Aggregate scores and decide'
    },
    {
      id: 'experiment',
      layer: 'Experimentation',
      name: 'Experiment Logging',
      icon: FlaskConical,
      color: 'emerald',
      description: 'Log for A/B analysis'
    }
  ]

  const runFlow = async () => {
    setFlowState({ running: true, currentStep: null, completedSteps: [], results: {} })

    const results = {}

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      setFlowState(prev => ({ ...prev, currentStep: step.id }))

      await new Promise(resolve => setTimeout(resolve, 800))

      // Simulate each step
      if (step.id === 'ingestion') {
        try {
          const res = await fetch(`${API_BASE}/data/ingestion/realtime`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction)
          })
          const data = await res.json()
          results.ingestion = {
            eventId: data.data?.eventId,
            latency: data.data?.latencyMs || 3,
            status: 'success'
          }
        } catch {
          results.ingestion = { latency: 3, status: 'success' }
        }
      }

      if (step.id === 'features') {
        results.features = {
          computed: [
            { name: 'amount_bucket', value: 'high' },
            { name: 'seller_risk_score', value: 65 },
            { name: 'velocity_1h', value: 3 },
            { name: 'device_age_days', value: 0 },
            { name: 'buyer_history_score', value: 0.72 }
          ],
          latency: 5,
          status: 'success'
        }
      }

      if (step.id === 'ml_inference') {
        try {
          const res = await fetch(`${API_BASE}/ml/inference/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              features: {
                amount: transaction.amount,
                isNewDevice: transaction.deviceIsNew,
                riskScore: 65
              }
            })
          })
          const data = await res.json()
          results.ml = {
            fraudScore: data.data?.prediction?.score || 0.73,
            label: data.data?.prediction?.label || 'SUSPICIOUS',
            confidence: data.data?.prediction?.confidence || 0.89,
            latency: data.data?.latencyMs || 12,
            modelId: data.data?.modelId,
            status: 'success'
          }
        } catch {
          results.ml = { fraudScore: 0.73, label: 'SUSPICIOUS', latency: 12, status: 'success' }
        }
      }

      if (step.id === 'rule_evaluation') {
        try {
          const res = await fetch(`${API_BASE}/decisions/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transaction: {
                ...transaction,
                transactionId: `TXN-FLOW-${Date.now()}`,
                riskScore: Math.floor((results.ml?.fraudScore || 0.5) * 100),
                mlScores: { fraudProbability: results.ml?.fraudScore || 0.5 }
              },
              dryRun: true
            })
          })
          const data = await res.json()
          results.rules = {
            rulesEvaluated: data.data?.rulesEvaluated || 50,
            rulesTriggered: data.data?.rulesTriggered || 3,
            triggeredRules: data.data?.ruleResults?.filter(r => r.triggered).slice(0, 5) || [],
            latency: data.data?.latencyMs || 8,
            status: 'success'
          }
        } catch {
          results.rules = { rulesEvaluated: 50, rulesTriggered: 3, latency: 8, status: 'success' }
        }
      }

      if (step.id === 'decision') {
        const fraudScore = results.ml?.fraudScore || 0.5
        results.decision = {
          action: fraudScore > 0.7 ? 'BLOCK' : fraudScore > 0.4 ? 'REVIEW' : 'APPROVE',
          riskScore: Math.floor(fraudScore * 100),
          reasons: [
            results.ml?.fraudScore > 0.5 ? 'High ML fraud score' : null,
            transaction.deviceIsNew ? 'New device detected' : null,
            transaction.amount > 1000 ? 'High value transaction' : null
          ].filter(Boolean),
          latency: 2,
          status: 'success'
        }
      }

      if (step.id === 'experiment') {
        results.experiment = {
          experimentId: 'EXP-FRAUD-001',
          variant: 'treatment',
          logged: true,
          latency: 1,
          status: 'success'
        }
      }

      setFlowState(prev => ({
        ...prev,
        completedSteps: [...prev.completedSteps, step.id],
        results
      }))
    }

    setFlowState(prev => ({ ...prev, running: false, currentStep: null }))
  }

  const getStepStatus = (stepId) => {
    if (flowState.currentStep === stepId) return 'running'
    if (flowState.completedSteps.includes(stepId)) return 'completed'
    return 'pending'
  }

  const colorClasses = {
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-400',
    amber: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
    emerald: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
  }

  const totalLatency = Object.values(flowState.results).reduce((sum, r) => sum + (r?.latency || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Transaction Flow Walkthrough</h1>
          <p className="text-gray-400 mt-1">See how a transaction flows through all 4 layers</p>
        </div>
        <button
          onClick={runFlow}
          disabled={flowState.running}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 rounded-lg font-medium transition-colors"
        >
          {flowState.running ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Flow
            </>
          )}
        </button>
      </div>

      {/* Transaction Input */}
      <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
        <h3 className="font-semibold text-white mb-4">Sample Transaction</h3>
        <div className="grid grid-cols-6 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Amount</label>
            <input
              type="number"
              value={transaction.amount}
              onChange={e => setTransaction(prev => ({ ...prev, amount: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Country</label>
            <select
              value={transaction.country}
              onChange={e => setTransaction(prev => ({ ...prev, country: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            >
              <option value="US">US</option>
              <option value="UK">UK</option>
              <option value="NG">NG (High Risk)</option>
              <option value="RO">RO (High Risk)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
            <select
              value={transaction.paymentMethod}
              onChange={e => setTransaction(prev => ({ ...prev, paymentMethod: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            >
              <option value="CREDIT_CARD">Credit Card</option>
              <option value="DEBIT_CARD">Debit Card</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">New Device</label>
            <select
              value={transaction.deviceIsNew ? 'yes' : 'no'}
              onChange={e => setTransaction(prev => ({ ...prev, deviceIsNew: e.target.value === 'yes' }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Seller ID</label>
            <input
              type="text"
              value={transaction.sellerId}
              onChange={e => setTransaction(prev => ({ ...prev, sellerId: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Buyer ID</label>
            <input
              type="text"
              value={transaction.buyerId}
              onChange={e => setTransaction(prev => ({ ...prev, buyerId: e.target.value }))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            />
          </div>
        </div>
      </div>

      {/* Flow Visualization */}
      <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-white">Processing Pipeline</h3>
          {totalLatency > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400">Total latency:</span>
              <span className="text-white font-medium">{totalLatency}ms</span>
            </div>
          )}
        </div>

        <div className="relative">
          {/* Connection line */}
          <div className="absolute top-8 left-0 right-0 h-0.5 bg-gray-800" />

          <div className="grid grid-cols-6 gap-4 relative">
            {steps.map((step, index) => {
              const status = getStepStatus(step.id)
              const result = flowState.results[step.id.replace('_', '').replace('inference', '').replace('evaluation', '')]

              return (
                <div key={step.id} className="flex flex-col items-center">
                  {/* Step Icon */}
                  <div
                    className={`w-16 h-16 rounded-xl flex items-center justify-center border-2 z-10 transition-all duration-300 ${
                      status === 'running'
                        ? 'bg-indigo-500/20 border-indigo-500 animate-pulse'
                        : status === 'completed'
                        ? `${colorClasses[step.color]} border-current`
                        : 'bg-gray-800 border-gray-700'
                    }`}
                  >
                    {status === 'running' ? (
                      <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                    ) : status === 'completed' ? (
                      <CheckCircle className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <step.icon className="w-6 h-6 text-gray-500" />
                    )}
                  </div>

                  {/* Arrow */}
                  {index < steps.length - 1 && (
                    <ChevronRight className="absolute top-6 text-gray-600 w-5 h-5" style={{ left: `${(index + 1) * (100/6) - 2}%` }} />
                  )}

                  {/* Label */}
                  <div className="mt-3 text-center">
                    <div className="text-xs text-gray-500">{step.layer}</div>
                    <div className="text-sm font-medium text-white mt-0.5">{step.name}</div>
                    {result?.latency && (
                      <div className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
                        <Zap className="w-3 h-3" />
                        {result.latency}ms
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Results Grid */}
      {Object.keys(flowState.results).length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {/* Features Result */}
          {flowState.results.features && (
            <div className="bg-[#12121a] rounded-xl border border-blue-500/30 p-4">
              <h4 className="font-semibold text-blue-400 mb-3 flex items-center gap-2">
                <Database className="w-4 h-4" />
                Extracted Features
              </h4>
              <div className="space-y-2">
                {flowState.results.features.computed.map(f => (
                  <div key={f.name} className="flex justify-between text-sm">
                    <span className="text-gray-400">{f.name}</span>
                    <span className="text-white font-mono">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ML Result */}
          {flowState.results.ml && (
            <div className="bg-[#12121a] rounded-xl border border-purple-500/30 p-4">
              <h4 className="font-semibold text-purple-400 mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4" />
                ML Prediction
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Fraud Score</span>
                  <span className="text-white font-mono">{(flowState.results.ml.fraudScore * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      flowState.results.ml.fraudScore > 0.7 ? 'bg-red-500' :
                      flowState.results.ml.fraudScore > 0.4 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${flowState.results.ml.fraudScore * 100}%` }}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Label</span>
                  <span className={`font-medium ${
                    flowState.results.ml.label === 'FRAUD' ? 'text-red-400' :
                    flowState.results.ml.label === 'SUSPICIOUS' ? 'text-amber-400' : 'text-emerald-400'
                  }`}>{flowState.results.ml.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Confidence</span>
                  <span className="text-white">{(flowState.results.ml.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Rules Result */}
          {flowState.results.rules && (
            <div className="bg-[#12121a] rounded-xl border border-amber-500/30 p-4">
              <h4 className="font-semibold text-amber-400 mb-3 flex items-center gap-2">
                <Cog className="w-4 h-4" />
                Rule Evaluation
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Rules Evaluated</span>
                  <span className="text-white">{flowState.results.rules.rulesEvaluated}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Rules Triggered</span>
                  <span className="text-amber-400 font-medium">{flowState.results.rules.rulesTriggered}</span>
                </div>
                {flowState.results.rules.triggeredRules?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-gray-500">Triggered Rules:</div>
                    {flowState.results.rules.triggeredRules.slice(0, 3).map((r, i) => (
                      <div key={i} className="text-xs text-gray-400 pl-2 border-l border-amber-500/30">
                        {r.ruleName || r.ruleId}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Final Decision */}
      {flowState.results.decision && (
        <div className={`rounded-xl border-2 p-6 ${
          flowState.results.decision.action === 'BLOCK' ? 'bg-red-500/10 border-red-500/50' :
          flowState.results.decision.action === 'REVIEW' ? 'bg-amber-500/10 border-amber-500/50' :
          'bg-emerald-500/10 border-emerald-500/50'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {flowState.results.decision.action === 'BLOCK' ? (
                <XCircle className="w-12 h-12 text-red-400" />
              ) : flowState.results.decision.action === 'REVIEW' ? (
                <AlertTriangle className="w-12 h-12 text-amber-400" />
              ) : (
                <CheckCircle className="w-12 h-12 text-emerald-400" />
              )}
              <div>
                <div className="text-2xl font-bold text-white">{flowState.results.decision.action}</div>
                <div className="text-gray-400">Final Decision</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-white">{flowState.results.decision.riskScore}</div>
              <div className="text-gray-400">Risk Score</div>
            </div>
          </div>

          {flowState.results.decision.reasons.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="text-sm text-gray-400 mb-2">Decision Reasons:</div>
              <div className="flex flex-wrap gap-2">
                {flowState.results.decision.reasons.map((reason, i) => (
                  <span key={i} className="px-3 py-1 bg-black/30 rounded-full text-sm text-gray-300">
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
