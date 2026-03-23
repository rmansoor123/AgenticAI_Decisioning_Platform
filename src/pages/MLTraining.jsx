import { useState, useEffect } from 'react'

const API_BASE = '/api'

export default function MLTraining() {
  const [servingStatus, setServingStatus] = useState(null)
  const [experiments, setExperiments] = useState(null)
  const [runs, setRuns] = useState([])
  const [benchmark, setBenchmark] = useState(null)
  const [benchmarkLoading, setBenchmarkLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/ml/training/serving/status`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/ml/training/experiments`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/ml/training/runs`).then(r => r.json()).catch(() => null)
    ]).then(([serving, exp, runsData]) => {
      if (serving?.success) setServingStatus(serving.data)
      if (exp?.success) setExperiments(exp.data)
      if (runsData?.success) setRuns(runsData.data)
      setLoading(false)
    })
  }, [])

  const runBenchmark = async () => {
    setBenchmarkLoading(true)
    setBenchmark(null)
    try {
      const res = await fetch(`${API_BASE}/ml/training/serving/benchmark?n=100`)
      const data = await res.json()
      if (data.success) setBenchmark(data.data)
    } catch (e) {
      console.error('Benchmark failed:', e)
    }
    setBenchmarkLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading training pipeline...</div>
      </div>
    )
  }

  const report = experiments?.latestReport
  const metadata = experiments?.datasetMetadata

  const backends = [
    { key: 'triton', name: 'Triton', desc: 'Nvidia GPU', color: 'green' },
    { key: 'onnx', name: 'ONNX Runtime', desc: 'Apple CoreML', color: 'blue' },
    { key: 'tfjs', name: 'TF.js', desc: 'CPU fallback', color: 'yellow' }
  ]

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">ML Training Pipeline</h1>
        <p className="text-gray-400 mt-1">Model training, experiment tracking, and multi-backend serving</p>
      </div>

      {/* Section 1: Model Serving Status */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Model Serving Status</h2>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Backend</div>
            <div className="text-lg font-semibold text-white mt-1">{servingStatus?.label || 'Unknown'}</div>
            <div className="text-xs text-gray-500 mt-1">{servingStatus?.backend || '-'}</div>
          </div>
          <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Predictions</div>
            <div className="text-lg font-semibold text-white mt-1">
              {servingStatus?.totalPredictions?.toLocaleString() || '0'}
            </div>
          </div>
          <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Avg Latency</div>
            <div className="text-lg font-semibold text-white mt-1">
              {servingStatus?.avgLatencyMs != null ? `${servingStatus.avgLatencyMs.toFixed(2)} ms` : '-'}
            </div>
          </div>
        </div>

        {/* Backend diagram */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {backends.map(b => {
            const isActive = servingStatus?.backend === b.key
            const borderColor = isActive
              ? b.color === 'green' ? 'border-green-500' : b.color === 'blue' ? 'border-blue-500' : 'border-yellow-500'
              : 'border-gray-800'
            const bgColor = isActive
              ? b.color === 'green' ? 'bg-green-500/10' : b.color === 'blue' ? 'bg-blue-500/10' : 'bg-yellow-500/10'
              : 'bg-[#0a0a0f]'
            return (
              <div key={b.key} className={`${bgColor} border ${borderColor} rounded-lg p-3 text-center`}>
                <div className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-gray-500'}`}>{b.name}</div>
                <div className="text-xs text-gray-500">{b.desc}</div>
                {isActive && <div className="text-[10px] text-green-400 mt-1 uppercase font-bold">Active</div>}
              </div>
            )
          })}
        </div>

        {/* Benchmark */}
        <div className="flex items-center gap-4">
          <button
            onClick={runBenchmark}
            disabled={benchmarkLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {benchmarkLoading ? 'Running...' : 'Run Benchmark'}
          </button>
          {benchmark && (
            <div className="flex gap-4 text-sm">
              <span className="text-gray-400">p50: <span className="text-white">{benchmark.p50}ms</span></span>
              <span className="text-gray-400">p95: <span className="text-white">{benchmark.p95}ms</span></span>
              <span className="text-gray-400">p99: <span className="text-white">{benchmark.p99}ms</span></span>
              <span className="text-gray-400">avg: <span className="text-white">{benchmark.avg}ms</span></span>
              <span className="text-gray-400">({benchmark.iterations} iterations)</span>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Training Pipeline */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Training Pipeline</h2>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Training Data</div>
            <div className={`text-sm font-semibold mt-1 ${experiments?.trainingDataExists ? 'text-green-400' : 'text-red-400'}`}>
              {experiments?.trainingDataExists ? 'Available' : 'Not Generated'}
            </div>
            {metadata && (
              <div className="text-xs text-gray-500 mt-1">
                {metadata.total_samples?.toLocaleString() || '-'} samples, {((metadata.fraud_rate || 0) * 100).toFixed(1)}% fraud rate
              </div>
            )}
          </div>
          <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Trained Model</div>
            <div className={`text-sm font-semibold mt-1 ${experiments?.trainedModelExists ? 'text-green-400' : 'text-red-400'}`}>
              {experiments?.trainedModelExists ? 'Ready' : 'Not Trained'}
            </div>
            {report && (
              <div className="text-xs text-gray-500 mt-1">
                v{report.version || '?'} - {report.trained_at?.substring(0, 10) || 'unknown'}
              </div>
            )}
          </div>
          <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Export Formats</div>
            <div className="flex gap-2 mt-2">
              {['ONNX', 'PyTorch', 'Triton'].map(fmt => (
                <span key={fmt} className="px-2 py-0.5 bg-gray-800 text-gray-400 text-xs rounded">
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Metrics from training report */}
        {report?.metrics && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Training Metrics</h3>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'AUC', value: report.metrics.auc },
                { label: 'Precision', value: report.metrics.precision },
                { label: 'Recall', value: report.metrics.recall },
                { label: 'F1 Score', value: report.metrics.f1 }
              ].map(m => (
                <div key={m.label} className="bg-[#0a0a0f] border border-gray-800 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500">{m.label}</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {m.value != null ? (typeof m.value === 'number' ? m.value.toFixed(4) : m.value) : '-'}
                  </div>
                </div>
              ))}
            </div>
            {report.metrics.confusion_matrix && (
              <div className="mt-3">
                <h4 className="text-xs text-gray-500 mb-2">Confusion Matrix</h4>
                <table className="text-xs text-gray-400 border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-gray-800 px-3 py-1"></th>
                      <th className="border border-gray-800 px-3 py-1">Predicted Legit</th>
                      <th className="border border-gray-800 px-3 py-1">Predicted Fraud</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-800 px-3 py-1 font-semibold">Actual Legit</td>
                      <td className="border border-gray-800 px-3 py-1 text-center text-green-400">
                        {report.metrics.confusion_matrix[0]?.[0] ?? '-'}
                      </td>
                      <td className="border border-gray-800 px-3 py-1 text-center text-red-400">
                        {report.metrics.confusion_matrix[0]?.[1] ?? '-'}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-800 px-3 py-1 font-semibold">Actual Fraud</td>
                      <td className="border border-gray-800 px-3 py-1 text-center text-red-400">
                        {report.metrics.confusion_matrix[1]?.[0] ?? '-'}
                      </td>
                      <td className="border border-gray-800 px-3 py-1 text-center text-green-400">
                        {report.metrics.confusion_matrix[1]?.[1] ?? '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Train a Model</div>
          <code className="text-xs text-indigo-400 block">
            cd backend/ml-training && pip install -r requirements.txt && python generate_data.py && python train.py
          </code>
        </div>
      </div>

      {/* Section 3: Experiment History */}
      <div className="bg-[#12121a] border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Experiment History</h2>
          {experiments?.mlflowAvailable && (
            <a
              href="http://localhost:5001"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              Open MLflow UI
            </a>
          )}
        </div>

        {runs.length === 0 ? (
          <div className="text-gray-500 text-sm">No training runs found. Train a model or start MLflow to see experiment history.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                  <th className="pb-2 pr-4">Run Name</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">AUC</th>
                  <th className="pb-2 pr-4">Precision</th>
                  <th className="pb-2 pr-4">Recall</th>
                  <th className="pb-2 pr-4">F1</th>
                  <th className="pb-2 pr-4">Epochs</th>
                  <th className="pb-2 pr-4">LR</th>
                  <th className="pb-2">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <tr key={run.runId || i} className="border-b border-gray-800/50">
                    <td className="py-2 pr-4 text-white">{run.runName || run.runId || '-'}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        run.status === 'FINISHED' ? 'bg-green-500/20 text-green-400' :
                        run.status === 'RUNNING' ? 'bg-blue-500/20 text-blue-400' :
                        run.status === 'FAILED' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {run.status || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-gray-300">{run.metrics?.auc != null ? Number(run.metrics.auc).toFixed(4) : '-'}</td>
                    <td className="py-2 pr-4 text-gray-300">{run.metrics?.precision != null ? Number(run.metrics.precision).toFixed(4) : '-'}</td>
                    <td className="py-2 pr-4 text-gray-300">{run.metrics?.recall != null ? Number(run.metrics.recall).toFixed(4) : '-'}</td>
                    <td className="py-2 pr-4 text-gray-300">{run.metrics?.f1 != null ? Number(run.metrics.f1).toFixed(4) : '-'}</td>
                    <td className="py-2 pr-4 text-gray-300">{run.params?.epochs || run.params?.num_epochs || '-'}</td>
                    <td className="py-2 pr-4 text-gray-300">{run.params?.learning_rate || run.params?.lr || '-'}</td>
                    <td className="py-2 text-gray-500 text-xs">
                      {run.startTime ? new Date(Number(run.startTime)).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
