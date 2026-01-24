/**
 * Agentic AI API Endpoints
 *
 * REST API for interacting with AI agents
 */

import express from 'express';
import {
  orchestrator,
  fraudInvestigator,
  ruleOptimizer,
  alertTriage
} from '../../agents/index.js';

const router = express.Router();

// ============================================================================
// ORCHESTRATOR ENDPOINTS
// ============================================================================

// Get orchestrator status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: orchestrator.getState()
  });
});

// List all agents
router.get('/agents', (req, res) => {
  const agents = Array.from(orchestrator.agents.values()).map(a => a.getState());
  res.json({
    success: true,
    data: agents
  });
});

// Get specific agent details
router.get('/agents/:agentId', (req, res) => {
  const agent = orchestrator.getAgent(req.params.agentId);
  if (!agent) {
    return res.status(404).json({ success: false, error: 'Agent not found' });
  }
  res.json({
    success: true,
    data: {
      ...agent.getState(),
      recentThoughts: agent.thoughtLog.slice(-10)
    }
  });
});

// List workflows
router.get('/workflows', (req, res) => {
  res.json({
    success: true,
    data: Array.from(orchestrator.workflows.values())
  });
});

// Execute a workflow
router.post('/workflows/:workflowId/execute', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const input = req.body;

    const execution = await orchestrator.executeWorkflow(workflowId, input);

    res.json({
      success: true,
      data: execution
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get workflow execution status
router.get('/executions/:executionId', (req, res) => {
  const execution = orchestrator.activeWorkflows.get(req.params.executionId);
  if (!execution) {
    return res.status(404).json({ success: false, error: 'Execution not found' });
  }
  res.json({ success: true, data: execution });
});

// ============================================================================
// FRAUD INVESTIGATION AGENT ENDPOINTS
// ============================================================================

// Investigate a transaction
router.post('/investigate', async (req, res) => {
  try {
    const { transactionId, alertType, context } = req.body;

    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'transactionId is required' });
    }

    const result = await fraudInvestigator.investigate(transactionId, alertType, context || {});

    res.json({
      success: true,
      data: {
        agentId: fraudInvestigator.agentId,
        agentName: fraudInvestigator.name,
        investigation: result.result,
        reasoning: result.result?.reasoning,
        thoughtProcess: {
          understanding: result.reasoning?.[0]?.understanding,
          actionsExecuted: result.actions?.length,
          evidenceGathered: result.result?.evidence?.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get investigation history
router.get('/investigations', (req, res) => {
  const investigations = fraudInvestigator.thoughtLog
    .filter(t => t.result?.investigationId)
    .map(t => ({
      investigationId: t.result.investigationId,
      transactionId: t.input?.transactionId,
      recommendation: t.result?.recommendation,
      confidence: t.result?.confidence,
      timestamp: t.timestamp
    }));

  res.json({ success: true, data: investigations });
});

// ============================================================================
// RULE OPTIMIZATION AGENT ENDPOINTS
// ============================================================================

// Run rule optimization
router.post('/optimize-rules', async (req, res) => {
  try {
    const { type = 'full' } = req.body;

    const result = await ruleOptimizer.optimize(type);

    res.json({
      success: true,
      data: {
        agentId: ruleOptimizer.agentId,
        agentName: ruleOptimizer.name,
        optimization: result.result,
        insights: result.result?.insights,
        recommendations: result.result?.recommendations,
        ruleHealth: result.result?.ruleHealth
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get optimization history
router.get('/optimizations', (req, res) => {
  const optimizations = ruleOptimizer.thoughtLog
    .filter(t => t.result?.optimizationId)
    .map(t => ({
      optimizationId: t.result.optimizationId,
      insightsCount: t.result?.insights?.length,
      recommendationsCount: t.result?.recommendations?.length,
      ruleHealth: t.result?.ruleHealth,
      timestamp: t.timestamp
    }));

  res.json({ success: true, data: optimizations });
});

// ============================================================================
// ALERT TRIAGE AGENT ENDPOINTS
// ============================================================================

// Triage alert queue
router.post('/triage', async (req, res) => {
  try {
    const result = await alertTriage.triageQueue();

    res.json({
      success: true,
      data: {
        agentId: alertTriage.agentId,
        agentName: alertTriage.name,
        triage: result.result,
        assignments: result.result?.assignments,
        queueHealth: result.result?.queueHealth
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get triage history
router.get('/triages', (req, res) => {
  const triages = alertTriage.thoughtLog
    .filter(t => t.result?.triageId)
    .map(t => ({
      triageId: t.result.triageId,
      alertsProcessed: t.result?.prioritizedAlerts?.length,
      assignmentsMade: t.result?.assignments?.length,
      queueHealth: t.result?.queueHealth,
      timestamp: t.timestamp
    }));

  res.json({ success: true, data: triages });
});

// ============================================================================
// MULTI-AGENT COLLABORATION ENDPOINTS
// ============================================================================

// Run collaborative investigation (all agents work together)
router.post('/collaborate/investigate', async (req, res) => {
  try {
    const { transactionId, fullAnalysis = true } = req.body;

    if (!transactionId) {
      return res.status(400).json({ success: false, error: 'transactionId is required' });
    }

    // Step 1: Triage to understand alert priority
    const triageResult = await alertTriage.reason({
      action: 'single_alert',
      alertId: transactionId
    });

    // Step 2: Deep investigation
    const investigationResult = await fraudInvestigator.investigate(
      transactionId,
      triageResult.result?.prioritizedAlerts?.[0]?.alertType
    );

    // Step 3: Check if rules need optimization based on this case
    let ruleResult = null;
    if (fullAnalysis) {
      ruleResult = await ruleOptimizer.reason({
        optimizationType: 'coverage',
        transactionContext: investigationResult.result
      });
    }

    // Combine results
    const collaborativeResult = {
      collaborationId: `COLLAB-${Date.now().toString(36).toUpperCase()}`,
      transactionId,
      timestamp: new Date().toISOString(),

      // Triage assessment
      triage: {
        agent: alertTriage.name,
        priority: triageResult.result?.prioritizedAlerts?.[0]?.priorityLevel,
        routing: triageResult.result?.assignments?.[0]
      },

      // Investigation findings
      investigation: {
        agent: fraudInvestigator.name,
        recommendation: investigationResult.result?.recommendation,
        confidence: investigationResult.result?.confidence,
        riskFactors: investigationResult.result?.riskFactors,
        evidence: investigationResult.result?.evidence?.length
      },

      // Rule insights
      ruleInsights: ruleResult ? {
        agent: ruleOptimizer.name,
        newPatterns: ruleResult.result?.insights?.find(i => i.type === 'EMERGING_PATTERNS'),
        recommendations: ruleResult.result?.recommendations?.slice(0, 3)
      } : null,

      // Final recommendation (consensus)
      finalRecommendation: investigationResult.result?.recommendation,

      // Full reasoning chain
      reasoningChain: [
        { step: 'Triage', agent: alertTriage.name, summary: triageResult.result?.summary },
        { step: 'Investigation', agent: fraudInvestigator.name, summary: investigationResult.result?.summary },
        ruleResult ? { step: 'Rule Analysis', agent: ruleOptimizer.name, summary: ruleResult.result?.summary } : null
      ].filter(Boolean)
    };

    res.json({
      success: true,
      data: collaborativeResult
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Demo endpoint - Full agentic workflow demonstration
router.post('/demo', async (req, res) => {
  try {
    const transactionId = req.body.transactionId || `TXN-DEMO-${Date.now().toString(36).toUpperCase()}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log('AGENTIC AI DEMO - Multi-Agent Fraud Investigation');
    console.log('='.repeat(60));

    // Execute the collaborative investigation
    const startTime = Date.now();

    // Step 1: Alert Triage Agent
    console.log('\n[1/3] Alert Triage Agent analyzing...');
    const triageResult = await alertTriage.triageQueue();
    console.log(`     → Processed ${triageResult.result?.prioritizedAlerts?.length || 0} alerts`);
    console.log(`     → Queue health: ${triageResult.result?.queueHealth?.status}`);

    // Step 2: Fraud Investigation Agent
    console.log('\n[2/3] Fraud Investigation Agent investigating...');
    const investigationResult = await fraudInvestigator.investigate(transactionId, 'HIGH_VALUE');
    console.log(`     → Recommendation: ${investigationResult.result?.recommendation?.action}`);
    console.log(`     → Confidence: ${(investigationResult.result?.recommendation?.confidence * 100).toFixed(0)}%`);
    console.log(`     → Risk factors: ${investigationResult.result?.riskFactors?.length || 0}`);

    // Step 3: Rule Optimization Agent
    console.log('\n[3/3] Rule Optimization Agent analyzing...');
    const ruleResult = await ruleOptimizer.optimize('full');
    console.log(`     → Insights found: ${ruleResult.result?.insights?.length || 0}`);
    console.log(`     → Recommendations: ${ruleResult.result?.recommendations?.length || 0}`);
    console.log(`     → Rule health: ${ruleResult.result?.ruleHealth?.status}`);

    const duration = Date.now() - startTime;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Demo completed in ${duration}ms`);
    console.log('='.repeat(60) + '\n');

    res.json({
      success: true,
      data: {
        demoId: `DEMO-${Date.now().toString(36).toUpperCase()}`,
        transactionId,
        duration: `${duration}ms`,

        agents: [
          {
            name: 'Alert Triage Agent',
            role: 'Prioritize and route alerts',
            result: {
              alertsProcessed: triageResult.result?.prioritizedAlerts?.length,
              queueHealth: triageResult.result?.queueHealth,
              topAssignment: triageResult.result?.assignments?.[0]
            }
          },
          {
            name: 'Fraud Investigation Agent',
            role: 'Deep investigation and evidence gathering',
            result: {
              recommendation: investigationResult.result?.recommendation,
              riskFactors: investigationResult.result?.riskFactors,
              evidenceCount: investigationResult.result?.evidence?.length
            }
          },
          {
            name: 'Rule Optimization Agent',
            role: 'Analyze and improve detection rules',
            result: {
              insights: ruleResult.result?.insights,
              recommendations: ruleResult.result?.recommendations?.slice(0, 3),
              ruleHealth: ruleResult.result?.ruleHealth
            }
          }
        ],

        summary: {
          finalDecision: investigationResult.result?.recommendation?.action,
          confidence: investigationResult.result?.recommendation?.confidence,
          reasoning: investigationResult.result?.reasoning
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
