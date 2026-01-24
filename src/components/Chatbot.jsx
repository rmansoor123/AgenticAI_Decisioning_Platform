import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, X, Bot, User, Sparkles, ChevronDown } from 'lucide-react'

// Knowledge base about the platform
const knowledgeBase = {
  // Agent explanations
  agents: {
    overview: `This platform has 3 autonomous AI agents that work together:

1. **Fraud Investigation Agent** - Investigates suspicious transactions by gathering evidence from multiple sources, running ML models, and making recommendations.

2. **Rule Optimization Agent** - Continuously analyzes rule performance, finds underperforming rules, discovers new fraud patterns, and suggests improvements.

3. **Alert Triage Agent** - Prioritizes incoming alerts by urgency, groups related alerts, and routes them to the right analysts.

Each agent follows a Think → Plan → Act → Observe loop, making autonomous decisions while explaining their reasoning.`,

    investigation: `**Fraud Investigation Agent**

**Role:** Deep investigation of suspicious transactions

**How it works:**
1. THINK - Analyzes the alert type and determines investigation strategy
2. PLAN - Creates a multi-step plan using available tools
3. ACT - Executes tools like:
   - check_velocity (transaction frequency analysis)
   - verify_device (device fingerprint & trust score)
   - analyze_history (user transaction history)
   - query_ml_model (get ML fraud predictions)
   - check_network (find linked accounts)
   - analyze_location (geo anomaly detection)
4. OBSERVE - Analyzes all evidence, calculates risk, generates recommendation

**Output:** Investigation report with:
- Risk factors identified
- Evidence gathered
- Recommendation (APPROVE/REVIEW/BLOCK)
- Confidence score
- Human-readable reasoning`,

    optimization: `**Rule Optimization Agent**

**Role:** Continuously improve fraud detection rules

**How it works:**
1. Analyzes performance metrics of all 50+ rules
2. Identifies underperforming rules (high false positives)
3. Finds redundant/overlapping rules
4. Discovers emerging fraud patterns not covered by existing rules
5. Generates actionable recommendations

**Capabilities:**
- Rule performance analysis
- Threshold optimization simulation
- Pattern discovery from fraud cases
- A/B test design for rule changes

**Output:** Optimization report with:
- Rule health score
- Underperforming rules list
- New fraud patterns discovered
- Prioritized recommendations`,

    triage: `**Alert Triage Agent**

**Role:** Intelligently prioritize and route fraud alerts

**How it works:**
1. Fetches all pending alerts from the queue
2. Calculates priority score based on:
   - Transaction amount (30%)
   - Risk score (25%)
   - Customer tier (VIP/Premium/Standard) (20%)
   - Alert type (15%)
   - Time in queue (10%)
3. Groups related alerts (same user, device, or pattern)
4. Matches alerts to analysts based on expertise and workload

**Routing Rules:**
- HIGH_VALUE → Senior Analyst
- ATO alerts → ATO Specialist Team
- Chargebacks → Disputes Team
- New patterns → ML Team

**Output:** Triage report with:
- Prioritized alert list
- Alert groupings
- Analyst assignments
- Queue health status`
  },

  // Platform architecture
  architecture: {
    overview: `**4-Layer Decisioning Architecture:**

1. **Data Foundation** - Real-time data ingestion & feature engineering
   - Real-time streaming (Kafka)
   - Near real-time micro-batching
   - Batch processing for historical analysis
   - Feature store with 2,840+ features

2. **ML Models** - Ensemble of fraud detection models
   - 15 specialized models
   - Real-time inference (<25ms latency)
   - Automatic drift detection
   - Hourly model retraining

3. **Decision Engine** - Rules + ML score aggregation
   - 50+ active rules
   - Visual Rule Builder
   - Real-time evaluation
   - Full audit trail

4. **Experimentation** - A/B testing & simulation
   - Shadow mode testing
   - Champion/Challenger experiments
   - Threshold simulation
   - Impact analysis`,

    dataLayer: `**Data Foundation Layer**

Handles all data ingestion and feature engineering:

**Pipeline Types:**
- Real-time: Kafka streaming, <5ms latency, 12.5K events/sec
- Near real-time: Micro-batching, 1-5 min windows
- Batch: Scheduled jobs for historical analysis

**Capabilities:**
- 47 connected data sources
- 2,840 computed features
- Data catalog with lineage tracking
- Query federation (SQL playground)
- Data quality monitoring`,

    mlLayer: `**ML Models Layer**

Manages fraud detection models:

**Models in Production:**
- Fraud Detector v3 (98.7% accuracy)
- Velocity Anomaly Model
- Device Trust Model
- ATO Detector
- Seller Risk Model
- Payment Anomaly Model

**Capabilities:**
- Model registry with versioning
- Real-time inference API
- Drift detection & alerts
- Automatic retraining triggers
- Model governance & approval workflow`,

    decisionEngine: `**Decision Engine Layer**

Combines ML scores with business rules:

**Rule Types:**
- Threshold rules (amount > $5000)
- ML-based rules (fraud_score > 0.8)
- Velocity rules (>5 txns in 1 hour)
- Attribute rules (new device + high risk country)
- Composite rules (combining multiple conditions)

**Rule Builder Features:**
- Visual rule creation
- Call ML models from rules
- Lookup datasets (blocklists, etc.)
- Test against historical data
- See estimated trigger rate

**Actions:** APPROVE, REVIEW, BLOCK`,

    experimentation: `**Experimentation Layer**

Test changes safely before full deployment:

**Experiment Types:**
- A/B Tests: Split traffic between control/treatment
- Shadow Mode: Run new rules without affecting decisions
- Champion/Challenger: Compare new model vs current
- Threshold Testing: Simulate threshold changes

**Simulation Engine:**
- Test rule changes against historical data
- See projected impact on catch rate & false positives
- Estimate revenue protected vs customer friction`
  },

  // How things work
  howTo: {
    ruleBuilder: `**How to Create a Rule:**

1. Go to Decision Engine → Rule Builder
2. Enter rule name and description
3. Add conditions:
   - **Attribute**: Check transaction fields (amount > 5000)
   - **ML Model**: Call a model (fraud_score > 0.8)
   - **Dataset**: Lookup (user in blocklist)
4. Choose action: APPROVE, REVIEW, or BLOCK
5. Click "Run Against Historical Data" to test
6. Review estimated trigger rate and sample matches
7. Save the rule

**Example Rule:**
IF ML(fraud-detector-v3).score > 0.75
AND amount > 2000
AND is_new_device = true
THEN BLOCK`,

    transactionFlow: `**How a Transaction Flows Through the System:**

1. **Data Ingestion** (3ms)
   - Transaction received via API
   - Validated and enriched
   - Stored in real-time database

2. **Feature Engineering** (5ms)
   - Compute real-time features (velocity, device age)
   - Lookup historical features (user risk score)
   - Aggregate signals

3. **ML Inference** (12ms)
   - Run through fraud detection models
   - Get fraud probability score
   - Identify top contributing features

4. **Rule Evaluation** (8ms)
   - Evaluate against 50+ active rules
   - Check ML thresholds
   - Apply business logic

5. **Final Decision** (2ms)
   - Aggregate all signals
   - Make decision: APPROVE/REVIEW/BLOCK
   - Log for audit trail

6. **Experiment Logging** (1ms)
   - Record for A/B analysis
   - Track variant assignment

**Total Latency: ~31ms**`,

    investigation: `**How to Run an Investigation:**

**Option 1: Via UI**
1. Go to Agentic AI page
2. Enter a transaction ID
3. Click "Investigate"
4. View the multi-agent collaboration results

**Option 2: Via API**
POST /api/agents/investigate
{
  "transactionId": "TXN-123",
  "alertType": "HIGH_VALUE"
}

**What happens:**
1. Alert Triage Agent assesses priority
2. Investigation Agent gathers evidence
3. Rule Optimizer checks for pattern coverage
4. Final recommendation generated with reasoning`
  },

  // Business services
  services: {
    overview: `**5 Business Microservices:**

1. **Seller Onboarding** (/api/onboarding)
   - New seller registration
   - KYC verification
   - Risk assessment
   - Watchlist screening

2. **Account Takeover Prevention** (/api/ato)
   - Login anomaly detection
   - Device fingerprinting
   - Session analysis
   - MFA triggers

3. **Seller Payout** (/api/payout)
   - Payout risk scoring
   - Velocity checks
   - Bank verification
   - Hold management

4. **Listing Management** (/api/listing)
   - Content moderation
   - Price anomaly detection
   - Counterfeit detection
   - Policy compliance

5. **Shipping & Fulfillment** (/api/shipping)
   - Address verification
   - Delivery risk assessment
   - Reshipping detection`
  },

  // Agentic AI concepts
  agenticConcepts: {
    whatIsAgentic: `**What is Agentic AI?**

Agentic AI refers to AI systems that can:

1. **Autonomously reason** - Understand problems and context
2. **Plan multi-step actions** - Break down goals into tasks
3. **Use tools** - Call APIs, query databases, run models
4. **Learn from experience** - Maintain memory across interactions
5. **Collaborate** - Work with other agents and humans

**Key difference from traditional AI:**
- Traditional: Input → Model → Output (one-shot)
- Agentic: Goal → Think → Plan → Act → Observe → Iterate

Our agents follow the **ReAct pattern** (Reasoning + Acting):
- THINK: Analyze the situation
- PLAN: Create action sequence
- ACT: Execute tools
- OBSERVE: Evaluate results
- ITERATE: Adjust if needed`,

    orchestrator: `**Agent Orchestrator**

The orchestrator coordinates multi-agent workflows:

**Responsibilities:**
- Manages agent lifecycle
- Routes tasks to appropriate agents
- Coordinates collaboration
- Handles human-in-the-loop escalations
- Maintains global state

**Workflow Example: Full Investigation**
1. Alert Triage Agent → Prioritize alert
2. Investigation Agent → Gather evidence
3. Rule Optimizer → Check coverage
4. Generate combined report

**Collaboration Strategies:**
- Sequential: Agents work one after another
- Parallel: Agents work simultaneously
- Consensus: Agents vote on decisions`,

    memory: `**Agent Memory System**

Each agent has 3 types of memory:

1. **Short-term Memory**
   - Recent interactions (last 100)
   - Current context
   - Auto-trimmed when full

2. **Long-term Memory**
   - Persistent knowledge
   - Important patterns learned
   - Consolidated from short-term

3. **Working Memory**
   - Current task state
   - Active investigation data
   - Cleared after task completion

This allows agents to:
- Learn from past investigations
- Recognize recurring patterns
- Improve over time`
  }
}

