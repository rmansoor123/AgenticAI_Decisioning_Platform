import { useEffect, useRef, Component } from 'react'
import {
  Brain, CheckCircle, XCircle, AlertTriangle, Shield, Scale, Lock, Eye,
  Loader2, Wifi, WifiOff, Wrench, Zap, Search, Target, Lightbulb,
  ClipboardList, Play, Pause, Gavel, ChevronDown, ChevronRight
} from 'lucide-react'
import { useState } from 'react'

// Error boundary to prevent agent viewer crashes from breaking the whole page
class AgentFlowErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-[#0d0d14] rounded-xl border border-red-800 p-6">
          <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
          <p className="text-sm text-red-400 font-semibold">Agent Flow Viewer Error</p>
          <p className="text-xs text-gray-500 mt-1 max-w-sm text-center">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 px-3 py-1 text-xs bg-gray-800 text-gray-300 rounded hover:bg-gray-700">
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Step-level config ──
const STEP_CONFIG = {
  THINK:       { icon: Brain,         color: 'cyan',    label: 'Think' },
  PLAN:        { icon: ClipboardList,  color: 'violet',  label: 'Plan' },
  ACT:         { icon: Play,          color: 'indigo',  label: 'Act' },
  OBSERVE:     { icon: Search,        color: 'blue',    label: 'Observe' },
  REFLECT:     { icon: Lightbulb,     color: 'amber',   label: 'Reflect' },
  INVESTIGATE: { icon: Target,        color: 'purple',  label: 'Investigate' },
  POLICY:      { icon: Shield,        color: 'red',     label: 'Policy' },
  JUDGE:       { icon: Gavel,         color: 'orange',  label: 'Judge' },
}

function getSourceBadge(source) {
  if (!source || source === 'simulation') return null
  const colors = {
    'ip-api': 'bg-blue-500/20 text-blue-300',
    'abuseipdb': 'bg-purple-500/20 text-purple-300',
    'emailrep': 'bg-green-500/20 text-green-300',
    'abstractapi': 'bg-teal-500/20 text-teal-300',
    'ofac-local': 'bg-red-500/20 text-red-300',
    'stopforumspam': 'bg-orange-500/20 text-orange-300',
    'opencorporates': 'bg-indigo-500/20 text-indigo-300',
    'nominatim': 'bg-cyan-500/20 text-cyan-300',
    'aba-checksum': 'bg-emerald-500/20 text-emerald-300',
    'deterministic-model': 'bg-amber-500/20 text-amber-300',
    'format-validation': 'bg-yellow-500/20 text-yellow-300',
    'internal': 'bg-gray-500/20 text-gray-300',
  }
  return (
    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded ${colors[source] || 'bg-gray-500/20 text-gray-300'}`}>
      {source}
    </span>
  )
}

// ── Step Card ──
function StepCard({ step, events }) {
  const [expanded, setExpanded] = useState(true)
  const config = STEP_CONFIG[step] || STEP_CONFIG.THINK
  const Icon = config.icon
  // Use the LAST occurrence so multi-turn investigation shows latest state
  const allStarts = events.filter(e => e.type === 'agent:step:start' && e.data?.step === step)
  const allCompletes = events.filter(e => e.type === 'agent:step:complete' && e.data?.step === step)
  const startEvt = allStarts[allStarts.length - 1]
  const completeEvt = allCompletes[allCompletes.length - 1]
  const isRunning = allStarts.length > allCompletes.length
  const roundCount = allStarts.length
  const data = completeEvt?.data || {}

  return (
    <div className={`rounded-xl border bg-${config.color}-500/5 border-${config.color}-500/20 overflow-hidden`}>
      {/* Step header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-${config.color}-500/10 transition-colors`}
      >
        <div className="flex-shrink-0">
          {isRunning ? (
            <Loader2 className={`w-4 h-4 text-${config.color}-400 animate-spin`} />
          ) : completeEvt ? (
            <Icon className={`w-4 h-4 text-${config.color}-400`} />
          ) : (
            <Icon className="w-4 h-4 text-gray-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${completeEvt || isRunning ? `text-${config.color}-400` : 'text-gray-600'}`}>
              {config.label}
            </span>
            {isRunning && <span className="text-[10px] text-gray-500 animate-pulse">running...</span>}
            {roundCount > 1 && <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">round {roundCount}</span>}
            {data.llmEnhanced && <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">LLM</span>}
            {data.skipped && <span className="text-[10px] px-1 py-0.5 rounded bg-gray-500/20 text-gray-400">skipped</span>}
          </div>
          {startEvt?.data?.description && !expanded && (
            <p className="text-[10px] text-gray-500 truncate">{safeString(startEvt.data.description)}</p>
          )}
        </div>
        {completeEvt && (expanded ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />)}
      </button>

      {/* Step details */}
      {expanded && completeEvt && (
        <div className="px-4 pb-3 space-y-1.5">
          {/* THINK details */}
          {step === 'THINK' && (
            <>
              {data.understanding && <DetailRow label="Understanding" value={data.understanding} />}
              {data.keyRisks?.length > 0 && <DetailRow label="Key Risks" value={data.keyRisks.join(', ')} />}
              {data.confidence != null && <DetailRow label="Confidence" value={`${(data.confidence * 100).toFixed(0)}%`} />}
              {data.suggestedApproach && <DetailRow label="Approach" value={data.suggestedApproach} />}
              {data.patternMatches > 0 && <DetailRow label="Pattern Matches" value={`${data.patternMatches} similar past case(s)`} />}
            </>
          )}

          {/* PLAN details */}
          {step === 'PLAN' && (
            <>
              {data.goal && <DetailRow label="Goal" value={data.goal} />}
              {data.reasoning && <DetailRow label="Reasoning" value={data.reasoning} />}
              {data.actions?.length > 0 && (
                <div className="mt-1">
                  <span className="text-[10px] text-gray-500 font-semibold">Planned Tools ({data.actionCount}):</span>
                  <div className="mt-1 space-y-0.5">
                    {data.actions.map((a, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[10px]">
                        <span className="text-indigo-400 font-mono flex-shrink-0">{i + 1}.</span>
                        <span className="text-gray-300 font-mono">{safeString(a.tool)}</span>
                        {a.rationale && <span className="text-gray-500 truncate">— {safeString(a.rationale)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* OBSERVE details */}
          {step === 'OBSERVE' && (
            <>
              {data.decision && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 font-semibold">Proposed Decision:</span>
                  <DecisionChip decision={data.decision} />
                </div>
              )}
              {data.riskScore != null && <DetailRow label="Risk Score" value={`${data.riskScore}/100`} />}
              {data.confidence != null && <DetailRow label="Confidence" value={`${(data.confidence * 100).toFixed(0)}%`} />}
              {data.reasoning && <DetailRow label="Reasoning" value={data.reasoning} />}
              {data.riskFactors?.length > 0 && (
                <div className="mt-1">
                  <span className="text-[10px] text-gray-500 font-semibold">Risk Factors:</span>
                  {data.riskFactors.map((f, i) => (
                    <div key={i} className="text-[10px] text-amber-300 ml-2">- {typeof f === 'string' ? f : f.factor || JSON.stringify(f)}</div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* REFLECT details */}
          {step === 'REFLECT' && (
            <>
              <DetailRow label="Should Revise" value={data.shouldRevise ? 'Yes' : 'No'} />
              {data.concerns?.length > 0 && (
                <div className="mt-1">
                  <span className="text-[10px] text-gray-500 font-semibold">Concerns:</span>
                  {data.concerns.map((c, i) => (
                    <div key={i} className="text-[10px] text-amber-300 ml-2">- {safeString(c)}</div>
                  ))}
                </div>
              )}
              {data.revisedAction && <DetailRow label="Revised To" value={data.revisedAction} />}
              {data.concerns?.length === 0 && <DetailRow label="Result" value="No concerns — decision upheld" />}
            </>
          )}

          {/* INVESTIGATE details */}
          {step === 'INVESTIGATE' && (
            <>
              {data.description && <DetailRow label="Result" value={data.description} />}
              {data.actionsExecuted != null && <DetailRow label="Follow-up Actions" value={`${data.actionsExecuted} additional tool(s) executed`} />}
              {data.investigationRound && <DetailRow label="Round" value={data.investigationRound} />}
            </>
          )}

          {/* POLICY details */}
          {step === 'POLICY' && (
            <>
              <DetailRow label="Allowed" value={data.allowed ? 'Yes — no policy violations' : 'No — overridden'} />
              {data.violations?.length > 0 && (
                <div className="mt-1">
                  <span className="text-[10px] text-gray-500 font-semibold">Violations:</span>
                  {data.violations.map((v, i) => (
                    <div key={i} className="text-[10px] text-red-300 ml-2">
                      - [{v.severity}] {v.policyId}: {v.message}
                    </div>
                  ))}
                </div>
              )}
              {data.enforcedAction && <DetailRow label="Enforced Action" value={data.enforcedAction} />}
              {data.flags?.length > 0 && <DetailRow label="Flags" value={data.flags.map(f => typeof f === 'string' ? f : (f.policyId || f.message || JSON.stringify(f))).join(', ')} />}
            </>
          )}

          {/* JUDGE details */}
          {step === 'JUDGE' && (
            <>
              {data.skipped ? (
                <DetailRow label="Skipped" value={data.reason} />
              ) : (
                <>
                  {data.quality != null && <DetailRow label="Quality Score" value={`${(data.quality * 100).toFixed(0)}%`} />}
                  <DetailRow label="Recommendation" value={data.recommendation || 'N/A'} />
                  {data.reasoning && <DetailRow label="Reasoning" value={data.reasoning} />}
                  {data.issues?.length > 0 && (
                    <div className="mt-1">
                      <span className="text-[10px] text-gray-500 font-semibold">Issues:</span>
                      {data.issues.map((iss, i) => (
                        <div key={i} className="text-[10px] text-orange-300 ml-2">- {safeString(iss)}</div>
                      ))}
                    </div>
                  )}
                  {data.judgeAgent && <DetailRow label="Judge Agent" value={data.judgeAgent} />}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function safeString(val) {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (Array.isArray(val)) return val.map(safeString).join(', ')
  if (typeof val === 'object') {
    // Special handling for common structures
    if (val.action) return `${val.action}${val.confidence ? ` (${(val.confidence * 100).toFixed(0)}%)` : ''}${val.reason ? ` — ${val.reason}` : ''}`
    return JSON.stringify(val)
  }
  return String(val)
}

function DetailRow({ label, value }) {
  const display = safeString(value)
  return (
    <div className="flex items-start gap-2 text-[10px]">
      <span className="text-gray-500 font-semibold flex-shrink-0 w-24">{label}:</span>
      <span className="text-gray-300 break-words">{display}</span>
    </div>
  )
}

function DecisionChip({ decision }) {
  const label = typeof decision === 'object' && decision !== null ? (decision.action || JSON.stringify(decision)) : String(decision || '')
  const colors = {
    APPROVE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    REJECT: 'bg-red-500/20 text-red-400 border-red-500/40',
    REVIEW: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    BLOCK: 'bg-red-500/20 text-red-400 border-red-500/40',
  }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${colors[label] || 'bg-gray-500/20 text-gray-400 border-gray-500/40'}`}>
      {label}
    </span>
  )
}

// ── Tool Action Card ──
function ToolCard({ startEvt, completeEvt }) {
  const [expanded, setExpanded] = useState(false)
  const toolName = startEvt?.data?.action || completeEvt?.data?.action || 'unknown'
  const isRunning = startEvt && !completeEvt
  const success = completeEvt?.data?.success !== false
  const data = completeEvt?.data || {}

  return (
    <div className={`ml-6 rounded-lg border p-2 ${
      isRunning ? 'bg-indigo-500/5 border-indigo-500/20' :
      success ? 'bg-emerald-500/5 border-emerald-500/20' :
      'bg-red-500/5 border-red-500/20'
    }`}>
      <button
        onClick={() => completeEvt && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left"
      >
        {isRunning ? (
          <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin flex-shrink-0" />
        ) : success ? (
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-gray-200">{toolName}</span>
            {data.source && getSourceBadge(data.source)}
            {data.riskScore != null && (
              <span className={`text-[10px] px-1 py-0.5 rounded ${
                data.riskScore >= 70 ? 'bg-red-500/20 text-red-300' :
                data.riskScore >= 40 ? 'bg-amber-500/20 text-amber-300' :
                'bg-emerald-500/20 text-emerald-300'
              }`}>risk: {data.riskScore}</span>
            )}
          </div>
          {data.summary && <p className="text-[10px] text-gray-400 truncate">{safeString(data.summary)}</p>}
        </div>

        {completeEvt && (expanded ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />)}
      </button>

      {expanded && (
        <div className="mt-1.5 pl-5 space-y-0.5 border-t border-gray-800 pt-1.5">
          {startEvt?.data?.rationale && <DetailRow label="Rationale" value={startEvt.data.rationale} />}
          {startEvt?.data?.params && Object.keys(startEvt.data.params).length > 0 && (
            <DetailRow label="Params" value={JSON.stringify(startEvt.data.params).slice(0, 200)} />
          )}
          {data.verified != null && <DetailRow label="Verified" value={data.verified ? 'Yes' : 'No'} />}
          <DetailRow label="Time" value={new Date(completeEvt.timestamp).toLocaleTimeString()} />
        </div>
      )}
    </div>
  )
}

// ── Other Event Card (injection, citation, reflection revision, etc.) ──
function MiscEventCard({ event }) {
  const type = event.type
  const data = event.data || {}

  const configs = {
    'agent:reflection:revision': { icon: AlertTriangle, color: 'amber', label: `Reflection revised: ${safeString(data.originalAction)} → ${safeString(data.revisedAction)}` },
    'agent:policy:override': { icon: Shield, color: 'red', label: `Policy override: ${(data.violations || []).map(v => typeof v === 'string' ? v : (v.policyId || v.message || JSON.stringify(v))).join(', ')} → ${data.enforcedAction}` },
    'agent:judge:overturn': { icon: Scale, color: 'orange', label: `Judge overturned ${data.originalDecision} → REVIEW` },
    'agent:injection:blocked': { icon: Lock, color: 'red', label: 'Prompt injection blocked' },
    'agent:citation:downgrade': { icon: Eye, color: 'yellow', label: `Citation downgrade: ${data.originalDecision} → REVIEW` },
    'agent:decision:complete': { icon: Target, color: 'emerald', label: `Final decision: ${data.decision}` },
    'agent:decision:error': { icon: XCircle, color: 'red', label: `Agent error: ${data.error}` },
  }

  const cfg = configs[type]
  if (!cfg) return null

  const Icon = cfg.icon
  return (
    <div className={`rounded-lg border p-2.5 bg-${cfg.color}-500/5 border-${cfg.color}-500/20`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 text-${cfg.color}-400 flex-shrink-0`} />
        <span className={`text-xs font-medium text-${cfg.color}-400`}>{cfg.label}</span>
      </div>
    </div>
  )
}

// ── Main Component ──
function AgentFlowViewerInner({ events = [], isConnected, isRunning, correlationId }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events.length])

  // Group events by step
  const steps = ['THINK', 'PLAN', 'ACT', 'OBSERVE', 'REFLECT', 'INVESTIGATE', 'POLICY', 'JUDGE']
  const activeSteps = steps.filter(s =>
    events.some(e => (e.type === 'agent:step:start' || e.type === 'agent:step:complete') && e.data?.step === s)
  )

  // Collect tool action events
  const actionStarts = events.filter(e => e.type === 'agent:action:start' && e.data?.action)
  const actionCompletes = events.filter(e => e.type === 'agent:action:complete' && e.data?.action)

  // Match starts to completes
  const toolPairs = []
  const usedCompletes = new Set()
  for (const start of actionStarts) {
    // Skip the initial agent:action:start that has agentName (it's the agent start, not a tool)
    if (start.data?.agentName && !start.data?.action) continue
    const match = actionCompletes.find(
      c => c.data?.action === start.data?.action && !usedCompletes.has(c.id)
    )
    if (match) usedCompletes.add(match.id)
    toolPairs.push({ start, complete: match || null })
  }

  // Misc events
  const miscTypes = [
    'agent:reflection:revision', 'agent:policy:override', 'agent:judge:overturn',
    'agent:injection:blocked', 'agent:citation:downgrade',
    'agent:decision:complete', 'agent:decision:error'
  ]
  const miscEvents = events.filter(e => miscTypes.includes(e.type))

  // Determine current step for progress indicator
  const currentStep = (() => {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (events.some(e => e.type === 'agent:step:start' && e.data?.step === steps[i])) {
        const done = events.some(e => e.type === 'agent:step:complete' && e.data?.step === steps[i])
        return { step: steps[i], done }
      }
    }
    return null
  })()

  return (
    <div className="flex flex-col h-full bg-[#0d0d14] rounded-xl border border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">Agent Decision Flow</h3>
          {correlationId && (
            <span className="text-[10px] text-gray-600 font-mono">{correlationId}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isRunning && currentStep && (
            <span className="flex items-center gap-1.5 text-[10px] text-indigo-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              {currentStep.step}{currentStep.done ? ' done' : '...'}
            </span>
          )}
          <span className={`flex items-center gap-1 text-[10px] ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Step progress bar */}
      {events.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-800">
          {steps.map((s, i) => {
            const started = events.some(e => e.type === 'agent:step:start' && e.data?.step === s)
            const completed = events.some(e => e.type === 'agent:step:complete' && e.data?.step === s)
            const cfg = STEP_CONFIG[s]
            return (
              <div key={s} className="flex items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  completed ? `bg-${cfg.color}-500/30 text-${cfg.color}-400` :
                  started ? `bg-${cfg.color}-500/10 text-${cfg.color}-400 ring-1 ring-${cfg.color}-500/40` :
                  'bg-gray-800 text-gray-600'
                }`}>
                  {completed ? <CheckCircle className="w-3.5 h-3.5" /> : s[0]}
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-4 h-px ${completed ? `bg-${cfg.color}-500/40` : 'bg-gray-800'}`} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Brain className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">Submit a seller to see the agent flow</p>
            <p className="text-xs mt-1">Each step (Think → Plan → Act → Observe → Reflect → Policy → Judge) will appear in real-time</p>
          </div>
        ) : (
          <>
            {/* Input received */}
            {events.find(e => e.type === 'agent:action:start' && e.data?.agentName) && (
              <div className="rounded-lg border p-2.5 bg-gray-500/5 border-gray-500/20">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-300">
                    {events.find(e => e.type === 'agent:action:start' && e.data?.agentName)?.data?.agentName} started
                  </span>
                </div>
              </div>
            )}

            {/* THINK step */}
            {activeSteps.includes('THINK') && <StepCard step="THINK" events={events} />}

            {/* PLAN step */}
            {activeSteps.includes('PLAN') && <StepCard step="PLAN" events={events} />}

            {/* ACT step — with tool cards */}
            {(activeSteps.includes('ACT') || toolPairs.length > 0) && (
              <div className="space-y-1.5">
                <StepCard step="ACT" events={events} />
                {toolPairs.map((pair, i) => (
                  <ToolCard key={pair.start.id || i} startEvt={pair.start} completeEvt={pair.complete} />
                ))}
              </div>
            )}

            {/* OBSERVE step */}
            {activeSteps.includes('OBSERVE') && <StepCard step="OBSERVE" events={events} />}

            {/* REFLECT step */}
            {activeSteps.includes('REFLECT') && <StepCard step="REFLECT" events={events} />}

            {/* INVESTIGATE step (multi-turn deep investigation) */}
            {activeSteps.includes('INVESTIGATE') && <StepCard step="INVESTIGATE" events={events} />}

            {/* POLICY step */}
            {activeSteps.includes('POLICY') && <StepCard step="POLICY" events={events} />}

            {/* JUDGE step */}
            {activeSteps.includes('JUDGE') && <StepCard step="JUDGE" events={events} />}

            {/* Misc events (overrides, overturns, injection blocks, etc.) */}
            {miscEvents.map((evt, i) => (
              <MiscEventCard key={evt.id || i} event={evt} />
            ))}
          </>
        )}
      </div>

      {/* Footer stats */}
      {events.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-800 flex items-center justify-between text-[10px] text-gray-500">
          <span>{events.length} events | {activeSteps.length}/{steps.length} steps</span>
          <span>
            {toolPairs.filter(p => p.complete?.data?.success !== false).length} tools succeeded,{' '}
            {toolPairs.filter(p => p.complete && p.complete.data?.success === false).length} failed
          </span>
        </div>
      )}
    </div>
  )
}

export default function AgentFlowViewer(props) {
  return (
    <AgentFlowErrorBoundary>
      <AgentFlowViewerInner {...props} />
    </AgentFlowErrorBoundary>
  )
}
