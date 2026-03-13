import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = 'ws://localhost:3001/ws'
const API_BASE = '/api'

const POLL_INTERVAL = 1500
const POLL_TIMEOUT = 300000
const MIN_STABLE_AFTER_TERMINAL = 2000

/**
 * Hook for real-time agent event streaming.
 *
 * REST polling is PRIMARY. WebSocket is supplementary for low-latency.
 * Deduplication is derived from events state (StrictMode-safe), not a detached ref.
 *
 * pollingDone: true only when REST event count stabilizes after the terminal event.
 */
export function useAgentFlow(correlationId) {
  const [events, setEvents] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [agentDecision, setAgentDecision] = useState(null)
  const [pollingDone, setPollingDone] = useState(false)
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)
  const correlationIdRef = useRef(correlationId)

  correlationIdRef.current = correlationId

  const clearEvents = useCallback(() => {
    setEvents([])
    setIsAgentRunning(false)
    setAgentDecision(null)
    setPollingDone(false)
  }, [])

  /**
   * Merge new events into state, deduplicate, sort, extract decision.
   * Dedup set is rebuilt from prev state each time (StrictMode-safe).
   * Returns { foundTerminal, novelCount }.
   */
  const mergeEvents = useCallback((incoming) => {
    let foundTerminal = false
    let novelCount = 0

    setEvents(prev => {
      // Rebuild seen set from actual state — never drifts from reality
      const seen = new Set(prev.map(e => e.id).filter(Boolean))
      const novel = incoming.filter(e => e.id && !seen.has(e.id))
      novelCount = novel.length

      if (novel.length === 0) {
        foundTerminal = prev.some(e =>
          e.type === 'agent:decision:complete' || e.type === 'agent:decision:error'
        )
        return prev
      }

      const combined = [...prev, ...novel]
      combined.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

      const decEvt = combined.find(e => e.type === 'agent:decision:complete')
      const errEvt = combined.find(e => e.type === 'agent:decision:error')
      foundTerminal = !!(decEvt || errEvt)

      if (decEvt?.data) {
        setTimeout(() => {
          setIsAgentRunning(false)
          setAgentDecision({
            decision: decEvt.data.decision,
            confidence: decEvt.data.confidence,
            reasoning: decEvt.data.reasoning,
            riskScore: decEvt.data.riskScore,
            sellerId: decEvt.data.sellerId,
            entityId: decEvt.data.entityId
          })
        }, 0)
      } else if (errEvt?.data) {
        setTimeout(() => {
          setIsAgentRunning(false)
          setAgentDecision({ decision: 'ERROR', error: errEvt.data.error })
        }, 0)
      }

      if (!foundTerminal) {
        const hasStart = combined.some(e =>
          e.type === 'agent:action:start' && e.data?.agentName
        )
        if (hasStart) {
          setTimeout(() => setIsAgentRunning(true), 0)
        }
      }

      return combined
    })

    return { foundTerminal, novelCount }
  }, [])

  // ── WebSocket (supplementary, low-latency) ──
  useEffect(() => {
    let ws

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL)
        wsRef.current = ws

        ws.onopen = () => {
          setIsConnected(true)
          ws.send(JSON.stringify({ command: 'subscribe', eventTypes: ['agent:*'] }))
        }

        ws.onmessage = (raw) => {
          try {
            const msg = JSON.parse(raw.data)
            if (!msg.type?.startsWith('agent:')) return

            const eventData = msg.data || msg
            const eventCorrelationId = eventData.correlationId

            if (!correlationIdRef.current || eventCorrelationId !== correlationIdRef.current) return

            const agentEvent = {
              id: msg.eventId || msg.id || `ws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: msg.type,
              data: eventData,
              timestamp: eventData.timestamp || msg.timestamp || new Date().toISOString()
            }

            mergeEvents([agentEvent])
          } catch (e) {
            // Ignore non-JSON
          }
        }

        ws.onclose = () => {
          setIsConnected(false)
          wsRef.current = null
          reconnectRef.current = setTimeout(connect, 3000)
        }

        ws.onerror = () => { /* triggers onclose */ }
      } catch (e) {
        reconnectRef.current = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [mergeEvents])

  // ── REST Polling (primary, reliable) ──
  useEffect(() => {
    if (!correlationId) return

    let cancelled = false
    let pollTimer = null
    const startTime = Date.now()

    let terminalFound = false
    let terminalFoundAt = 0
    let lastRestCount = -1
    let stablePolls = 0

    const poll = async () => {
      if (cancelled) return

      if (Date.now() - startTime > POLL_TIMEOUT) {
        console.warn('[useAgentFlow] Polling timed out')
        if (!cancelled) setPollingDone(true)
        return
      }

      try {
        const resp = await fetch(
          `${API_BASE}/agents/events?correlationId=${encodeURIComponent(correlationId)}&limit=500`,
          { cache: 'no-store' }
        )
        const json = await resp.json()

        if (cancelled) return

        if (json.success && json.events?.length > 0) {
          const mapped = json.events.map(e => ({
            id: e.id,
            type: e.type,
            data: e.data,
            timestamp: e.timestamp
          }))

          const restCount = mapped.length
          const { foundTerminal, novelCount } = mergeEvents(mapped)

          if (foundTerminal && !terminalFound) {
            terminalFound = true
            terminalFoundAt = Date.now()
          }

          if (terminalFound) {
            if (restCount === lastRestCount && novelCount === 0) {
              stablePolls++
            } else {
              stablePolls = 0
            }
            lastRestCount = restCount

            const elapsed = Date.now() - terminalFoundAt
            if (stablePolls >= 2 && elapsed >= MIN_STABLE_AFTER_TERMINAL) {
              if (!cancelled) setPollingDone(true)
              return
            }
          }
        } else if (terminalFound) {
          stablePolls++
          const elapsed = Date.now() - terminalFoundAt
          if (stablePolls >= 2 && elapsed >= MIN_STABLE_AFTER_TERMINAL) {
            if (!cancelled) setPollingDone(true)
            return
          }
        }
      } catch (e) {
        // Network error — keep polling
      }

      if (!cancelled) {
        pollTimer = setTimeout(poll, terminalFound ? 800 : POLL_INTERVAL)
      }
    }

    pollTimer = setTimeout(poll, 500)

    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [correlationId, mergeEvents])

  return { events, isConnected, isAgentRunning, agentDecision, pollingDone, clearEvents }
}

export default useAgentFlow
