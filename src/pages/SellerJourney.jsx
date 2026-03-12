import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Shield, UserX, Settings, Package, DollarSign, Activity, CreditCard, Truck,
  RotateCcw, ShieldAlert, UserCog, Play, RefreshCw, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, Search, Lock, Flag, AlertTriangle, Filter
} from 'lucide-react'
import { useAgentFlow } from '../hooks/useAgentFlow'
import AgentFlowViewer from '../components/AgentFlowViewer'

const API_BASE = '/api'

// ── Constants (duplicated from SellerRiskProfile — not exported there) ──

const TIER_COLORS = {
  LOW: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  MEDIUM: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
  HIGH: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  CRITICAL: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' }
}

const DOMAIN_ICONS = {
  onboarding: UserX, account_setup: Settings, item_setup: Package,
  listing: Package, pricing: DollarSign, transaction: Activity,
  payout: CreditCard, shipping: Truck, returns: RotateCcw,
  ato: ShieldAlert, profile_updates: UserCog,
  payment: CreditCard, compliance: Shield, network: Activity,
  review: Flag, behavioral: Activity, buyer_trust: UserCog,
  policy_enforcement: ShieldAlert
}

const DOMAIN_LABELS = {
  onboarding: 'Onboarding', account_setup: 'Account Setup', item_setup: 'Item Setup',
  listing: 'Listing', pricing: 'Pricing', transaction: 'Transaction',
  payout: 'Payout', shipping: 'Shipping', returns: 'Returns',
  ato: 'ATO', profile_updates: 'Profile Updates',
  payment: 'Payment', compliance: 'Compliance', network: 'Network',
  review: 'Review', behavioral: 'Behavioral', buyer_trust: 'Buyer Trust',
  policy_enforcement: 'Policy'
}

const DOMAIN_COLORS = {
  onboarding: 'bg-blue-500', account_setup: 'bg-cyan-500', item_setup: 'bg-violet-500',
  listing: 'bg-purple-500', pricing: 'bg-emerald-500', transaction: 'bg-indigo-500',
  payout: 'bg-amber-500', shipping: 'bg-teal-500', returns: 'bg-pink-500',
  ato: 'bg-red-500', profile_updates: 'bg-orange-500',
  payment: 'bg-green-500', compliance: 'bg-yellow-500', network: 'bg-fuchsia-500',
  review: 'bg-lime-500', behavioral: 'bg-rose-500', buyer_trust: 'bg-sky-500',
  policy_enforcement: 'bg-slate-500'
}

// ── Decision color/icon maps per domain ──

const DECISION_STYLES = {
  APPROVE: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', Icon: CheckCircle },
  REVIEW: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', Icon: Clock },
  REJECT: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', Icon: XCircle },
  HOLD: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', Icon: Clock },
  FLAG: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', Icon: Flag },
  ALLOW: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', Icon: CheckCircle },
  BLOCK: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', Icon: XCircle },
  CHALLENGE: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', Icon: ShieldAlert },
  INVESTIGATE: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', Icon: Search },
  DENY: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', Icon: XCircle },
  STEP_UP: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', Icon: ShieldAlert },
  LOCK: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', Icon: Lock },
  ERROR: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', Icon: XCircle },
  NORMAL: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', Icon: CheckCircle },
  WARN: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', Icon: AlertTriangle },
  CLEAR: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', Icon: CheckCircle },
  REMOVE: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', Icon: XCircle },
  RESTRICT: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', Icon: Lock },
}

// ── 10 Checkpoint configs ──

