---
name: wire-agent
description: How to wire a specialized agent to a business service using StreamEngine pub/sub
triggers:
  - wire agent
  - connect agent to service
  - add agent to service
  - agent service integration
  - pub sub agent
  - stream engine agent
---

# Wire Agent to Business Service

This skill explains how to connect a specialized agent to a business service using the three-layer event architecture: HTTP Service → Agent → EventBus → StreamEngine → WebSocket.

## Reference Implementation

The canonical example is **Seller Onboarding**:
- Service: `backend/services/business/seller-onboarding/index.js`
- Agent: `backend/agents/specialized/seller-onboarding-agent.js`
- Agent index: `backend/agents/index.js`
- EventBus: `backend/gateway/websocket/event-bus.js`
- StreamEngine: `backend/streaming/stream-engine.js`

## Architecture

```
HTTP POST /api/{service}/endpoint
  → Express router (service/index.js)
    → agent.evaluateX(id, data, { _correlationId })   [fire-and-forget]
      → BaseAgent.reason() emits events via emitEvent()
        → EventBus.publish()          [in-process pub/sub]
          → StreamEngine.produce()    [Kafka-like durable log]
            → bridges back to EventBus for WebSocket clients
  → res.status(202).json({ correlationId, status: 'EVALUATING' })
```

## Step-by-Step Wiring

### 1. Import the Agent Singleton

In your service file (e.g., `backend/services/business/my-service/index.js`):

```js
import { myAgent } from '../../../agents/index.js';
```

The agent must be exported from `backend/agents/index.js` as a singleton instance.

### 2. Generate a Correlation ID

```js
const correlationId = 'PREFIX-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
```

Convention: use a 3-letter prefix matching your service (e.g., `ONB-`, `INV-`, `TRG-`, `PAY-`).

### 3. Fire-and-Forget the Agent Call

```js
// DO NOT await in the request handler — return 202 immediately
myAgent.evaluateX(entityId, entityData, { _correlationId: correlationId })
  .then(agentResult => {
    // Update DB with result
    const decision = agentResult?.result?.recommendation || agentResult?.result?.decision;
    db_ops.update('my_table', entityId, {
      status: decision?.action || 'UNKNOWN',
      riskScore: agentResult?.result?.overallRisk?.score,
      updatedAt: new Date().toISOString()
    });

    // Publish completion event
    const bus = getEventBus();
    bus.publish('agent:decision:complete', {
      correlationId,
      entityId,
      decision: decision?.action,
      confidence: decision?.confidence,
      reasoning: agentResult?.result?.reasoning,
      riskScore: agentResult?.result?.overallRisk?.score,
      timestamp: new Date().toISOString()
    });
  })
  .catch(err => {
    console.error(`[MyService] Agent error for ${entityId}:`, err.message);
    const bus = getEventBus();
    bus.publish('agent:decision:complete', {
      correlationId, entityId, decision: 'ERROR',
      error: err.message, timestamp: new Date().toISOString()
    });
  });

// Return 202 Accepted immediately
res.status(202).json({
  success: true,
  correlationId,
  entityId,
  status: 'EVALUATING',
  message: 'Agent evaluation started'
});
```

### 4. Register the Route in the Gateway

In `backend/gateway/server.js`, mount your service router:

```js
import myServiceRouter from '../services/business/my-service/index.js';
app.use('/api/my-service', myServiceRouter);
```

### 5. Frontend WebSocket Subscription

The frontend subscribes to `agent:decision:complete` events filtered by `correlationId`:

```js
// In React component
useEffect(() => {
  const ws = new WebSocket('ws://localhost:3001');
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'agent:decision:complete' && data.correlationId === correlationId) {
      setResult(data);
    }
  };
  return () => ws.close();
}, [correlationId]);
```

### 6. Optional: StreamEngine Topic Registration

If you want durable, partitioned message logging for your service:

```js
import { getStreamEngine } from '../../streaming/stream-engine.js';

const engine = getStreamEngine();
// Produce to a topic (key determines partition via MD5 hash)
engine.produce('my-service.events', entityId, {
  agentId: 'MY_AGENT',
  decision: result.action,
  timestamp: new Date().toISOString()
});
```

Default topics are registered in `stream-engine.js` lines 373-382. Add yours to that list if you need it available at startup.

### 7. Optional: Periodic Eval Triggering

Every N decisions, fire an eval request to the Python service:

```js
const evalInterval = parseInt(process.env.EVAL_INTERVAL || '5');
if (decisionCount % evalInterval === 0 && process.env.EVAL_SERVICE_URL) {
  fetch(`${process.env.EVAL_SERVICE_URL}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `Evaluate ${entityType}: ${entityName}`,
      retrieved_contexts: chainOfThought.map(s => s.content).slice(0, 5),
      agent_response: `Decision: ${action}. Risk Score: ${riskScore}. ${reasoning}`,
      use_case: 'my_service_decision',
      agent_id: 'my-agent'
    })
  }).catch(() => {}); // fire-and-forget
}
```

## EventBus Event Types

Key events emitted automatically by `BaseAgent.reason()`:
- `agent:action:start` / `agent:action:complete` — full evaluation lifecycle
- `agent:step:start` / `agent:step:complete` — per TPAOR phase (THINK, PLAN, ACT, OBSERVE, REFLECT)
- `agent:decision:complete` — final decision (you publish this from the service)
- `agent:policy:override` — policy engine overrode the agent's decision

## Checklist

- [ ] Agent singleton exported from `backend/agents/index.js`
- [ ] Service imports agent and calls it fire-and-forget (no await in handler)
- [ ] Correlation ID generated with service prefix
- [ ] 202 Accepted returned immediately
- [ ] `.then()` handler updates DB and publishes `agent:decision:complete`
- [ ] `.catch()` handler publishes error event
- [ ] Route mounted in `backend/gateway/server.js`
- [ ] Frontend subscribes to WebSocket events filtered by correlationId
