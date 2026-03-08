import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = 'ws://localhost:3001/ws'
const API_BASE = '/api'

const POLL_INTERVAL = 2000    // Poll every 2 seconds
const POLL_TIMEOUT = 300000   // 5 minutes max polling

/**
 * Production-grade hook for real-time agent event streaming.
 *
 * Architecture: REST polling is the PRIMARY reliable source.
 * WebSocket is supplementary for low-latency updates between polls.
 * Both sources deduplicate by event ID.
 */
export function useAgentFlow(correlationId) {
  const [events, setEvents] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [agentDecision, setAgentDecision] = useState(null)
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)
  const correlationIdRef = useRef(correlationId)
  const seenIdsRef = useRef(new Set())

  correlationIdRef.current = correlationId

  const clearEvents = useCallback(() => {
    setEvents([])
    setIsAgentRunning(false)
    setAgentDecision(null)
    seenIdsRef.current = new Set()
  }, [])

  /**
   * Merge new events into state, deduplicate, sort, extract decision.
   * Returns true if a terminal event was found.
   */
  const mergeEvents = useCallback((incoming) => {
    let foundTerminal = false

    setEvents(prev => {
      const seen = seenIdsRef.current
      const novel = incoming.filter(e => e.id && !seen.has(e.id))
      if (novel.length === 0) return prev

      novel.forEach(e => seen.add(e.id))

      const combined = [...prev, ...novel]
      combined.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

      // Check for terminal event
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
            sellerId: decEvt.data.sellerId
          })
        }, 0)
      } else if (errEvt?.data) {
        setTimeout(() => {
          setIsAgentRunning(false)
          setAgentDecision({ decision: 'ERROR', error: errEvt.data.error })
        }, 0)
      }

      // If we see any action:start, mark as running (unless already terminal)
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

    return foundTerminal
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
  // Polls every POLL_INTERVAL until terminal event or POLL_TIMEOUT
  useEffect(() => {
    if (!correlationId) return

    let cancelled = false
    let pollTimer = null
    const startTime = Date.now()

    const poll = async () => {
      if (cancelled) return

      // Timeout guard
      if (Date.now() - startTime > POLL_TIMEOUT) {
        console.warn('[useAgentFlow] Polling timed out after 5 minutes')
        return
      }

      try {
        const resp = await fetch(
          `${API_BASE}/agents/events?correlationId=${encodeURIComponent(correlationId)}&limit=500`
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

          const terminal = mergeEvents(mapped)
          if (terminal) return // Stop polling — pipeline complete
        }
      } catch (e) {
        // Network error — keep polling
      }

      if (!cancelled) {
        pollTimer = setTimeout(poll, POLL_INTERVAL)
      }
    }

    // Start polling after a short delay for initial events to arrive
    pollTimer = setTimeout(poll, 500)

    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [correlationId, mergeEvents])

  return { events, isConnected, isAgentRunning, agentDecision, clearEvents }
}

export default useAgentFlow
