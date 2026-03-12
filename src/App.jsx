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
import SellerOnboardingLive from './pages/SellerOnboardingLive'
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
import PromptLibrary from './pages/PromptLibrary'
import FeedbackReview from './pages/FeedbackReview'
import AutonomousAgents from './pages/AutonomousAgents'
import RulesRepository from './pages/RulesRepository'
import PayoutLive from './pages/PayoutLive'
import ListingLive from './pages/ListingLive'
import ReturnsLive from './pages/ReturnsLive'
import ProfileUpdatesLive from './pages/ProfileUpdatesLive'
import ATOLive from './pages/ATOLive'
import ShippingLive from './pages/ShippingLive'
import AccountSetupLive from './pages/AccountSetupLive'
import ItemSetupLive from './pages/ItemSetupLive'
import PricingLive from './pages/PricingLive'
import SellerJourney from './pages/SellerJourney'
import TransactionLive from './pages/TransactionLive'
import PaymentLive from './pages/PaymentLive'
import ComplianceLive from './pages/ComplianceLive'
import NetworkLive from './pages/NetworkLive'
import ReviewLive from './pages/ReviewLive'
import BehavioralLive from './pages/BehavioralLive'
import BuyerTrustLive from './pages/BuyerTrustLive'
import PolicyLive from './pages/PolicyLive'

const API_BASE = '/api'
// Connect directly to backend WebSocket to avoid Vite HMR proxy conflict
const WS_URL = 'ws://localhost:3001/ws'

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
          <Route path="/listing/live" element={<ListingLive />} />
          <Route path="/payout" element={<Payout />} />
          <Route path="/payout/live" element={<PayoutLive />} />
          <Route path="/ato" element={<ATO />} />
          <Route path="/ato/live" element={<ATOLive />} />
          <Route path="/shipping" element={<Shipping />} />
          <Route path="/shipping/live" element={<ShippingLive />} />
          <Route path="/agents" element={<AgenticAI />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/onboarding/form" element={<SellerOnboardingForm />} />
          <Route path="/onboarding/live" element={<SellerOnboardingLive />} />
          <Route path="/seller-risk" element={<SellerRiskLifecycle />} />
          <Route path="/seller-network" element={<SellerNetworkAnalysis />} />
          <Route path="/observability" element={<Observability />} />
          <Route path="/risk-rules" element={<RiskRules />} />
          <Route path="/case-queue" element={<CaseQueue />} />
          <Route path="/risk-profiles" element={<SellerRiskProfile />} />
          <Route path="/account-setup" element={<AccountSetup />} />
          <Route path="/account-setup/live" element={<AccountSetupLive />} />
          <Route path="/item-setup" element={<ItemSetup />} />
          <Route path="/item-setup/live" element={<ItemSetupLive />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/pricing/live" element={<PricingLive />} />
          <Route path="/profile-updates" element={<ProfileUpdates />} />
          <Route path="/profile-updates/live" element={<ProfileUpdatesLive />} />
          <Route path="/flow-detail" element={<TransactionFlow />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/returns/live" element={<ReturnsLive />} />
          <Route path="/streaming" element={<StreamingPipeline />} />
          <Route path="/rag-evaluation" element={<RAGEvaluation />} />
          <Route path="/prompt-library" element={<PromptLibrary />} />
          <Route path="/feedback-review" element={<FeedbackReview />} />
          <Route path="/autonomous" element={<AutonomousAgents />} />
          <Route path="/rules-repository" element={<RulesRepository />} />
          <Route path="/seller-journey" element={<SellerJourney />} />
          <Route path="/transaction/live" element={<TransactionLive />} />
          <Route path="/payment/live" element={<PaymentLive />} />
          <Route path="/compliance/live" element={<ComplianceLive />} />
          <Route path="/network/live" element={<NetworkLive />} />
          <Route path="/review/live" element={<ReviewLive />} />
          <Route path="/behavioral/live" element={<BehavioralLive />} />
          <Route path="/buyer-trust/live" element={<BuyerTrustLive />} />
          <Route path="/policy/live" element={<PolicyLive />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