// Function to find best matching answer
function findAnswer(question) {
  const q = question.toLowerCase()

  // Agent-related questions
  if (q.includes('agent') && (q.includes('what') || q.includes('how') || q.includes('explain'))) {
    if (q.includes('investigation') || q.includes('investigator') || q.includes('fraud')) {
      return knowledgeBase.agents.investigation
    }
    if (q.includes('optimization') || q.includes('optimizer') || q.includes('rule')) {
      return knowledgeBase.agents.optimization
    }
    if (q.includes('triage') || q.includes('alert') || q.includes('priorit')) {
      return knowledgeBase.agents.triage
    }
    return knowledgeBase.agents.overview
  }

  // Agentic AI concepts
  if (q.includes('agentic') || q.includes('what is agent')) {
    return knowledgeBase.agenticConcepts.whatIsAgentic
  }
  if (q.includes('orchestrat')) {
    return knowledgeBase.agenticConcepts.orchestrator
  }
  if (q.includes('memory')) {
    return knowledgeBase.agenticConcepts.memory
  }

  // Architecture questions
  if (q.includes('architect') || q.includes('layer') || q.includes('overview')) {
    return knowledgeBase.architecture.overview
  }
  if (q.includes('data') && (q.includes('layer') || q.includes('foundation') || q.includes('ingestion'))) {
    return knowledgeBase.architecture.dataLayer
  }
  if (q.includes('ml') || q.includes('model') && q.includes('layer')) {
    return knowledgeBase.architecture.mlLayer
  }
  if (q.includes('decision') && q.includes('engine')) {
    return knowledgeBase.architecture.decisionEngine
  }
  if (q.includes('experiment') || q.includes('a/b') || q.includes('simulation')) {
    return knowledgeBase.architecture.experimentation
  }

  // How-to questions
  if (q.includes('rule') && (q.includes('create') || q.includes('build') || q.includes('write'))) {
    return knowledgeBase.howTo.ruleBuilder
  }
  if (q.includes('transaction') && q.includes('flow')) {
    return knowledgeBase.howTo.transactionFlow
  }
  if (q.includes('investigat') && q.includes('how')) {
    return knowledgeBase.howTo.investigation
  }

  // Services
  if (q.includes('service') || q.includes('microservice') || q.includes('api')) {
    return knowledgeBase.services.overview
  }

  // Default responses
  if (q.includes('help') || q.includes('what can')) {
    return `I can answer questions about:

**Agents:**
- "How does the Investigation Agent work?"
- "What does the Rule Optimizer do?"
- "Explain the Alert Triage Agent"

**Architecture:**
- "What is the 4-layer architecture?"
- "How does the ML layer work?"
- "Explain the Decision Engine"

**How-To:**
- "How do I create a rule?"
- "How does a transaction flow through the system?"
- "How do I run an investigation?"

**Concepts:**
- "What is Agentic AI?"
- "How does the orchestrator work?"
- "Explain agent memory"

Just ask any question!`
  }

  return `I don't have a specific answer for that question. Try asking about:
- How the agents work
- The 4-layer architecture
- How to create rules
- How transactions flow through the system
- What is Agentic AI

Type "help" to see all available topics.`
}

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi! I'm your AI assistant for the Fraud Detection Platform.

