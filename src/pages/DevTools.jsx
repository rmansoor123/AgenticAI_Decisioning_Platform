import { useState, useEffect } from 'react'

const API_BASE = '/api'

export default function DevTools() {
  const [models, setModels] = useState(null)
  const [stats, setStats] = useState(null)
  const [info, setInfo] = useState(null)
  const [testPrompt, setTestPrompt] = useState('')
  const [testModel, setTestModel] = useState('gpt-4o-mini')
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/dev/gateway/models`).then(r => r.json()).then(d => d.success && setModels(d.data)).catch(() => {})
    fetch(`${API_BASE}/dev/gateway/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {})
    fetch(`${API_BASE}/dev/info`).then(r => r.json()).then(d => d.success && setInfo(d.data)).catch(() => {})
  }, [])

  const runTest = async () => {
    if (!testPrompt.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${API_BASE}/dev/gateway/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: testModel, messages: [{ role: 'user', content: testPrompt }], maxTokens: 500 })
      })
      const data = await res.json()
      setTestResult(data.success ? data.data : { error: data.error })
      // Refresh stats
      fetch(`${API_BASE}/dev/gateway/stats`).then(r => r.json()).then(d => d.success && setStats(d.data)).catch(() => {})
    } catch (err) {
      setTestResult({ error: err.message })
    }
    setTesting(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Developer Tools</h1>
        <p className="text-gray-400 mt-1">LLM gateway, API docs, testing, and observability</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LLM Gateway - Available Providers */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">LLM Gateway Providers</h2>
          {models ? (
            <div className="space-y-3">
              {Object.entries(models).map(([name, data]) => (
                <div key={name} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-white capitalize">{name}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{data.models.join(', ')}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${data.available ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700 text-gray-500'}`}>
                    {data.available ? 'Available' : 'No Key'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Loading providers...</p>
          )}
        </div>

        {/* Gateway Stats */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Gateway Statistics</h2>
          {stats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-indigo-400">{stats.calls}</div>
                  <div className="text-xs text-gray-500">Total Calls</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{stats.totalTokens.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Total Tokens</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-400">{stats.errors}</div>
                  <div className="text-xs text-gray-500">Errors</div>
                </div>
              </div>
              {Object.keys(stats.byProvider).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-400 mb-2">By Provider</h3>
                  <div className="space-y-1">
                    {Object.entries(stats.byProvider).map(([p, count]) => (
                      <div key={p} className="flex justify-between text-sm">
                        <span className="text-gray-300 capitalize">{p}</span>
                        <span className="text-gray-500">{count} calls</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Loading stats...</p>
          )}
        </div>

        {/* Test Completion */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Test LLM Completion</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Model</label>
              <select
                value={testModel}
                onChange={(e) => setTestModel(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <optgroup label="OpenAI">
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                </optgroup>
                <optgroup label="Anthropic">
                  <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
                  <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                </optgroup>
                <optgroup label="Ollama">
                  <option value="qwen2.5:7b">qwen2.5:7b</option>
                  <option value="llama3:8b">llama3:8b</option>
                </optgroup>
                <optgroup label="Groq">
                  <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                </optgroup>
                <optgroup label="Mistral">
                  <option value="mistral-small">mistral-small</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Prompt</label>
              <textarea
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                placeholder="Enter a test prompt..."
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none"
              />
            </div>
            <button
              onClick={runTest}
              disabled={testing || !testPrompt.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm py-2 rounded-lg transition-colors"
            >
              {testing ? 'Running...' : 'Send Completion'}
            </button>
            {testResult && (
              <div className="bg-gray-800/50 rounded-lg p-3 mt-2">
                {testResult.error ? (
                  <p className="text-red-400 text-sm">{testResult.error}</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">{testResult.content}</p>
                    <div className="flex gap-4 text-xs text-gray-500 pt-2 border-t border-gray-700">
                      <span>Provider: {testResult.provider}</span>
                      <span>Tokens: {testResult.tokens}</span>
                      <span>Latency: {testResult.latencyMs}ms</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Platform Info */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Platform Info</h2>
          {info ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-lg font-bold text-white">{info.agents.total}</div>
                  <div className="text-xs text-gray-500">AI Agents</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-lg font-bold text-white">{info.endpoints}</div>
                  <div className="text-xs text-gray-500">API Endpoints</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-lg font-bold text-white">{info.dockerServices}</div>
                  <div className="text-xs text-gray-500">Docker Services</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-lg font-bold text-white">{info.kafkaTopics}</div>
                  <div className="text-xs text-gray-500">Kafka Topics</div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-2">Capabilities</h3>
                <div className="flex flex-wrap gap-1.5">
                  {info.features.map((f, i) => (
                    <span key={i} className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">{f}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Loading...</p>
          )}
        </div>

        {/* API Docs */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">API Documentation</h2>
          <p className="text-sm text-gray-400 mb-4">Interactive Swagger UI for all platform endpoints.</p>
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Open Swagger UI
          </a>
          <p className="text-xs text-gray-600 mt-3">Available at <code className="text-gray-500">/api/docs</code></p>
        </div>

        {/* Load Testing */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Load Testing (k6)</h2>
          <p className="text-sm text-gray-400 mb-3">
            Run load tests against the platform with k6. The test script covers health, ML inference, segmentation, and underwriting endpoints.
          </p>
          <div className="bg-gray-800/50 rounded-lg p-3 font-mono text-xs text-gray-300 space-y-1">
            <p className="text-gray-500"># Install k6</p>
            <p>brew install k6</p>
            <p className="text-gray-500 mt-2"># Run load test</p>
            <p>k6 run backend/__tests__/load/k6-decisioning.js</p>
            <p className="text-gray-500 mt-2"># Custom base URL</p>
            <p>k6 run -e BASE_URL=http://localhost:3001 backend/__tests__/load/k6-decisioning.js</p>
          </div>
          <div className="mt-3 text-xs text-gray-500">
            <p>Thresholds: p95 &lt; 500ms, error rate &lt; 5%</p>
            <p>Stages: 10s ramp-up to 10 VUs, 30s sustain at 50 VUs, 10s ramp-down</p>
          </div>
        </div>
      </div>
    </div>
  )
}
