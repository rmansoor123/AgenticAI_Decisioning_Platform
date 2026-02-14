import express from 'express';
import { getMetricsCollector } from '../../agents/core/metrics-collector.js';
import { getTraceCollector } from '../../agents/core/trace-collector.js';
import { getDecisionLogger } from '../../agents/core/decision-logger.js';
import { getAllCircuitBreakerStates } from '../../agents/core/circuit-breaker.js';
import { getAgentRouter } from '../../agents/core/agent-router.js';
import { getKnowledgeBase } from '../../agents/core/knowledge-base.js';
import { getMemoryStore } from '../../agents/core/memory-store.js';
import { getContextEngine } from '../../agents/core/context-engine.js';

const router = express.Router();

// GET /metrics — All agent metrics
router.get('/metrics', (req, res) => {
  try {
    const metrics = getMetricsCollector();
    res.json({ success: true, data: metrics.getAllMetrics() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /traces — Recent traces
router.get('/traces', (req, res) => {
  try {
    const { limit = 20, agentId } = req.query;
    const tracer = getTraceCollector();
    res.json({ success: true, data: tracer.getRecentTraces(parseInt(limit), agentId || null) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /traces/:traceId — Single trace
router.get('/traces/:traceId', (req, res) => {
  try {
    const tracer = getTraceCollector();
    const trace = tracer.getTrace(req.params.traceId);
    if (!trace) return res.status(404).json({ success: false, error: 'Trace not found' });
    res.json({ success: true, data: trace });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /decisions — Decision audit log
router.get('/decisions', (req, res) => {
  try {
    const { agentId, limit = 50 } = req.query;
    const logger = getDecisionLogger();
    res.json({ success: true, data: logger.getDecisions({ agentId, limit: parseInt(limit) }) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /health — Agent health summary
router.get('/health', (req, res) => {
  try {
    const metrics = getMetricsCollector();
    const tracer = getTraceCollector();
    const decisions = getDecisionLogger();
    const circuitBreakers = getAllCircuitBreakerStates();
    const agentRouter = getAgentRouter();
    const kb = getKnowledgeBase();
    const memory = getMemoryStore();
    const context = getContextEngine();

    res.json({
      success: true,
      data: {
        agents: metrics.getAllMetrics(),
        circuitBreakers,
        routing: agentRouter.getStats(),
        tracing: tracer.getStats(),
        decisions: decisions.getStats(),
        knowledgeBase: kb.getStats(),
        memory: memory.getStats(),
        contextEngine: context.getStats(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
