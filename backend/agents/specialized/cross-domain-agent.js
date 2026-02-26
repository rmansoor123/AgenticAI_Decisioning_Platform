/**
 * Cross-Domain Correlation Agent
 *
 * A specialized autonomous agent that detects multi-step attack sequences
 * across 11 seller lifecycle domains. It correlates events from onboarding,
 * listing, transaction, shipping, returns, payout, pricing, ato,
 * profile_updates, account_setup, and other domains to identify coordinated
 * fraud campaigns.
 *
 * Capabilities:
 * - Cross-domain event correlation and trajectory analysis
 * - Sequence pattern matching against known attack patterns
 * - Coordinated behavior detection across seller networks
 * - Predictive next-step analysis using matched patterns
 *
 * Extends AutonomousAgent with a 5-minute scan interval and 6 registered tools.
 */

import { AutonomousAgent } from '../core/autonomous-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { getSequencePatterns, matchSellerTimeline } from '../core/sequence-patterns.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getConfidenceCalibrator } from '../core/confidence-calibrator.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';

// Try to import graph queries for network peer lookup
let graphNeighbors = null;
try {
  const graphTools = await import('../tools/graph-tools.js');
  // Use the getNeighbors helper exposed by graph-tools
  const graphEngine = await import('../../graph/graph-engine.js');
  graphNeighbors = (sellerId, depth) => {
    const engine = graphEngine.getGraphEngine();
    return engine.getNeighbors(sellerId, depth);
  };
} catch (e) {
  // Graph engine not available, that's okay
}

export class CrossDomainCorrelationAgent extends AutonomousAgent {
  constructor() {
    super({
      agentId: 'CROSS_DOMAIN_CORRELATION',
      name: 'Cross-Domain Correlation Agent',
      role: 'cross_domain_analyst',
      capabilities: [
        'cross_domain_detection',
        'trajectory_analysis',
        'sequence_matching',
        'coordinated_behavior_detection'
      ],
      scanIntervalMs: 300000, // 5 minutes
      eventAccelerationThreshold: 3,
      subscribedTopics: ['risk:event:created', 'decision:made', 'case:resolved']
    });

    // Initialize self-correction and calibrator
    this.selfCorrection = createSelfCorrection(this.agentId);
    this.calibrator = getConfidenceCalibrator();
    this.knowledgeBase = getKnowledgeBase();

    // Internal detection log, capped at 200
    this.detections = [];

    // Register the 6 tools
    this._registerTools();
  }

  // ============================================================================
  // TOOL REGISTRATION
  // ============================================================================

