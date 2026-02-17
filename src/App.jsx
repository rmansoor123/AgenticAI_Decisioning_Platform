import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import DataPlatform from './pages/DataPlatform'
import MLPlatform from './pages/MLPlatform'
import DecisionEngine from './pages/DecisionEngine'
import Experimentation from './pages/Experimentation'
import TransactionFlow from './pages/TransactionFlow'
import Listing from './pages/Listing'
import Payout from './pages/Payout'
import ATO from './pages/ATO'
import Shipping from './pages/Shipping'
import AgenticAI from './pages/AgenticAI'
import Onboarding from './pages/Onboarding'
import SellerOnboardingForm from './pages/SellerOnboardingForm'
import SellerRiskLifecycle from './pages/SellerRiskLifecycle'
import SellerNetworkAnalysis from './pages/SellerNetworkAnalysis'
import SellerRiskProfile from './pages/SellerRiskProfile'
import Observability from './pages/Observability'
import RiskRules from './pages/RiskRules'
import CaseQueue from './pages/CaseQueue'
import AccountSetup from './pages/AccountSetup'
import ItemSetup from './pages/ItemSetup'
import Pricing from './pages/Pricing'
import ProfileUpdates from './pages/ProfileUpdates'
import Returns from './pages/Returns'
import StreamingPipeline from './pages/StreamingPipeline'
import RAGEvaluation from './pages/RAGEvaluation'

const API_BASE = '/api'
const WS_URL = ((window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + '/ws')

function App() {
  const [transactions, setTransactions] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const metricsRes = await fetch(`${API_BASE}/metrics`)
        const metricsData = await metricsRes.json()
        if (metricsData.success) setMetrics(metricsData.data)
      } catch (error) {
        console.error('Error fetching data:', error)
        // Use fallback data if API not available
        setMetrics({
          transactions: { total: 847293, approved: 800000, blocked: 30000, review: 17293 },
          fraud: { catchRate: 0.987, falsePositiveRate: 0.003, amountBlocked: 2847392 },
          sellers: { active: 25000, underReview: 127 },
          models: { avgLatencyMs: 23, accuracy: 0.987 },
          rules: { active: 50 }
        })
      }
    }

    fetchData()
  }, [])

  // WebSocket connection
  useEffect(() => {
    let ws
    let reconnectTimeout

    const connect = () => {
      ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        console.log('WebSocket connected')
        setWsConnected(true)
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)

        if (data.type === 'transaction') {
          setTransactions(prev => {
            const tx = {
              id: data.data.transactionId,
              amount: data.data.amount,
              merchant: data.data.merchant || 'Unknown',
              riskScore: data.data.riskScore,
              status: data.data.decision?.toLowerCase() || 'approved',
              country: data.data.geoLocation?.country || 'US',
              timestamp: data.timestamp
            }
            return [tx, ...prev.slice(0, 19)]
          })
        }

        if (data.type === 'metrics') {
          setMetrics(data.data)
        }
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected')
        setWsConnected(false)
        reconnectTimeout = setTimeout(connect, 3000)
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    }

    connect()

    return () => {
      if (ws) ws.close()
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
    }
  }, [])

  // Fallback transaction generator if WS not connected
  useEffect(() => {
    if (wsConnected || transactions.length > 0) return

    const generateTransaction = () => ({
      id: `TXN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      amount: Math.floor(Math.random() * 10000) + 10,
      merchant: ['Amazon', 'Walmart', 'Target', 'Best Buy', 'Apple', 'Gas Station'][Math.floor(Math.random() * 6)],
      riskScore: Math.floor(Math.random() * 100),
      status: ['approved', 'blocked', 'review'][Math.floor(Math.random() * 3)],
      country: ['US', 'UK', 'CA', 'DE', 'FR', 'JP'][Math.floor(Math.random() * 6)],
      timestamp: new Date().toISOString()
    })

    setTransactions(Array.from({ length: 20 }, generateTransaction))

    const interval = setInterval(() => {
      if (!wsConnected) {
        setTransactions(prev => [generateTransaction(), ...prev.slice(0, 19)])
      }
    }, 1500)

    return () => clearInterval(interval)
  }, [wsConnected, transactions.length])

  return (
    <BrowserRouter>
      <Layout wsConnected={wsConnected}>
        <Routes>
          <Route path="/" element={<Dashboard transactions={transactions} metrics={metrics} wsConnected={wsConnected} />} />
          <Route path="/data" element={<DataPlatform />} />
          <Route path="/data/ingestion" element={<DataPlatform />} />
          <Route path="/data/catalog" element={<DataPlatform />} />
          <Route path="/data/query" element={<DataPlatform />} />
          <Route path="/ml" element={<MLPlatform />} />
          <Route path="/ml/models" element={<MLPlatform />} />
          <Route path="/ml/inference" element={<MLPlatform />} />
          <Route path="/ml/monitoring" element={<MLPlatform />} />
          <Route path="/decisions" element={<DecisionEngine />} />
          <Route path="/decisions/rules" element={<DecisionEngine />} />
          <Route path="/decisions/builder" element={<DecisionEngine />} />
          <Route path="/decisions/execution" element={<DecisionEngine />} />
          <Route path="/experiments" element={<Experimentation />} />
          <Route path="/experiments/ab" element={<Experimentation />} />
          <Route path="/experiments/simulation" element={<Experimentation />} />
          <Route path="/flow" element={<TransactionFlow />} />
          <Route path="/listing" element={<Listing />} />
          <Route path="/payout" element={<Payout />} />
          <Route path="/ato" element={<ATO />} />
          <Route path="/shipping" element={<Shipping />} />
          <Route path="/agents" element={<AgenticAI />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/onboarding/form" element={<SellerOnboardingForm />} />
          <Route path="/seller-risk" element={<SellerRiskLifecycle />} />
          <Route path="/seller-network" element={<SellerNetworkAnalysis />} />
          <Route path="/observability" element={<Observability />} />
          <Route path="/risk-rules" element={<RiskRules />} />
          <Route path="/case-queue" element={<CaseQueue />} />
          <Route path="/risk-profiles" element={<SellerRiskProfile />} />
          <Route path="/account-setup" element={<AccountSetup />} />
          <Route path="/item-setup" element={<ItemSetup />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/profile-updates" element={<ProfileUpdates />} />
          <Route path="/flow-detail" element={<TransactionFlow />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/streaming" element={<StreamingPipeline />} />
          <Route path="/rag-evaluation" element={<RAGEvaluation />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
