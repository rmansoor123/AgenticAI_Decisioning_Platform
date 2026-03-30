/**
 * Developer Tools API — LLM gateway, Swagger docs, OpenTelemetry, and load test endpoints.
 */
import express from 'express';
import { getLLMGateway } from '../../agents/core/llm-gateway.js';

const router = express.Router();

// LLM Gateway endpoints
router.get('/gateway/models', (req, res) => {
  const gateway = getLLMGateway();
  res.json({ success: true, data: gateway.getAvailableModels() });
});

router.get('/gateway/stats', (req, res) => {
  const gateway = getLLMGateway();
  res.json({ success: true, data: gateway.getStats() });
});

router.post('/gateway/complete', async (req, res) => {
  try {
    const gateway = getLLMGateway();
    const result = await gateway.complete(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Platform info
router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      platform: 'AgenticAI Decisioning Platform',
      version: '2.0.0',
      agents: { fraud: 23, financial: 12, total: 35 },
      endpoints: '100+',
      dockerServices: 16,
      kafkaTopics: 14,
      decisionRules: 143,
      mlModels: 2,
      features: [
        'TPAOR Agent Reasoning Loop',
        'Real-time ML Inference (TensorFlow.js)',
        'Apache Kafka Streaming (14 topics)',
        'Redis Feature Store + Prediction Cache',
        'PostgreSQL with pgvector',
        'Langfuse Observability',
        'Multi-backend Model Serving (Triton/ONNX/TF.js)',
        'Seller Segmentation (12-dimensional)',
        'Financial Platform (12 agents)',
        'Prompt Management (Langfuse + PromptLayer)',
        'OpenTelemetry Distributed Tracing'
      ]
    }
  });
});

export default router;