  _registerTools() {
    // 1. get_seller_timeline
    this.registerTool(
      'get_seller_timeline',
      'Retrieve chronological risk events for a seller across all domains',
      async (params) => {
        const { sellerId } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        try {
          const allEvents = db_ops.getAll('risk_events', 10000, 0);
          const sellerEvents = allEvents
            .map(e => e.data)
            .filter(e => e.sellerId === sellerId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

          return {
            success: true,
            data: {
              sellerId,
              events: sellerEvents,
              eventCount: sellerEvents.length
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 2. get_domain_velocity
    this.registerTool(
      'get_domain_velocity',
      'Count events per domain in a time window for velocity analysis',
      async (params) => {
        const { sellerId, domain, windowDays } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        const window = windowDays || 30;
        const cutoff = Date.now() - window * 24 * 60 * 60 * 1000;

        try {
          const allEvents = db_ops.getAll('risk_events', 10000, 0);
          const filtered = allEvents
            .map(e => e.data)
            .filter(e => {
              if (e.sellerId !== sellerId) return false;
              if (domain && e.domain !== domain) return false;
              const eventTime = new Date(e.createdAt).getTime();
              return eventTime >= cutoff;
            });

          const avgRiskScore = filtered.length > 0
            ? filtered.reduce((sum, e) => sum + (e.riskScore || 0), 0) / filtered.length
            : 0;

          return {
            success: true,
            data: {
              domain: domain || 'all',
              count: filtered.length,
              avgRiskScore,
              events: filtered
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 3. compare_seller_trajectories
    this.registerTool(
      'compare_seller_trajectories',
      'Find sellers with similar attack trajectory patterns',
      async (params) => {
        const { sellerId } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        try {
          // Get this seller's timeline
          const allEvents = db_ops.getAll('risk_events', 10000, 0);
          const timeline = allEvents
            .map(e => e.data)
            .filter(e => e.sellerId === sellerId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

          const patterns = getSequencePatterns();
          const matches = matchSellerTimeline(timeline, patterns);

          if (matches.length === 0) {
            return {
              success: true,
              data: { sellerId, similarSellers: [], matchedPatterns: [] }
            };
          }

          // Search knowledge base for sellers with similar matched patterns
          const similarSellers = [];
          for (const match of matches) {
            try {
              const kbResults = this.knowledgeBase.searchKnowledge(
                'risk-events',
                `${match.patternId} cross-domain detection`,
                {},
                10
              );

              for (const entry of kbResults) {
                if (entry.sellerId && entry.sellerId !== sellerId) {
                  const existing = similarSellers.find(s => s.sellerId === entry.sellerId);
                  if (!existing) {
                    similarSellers.push({
                      sellerId: entry.sellerId,
                      sharedPattern: match.patternId,
                      matchScore: match.matchScore
                    });
                  }
                }
              }
            } catch (e) {
              // Knowledge base search may fail, continue
            }
          }

          return {
            success: true,
            data: {
              sellerId,
              similarSellers,
              matchedPatterns: matches.map(m => m.patternId)
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 4. check_sequence_pattern
    this.registerTool(
      'check_sequence_pattern',
      'Check a seller timeline against a specific attack sequence pattern',
      async (params) => {
        const { sellerId, patternId } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        try {
          // Get seller timeline
          const allEvents = db_ops.getAll('risk_events', 10000, 0);
          const timeline = allEvents
            .map(e => e.data)
            .filter(e => e.sellerId === sellerId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

          const patterns = getSequencePatterns();
          const allMatches = matchSellerTimeline(timeline, patterns);

          // Filter to the specific pattern if provided
          if (patternId) {
            const match = allMatches.find(m => m.patternId === patternId);
            return {
              success: true,
              data: match || {
                patternId,
                matchScore: 0,
                stepsCompleted: 0,
                stepsRemaining: 0,
                totalSteps: 0,
                matched: false
              }
            };
          }

          return {
            success: true,
            data: {
              matches: allMatches,
              totalMatches: allMatches.length
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );

    // 5. get_network_peers
    this.registerTool(
      'get_network_peers',
      'Get network peers connected to a seller in the entity graph',
      async (params) => {
        const { sellerId } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        try {
          if (!graphNeighbors) {
            return {
              success: true,
              data: { peers: [], note: 'Graph engine not available' }
            };
          }

          const { nodes, edges } = graphNeighbors(sellerId, 2);
          const peers = nodes
            .filter(n => n.id !== sellerId)
            .map(n => ({
              sellerId: n.id,
              connectionType: n.type || 'unknown',
              riskScore: n.properties?.riskScore || 0
            }));

          return {
            success: true,
            data: { peers }
          };
        } catch (error) {
          return {
            success: true,
            data: { peers: [], note: `Graph lookup failed: ${error.message}` }
          };
        }
      }
    );

    // 6. predict_next_step
    this.registerTool(
      'predict_next_step',
      'Predict the next likely action in an attack sequence based on matched pattern progress',
      async (params) => {
        const { sellerId, matchedPattern, stepsCompleted } = params;
        if (!matchedPattern) {
          return { success: false, error: 'matchedPattern (patternId) is required' };
        }

        try {
          const patterns = getSequencePatterns();
          const pattern = patterns.find(p => p.patternId === matchedPattern);

          if (!pattern) {
            return {
              success: false,
              error: `Pattern ${matchedPattern} not found`
            };
          }

          const completed = stepsCompleted || 0;
          const nextStepIndex = Math.min(completed, pattern.sequence.length - 1);
          const nextStep = pattern.sequence[nextStepIndex];

          // Try LLM prediction if available
          if (this.llmClient?.enabled) {
            try {
              const systemPrompt = 'You are a fraud analyst. Predict the next likely action in this attack sequence. Return ONLY valid JSON: {"predictedDomain":"...", "predictedEventTypes":["..."], "confidence":0.0-1.0}';
              const userPrompt = `Pattern: ${pattern.name}. Steps completed: ${completed}/${pattern.sequence.length}. Next expected step: domain=${nextStep.domain}, events=${nextStep.eventTypes.join(',')}. Seller: ${sellerId}`;

              const result = await this.llmClient.complete(systemPrompt, userPrompt);
              if (result?.content) {
                const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  return {
                    success: true,
                    data: {
                      predictedDomain: parsed.predictedDomain || nextStep.domain,
                      predictedEventTypes: parsed.predictedEventTypes || nextStep.eventTypes,
                      confidence: parsed.confidence || 0.7,
                      llmEnhanced: true
                    }
                  };
                }
              }
            } catch (e) {
              // Fall through to rule-based prediction
            }
          }

          // Rule-based fallback: return the next step from the pattern definition
          return {
            success: true,
            data: {
              predictedDomain: nextStep.domain,
              predictedEventTypes: nextStep.eventTypes,
              confidence: 0.6 + (completed / pattern.sequence.length) * 0.3
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    );
  }

  // ============================================================================
  // AUTONOMOUS AGENT OVERRIDES
  // ============================================================================

  /**
   * Transform the event buffer into input for the reason() loop.
   * Groups events by sellerId for cross-domain analysis.
   */
  _buildScanInput() {
    const sellerEvents = {};

    for (const event of this.eventBuffer) {
      const sellerId = event.data?.sellerId || event.sellerId || 'unknown';
      if (!sellerEvents[sellerId]) {
        sellerEvents[sellerId] = [];
      }
      sellerEvents[sellerId].push(event);
    }

    return {
      sellerEvents,
      totalEvents: this.eventBuffer.length,
      scanTimestamp: new Date().toISOString()
    };
  }

  /**
   * Post-processing hook after a successful scan cycle.
   * Extracts detections, logs predictions, writes to knowledge base,
   * and broadcasts high-confidence detections.
   */
  async _postCycle(result) {
    // Extract detections from the result
    const findings = result?.result?.findings
      || result?.findings
      || result?.detections
      || [];

    if (!Array.isArray(findings) || findings.length === 0) {
      return;
    }

    for (const detection of findings) {
      const matchScore = detection.matchScore || 0;

      if (matchScore > 0.7) {
        // Add to internal detections array (capped at 200)
        this.detections.push({
          ...detection,
          detectedAt: new Date().toISOString()
        });
        if (this.detections.length > 200) {
          this.detections = this.detections.slice(-200);
        }

        // Log prediction via self-correction
        this.selfCorrection.logPrediction(
          `CD-${Date.now().toString(36).toUpperCase()}`,
          detection.sellerId || 'unknown',
          detection.patternId || 'UNKNOWN_PATTERN',
          matchScore,
          `Cross-domain detection: ${detection.patternName || detection.patternId || 'unknown'} with score ${matchScore}`
        );

        // Write to knowledge base
        try {
          this.knowledgeBase.addKnowledge('risk-events', [{
            _id: `CD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            text: `Cross-domain detection for seller ${detection.sellerId}. Pattern: ${detection.patternId || 'unknown'}. Match score: ${matchScore}. Steps completed: ${detection.stepsCompleted || 0}/${detection.totalSteps || 0}.`,
            category: 'cross-domain',
            sellerId: detection.sellerId,
            domain: 'cross-domain',
            outcome: matchScore > 0.8 ? 'fraud' : 'suspicious',
            riskScore: Math.round(matchScore * 100),
            source: this.agentId
          }]);
        } catch (e) {
          // Knowledge base write failure is non-fatal
        }

        // Emit event
        this.emitEvent('cross-domain:detection', {
          agentId: this.agentId,
          sellerId: detection.sellerId,
          patternId: detection.patternId,
          matchScore,
          stepsCompleted: detection.stepsCompleted,
          totalSteps: detection.totalSteps,
          severity: detection.severity
        });
      }

      // For detections above calibrated minimum confidence, broadcast
      const calibratedConfidence = this.calibrator.getCalibratedConfidence(matchScore);
      const minConfidence = 0.6; // Minimum threshold for broadcasting

      if (calibratedConfidence > minConfidence) {
        try {
          this.messenger.broadcast({
            from: this.agentId,
            content: {
              type: 'cross_domain_detection',
              sellerId: detection.sellerId,
              patternId: detection.patternId,
              matchScore,
              calibratedConfidence,
              severity: detection.severity,
              stepsCompleted: detection.stepsCompleted,
              totalSteps: detection.totalSteps
            },
            priority: matchScore > 0.8 ? 3 : 2 // HIGH or NORMAL
          });
        } catch (e) {
          // Broadcast failure is non-fatal
        }
      }
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance = null;

/**
 * Get the singleton CrossDomainCorrelationAgent instance.
 * @returns {CrossDomainCorrelationAgent}
 */
export function getCrossDomainAgent() {
  if (!instance) {
    instance = new CrossDomainCorrelationAgent();
  }
  return instance;
}

export default CrossDomainCorrelationAgent;
