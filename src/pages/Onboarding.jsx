import { useState, useEffect } from 'react'
import {
  Users, Bot, CheckCircle, XCircle, Clock, AlertTriangle,
  Shield, FileText, CreditCard, MapPin, Mail, Building,
  Play, RefreshCw, Eye, ArrowRight, Sparkles, Brain,
  Activity, TrendingUp, TrendingDown, Zap, ChevronRight
} from 'lucide-react'

const API_BASE = 'http://localhost:3005/api'

export default function Onboarding() {
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedSeller, setSelectedSeller] = useState(null)
  const [evaluationFlow, setEvaluationFlow] = useState(null)
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetchSellers()
    fetchStats()
  }, [])

  const fetchSellers = async () => {
    try {
      const res = await fetch(`${API_BASE}/onboarding/sellers?limit=20`)
      const data = await res.json()
      if (data.success) {
        setSellers(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching sellers:', error)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/onboarding/stats`)
      const data = await res.json()
      if (data.success) {
        setStats(data.data)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
      // Fallback stats
      setStats({
        total: 0,
        byStatus: { ACTIVE: 0, UNDER_REVIEW: 0, BLOCKED: 0 },
        byRiskTier: {},
        byDecision: {}
      })
    }
  }

  // Mock seller data generator
  const generateMockSeller = () => {
    const countries = ['US', 'UK', 'CA', 'DE', 'FR', 'NG', 'RO', 'PK']
    const categories = ['Electronics', 'Fashion', 'Home & Garden', 'Sports', 'Automotive', 'Health & Beauty']
    const riskLevels = ['LOW', 'MEDIUM', 'HIGH']
    
    const country = countries[Math.floor(Math.random() * countries.length)]
    const isHighRiskCountry = ['NG', 'RO', 'PK'].includes(country)
    const kycVerified = Math.random() > 0.2
    const bankVerified = Math.random() > 0.15
    const emailDomain = Math.random() > 0.9 ? 'tempmail.com' : 'example.com'
    
    return {
      businessName: `Business ${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      email: `seller${Math.floor(Math.random() * 1000)}@${emailDomain}`,
      phone: `+1-${Math.floor(Math.random() * 9000000000) + 1000000000}`,
      country,
      businessCategory: categories[Math.floor(Math.random() * categories.length)],
      kycVerified,
      bankVerified,
      businessRegistrationNumber: `REG-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      ipAddress: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      address: `${Math.floor(Math.random() * 9999)} Main St, City, ${country}`,
      taxId: `TAX-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
    }
  }

  const runOnboardingDemo = async () => {
    setLoading(true)
    setEvaluationFlow(null)
    setSelectedSeller(null)

    // Generate mock seller
    const mockSeller = generateMockSeller()
    
    // Show the flow step by step
    const flowSteps = [
      {
        step: '1. Service Receives Request',
        description: 'Onboarding service receives seller application',
        data: mockSeller,
        status: 'pending'
      },
      {
        step: '2. Service Calls Agent',
        description: 'Service calls sellerOnboarding.evaluateSeller()',
        code: `const agentResult = await sellerOnboarding.evaluateSeller(sellerId, sellerData)`,
        status: 'processing'
      },
      {
        step: '3. Agent THINK Phase',
        description: 'Agent analyzes seller data and determines strategy',
        agentAction: 'THINK',
        analysis: {
          riskIndicators: [
            !mockSeller.kycVerified && 'KYC_NOT_VERIFIED',
            !mockSeller.bankVerified && 'BANK_NOT_VERIFIED',
            ['NG', 'RO', 'PK'].includes(mockSeller.country) && 'HIGH_RISK_COUNTRY',
            mockSeller.email.includes('tempmail') && 'DISPOSABLE_EMAIL'
          ].filter(Boolean),
          strategy: ['NG', 'RO', 'PK'].includes(mockSeller.country) ? 'COMPREHENSIVE' : 'STANDARD'
        },
        status: 'processing'
      },
      {
        step: '4. Agent PLAN Phase',
        description: 'Agent creates verification plan',
        agentAction: 'PLAN',
        plan: {
          intensity: ['NG', 'RO', 'PK'].includes(mockSeller.country) ? 'COMPREHENSIVE' : 'STANDARD',
          tools: [
            'verify_identity',
            'verify_email',
            'check_duplicates',
            'screen_watchlist',
            'verify_business',
            'verify_bank_account',
            'verify_address',
            'check_fraud_databases',
            'analyze_business_category'
          ]
        },
        status: 'processing'
      },
      {
        step: '5. Agent ACT Phase',
        description: 'Agent executes verification tools',
        agentAction: 'ACT',
        tools: [
          { name: 'verify_identity', status: 'completed', result: { verified: mockSeller.kycVerified } },
          { name: 'verify_email', status: 'completed', result: { isDisposable: mockSeller.email.includes('tempmail') } },
          { name: 'check_duplicates', status: 'completed', result: { isDuplicate: false } },
          { name: 'screen_watchlist', status: 'completed', result: { sanctionsMatch: false } },
          { name: 'verify_business', status: 'completed', result: { isRegistered: true } },
          { name: 'verify_bank_account', status: 'completed', result: { verified: mockSeller.bankVerified } },
          { name: 'check_fraud_databases', status: 'completed', result: { isBlocked: false } }
        ],
        status: 'processing'
      },
      {
        step: '6. Agent OBSERVE Phase',
        description: 'Agent analyzes evidence and makes decision',
        agentAction: 'OBSERVE',
        evidence: {
          riskFactors: [
            !mockSeller.kycVerified && { factor: 'KYC_NOT_VERIFIED', severity: 'CRITICAL', score: 40 },
            !mockSeller.bankVerified && { factor: 'BANK_NOT_VERIFIED', severity: 'HIGH', score: 30 },
            ['NG', 'RO', 'PK'].includes(mockSeller.country) && { factor: 'HIGH_RISK_COUNTRY', severity: 'MEDIUM', score: 25 },
            mockSeller.email.includes('tempmail') && { factor: 'DISPOSABLE_EMAIL', severity: 'HIGH', score: 30 }
          ].filter(Boolean),
          totalRiskScore: [
            !mockSeller.kycVerified && 40,
            !mockSeller.bankVerified && 30,
            ['NG', 'RO', 'PK'].includes(mockSeller.country) && 25,
            mockSeller.email.includes('tempmail') && 30
          ].filter(Boolean).reduce((a, b) => a + b, 0)
        },
        status: 'processing'
      },
      {
        step: '7. Agent Decision',
        description: 'Agent generates decision with confidence',
        agentAction: 'DECISION',
        decision: (() => {
          const riskScore = [
            !mockSeller.kycVerified && 40,
            !mockSeller.bankVerified && 30,
            ['NG', 'RO', 'PK'].includes(mockSeller.country) && 25,
            mockSeller.email.includes('tempmail') && 30
          ].filter(Boolean).reduce((a, b) => a + b, 0)
          
          if (riskScore >= 61 || !mockSeller.kycVerified) {
            return { action: 'REJECT', confidence: 0.90, reason: 'High risk with critical factors' }
          } else if (riskScore >= 31) {
            return { action: 'REVIEW', confidence: 0.75, reason: 'Moderate risk requires manual review' }
          } else {
            return { action: 'APPROVE', confidence: 0.85, reason: 'Low risk seller meets criteria' }
          }
        })(),
        status: 'completed'
      },
      {
        step: '8. Service Processes Decision',
        description: 'Service sets seller status based on agent decision',
        code: `if (decision.action === 'REJECT') {
  sellerData.status = 'BLOCKED'
} else if (decision.action === 'REVIEW') {
  sellerData.status = 'UNDER_REVIEW'
} else {
  sellerData.status = 'PENDING'
}`,
        status: 'completed'
      }
    ]

    // Animate through steps
    for (let i = 0; i < flowSteps.length; i++) {
      setEvaluationFlow({
        currentStep: i,
        steps: flowSteps.slice(0, i + 1),
        sellerData: mockSeller
      })
      await new Promise(resolve => setTimeout(resolve, 1500))
    }

    // Now actually call the API to get real agent evaluation
    try {
      const res = await fetch(`${API_BASE}/onboarding/sellers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockSeller)
      })
      const data = await res.json()
      
      if (data.success) {
        // Also fetch the detailed agent evaluation
        let detailedEvaluation = null
        try {
          const evalRes = await fetch(`${API_BASE}/onboarding/sellers/${data.data.sellerId}/agent-evaluation`)
          const evalData = await evalRes.json()
          if (evalData.success) {
            detailedEvaluation = evalData.data.evaluation
          }
        } catch (e) {
          console.log('Could not fetch detailed evaluation:', e)
        }

        setSelectedSeller(data.data)
        setEvaluationFlow(prev => ({
          ...prev,
          finalResult: data.data,
          agentEvaluation: data.agentEvaluation,
          detailedEvaluation: detailedEvaluation,
          // Update steps with actual agent data
          steps: prev.steps.map((step, idx) => {
            if (idx === 4 && data.data.onboardingRiskAssessment?.agentEvaluation) {
              // Update ACT phase with actual tool results
              return {
                ...step,
                actualTools: data.data.onboardingRiskAssessment.agentEvaluation.evidenceGathered || 12,
                toolDetails: 'See detailed evaluation below'
              }
            }
            if (idx === 5 && data.data.onboardingRiskAssessment) {
              // Update OBSERVE phase with actual risk factors
              return {
                ...step,
                actualEvidence: data.data.onboardingRiskAssessment,
                riskFactors: data.data.onboardingRiskAssessment.signals || []
              }
            }
            if (idx === 6 && data.agentEvaluation) {
              // Update decision with actual agent decision
              return {
                ...step,
                decision: {
                  action: data.agentEvaluation.decision,
                  confidence: data.agentEvaluation.confidence,
                  reason: data.agentEvaluation.reasoning || step.decision.reason
                }
              }
            }
            return step
          })
        }))
        await fetchSellers()
        await fetchStats()
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const getDecisionColor = (decision) => {
    switch (decision) {
      case 'APPROVE': return 'emerald'
      case 'REJECT': return 'red'
      case 'REVIEW': return 'amber'
      default: return 'gray'
    }
  }

  const getDecisionIcon = (decision) => {
    switch (decision) {
      case 'APPROVE': return CheckCircle
      case 'REJECT': return XCircle
      case 'REVIEW': return Clock
      default: return AlertTriangle
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl">
              <Users className="w-6 h-6 text-white" />
            </div>
            Seller Onboarding
          </h1>
          <p className="text-gray-400 mt-1">Agentic AI-powered seller evaluation and approval</p>
        </div>
        <button
          onClick={runOnboardingDemo}
          disabled={loading}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-lg flex items-center gap-2 font-medium disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run Onboarding Demo
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <div className="text-2xl font-bold text-white">{stats.total || 0}</div>
            <div className="text-sm text-gray-400">Total Sellers</div>
          </div>
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <div className="text-2xl font-bold text-emerald-400">{stats.byStatus?.ACTIVE || 0}</div>
            <div className="text-sm text-gray-400">Approved</div>
          </div>
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <div className="text-2xl font-bold text-amber-400">{stats.byStatus?.UNDER_REVIEW || 0}</div>
            <div className="text-sm text-gray-400">Under Review</div>
          </div>
          <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
            <div className="text-2xl font-bold text-red-400">{stats.byStatus?.BLOCKED || 0}</div>
            <div className="text-sm text-gray-400">Rejected</div>
          </div>
        </div>
      )}

      {/* Agent Reasoning Explanation */}
      <div className="bg-[#12121a] rounded-xl border border-blue-500/30 p-6">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5 text-blue-400" />
          Agent Reasoning Process & Tools
        </h3>
        
        <div className="space-y-4 mb-6">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-3">Agent Reasoning Framework</h4>
            <div className="space-y-2 text-sm text-gray-300">
              <p>The Seller Onboarding Agent uses a <strong className="text-white">Think-Plan-Act-Observe</strong> reasoning loop:</p>
              <div className="grid grid-cols-4 gap-3 mt-3">
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded">
                  <div className="text-xs font-medium text-blue-400 mb-1">1. THINK</div>
                  <div className="text-xs text-gray-400">Analyzes seller data, identifies risk indicators, determines investigation strategy</div>
                </div>
                <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded">
                  <div className="text-xs font-medium text-purple-400 mb-1">2. PLAN</div>
                  <div className="text-xs text-gray-400">Creates verification plan, selects appropriate tools based on risk level</div>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded">
                  <div className="text-xs font-medium text-amber-400 mb-1">3. ACT</div>
                  <div className="text-xs text-gray-400">Executes 15+ verification tools, gathers evidence from each check</div>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded">
                  <div className="text-xs font-medium text-emerald-400 mb-1">4. OBSERVE</div>
                  <div className="text-xs text-gray-400">Analyzes evidence, calculates risk score, makes decision with confidence</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-3">All 15 Verification Tools Used by Agent</h4>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { tool: 'verify_identity', category: 'KYC', purpose: 'ID document verification (passport, driver license)' },
                { tool: 'verify_email', category: 'Communication', purpose: 'Email validation & risk assessment' },
                { tool: 'check_duplicates', category: 'Database', purpose: 'Duplicate account detection' },
                { tool: 'screen_watchlist', category: 'Compliance', purpose: 'Sanctions/PEP/watchlist screening' },
                { tool: 'verify_business', category: 'Business', purpose: 'Business registration verification' },
                { tool: 'verify_bank_account', category: 'Financial', purpose: 'Bank account ownership verification' },
                { tool: 'verify_address', category: 'Location', purpose: 'Business and mailing address verification' },
                { tool: 'check_fraud_databases', category: 'Security', purpose: 'Fraud database and blocklist checks' },
                { tool: 'analyze_business_category', category: 'Risk', purpose: 'Business category risk assessment' },
                { tool: 'check_financial_history', category: 'Financial', purpose: 'Credit and financial history check' },
                { tool: 'analyze_historical_patterns', category: 'Analytics', purpose: 'Similar seller pattern analysis' },
                { tool: 'check_ip_reputation', category: 'Security', purpose: 'IP address reputation and risk' },
                { tool: 'check_device_reputation', category: 'Security', purpose: 'Device trust and history (if available)' },
                { tool: 'check_consortium_data', category: 'Network', purpose: 'Shared fraud network data check' },
                { tool: 'request_fraud_investigation', category: 'Collaboration', purpose: 'Request help from Fraud Agent' }
              ].map((item, i) => (
                <div key={i} className="p-2 bg-gray-700/30 rounded border border-gray-600/30">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-gray-300 font-mono text-xs">{item.tool}</div>
                    <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                      {item.category}
                    </span>
                  </div>
                  <div className="text-gray-500 text-xs">{item.purpose}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-3">Decision Logic</h4>
            <div className="space-y-2 text-xs text-gray-300">
              <p>The agent calculates a risk score (0-100) based on all verification results:</p>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded">
                  <div className="text-emerald-400 font-medium">APPROVE</div>
                  <div className="text-gray-400">Risk ≤ 30</div>
                </div>
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded">
                  <div className="text-amber-400 font-medium">REVIEW</div>
                  <div className="text-gray-400">Risk 31-60</div>
                </div>
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded">
                  <div className="text-red-400 font-medium">REJECT</div>
                  <div className="text-gray-400">Risk ≥ 61 or critical factors</div>
                </div>
              </div>
              <p className="mt-3 text-gray-400">Critical factors (auto-reject): Watchlist matches, fraud database blocks, unverified identity, business not registered, bank ownership mismatch</p>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Reasoning Explanation */}
      <div className="bg-[#12121a] rounded-xl border border-blue-500/30 p-6">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Brain className="w-5 h-5 text-blue-400" />
          Agent Reasoning Process & All Tools
        </h3>
        
        <div className="space-y-4 mb-6">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-3">Agent Reasoning Framework (Think-Plan-Act-Observe)</h4>
            <div className="space-y-2 text-sm text-gray-300">
              <p>The Seller Onboarding Agent uses a <strong className="text-white">Think-Plan-Act-Observe</strong> reasoning loop:</p>
              <div className="grid grid-cols-4 gap-3 mt-3">
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded">
                  <div className="text-xs font-medium text-blue-400 mb-1">1. THINK</div>
                  <div className="text-xs text-gray-400">Analyzes seller data, identifies risk indicators, determines investigation strategy (BASIC/STANDARD/COMPREHENSIVE)</div>
                </div>
                <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded">
                  <div className="text-xs font-medium text-purple-400 mb-1">2. PLAN</div>
                  <div className="text-xs text-gray-400">Creates verification plan, selects appropriate tools based on risk level</div>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded">
                  <div className="text-xs font-medium text-amber-400 mb-1">3. ACT</div>
                  <div className="text-xs text-gray-400">Executes 15+ verification tools, gathers evidence from each check</div>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded">
                  <div className="text-xs font-medium text-emerald-400 mb-1">4. OBSERVE</div>
                  <div className="text-xs text-gray-400">Analyzes evidence, calculates risk score, makes decision with confidence</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-3">All 15 Verification Tools Used by Agent</h4>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { tool: 'verify_identity', category: 'KYC', purpose: 'ID document verification (passport, driver license)' },
                { tool: 'verify_email', category: 'Communication', purpose: 'Email validation & risk assessment' },
                { tool: 'check_duplicates', category: 'Database', purpose: 'Duplicate account detection' },
                { tool: 'screen_watchlist', category: 'Compliance', purpose: 'Sanctions/PEP/watchlist screening' },
                { tool: 'verify_business', category: 'Business', purpose: 'Business registration verification' },
                { tool: 'verify_bank_account', category: 'Financial', purpose: 'Bank account ownership verification' },
                { tool: 'verify_address', category: 'Location', purpose: 'Business and mailing address verification' },
                { tool: 'check_fraud_databases', category: 'Security', purpose: 'Fraud database and blocklist checks' },
                { tool: 'analyze_business_category', category: 'Risk', purpose: 'Business category risk assessment' },
                { tool: 'check_financial_history', category: 'Financial', purpose: 'Credit and financial history check' },
                { tool: 'analyze_historical_patterns', category: 'Analytics', purpose: 'Similar seller pattern analysis' },
                { tool: 'check_ip_reputation', category: 'Security', purpose: 'IP address reputation and risk' },
                { tool: 'check_device_reputation', category: 'Security', purpose: 'Device trust and history (if available)' },
                { tool: 'check_consortium_data', category: 'Network', purpose: 'Shared fraud network data check' },
                { tool: 'request_fraud_investigation', category: 'Collaboration', purpose: 'Request help from Fraud Agent' }
              ].map((item, i) => (
                <div key={i} className="p-2 bg-gray-700/30 rounded border border-gray-600/30">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-gray-300 font-mono text-xs">{item.tool}</div>
                    <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                      {item.category}
                    </span>
                  </div>
                  <div className="text-gray-500 text-xs">{item.purpose}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-white mb-3">Decision Logic & Risk Thresholds</h4>
            <div className="space-y-2 text-xs text-gray-300">
              <p>The agent calculates a risk score (0-100) based on all verification results:</p>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded">
                  <div className="text-emerald-400 font-medium">APPROVE</div>
                  <div className="text-gray-400">Risk ≤ 30</div>
                </div>
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded">
                  <div className="text-amber-400 font-medium">REVIEW</div>
                  <div className="text-gray-400">Risk 31-60</div>
                </div>
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded">
                  <div className="text-red-400 font-medium">REJECT</div>
                  <div className="text-gray-400">Risk ≥ 61 or critical factors</div>
                </div>
              </div>
              <p className="mt-3 text-gray-400">Critical factors (auto-reject): Watchlist matches, fraud database blocks, unverified identity, business not registered, bank ownership mismatch</p>
            </div>
          </div>
        </div>
      </div>

      {/* How Service Uses Agent */}
      <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          How the Onboarding Service Uses the Agent
        </h3>
        
        <div className="space-y-4">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-sm font-medium text-white mb-2">1. Service Receives Request</div>
            <code className="text-xs text-gray-400 block mb-2">POST /api/onboarding/sellers</code>
            <div className="text-xs text-gray-500">Client sends seller application data</div>
          </div>

          <ChevronRight className="w-5 h-5 text-gray-600 mx-auto" />

          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-sm font-medium text-white mb-2">2. Service Calls Agent</div>
            <code className="text-xs text-gray-400 block mb-2">
              const agentResult = await sellerOnboarding.evaluateSeller(sellerId, sellerData)
            </code>
            <div className="text-xs text-gray-500">Service imports agent and calls evaluateSeller() method</div>
          </div>

          <ChevronRight className="w-5 h-5 text-gray-600 mx-auto" />

          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-sm font-medium text-white mb-2">3. Agent Performs Evaluation</div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              <div className="text-xs text-gray-400">THINK</div>
              <div className="text-xs text-gray-400">PLAN</div>
              <div className="text-xs text-gray-400">ACT</div>
              <div className="text-xs text-gray-400">OBSERVE</div>
            </div>
            <div className="text-xs text-gray-500 mt-2">Agent runs through reasoning loop with 15+ verification tools</div>
          </div>

          <ChevronRight className="w-5 h-5 text-gray-600 mx-auto" />

          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-sm font-medium text-white mb-2">4. Agent Returns Decision</div>
            <code className="text-xs text-gray-400 block mb-2">
              {`{
  decision: { action: 'APPROVE' | 'REJECT' | 'REVIEW', confidence: 0.85 },
  riskFactors: [...],
  reasoning: '...'
}`}
            </code>
            <div className="text-xs text-gray-500">Agent returns structured decision with full reasoning</div>
          </div>

          <ChevronRight className="w-5 h-5 text-gray-600 mx-auto" />

          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="text-sm font-medium text-white mb-2">5. Service Processes Decision</div>
            <code className="text-xs text-gray-400 block mb-2">
              {`if (decision.action === 'REJECT') sellerData.status = 'BLOCKED'
else if (decision.action === 'REVIEW') sellerData.status = 'UNDER_REVIEW'
else sellerData.status = 'PENDING'`}
            </code>
            <div className="text-xs text-gray-500">Service sets seller status and stores evaluation results</div>
          </div>
        </div>
      </div>

      {/* Evaluation Flow */}
      {evaluationFlow && (
        <div className="bg-[#12121a] rounded-xl border border-blue-500/30 p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            Live Agent Evaluation Flow
          </h3>

          <div className="space-y-4">
            {evaluationFlow.steps.map((step, index) => (
              <div
                key={index}
                className={`border rounded-lg p-4 transition-all ${
                  index === evaluationFlow.currentStep
                    ? 'border-blue-500/50 bg-blue-500/10'
                    : index < evaluationFlow.currentStep
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-gray-800 bg-gray-800/30'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {index < evaluationFlow.currentStep ? (
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    ) : index === evaluationFlow.currentStep ? (
                      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <div className="w-5 h-5 border-2 border-gray-600 rounded-full" />
                    )}
                    <div>
                      <div className="font-medium text-white">{step.step}</div>
                      <div className="text-xs text-gray-400">{step.description}</div>
                    </div>
                  </div>
                  {step.agentAction && (
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
                      {step.agentAction}
                    </span>
                  )}
                </div>

                {/* Step-specific content */}
                {step.code && (
                  <div className="mt-3 p-3 bg-black/30 rounded font-mono text-xs text-gray-300">
                    {step.code}
                  </div>
                )}

                {step.analysis && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-gray-400">Risk Indicators:</div>
                    <div className="flex flex-wrap gap-2">
                      {step.analysis.riskIndicators.map((indicator, i) => (
                        <span key={i} className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">
                          {indicator}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                      Strategy: <span className="text-white">{step.analysis.strategy}</span>
                    </div>
                  </div>
                )}

                {step.plan && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-gray-400">Verification Plan:</div>
                    <div className="grid grid-cols-3 gap-2">
                      {step.plan.tools.map((tool, i) => (
                        <div key={i} className="px-2 py-1 bg-gray-700/50 rounded text-xs text-gray-300">
                          {tool}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {step.tools && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-gray-400 mb-2">Tools Executed ({step.tools.length}):</div>
                    <div className="space-y-2">
                      {step.tools.map((tool, i) => (
                        <div key={i} className="p-3 bg-gray-700/30 rounded-lg border border-gray-600/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                              <span className="text-sm font-medium text-white">{tool.name}</span>
                            </div>
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          </div>
                          {tool.result && (
                            <div className="mt-2 pl-4 border-l-2 border-gray-600 space-y-1">
                              {Object.entries(tool.result).map(([key, value]) => (
                                <div key={key} className="text-xs">
                                  <span className="text-gray-400">{key}:</span>{' '}
                                  <span className={`text-white ${
                                    typeof value === 'boolean' 
                                      ? value ? 'text-emerald-400' : 'text-red-400'
                                      : ''
                                  }`}>
                                    {typeof value === 'boolean' ? (value ? '✓' : '✗') : String(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {step.evidence && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-gray-400">Risk Factors Found:</div>
                    <div className="space-y-1">
                      {step.evidence.riskFactors.map((factor, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-gray-700/30 rounded">
                          <div>
                            <span className="text-xs text-white">{factor.factor}</span>
                            <span className={`text-xs ml-2 ${
                              factor.severity === 'CRITICAL' ? 'text-red-400' :
                              factor.severity === 'HIGH' ? 'text-amber-400' :
                              'text-yellow-400'
                            }`}>
                              {factor.severity}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">+{factor.score}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 p-2 bg-gray-700/50 rounded">
                      <div className="text-xs text-gray-400">Total Risk Score:</div>
                      <div className="text-lg font-bold text-white">{step.evidence.totalRiskScore}/100</div>
                    </div>
                  </div>
                )}

                {step.decision && (
                  <div className={`mt-3 p-4 rounded-lg bg-${getDecisionColor(step.decision.action)}-500/10 border border-${getDecisionColor(step.decision.action)}-500/30`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-gray-400">Agent Decision</div>
                        <div className="text-xl font-bold text-white">{step.decision.action}</div>
                        <div className="text-xs text-gray-400 mt-1">{step.decision.reason}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-400">Confidence</div>
                        <div className="text-xl font-bold text-white">
                          {(step.decision.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Agent Reasoning & Tools Details */}
          {evaluationFlow.finalResult?.onboardingRiskAssessment && (
            <div className="mt-6 space-y-4">
              {/* Agent Reasoning */}
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
                <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-blue-400" />
                  Agent Reasoning Process
                </h4>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-gray-400 mb-1">1. THINK Phase - Initial Analysis</div>
                    <div className="text-gray-300 pl-4">
                      Agent analyzed seller data and identified {evaluationFlow.finalResult.onboardingRiskAssessment.signals?.length || 0} initial risk indicators.
                      Strategy determined: <span className="text-white">
                        {evaluationFlow.finalResult.onboardingRiskAssessment.signals?.length >= 3 ? 'COMPREHENSIVE' :
                         evaluationFlow.finalResult.onboardingRiskAssessment.signals?.length >= 1 ? 'STANDARD' : 'BASIC'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-1">2. PLAN Phase - Verification Plan</div>
                    <div className="text-gray-300 pl-4">
                      Agent created verification plan with {evaluationFlow.finalResult.onboardingRiskAssessment.agentEvaluation?.evidenceGathered || 12} tools to execute.
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-1">3. ACT Phase - Tool Execution</div>
                    <div className="text-gray-300 pl-4">
                      Agent executed {evaluationFlow.finalResult.onboardingRiskAssessment.agentEvaluation?.evidenceGathered || 12} verification tools:
                    </div>
                    <div className="mt-2 pl-4 grid grid-cols-2 gap-2">
                      {[
                        'verify_identity', 'verify_email', 'check_duplicates', 'screen_watchlist',
                        'verify_business', 'verify_bank_account', 'verify_address', 'check_fraud_databases',
                        'analyze_business_category', 'check_financial_history', 'analyze_historical_patterns', 'check_ip_reputation'
                      ].map((tool, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <CheckCircle className="w-3 h-3 text-emerald-400" />
                          <span className="text-gray-400">{tool}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-1">4. OBSERVE Phase - Evidence Analysis</div>
                    <div className="text-gray-300 pl-4">
                      Agent analyzed all evidence and calculated risk score: <span className="text-white font-bold">
                        {evaluationFlow.finalResult.onboardingRiskAssessment.riskScore}/100
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 mb-1">5. DECISION Phase - Final Decision</div>
                    <div className="text-gray-300 pl-4">
                      Based on risk score and critical factors, agent decision: <span className={`font-bold ${
                        getDecisionColor(evaluationFlow.finalResult.onboardingRiskAssessment.decision) === 'emerald' ? 'text-emerald-400' :
                        getDecisionColor(evaluationFlow.finalResult.onboardingRiskAssessment.decision) === 'red' ? 'text-red-400' :
                        'text-amber-400'
                      }`}>
                        {evaluationFlow.finalResult.onboardingRiskAssessment.decision}
                      </span> with {(evaluationFlow.finalResult.onboardingRiskAssessment.confidence * 100).toFixed(0)}% confidence.
                    </div>
                  </div>
                </div>
              </div>

              {/* All Tools Used */}
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
                <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  All Verification Tools Used (15 Tools)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { name: 'verify_identity', category: 'KYC', desc: 'Verify ID documents (passport, driver license)' },
                    { name: 'verify_email', category: 'Communication', desc: 'Email validation and risk assessment' },
                    { name: 'check_duplicates', category: 'Database', desc: 'Check for duplicate seller accounts' },
                    { name: 'screen_watchlist', category: 'Compliance', desc: 'Sanctions, PEP, watchlist screening' },
                    { name: 'verify_business', category: 'Business', desc: 'Business registration verification' },
                    { name: 'verify_bank_account', category: 'Financial', desc: 'Bank account ownership verification' },
                    { name: 'verify_address', category: 'Location', desc: 'Business and mailing address verification' },
                    { name: 'check_fraud_databases', category: 'Security', desc: 'Fraud database and blocklist checks' },
                    { name: 'analyze_business_category', category: 'Risk', desc: 'Business category risk assessment' },
                    { name: 'check_financial_history', category: 'Financial', desc: 'Credit and financial history check' },
                    { name: 'analyze_historical_patterns', category: 'Analytics', desc: 'Similar seller pattern analysis' },
                    { name: 'check_ip_reputation', category: 'Security', desc: 'IP address reputation and risk' },
                    { name: 'check_device_reputation', category: 'Security', desc: 'Device trust and history (if available)' },
                    { name: 'check_consortium_data', category: 'Network', desc: 'Shared fraud network data check' },
                    { name: 'request_fraud_investigation', category: 'Collaboration', desc: 'Request help from Fraud Agent' }
                  ].map((tool, i) => (
                    <div key={i} className="p-3 bg-gray-700/30 rounded-lg border border-gray-600/30">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-white">{tool.name}</span>
                        <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                          {tool.category}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">{tool.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Factors & Decision Logic */}
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-4">
                <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-red-400" />
                  Risk Factors & Decision Logic
                </h4>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-400 mb-2">Risk Thresholds:</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded">
                        <div className="text-xs text-emerald-400 font-medium">APPROVE</div>
                        <div className="text-xs text-gray-300">Risk ≤ 30</div>
                      </div>
                      <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded">
                        <div className="text-xs text-amber-400 font-medium">REVIEW</div>
                        <div className="text-xs text-gray-300">Risk 31-60</div>
                      </div>
                      <div className="p-2 bg-red-500/10 border border-red-500/30 rounded">
                        <div className="text-xs text-red-400 font-medium">REJECT</div>
                        <div className="text-xs text-gray-300">Risk ≥ 61</div>
                      </div>
                    </div>
                  </div>
                  {evaluationFlow.finalResult.onboardingRiskAssessment.signals && (
                    <div>
                      <div className="text-xs text-gray-400 mb-2">Risk Signals Found:</div>
                      <div className="space-y-1">
                        {evaluationFlow.finalResult.onboardingRiskAssessment.signals.map((signal, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-gray-700/30 rounded">
                            <span className="text-xs text-gray-300">{signal.signal || signal}</span>
                            <span className="text-xs text-amber-400">+{signal.weight || 20}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-gray-400 mb-2">Decision Calculation:</div>
                    <div className="p-3 bg-black/30 rounded font-mono text-xs text-gray-300">
                      {`Total Risk Score: ${evaluationFlow.finalResult.onboardingRiskAssessment.riskScore}/100
                      
if (riskScore >= 61 || criticalFactors > 0) {
  decision = 'REJECT'
} else if (riskScore >= 31) {
  decision = 'REVIEW'
} else {
  decision = 'APPROVE'
}

Current Decision: ${evaluationFlow.finalResult.onboardingRiskAssessment.decision}
Confidence: ${(evaluationFlow.finalResult.onboardingRiskAssessment.confidence * 100).toFixed(0)}%`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Final Result */}
              <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium text-white">Final Result</div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    evaluationFlow.finalResult.status === 'BLOCKED' ? 'bg-red-500/20 text-red-400' :
                    evaluationFlow.finalResult.status === 'UNDER_REVIEW' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {evaluationFlow.finalResult.status}
                  </div>
                </div>
                <div className="text-xs text-gray-400 mb-2">
                  Seller ID: <span className="text-white font-mono">{evaluationFlow.finalResult.sellerId}</span>
                </div>
                {evaluationFlow.agentEvaluation && (
                  <div className="mt-3 p-3 bg-black/30 rounded">
                    <div className="text-xs text-gray-400 mb-2">Agent Evaluation Summary:</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Decision:</span>
                        <span className={`text-white font-medium ${
                          getDecisionColor(evaluationFlow.agentEvaluation.decision) === 'emerald' ? 'text-emerald-400' :
                          getDecisionColor(evaluationFlow.agentEvaluation.decision) === 'red' ? 'text-red-400' :
                          'text-amber-400'
                        }`}>
                          {evaluationFlow.agentEvaluation.decision}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Confidence:</span>
                        <span className="text-white">{(evaluationFlow.agentEvaluation.confidence * 100).toFixed(0)}%</span>
                      </div>
                      {evaluationFlow.finalResult.onboardingRiskAssessment.agentEvaluation && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Tools Executed:</span>
                            <span className="text-white">{evaluationFlow.finalResult.onboardingRiskAssessment.agentEvaluation.evidenceGathered}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Risk Factors:</span>
                            <span className="text-white">{evaluationFlow.finalResult.onboardingRiskAssessment.agentEvaluation.riskFactors}</span>
                          </div>
                        </>
                      )}
                    </div>
                    {evaluationFlow.agentEvaluation.reasoning && (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <div className="text-xs text-gray-400 mb-1">Agent Reasoning:</div>
                        <div className="text-xs text-gray-300 whitespace-pre-wrap">
                          {evaluationFlow.agentEvaluation.reasoning}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Sellers */}
      <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold text-white">Recent Onboardings</h3>
          <button
            onClick={fetchSellers}
            className="p-1 hover:bg-gray-800 rounded"
          >
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full">
            <thead className="bg-[#0d0d14] sticky top-0">
              <tr className="text-xs text-gray-500">
                <th className="px-4 py-3 text-left">Seller ID</th>
                <th className="px-4 py-3 text-left">Business Name</th>
                <th className="px-4 py-3 text-left">Country</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Risk Tier</th>
                <th className="px-4 py-3 text-left">Agent Decision</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sellers.slice(0, 10).map((seller, i) => {
                const decision = seller.onboardingRiskAssessment?.decision || 'PENDING'
                const DecisionIcon = getDecisionIcon(decision)
                const decisionColor = getDecisionColor(decision)

                return (
                  <tr
                    key={seller.sellerId || i}
                    className="border-t border-gray-800/50 hover:bg-gray-800/30 cursor-pointer"
                    onClick={() => setSelectedSeller(selectedSeller?.sellerId === seller.sellerId ? null : seller)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-300">{seller.sellerId}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-white">{seller.businessName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-400">{seller.country}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${
                        seller.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' :
                        seller.status === 'UNDER_REVIEW' ? 'bg-amber-500/20 text-amber-400' :
                        seller.status === 'BLOCKED' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {seller.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${
                        seller.riskTier === 'LOW' ? 'bg-emerald-500/20 text-emerald-400' :
                        seller.riskTier === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                        seller.riskTier === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {seller.riskTier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {seller.onboardingRiskAssessment ? (
                        <span className={`flex items-center gap-1.5 text-xs ${
                          decisionColor === 'emerald' ? 'text-emerald-400' :
                          decisionColor === 'red' ? 'text-red-400' :
                          'text-amber-400'
                        }`}>
                          <DecisionIcon className="w-3 h-3" />
                          {decision}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button className="p-1 hover:bg-gray-700 rounded">
                        <Eye className="w-4 h-4 text-gray-400" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seller Details */}
      {selectedSeller && (
        <div className="bg-[#12121a] rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Seller Details</h3>
            <button
              onClick={() => setSelectedSeller(null)}
              className="p-1 hover:bg-gray-800 rounded"
            >
              <XCircle className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">Business Name</div>
              <div className="text-sm text-white">{selectedSeller.businessName}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Email</div>
              <div className="text-sm text-white">{selectedSeller.email}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Country</div>
              <div className="text-sm text-white">{selectedSeller.country}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Category</div>
              <div className="text-sm text-white">{selectedSeller.businessCategory}</div>
            </div>
          </div>

          {selectedSeller.onboardingRiskAssessment && (
            <div className="mt-4 p-4 bg-gray-800/50 rounded-lg">
              <div className="text-sm font-medium text-white mb-3">Agent Evaluation</div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Decision</span>
                  <span className={`text-xs font-medium ${
                    getDecisionColor(selectedSeller.onboardingRiskAssessment.decision) === 'emerald' ? 'text-emerald-400' :
                    getDecisionColor(selectedSeller.onboardingRiskAssessment.decision) === 'red' ? 'text-red-400' :
                    'text-amber-400'
                  }`}>
                    {selectedSeller.onboardingRiskAssessment.decision}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Risk Score</span>
                  <span className="text-xs text-white">{selectedSeller.onboardingRiskAssessment.riskScore}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-400">Confidence</span>
                  <span className="text-xs text-white">
                    {((selectedSeller.onboardingRiskAssessment.confidence || 0) * 100).toFixed(0)}%
                  </span>
                </div>
                {selectedSeller.onboardingRiskAssessment.agentEvaluation && (
                  <div className="mt-2 pt-2 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-1">Agent</div>
                    <div className="text-xs text-white">
                      {selectedSeller.onboardingRiskAssessment.agentEvaluation.agentName}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Evidence Gathered: {selectedSeller.onboardingRiskAssessment.agentEvaluation.evidenceGathered} checks
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