const CHECKPOINTS = [
  {
    domain: 'onboarding', label: 'Onboarding', phase: 'PRE-LAUNCH',
    apiPath: '/api/onboarding/sellers', isCreate: true,
    decisions: ['APPROVE', 'REVIEW', 'REJECT'],
    generate: () => {
      const names = ['TechNova LLC', 'Bright Solutions', 'GlobalMart Inc', 'Apex Trading', 'SilverLine Co']
      const countries = ['US', 'GB', 'DE', 'JP', 'CA']
      const categories = ['electronics', 'fashion', 'home_goods', 'sports', 'beauty']
      const name = names[Math.floor(Math.random() * names.length)]
      const country = countries[Math.floor(Math.random() * countries.length)]
      return {
        sellerId: `SLR-${Date.now().toString(36).toUpperCase()}`,
        businessName: name,
        businessCategory: categories[Math.floor(Math.random() * categories.length)],
        businessRegistrationNumber: `REG-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        businessAge: Math.floor(Math.random() * 10) + 1,
        taxId: `${Math.floor(10 + Math.random() * 89)}-${Math.floor(1000000 + Math.random() * 8999999)}`,
        email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        phone: '+1' + Math.floor(2000000000 + Math.random() * 7999999999),
        country,
        address: { street: '123 Commerce St', city: 'Business City', state: 'NY', zip: '10001', country },
        documentType: 'passport',
        documentNumber: `P${Math.floor(10000000 + Math.random() * 89999999)}`,
        bankName: 'First National Bank',
        accountNumber: `${Math.floor(100000000 + Math.random() * 899999999)}`,
        routingNumber: `${Math.floor(100000000 + Math.random() * 899999999)}`,
        accountHolderName: name,
        ipAddress: `${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        kycVerified: false,
        bankVerified: false,
        createdAt: new Date().toISOString()
      }
    }
  },
  {
    domain: 'account_setup', label: 'Account Setup', phase: 'PRE-LAUNCH',
    apiPath: '/api/account-setup',
    decisions: ['APPROVE', 'REVIEW', 'REJECT'],
    generate: (sellerId) => ({
      sellerId,
      bankAccount: { last4: String(Math.floor(1000 + Math.random() * 8999)) },
      routingNumber: `${Math.floor(100000000 + Math.random() * 899999999)}`,
      bankCountry: Math.random() > 0.2 ? 'US' : ['NG', 'RO', 'GB'][Math.floor(Math.random() * 3)],
      taxId: `${Math.floor(10 + Math.random() * 89)}-${Math.floor(1000000 + Math.random() * 8999999)}`,
      storeCategory: ['electronics', 'fashion', 'home_goods', 'sports', 'beauty', 'toys', 'grocery'][Math.floor(Math.random() * 7)]
    })
  },
  {
    domain: 'item_setup', label: 'Item Setup', phase: 'PRE-LAUNCH',
    apiPath: '/api/item-setup',
    decisions: ['APPROVE', 'FLAG', 'REJECT'],
    generate: (sellerId) => ({
      sellerId,
      title: ['iPhone 15 Pro Max', 'Nike Air Jordan 1', 'Sony WH-1000XM5', 'Dyson V15 Detect', 'iPad Pro M2', 'Samsung Galaxy S24', 'Bose QuietComfort', 'Prescription Medication'][Math.floor(Math.random() * 8)],
      category: ['electronics', 'fashion', 'home_goods', 'sports', 'beauty', 'toys', 'Pharmaceuticals'][Math.floor(Math.random() * 7)],
      price: Math.floor(Math.random() * 500) + 5,
      weight: Math.round((Math.random() * 10 + 0.1) * 10) / 10
    })
  },
  {
    domain: 'listing', label: 'Listing', phase: 'PRE-LAUNCH',
    apiPath: '/api/listing/listings',
    decisions: ['APPROVE', 'FLAG', 'REJECT'],
    generate: (sellerId) => {
      const categories = ['electronics', 'fashion', 'luxury', 'home_goods', 'sports']
      const cat = categories[Math.floor(Math.random() * categories.length)]
      return {
        sellerId,
        title: `${cat === 'luxury' ? 'Designer' : 'Premium'} ${cat} item - ${Math.random().toString(36).slice(2, 6)}`,
        description: `High quality ${cat} product for sale`,
        category: cat,
        price: Math.floor(Math.random() * 800) + 20,
        quantity: Math.floor(Math.random() * 50) + 1,
        condition: ['new', 'like_new', 'used'][Math.floor(Math.random() * 3)],
        riskFlags: {
          priceAnomaly: Math.random() > 0.7,
          prohibitedContent: Math.random() > 0.9,
          counterfeitRisk: cat === 'luxury' && Math.random() > 0.5,
          duplicateListing: Math.random() > 0.8
        }
      }
    }
  },
  {
    domain: 'pricing', label: 'Pricing', phase: 'PRE-LAUNCH',
    apiPath: '/api/pricing',
    decisions: ['APPROVE', 'FLAG', 'REJECT'],
    generate: (sellerId) => {
      const currentPrice = Math.floor(Math.random() * 500) + 10
      const change = (Math.random() - 0.3) * 0.8
      return {
        sellerId,
        listingId: `LST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        category: ['electronics', 'fashion', 'home_goods', 'sports', 'beauty'][Math.floor(Math.random() * 5)],
        currentPrice,
        newPrice: Math.max(1, Math.round(currentPrice * (1 + change)))
      }
    }
  },
  {
    domain: 'payout', label: 'Payout', phase: 'LIVE OPERATIONS',
    apiPath: '/api/payout/payouts',
    decisions: ['APPROVE', 'HOLD', 'REJECT'],
    generate: (sellerId) => ({
      sellerId,
      amount: Math.floor(Math.random() * 5000) + 50,
      method: ['bank_transfer', 'paypal', 'check'][Math.floor(Math.random() * 3)]
    })
  },
  {
    domain: 'shipping', label: 'Shipping', phase: 'LIVE OPERATIONS',
    apiPath: '/api/shipping/shipments',
    decisions: ['APPROVE', 'FLAG', 'HOLD'],
    generate: (sellerId) => ({
      sellerId,
      address: ['123 Main St, New York, NY 10001', '456 Oak Ave, Los Angeles, CA 90001', '789 Pine Rd, Chicago, IL 60601', '321 Elm Dr, Houston, TX 77001'][Math.floor(Math.random() * 4)],
      carrier: ['USPS', 'FedEx', 'UPS', 'DHL'][Math.floor(Math.random() * 4)],
      weight: Math.round((Math.random() * 20 + 0.1) * 10) / 10,
      value: Math.floor(Math.random() * 500) + 10,
      category: ['electronics', 'fashion', 'home_goods', 'sports', 'beauty', 'toys'][Math.floor(Math.random() * 6)]
    })
  },
  {
    domain: 'returns', label: 'Returns', phase: 'LIVE OPERATIONS',
    apiPath: '/api/returns',
    decisions: ['APPROVE', 'INVESTIGATE', 'DENY'],
    generate: (sellerId) => ({
      sellerId,
      orderId: `ORD-${Date.now().toString(36).toUpperCase()}`,
      reason: ['defective', 'wrong_item', 'not_as_described', 'changed_mind', 'arrived_late'][Math.floor(Math.random() * 5)],
      refundAmount: Math.floor(Math.random() * 300) + 10,
      serialReturner: Math.random() > 0.7,
      emptyBox: Math.random() > 0.9,
      refundExceedsPurchase: Math.random() > 0.85,
      wardrobing: Math.random() > 0.8,
      fundsWithdrawn: Math.random() > 0.75
    })
  },
  {
    domain: 'ato', label: 'ATO', phase: 'SECURITY',
    apiPath: '/api/ato/evaluate',
    decisions: ['ALLOW', 'CHALLENGE', 'BLOCK'],
    generate: (sellerId) => ({
      sellerId,
      eventType: ['LOGIN_ATTEMPT', 'PASSWORD_CHANGE', 'EMAIL_CHANGE', 'BANK_CHANGE', 'MFA_DISABLED', 'SESSION_START'][Math.floor(Math.random() * 6)],
      deviceInfo: { fingerprint: `FP-${Math.random().toString(36).slice(2, 14)}` },
      location: { country: ['US', 'GB', 'DE', 'NG', 'RO', 'JP', 'BR'][Math.floor(Math.random() * 7)] }
    })
  },
  {
    domain: 'profile_updates', label: 'Profile Updates', phase: 'SECURITY',
    apiPath: '/api/profile-updates',
    decisions: ['ALLOW', 'STEP_UP', 'LOCK'],
    generate: (sellerId) => {
      const updateTypes = ['bank_change', 'email_change', 'phone_change', 'address_change', 'business_name_change']
      const type = updateTypes[Math.floor(Math.random() * updateTypes.length)]
      const changes = type === 'bank_change'
        ? { field: 'bank_account', old: '****1234', new: '****' + Math.floor(1000 + Math.random() * 8999) }
        : type === 'email_change'
        ? { field: 'email', old: 'old@example.com', new: 'new@example.com' }
        : { field: type.replace('_change', ''), old: 'previous', new: 'updated' }
      return {
        sellerId,
        updateType: type,
        changes: JSON.stringify(changes),
        openDispute: Math.random() > 0.7,
        newDevice: Math.random() > 0.6,
        emailDomainDowngrade: Math.random() > 0.8
      }
    }
  },
  {
    domain: 'payment', label: 'Payment', phase: 'EXTENDED',
    apiPath: '/api/payment',
    decisions: ['APPROVE', 'CHALLENGE', 'BLOCK'],
    generate: (sellerId) => ({
      sellerId,
      amount: Math.floor(Math.random() * 2000) + 5,
      cardBin: String(Math.floor(100000 + Math.random() * 899999)),
      cardLast4: String(Math.floor(1000 + Math.random() * 8999)),
      paymentType: ['credit', 'debit', 'prepaid', 'virtual'][Math.floor(Math.random() * 4)],
      currency: ['USD', 'EUR', 'GBP'][Math.floor(Math.random() * 3)],
      billingCountry: ['US', 'GB', 'DE', 'JP'][Math.floor(Math.random() * 4)],
      deviceFingerprint: `FP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
    })
  },
  {
    domain: 'compliance', label: 'Compliance', phase: 'EXTENDED',
    apiPath: '/api/compliance',
    decisions: ['APPROVE', 'REVIEW', 'BLOCK'],
    generate: (sellerId) => ({
      sellerId,
      checkType: ['aml_screening', 'sanctions_check', 'pep_screening', 'tax_compliance', 'crypto_monitoring'][Math.floor(Math.random() * 5)],
      transactionVolume: Math.floor(Math.random() * 500000) + 1000,
      jurisdiction: ['US', 'GB', 'DE', 'NG', 'RO', 'IR'][Math.floor(Math.random() * 6)],
      linkedAccounts: Math.floor(Math.random() * 5)
    })
  },
  {
    domain: 'network', label: 'Network Intelligence', phase: 'EXTENDED',
    apiPath: '/api/network',
    decisions: ['CLEAR', 'FLAG', 'BLOCK'],
    generate: (sellerId) => ({
      sellerId,
      scanType: ['ring_detection', 'mule_network', 'collusion', 'entity_resolution', 'dormant_reactivation'][Math.floor(Math.random() * 5)],
      linkedSellers: Math.floor(Math.random() * 8),
      sharedInfrastructure: Math.floor(Math.random() * 3),
      deviceFingerprints: Array.from({ length: Math.floor(Math.random() * 3) + 1 }, () => `FP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`).join(',')
    })
  },
  {
    domain: 'review', label: 'Review Integrity', phase: 'EXTENDED',
    apiPath: '/api/review',
    decisions: ['APPROVE', 'FLAG', 'REMOVE'],
    generate: (sellerId) => ({
      sellerId,
      reviewerAccount: `BUYER-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      rating: Math.floor(Math.random() * 5) + 1,
      reviewText: ['Great seller!', 'Fast shipping amazing product', 'Exactly as described', 'Best deal ever', 'Five stars'][Math.floor(Math.random() * 5)],
      purchaseDate: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000).toISOString().split('T')[0]
    })
  },
  {
    domain: 'behavioral', label: 'Behavioral Analytics', phase: 'EXTENDED',
    apiPath: '/api/behavioral',
    decisions: ['NORMAL', 'FLAG', 'CHALLENGE'],
    generate: (sellerId) => ({
      sellerId,
      sessionId: `SES-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      clickRate: Math.round((Math.random() * 49.9 + 0.1) * 10) / 10,
      typingSpeed: Math.floor(Math.random() * 480) + 20,
      browsingRatio: Math.round(Math.random() * 100) / 100,
      deviceFingerprint: `FP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
    })
  },
  {
    domain: 'buyer_trust', label: 'Buyer Trust', phase: 'EXTENDED',
    apiPath: '/api/buyer-trust',
    decisions: ['APPROVE', 'FLAG', 'RESTRICT'],
    generate: (sellerId) => ({
      sellerId,
      buyerId: `BUY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      purchaseAmount: Math.floor(Math.random() * 3000) + 10,
      isFirstPurchase: Math.random() > 0.5,
      chargebackHistory: Math.floor(Math.random() * 5),
      disputeCount: Math.floor(Math.random() * 10),
      deviceFingerprint: `FP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
    })
  },
  {
    domain: 'policy_enforcement', label: 'Policy Enforcement', phase: 'EXTENDED',
    apiPath: '/api/policy',
    decisions: ['CLEAR', 'WARN', 'RESTRICT'],
    generate: (sellerId) => ({
      sellerId,
      violationType: ['metrics_gaming', 'search_manipulation', 'repeat_offender', 'policy_violation'][Math.floor(Math.random() * 4)],
      complianceScore: Math.floor(Math.random() * 80) + 20,
      priorViolations: Math.floor(Math.random() * 5),
      linkedAccounts: Math.floor(Math.random() * 3)
    })
  }
]

// ── LifecycleFlow (duplicated from SellerRiskProfile.jsx — not exported) ──

function LifecycleFlow({ domainScores }) {
  const getNodeColor = (score) => {
    if (score >= 75) return { bg: 'bg-red-500/30', border: 'border-red-500', text: 'text-red-400' }
    if (score >= 50) return { bg: 'bg-orange-500/30', border: 'border-orange-500', text: 'text-orange-400' }
    if (score >= 25) return { bg: 'bg-amber-500/30', border: 'border-amber-500', text: 'text-amber-400' }
    return { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400' }
  }

  const preLaunch = ['onboarding', 'account_setup', 'item_setup', 'listing', 'pricing']
  const liveOps = ['transaction', 'payment', 'payout', 'shipping', 'returns']
  const security = ['ato', 'profile_updates']
  const extended = ['compliance', 'network', 'review', 'behavioral', 'buyer_trust', 'policy_enforcement']

  const renderNode = (domain) => {
    const score = Math.round(domainScores[domain] || 0)
    const colors = getNodeColor(score)
    const Icon = DOMAIN_ICONS[domain]
    return (
      <div key={domain} className={`flex flex-col items-center gap-1 p-2 rounded-lg border ${colors.bg} ${colors.border}`}>
        <Icon className={`w-4 h-4 ${colors.text}`} />
        <span className="text-[10px] text-gray-400 whitespace-nowrap">{DOMAIN_LABELS[domain]}</span>
        <span className={`text-sm font-bold font-mono ${colors.text}`}>{score}</span>
      </div>
    )
  }

  const renderArrow = () => (
    <div className="text-gray-600 flex items-center px-0.5">&rarr;</div>
  )

  return (
    <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2">Pre-Launch</div>
          <div className="flex items-center gap-1 flex-wrap">
            {preLaunch.map((d, i) => (
              <div key={d} className="flex items-center">
                {renderNode(d)}
                {i < preLaunch.length - 1 && renderArrow()}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2">Live Operations</div>
          <div className="flex items-center gap-1 flex-wrap">
            {liveOps.map((d, i) => (
              <div key={d} className="flex items-center">
                {renderNode(d)}
                {i < liveOps.length - 1 && renderArrow()}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2">Security</div>
          <div className="flex items-center gap-1 flex-wrap">
            {security.map((d, i) => (
              <div key={d} className="flex items-center">
                {renderNode(d)}
                {i < security.length - 1 && renderArrow()}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2">Extended</div>
          <div className="flex items-center gap-1 flex-wrap">
            {extended.map((d, i) => (
              <div key={d} className="flex items-center">
                {renderNode(d)}
                {i < extended.length - 1 && renderArrow()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CheckpointCard — each gets its own useAgentFlow instance ──

function CheckpointCard({ checkpoint, sellerId, isExpanded, onToggleExpand, isOnboardingSeller }) {
  const [correlationId, setCorrelationId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [decision, setDecision] = useState(null)
  const [error, setError] = useState(null)
  const { events, isConnected, isAgentRunning, agentDecision, clearEvents } = useAgentFlow(correlationId)

  useEffect(() => {
    if (agentDecision) {
      setSubmitting(false)
      setDecision(agentDecision.decision || agentDecision)
    }
  }, [agentDecision])

  const runEvaluation = useCallback(async () => {
    if (submitting) return
    clearEvents()
    setCorrelationId(null)
    setDecision(null)
    setError(null)
    setSubmitting(true)

    try {
      const payload = checkpoint.isCreate ? checkpoint.generate() : checkpoint.generate(sellerId)
      const res = await fetch(checkpoint.apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.correlationId) {
        setCorrelationId(data.correlationId)
      } else if (data.success === false) {
        setError(data.error || 'Request failed')
        setSubmitting(false)
      }
    } catch (e) {
      setError(e.message)
      setSubmitting(false)
    }
  }, [checkpoint, sellerId, submitting, clearEvents])

  const Icon = DOMAIN_ICONS[checkpoint.domain]
  const domainColor = DOMAIN_COLORS[checkpoint.domain]
  const decisionStr = typeof decision === 'string' ? decision : decision?.decision
  const style = decisionStr ? (DECISION_STYLES[decisionStr] || DECISION_STYLES.ERROR) : null
  const isOnboardingDone = checkpoint.isCreate && isOnboardingSeller

  return (
    <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-8 h-8 rounded-lg ${domainColor} bg-opacity-20 flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white">{checkpoint.label}</div>
          <div className="text-[10px] text-gray-500">{checkpoint.decisions.join(' / ')}</div>
        </div>

        {/* Decision chip */}
        {style && decisionStr && (
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text} border ${style.border}`}>
            <style.Icon className="w-3 h-3" />
            {decisionStr}
          </span>
        )}

        {/* Spinner while running */}
        {submitting && !decisionStr && (
          <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
        )}

        {/* Error */}
        {error && !submitting && (
          <span className="text-xs text-red-400 truncate max-w-[120px]" title={error}>Error</span>
        )}

        {/* Action buttons */}
        {isOnboardingDone ? (
          <span className="text-[10px] text-gray-600 px-2">Already evaluated</span>
        ) : (
          <button
            onClick={runEvaluation}
            disabled={submitting}
            className="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Running...' : decisionStr ? 'Re-run' : 'Run'}
          </button>
        )}

        {/* Expand toggle */}
        {correlationId && (
          <button onClick={onToggleExpand} className="p-1 text-gray-400 hover:text-white">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Expanded: AgentFlowViewer */}
      {isExpanded && correlationId && (
        <div className="border-t border-gray-800 p-4" style={{ height: '400px' }}>
          <AgentFlowViewer
            events={events}
            isConnected={isConnected}
            isRunning={isAgentRunning || submitting}
            correlationId={correlationId}
          />
        </div>
      )}
    </div>
  )
}

// ── Event Log ──

function EventLog({ events, domainFilter, setDomainFilter }) {
  const domains = ['all', 'onboarding', 'account_setup', 'item_setup', 'listing', 'pricing', 'payout', 'shipping', 'returns', 'ato', 'profile_updates']
  const filtered = domainFilter === 'all' ? events : events.filter(ev => ev.domain === domainFilter)

  return (
    <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          Event Log
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {domains.map(d => (
            <button
              key={d}
              onClick={() => setDomainFilter(d)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                domainFilter === d
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {d === 'all' ? 'All' : DOMAIN_LABELS[d]}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-auto max-h-[300px]">
        <table className="w-full">
          <thead className="bg-[#0d0d14] sticky top-0">
            <tr className="text-xs text-gray-500">
              <th className="px-4 py-2 text-left font-medium">Time</th>
              <th className="px-4 py-2 text-left font-medium">Domain</th>
              <th className="px-4 py-2 text-left font-medium">Event</th>
              <th className="px-4 py-2 text-left font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? filtered.map((ev, i) => {
              const DIcon = DOMAIN_ICONS[ev.domain] || Activity
              return (
                <tr key={i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-xs text-gray-400">
                    {new Date(ev.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5">
                      <DIcon className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-300">{DOMAIN_LABELS[ev.domain] || ev.domain}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-white">{ev.eventType || ev.type}</td>
                  <td className="px-4 py-2 text-xs font-mono text-gray-300">
                    {typeof ev.originalScore === 'number' ? ev.originalScore.toFixed(1) : (ev.score || '-')}
                  </td>
                </tr>
              )
            }) : (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">No events found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Page ──

export default function SellerJourney() {
  const [sellers, setSellers] = useState([])
  const [selectedSellerId, setSelectedSellerId] = useState('')
  const [profile, setProfile] = useState(null)
  const [events, setEvents] = useState([])
  const [domainFilter, setDomainFilter] = useState('all')
  const [expandedCheckpoint, setExpandedCheckpoint] = useState(null)
  const [loading, setLoading] = useState(false)
  const [runningAll, setRunningAll] = useState(false)
  const checkpointRefs = useRef({})
  const refreshTimerRef = useRef(null)

  // Fetch sellers for picker
  useEffect(() => {
    fetch(`${API_BASE}/onboarding/sellers?limit=50`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) setSellers(data.data)
      })
      .catch(() => {})
  }, [])

  // Fetch risk profile + events when seller selected
  const fetchProfile = useCallback(async (sellerId) => {
    if (!sellerId) return
    setLoading(true)
    try {
      const [profileRes, eventsRes] = await Promise.all([
        fetch(`${API_BASE}/risk-profile/${sellerId}`),
        fetch(`${API_BASE}/risk-profile/${sellerId}/events`)
      ])
      const [profileData, eventsData] = await Promise.all([profileRes.json(), eventsRes.json()])
      if (profileData.success) setProfile(profileData.data)
      else setProfile(null)
      if (eventsData.success) setEvents(eventsData.data || [])
      else setEvents([])
    } catch {
      setProfile(null)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedSellerId) {
      fetchProfile(selectedSellerId)
      setExpandedCheckpoint(null)
    } else {
      setProfile(null)
      setEvents([])
    }
  }, [selectedSellerId, fetchProfile])

  // Debounced profile refresh (called after checkpoint completes)
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      if (selectedSellerId) fetchProfile(selectedSellerId)
    }, 2000)
  }, [selectedSellerId, fetchProfile])

  // "Run All" — triggers checkpoints sequentially with delay
  const handleRunAll = useCallback(async () => {
    if (!selectedSellerId || runningAll) return
    setRunningAll(true)

    // Skip onboarding (isCreate) for existing sellers
    const toRun = CHECKPOINTS.filter(c => !c.isCreate)
    for (let i = 0; i < toRun.length; i++) {
      const domain = toRun[i].domain
      const ref = checkpointRefs.current[domain]
      if (ref?.runEvaluation) {
        ref.runEvaluation()
        if (i < toRun.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    }

    // Schedule a profile refresh after all are kicked off
    setTimeout(() => {
      setRunningAll(false)
      scheduleRefresh()
    }, 3000)
  }, [selectedSellerId, runningAll, scheduleRefresh])

  const tierColor = profile?.tier ? (TIER_COLORS[profile.tier] || TIER_COLORS.LOW) : TIER_COLORS.LOW

  const getScoreColor = (score) => {
    if (score >= 75) return 'text-red-400'
    if (score >= 50) return 'text-orange-400'
    if (score >= 25) return 'text-amber-400'
    return 'text-emerald-400'
  }

  // Group checkpoints by phase
  const phases = [
    { name: 'PRE-LAUNCH', checkpoints: CHECKPOINTS.filter(c => c.phase === 'PRE-LAUNCH') },
    { name: 'LIVE OPERATIONS', checkpoints: CHECKPOINTS.filter(c => c.phase === 'LIVE OPERATIONS') },
    { name: 'SECURITY', checkpoints: CHECKPOINTS.filter(c => c.phase === 'SECURITY') }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
              <Shield className="w-6 h-6 text-white" />
            </div>
            Seller Journey
          </h1>
          <p className="text-gray-400 mt-1">Evaluate across all seller lifecycle checkpoints</p>
        </div>
        {selectedSellerId && (
          <button
            onClick={handleRunAll}
            disabled={runningAll || !selectedSellerId}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            {runningAll ? 'Running All...' : 'Run All'}
          </button>
        )}
      </div>

      {/* Seller Picker */}
      <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
        <label className="block text-xs text-gray-400 mb-2">Select Seller</label>
        <select
          value={selectedSellerId}
          onChange={e => setSelectedSellerId(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">Choose a seller...</option>
          {sellers.map(s => (
            <option key={s.sellerId} value={s.sellerId}>
              {s.sellerId} - {s.businessName || 'Unknown'}
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      )}

      {/* Risk Profile Summary */}
      {selectedSellerId && !loading && (
        <>
          {profile ? (
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className={`text-3xl font-bold font-mono ${getScoreColor(profile.compositeScore || 0)}`}>
                    {Math.round(profile.compositeScore || 0)}
                  </div>
                  <div className="text-xs text-gray-500">Composite<br/>Score</div>
                </div>
                <div className="h-8 w-px bg-gray-700" />
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${tierColor.bg} ${tierColor.text}`}>
                  {profile.tier || 'LOW'}
                </span>
                <div className="h-8 w-px bg-gray-700" />
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-300">{events.length} events</span>
                </div>
                {profile.activeActions?.length > 0 && (
                  <>
                    <div className="h-8 w-px bg-gray-700" />
                    <div className="flex flex-wrap gap-1.5">
                      {profile.activeActions.map((action, i) => (
                        <span key={i} className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                          {action.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => fetchProfile(selectedSellerId)}
                  className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
                  title="Refresh profile"
                >
                  <RefreshCw className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#12121a] rounded-xl border border-gray-800 p-4 text-center text-sm text-gray-500">
              No risk profile yet for this seller
            </div>
          )}

          {/* Lifecycle Flow */}
          {profile?.domainScores && (
            <LifecycleFlow domainScores={profile.domainScores} />
          )}

          {/* Checkpoint Cards by Phase */}
          <div className="space-y-4">
            {phases.map(phase => (
              <div key={phase.name}>
                <div className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold mb-2 px-1">
                  {phase.name}
                </div>
                <div className="space-y-2">
                  {phase.checkpoints.map(cp => (
                    <CheckpointCard
                      key={cp.domain}
                      checkpoint={cp}
                      sellerId={selectedSellerId}
                      isExpanded={expandedCheckpoint === cp.domain}
                      onToggleExpand={() => setExpandedCheckpoint(
                        expandedCheckpoint === cp.domain ? null : cp.domain
                      )}
                      isOnboardingSeller={cp.isCreate}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Event Log */}
          <EventLog
            events={events}
            domainFilter={domainFilter}
            setDomainFilter={setDomainFilter}
          />
        </>
      )}
    </div>
  )
}
