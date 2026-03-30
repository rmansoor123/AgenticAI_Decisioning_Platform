/**
 * Swagger/OpenAPI configuration for the platform.
 */
import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AgenticAI Decisioning Platform API',
      version: '2.0.0',
      description: 'Real-time fraud decisioning with 35 AI agents, ML inference, streaming pipelines, and a full financial platform.',
      contact: { name: 'Platform Team' }
    },
    servers: [
      { url: 'http://localhost:3001', description: 'Development' }
    ],
    tags: [
      { name: 'Onboarding', description: 'Seller onboarding and KYC' },
      { name: 'Risk', description: 'Risk profiles and scoring' },
      { name: 'ML', description: 'ML inference and training' },
      { name: 'Streaming', description: 'Kafka streaming pipeline' },
      { name: 'Financial', description: 'Financial platform services' },
      { name: 'Agents', description: 'AI agent management' },
      { name: 'Rules', description: 'Decision rules engine' },
      { name: 'Experiments', description: 'A/B testing and experimentation' },
      { name: 'Segmentation', description: 'Seller segmentation' },
      { name: 'Dev Tools', description: 'Developer tools and utilities' }
    ],
    paths: {
      '/api/onboarding/sellers': {
        post: {
          tags: ['Onboarding'], summary: 'Create seller and trigger AI evaluation',
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
            businessName: { type: 'string' }, businessCategory: { type: 'string' },
            country: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }
          }}}}},
          responses: { '200': { description: 'Seller created, agent evaluation started' } }
        },
        get: {
          tags: ['Onboarding'], summary: 'List all sellers',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }
          ],
          responses: { '200': { description: 'Array of sellers' } }
        }
      },
      '/api/onboarding/sellers/{sellerId}': {
        get: {
          tags: ['Onboarding'], summary: 'Get seller by ID',
          parameters: [{ name: 'sellerId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Seller detail' } }
        }
      },
      '/api/onboarding/sellers/{sellerId}/agent-evaluation': {
        get: {
          tags: ['Onboarding'], summary: 'Get agent evaluation result',
          parameters: [{ name: 'sellerId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Agent evaluation with chain of thought' } }
        }
      },
      '/api/risk-profile/{sellerId}': {
        get: {
          tags: ['Risk'], summary: 'Get seller risk profile',
          parameters: [{ name: 'sellerId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Risk profile with domain scores' } }
        }
      },
      '/api/ml/inference/predict': {
        post: {
          tags: ['ML'], summary: 'Run ML model prediction',
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
            modelId: { type: 'string' }, features: { type: 'object' }
          }}}}},
          responses: { '200': { description: 'Prediction result with score' } }
        }
      },
      '/api/ml/inference/test': {
        post: {
          tags: ['ML'], summary: 'Test onboarding ML model with custom features',
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
            features: { type: 'object' }
          }}}}},
          responses: { '200': { description: 'Score, decision, SHAP contributions' } }
        }
      },
      '/api/ml/inference/models/onboarding-risk-v1': {
        get: {
          tags: ['ML'], summary: 'Get onboarding model details and architecture',
          responses: { '200': { description: 'Model info, architecture, thresholds' } }
        }
      },
      '/api/ml/training/serving/benchmark': {
        get: {
          tags: ['ML'], summary: 'Run inference benchmark (p50/p95/p99 latencies)',
          parameters: [{ name: 'n', in: 'query', schema: { type: 'integer', default: 100 } }],
          responses: { '200': { description: 'Benchmark results' } }
        }
      },
      '/api/streaming/onboarding/stats': {
        get: {
          tags: ['Streaming'], summary: 'Onboarding pipeline stats and backend status',
          responses: { '200': { description: 'Pipeline stages, message counts, backend type' } }
        }
      },
      '/api/financial-platform/underwrite': {
        post: {
          tags: ['Financial'], summary: 'Run credit underwriting for a seller',
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
            sellerId: { type: 'string' }, riskScore: { type: 'number' },
            gmv30d: { type: 'number' }, sellerTier: { type: 'string' }
          }}}}},
          responses: { '200': { description: 'Underwriting decision with credit limit and tier' } }
        }
      },
      '/api/financial-platform/payout/request': {
        post: {
          tags: ['Financial'], summary: 'Submit payout through fraud-aware gating',
          responses: { '200': { description: 'Payout release decision' } }
        }
      },
      '/api/financial-platform/wallet/{sellerId}': {
        get: {
          tags: ['Financial'], summary: 'Get seller wallet balance',
          parameters: [{ name: 'sellerId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Wallet balance, available, hold' } }
        }
      },
      '/api/financial-platform/fx/rates/{currency}': {
        get: {
          tags: ['Financial'], summary: 'Get FX rates for a currency',
          parameters: [{ name: 'currency', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Exchange rates' } }
        }
      },
      '/api/seller-tools/segmentation': {
        get: {
          tags: ['Segmentation'], summary: 'Get all sellers with segmentation data',
          responses: { '200': { description: 'Sellers with tiers, tags, clusters, trends' } }
        }
      },
      '/api/rules': {
        get: {
          tags: ['Rules'], summary: 'List all decision rules',
          responses: { '200': { description: 'Array of rules' } }
        }
      },
      '/api/experiments/experiments': {
        get: {
          tags: ['Experiments'], summary: 'List all A/B experiments',
          responses: { '200': { description: 'Array of experiments' } }
        }
      },
      '/api/health': {
        get: {
          tags: ['Dev Tools'], summary: 'Platform health check',
          responses: { '200': { description: 'Service status' } }
        }
      },
      '/api/dev/gateway/models': {
        get: {
          tags: ['Dev Tools'], summary: 'List available LLM providers and models',
          responses: { '200': { description: 'Available providers with models' } }
        }
      },
      '/api/dev/gateway/stats': {
        get: {
          tags: ['Dev Tools'], summary: 'LLM gateway call statistics',
          responses: { '200': { description: 'Call counts by provider and model' } }
        }
      }
    }
  },
  apis: [] // We define paths inline above
};

export const swaggerSpec = swaggerJsdoc(options);
export default swaggerSpec;
