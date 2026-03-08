import { useState, useEffect, useRef, useCallback } from 'react'

// Connect directly to backend to avoid Vite HMR WebSocket conflict
const WS_URL = 'ws://localhost:3001/ws'
const API_BASE = '/api'

/**
 * Custom hook for real-time agent event streaming.
 * Connects to WebSocket, filters events by correlationId,
 * and provides backfill via REST endpoint.
 *
 * @param {string|null} correlationId - Correlation ID to filter events
 * @returns {{ events, isConnected, isAgentRunning, clearEvents }}
 */
export function useAgentFlow(correlationId) {
  const [events, setEvents] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [isAgentRunning, setIsAgentRunning] = useState(false)
  const [agentDecision, setAgentDecision] = useState(null)
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)
  const correlationIdRef = useRef(correlationId)

  // Keep ref in sync
  correlationIdRef.current = correlationId

  const clearEvents = useCallback(() => {
    setEvents([])
    setIsAgentRunning(false)
    setAgentDecision(null)
  }, [])

  // WebSocket connection
  useEffect(() => {
    let ws

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL)
        wsRef.current = ws

        ws.onopen = () => {
          setIsConnected(true)
          // Subscribe to agent events
          ws.send(JSON.stringify({ command: 'subscribe', eventTypes: ['agent:*'] }))
        }

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)

            // Only process agent events
            if (!msg.type?.startsWith('agent:')) return

            const eventData = msg.data || msg
            const eventCorrelationId = eventData.correlationId

            // Filter by correlationId if we have one
            if (correlationIdRef.current && eventCorrelationId !== correlationIdRef.current) return

            const agentEvent = {
              id: msg.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: msg.type,
              data: eventData,
              timestamp: eventData.timestamp || msg.timestamp || new Date().toISOString()
            }

            setEvents(prev => [...prev, agentEvent])

            // Track running state
            if (msg.type === 'agent:action:start' && eventData.agentName) {
              setIsAgentRunning(true)
            }
            if (msg.type === 'agent:decision:complete') {
              setIsAgentRunning(false)
              setAgentDecision({
                decision: eventData.decision,
                confidence: eventData.confidence,
                reasoning: eventData.reasoning,
                riskScore: eventData.riskScore,
                sellerId: eventData.sellerId
              })
            }
            if (msg.type === 'agent:decision:error') {
              setIsAgentRunning(false)
              setAgentDecision({
                decision: 'ERROR',
                error: eventData.error
              })
            }
          } catch (e) {
            // Ignore non-JSON messages
          }
        }

        ws.onclose = () => {
          setIsConnected(false)
          wsRef.current = null
          // Reconnect after 3 seconds
          reconnectRef.current = setTimeout(connect, 3000)
        }

        ws.onerror = () => {
          // Will trigger onclose
        }
      } catch (e) {
        // WebSocket construction failed
        reconnectRef.current = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // Prevent reconnect on cleanup
        wsRef.current.close()
      }
    }
  }, [])

  // Backfill events when correlationId changes
  useEffect(() => {
    if (!correlationId) return

    const backfill = async () => {
      try {
        const resp = await fetch(`${API_BASE}/agents/events?correlationId=${encodeURIComponent(correlationId)}&limit=200`)
        const json = await resp.json()

        if (json.success && json.events?.length > 0) {
          setEvents(prev => {
            // Merge backfill events, deduplicate by id
            const existingIds = new Set(prev.map(e => e.id))
            const newEvents = json.events
              .filter(e => !existingIds.has(e.id))
              .map(e => ({
                id: e.id,
                type: e.type,
                data: e.data,
                timestamp: e.timestamp
              }))

            if (newEvents.length === 0) return prev

            // Combine and sort by timestamp
            const combined = [...prev, ...newEvents]
            combined.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            return combined
          })
        }
      } catch (e) {
        // Backfill failed, not critical
        console.warn('Agent event backfill failed:', e.message)
      }
    }

    backfill()
  }, [correlationId])

  return { events, isConnected, isAgentRunning, agentDecision, clearEvents }
}

export default useAgentFlow