I can answer questions about:
- How the 3 AI agents work
- The 4-layer architecture
- How to create rules
- Transaction flow
- Agentic AI concepts

What would you like to know?`
    }
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsTyping(true)

    // Simulate thinking delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500))

    const answer = findAnswer(userMessage)
    setIsTyping(false)
    setMessages(prev => [...prev, { role: 'assistant', content: answer }])
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const suggestedQuestions = [
    "How do the agents work?",
    "Explain the architecture",
    "How do I create a rule?",
    "What is Agentic AI?"
  ]

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 p-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 rounded-full shadow-lg transition-all z-50 ${isOpen ? 'scale-0' : 'scale-100'}`}
      >
        <MessageSquare className="w-6 h-6 text-white" />
      </button>

      {/* Chat Window */}
      <div className={`fixed bottom-6 right-6 w-96 bg-[#12121a] border border-gray-800 rounded-2xl shadow-2xl transition-all z-50 ${isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-medium text-white">Platform Assistant</div>
              <div className="text-xs text-gray-400">Ask me anything</div>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-gray-800 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Messages */}
        <div className="h-96 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                msg.role === 'user' ? 'bg-blue-500/20' : 'bg-violet-500/20'
              }`}>
                {msg.role === 'user' ? (
                  <User className="w-4 h-4 text-blue-400" />
                ) : (
                  <Bot className="w-4 h-4 text-violet-400" />
                )}
              </div>
              <div className={`flex-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                <div className={`inline-block p-3 rounded-xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-500/20 text-white'
                    : 'bg-gray-800/50 text-gray-200'
                }`}>
                  <div className="whitespace-pre-wrap prose prose-invert prose-sm max-w-none">
                    {msg.content.split('\n').map((line, j) => {
                      // Handle bold text
                      const parts = line.split(/(\*\*[^*]+\*\*)/g)
                      return (
                        <div key={j} className={line.startsWith('-') ? 'ml-2' : ''}>
                          {parts.map((part, k) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return <strong key={k} className="text-white">{part.slice(2, -2)}</strong>
                            }
                            return <span key={k}>{part}</span>
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-violet-400" />
              </div>
              <div className="bg-gray-800/50 rounded-xl p-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Questions */}
        {messages.length <= 2 && (
          <div className="px-4 pb-2">
            <div className="text-xs text-gray-500 mb-2">Suggested questions:</div>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(q)
                    setTimeout(() => handleSend(), 100)
                  }}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-full text-xs text-gray-300 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about agents, architecture..."
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-violet-500 focus:outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 rounded-xl transition-colors"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
