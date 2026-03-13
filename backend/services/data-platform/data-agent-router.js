/**
 * Data Agent Router — Express endpoints for the DataAgent orchestrator
 *
 * Uses the same 202 ACCEPTED + correlationId fire-and-forget pattern
 * as other agent-wired services.
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDataAgent } from '../../agents/specialized/data-agent.js';
import { getDataPlaygroundAgent } from '../../agents/specialized/data-playground-agent.js';
import { getQueryFederationAgent } from '../../agents/specialized/query-federation-agent.js';
import { getFeatureEngineeringAgent } from '../../agents/specialized/feature-engineering-agent.js';

const router = express.Router();

// POST /reason — fire-and-forget DataAgent reasoning
router.post('/reason', (req, res) => {
  const correlationId = `DATA-${uuidv4().substring(0, 8).toUpperCase()}`;
  const agent = getDataAgent();

  // Fire and forget
  agent.reason(req.body, { correlationId })
    .then(async result => {
      console.log(`[DataAgent] Completed ${correlationId}`);
    })
    .catch(async err => {
      console.error(`[DataAgent] Error ${correlationId}:`, err.message);
    });

  res.status(202).json({
    success: true,
    data: {
      correlationId,
      status: 'ACCEPTED',
      message: 'DataAgent reasoning started',
      agentId: 'DATA_AGENT'
    }
  });
});

// GET /status — agent idle/processing state
router.get('/status', (req, res) => {
  const agent = getDataAgent();
  res.json({
    success: true,
    data: {
      agentId: agent.agentId,
      name: agent.name,
      status: agent.status || 'IDLE',
      capabilities: agent.capabilities,
      tools: [...agent.tools.keys()]
    }
  });
});

// GET /capabilities — list all agent + sub-agent capabilities
router.get('/capabilities', (req, res) => {
  const dataAgent = getDataAgent();
  const playground = getDataPlaygroundAgent();
  const federation = getQueryFederationAgent();
  const featureEng = getFeatureEngineeringAgent();

  res.json({
    success: true,
    data: {
      orchestrator: {
        agentId: dataAgent.agentId,
        name: dataAgent.name,
        capabilities: dataAgent.capabilities,
        tools: [...dataAgent.tools.keys()]
      },
      subAgents: [
        {
          agentId: playground.agentId,
          name: playground.name,
          capabilities: playground.capabilities,
          tools: [...playground.tools.keys()]
        },
        {
          agentId: federation.agentId,
          name: federation.name,
          capabilities: federation.capabilities,
          tools: [...federation.tools.keys()]
        },
        {
          agentId: featureEng.agentId,
          name: featureEng.name,
          capabilities: featureEng.capabilities,
          tools: [...featureEng.tools.keys()]
        }
      ]
    }
  });
});

export default router;
