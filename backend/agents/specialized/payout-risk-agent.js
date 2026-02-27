/**
 * Payout Risk Agent
 *
 * A specialized autonomous agent that monitors payout activity for signs of
 * fraudulent cash-out behaviour. It detects velocity spikes, bank-change-then-
 * withdraw patterns, anomalous payout-to-revenue ratios, and dispute-loaded
 * sellers attempting payouts.
 *
 * Capabilities:
 * - Payout velocity monitoring across 24h / 7d / 30d windows
 * - Bank-change timing analysis (withdrawals shortly after bank update)
 * - Cash-out anomaly detection (payout vs revenue ratio)
 * - Dispute-aware payout risk scoring
 *
 * Extends AutonomousAgent with a 10-minute scan interval and 5 registered tools.
 */

import { AutonomousAgent } from '../core/autonomous-agent.js';
import { db_ops } from '../../shared/common/database.js';

// Optional imports — agents must work without these in test / lightweight mode
let getKnowledgeBase = null;
try {
  const mod = await import('../core/knowledge-base.js');
  getKnowledgeBase = mod.getKnowledgeBase;
} catch (e) {
  // Knowledge base not available
}

let getConfidenceCalibrator = null;
try {
  const mod = await import('../core/confidence-calibrator.js');
  getConfidenceCalibrator = mod.getConfidenceCalibrator;
} catch (e) {
  // Confidence calibrator not available
}

let getSelfCorrection = null;
try {
  const mod = await import('../core/self-correction.js');
  getSelfCorrection = mod.createSelfCorrection;
} catch (e) {
  // Self-correction not available
}

let getAgentMessenger = null;
try {
  const mod = await import('../core/agent-messenger.js');
  getAgentMessenger = mod.getAgentMessenger;
} catch (e) {
  // Agent messenger not available
}

let getPatternMemory = null;
try {
  const mod = await import('../core/pattern-memory.js');
  getPatternMemory = mod.getPatternMemory;
} catch (e) {
  // Pattern memory not available
}

// Try to import event bus for direct emission in _postCycle
let eventBus = null;
try {
  const mod = await import('../../gateway/websocket/event-bus.js');
  eventBus = mod.getEventBus();
} catch (e) {
  // Event bus not available
}

export class PayoutRiskAgent extends AutonomousAgent {
  constructor() {
    super({
      agentId: 'PAYOUT_RISK',
      name: 'Payout Risk Monitor',
      role: 'payout_risk_analyst',
      capabilities: [
        'payout_monitoring',
        'velocity_detection',
        'cash_out_analysis'
      ],
      scanIntervalMs: 600000, // 10 minutes
      eventAccelerationThreshold: 3,
      subscribedTopics: ['risk:event:created', 'decision:made']
    });

    // Initialize optional components
    this.knowledgeBase = getKnowledgeBase ? getKnowledgeBase() : null;
    this.calibrator = getConfidenceCalibrator ? getConfidenceCalibrator() : null;
    this.selfCorrection = getSelfCorrection ? getSelfCorrection(this.agentId) : null;
    this.payoutMessenger = getAgentMessenger ? getAgentMessenger() : null;
    this.payoutPatternMemory = getPatternMemory ? getPatternMemory() : null;

    // Internal detection log, capped at 200
    this.detections = [];

    // Register the 5 tools
    this._registerTools();
  }

  // ============================================================================
  // TOOL REGISTRATION
  // ============================================================================

  _registerTools() {
    // 1. get_payout_history
    this.tools.set('get_payout_history', {
      name: 'get_payout_history',
      description: 'Retrieve payout history for a specific seller, sorted by most recent first',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        try {
          const allPayouts = db_ops.getAll('payouts', 1000, 0);
          const sellerPayouts = allPayouts
            .map(e => e.data || e)
            .filter(p => p.sellerId === sellerId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

          return {
            success: true,
            data: {
              payouts: sellerPayouts,
              total: sellerPayouts.length,
              sellerId
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // 2. get_payout_velocity
    this.tools.set('get_payout_velocity', {
      name: 'get_payout_velocity',
      description: 'Compute payout velocity across 24h, 7d, and 30d windows for a seller',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        try {
          const allPayouts = db_ops.getAll('payouts', 1000, 0);
          const sellerPayouts = allPayouts
            .map(e => e.data || e)
            .filter(p => p.sellerId === sellerId);

          const now = Date.now();
          const windows = {
            '24h': { cutoff: now - 24 * 60 * 60 * 1000, count: 0, totalAmount: 0 },
            '7d': { cutoff: now - 7 * 24 * 60 * 60 * 1000, count: 0, totalAmount: 0 },
            '30d': { cutoff: now - 30 * 24 * 60 * 60 * 1000, count: 0, totalAmount: 0 }
          };

          for (const payout of sellerPayouts) {
            const payoutTime = new Date(payout.createdAt).getTime();
            for (const [key, window] of Object.entries(windows)) {
              if (payoutTime >= window.cutoff) {
                window.count++;
                window.totalAmount += payout.amount || 0;
              }
            }
          }

          // Clean up the cutoff field before returning
          const result = {};
          for (const [key, window] of Object.entries(windows)) {
            result[key] = { count: window.count, totalAmount: window.totalAmount };
          }

          return {
            success: true,
            data: {
              sellerId,
              windows: result
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // 3. check_bank_change_timing
    this.tools.set('check_bank_change_timing', {
      name: 'check_bank_change_timing',
      description: 'Check if a seller recently changed bank details and has pending/recent payouts',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        try {
          // Get profile updates for this seller
          const allUpdates = db_ops.getAll('profile_updates', 1000, 0);
          const bankChanges = allUpdates
            .map(e => e.data || e)
            .filter(u => u.sellerId === sellerId && (u.type || '').toLowerCase().includes('bank'))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

          // Get most recent payouts
          const allPayouts = db_ops.getAll('payouts', 1000, 0);
          const recentPayouts = allPayouts
            .map(e => e.data || e)
            .filter(p => p.sellerId === sellerId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);

          let hoursSinceChange = null;
          let recentBankChange = false;

          if (bankChanges.length > 0) {
            const lastChange = new Date(bankChanges[0].createdAt).getTime();
            hoursSinceChange = (Date.now() - lastChange) / (1000 * 60 * 60);
            recentBankChange = true;
          }

          return {
            success: true,
            data: {
              sellerId,
              recentBankChange,
              hoursSinceChange,
              recentPayouts,
              riskIndicator: hoursSinceChange !== null && hoursSinceChange < 48
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // 4. get_seller_dispute_status
    this.tools.set('get_seller_dispute_status', {
      name: 'get_seller_dispute_status',
      description: 'Get dispute statistics for a seller from the cases table',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        try {
          const allCases = db_ops.getAll('cases', 500, 0);
          const sellerCases = allCases
            .map(e => e.data || e)
            .filter(c => c.sellerId === sellerId);

          const openDisputes = sellerCases.filter(
            c => (c.status || '').toLowerCase() === 'open'
          ).length;
          const totalDisputes = sellerCases.length;
          const disputeRate = totalDisputes > 0 ? openDisputes / totalDisputes : 0;

          return {
            success: true,
            data: {
              sellerId,
              openDisputes,
              totalDisputes,
              disputeRate
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // 5. compare_payout_to_revenue
    this.tools.set('compare_payout_to_revenue', {
      name: 'compare_payout_to_revenue',
      description: 'Compare total payout amounts to total revenue for anomaly detection',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) {
          return { success: false, error: 'sellerId is required' };
        }

        try {
          const allPayouts = db_ops.getAll('payouts', 1000, 0);
          const sellerPayouts = allPayouts
            .map(e => e.data || e)
            .filter(p => p.sellerId === sellerId);

          const allTransactions = db_ops.getAll('transactions', 1000, 0);
          const sellerTransactions = allTransactions
            .map(e => e.data || e)
            .filter(t => t.sellerId === sellerId);

          const totalPayouts = sellerPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
          const totalRevenue = sellerTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
          const payoutToRevenueRatio = totalRevenue > 0 ? totalPayouts / totalRevenue : 0;

          return {
            success: true,
            data: {
              sellerId,
              totalPayouts,
              totalRevenue,
              payoutToRevenueRatio,
              isAnomalous: payoutToRevenueRatio > 0.9
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });
  }

  // ============================================================================
  // AUTONOMOUS AGENT OVERRIDES
  // ============================================================================

  /**
   * Transform the event buffer into input for the reason() loop.
   * Filters for payout-related events and groups by sellerId.
   */
  _buildScanInput() {
    // Filter for payout-related events
    const payoutEvents = this.eventBuffer.filter(event => {
      const domain = event.data?.domain || event.domain || '';
      const eventType = event.data?.eventType || event.eventType || '';
      return (
        domain.toLowerCase().includes('payout') ||
        eventType.toLowerCase().includes('payout') ||
        eventType.toLowerCase().includes('bank_change')
      );
    });

    // Group by sellerId
    const sellerMap = {};
    for (const event of payoutEvents) {
      const sellerId = event.data?.sellerId || event.sellerId || 'unknown';
      if (!sellerMap[sellerId]) {
        sellerMap[sellerId] = [];
      }
      sellerMap[sellerId].push(event);
    }

    const sellers = Object.entries(sellerMap).map(([sellerId, events]) => ({
      sellerId,
      events,
      eventCount: events.length
    }));

    return {
      sellers,
      totalEvents: payoutEvents.length,
      scanTimestamp: new Date().toISOString()
    };
  }

  /**
   * Post-processing hook after a successful scan cycle.
   * Extracts detections, emits events, broadcasts via messenger,
   * and writes to knowledge base.
   */
  async _postCycle(result) {
    // Ensure detections array exists
    if (!Array.isArray(this.detections)) {
      this.detections = [];
    }

    // Extract actions/findings from result (handle multiple shapes)
    const detections = result?.actions
      || result?.findings
      || result?.result?.actions
      || result?.result?.findings
      || result?.detections
      || [];

    if (!Array.isArray(detections) || detections.length === 0) {
      return { detectionsEmitted: 0, timestamp: new Date().toISOString() };
    }

    let detectionsEmitted = 0;

    for (const detection of detections) {
      // Push to internal detections log
      this.detections.push({
        ...detection,
        detectedAt: new Date().toISOString()
      });
      detectionsEmitted++;

      // Try to emit on event bus
      try {
        if (eventBus) {
          eventBus.emit('payout-risk:detection', {
            agentId: this.agentId,
            sellerId: detection.sellerId,
            type: detection.type || 'payout_risk',
            severity: detection.severity || 'MEDIUM',
            details: detection
          });
        }
      } catch (e) {
        // Event bus emission failure is non-fatal
      }

      // Try to broadcast via messenger
      try {
        const messenger = this.payoutMessenger || this.messenger;
        if (messenger && typeof messenger.broadcast === 'function') {
          messenger.broadcast({
            from: this.agentId,
            content: {
              type: 'payout_risk_detection',
              sellerId: detection.sellerId,
              severity: detection.severity || 'MEDIUM',
              details: detection
            },
            priority: detection.severity === 'CRITICAL' ? 3 : 2
          });
        }
      } catch (e) {
        // Broadcast failure is non-fatal
      }

      // Try to write to knowledge base
      try {
        if (this.knowledgeBase && typeof this.knowledgeBase.addKnowledge === 'function') {
          this.knowledgeBase.addKnowledge('risk-events', [{
            _id: `PR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            text: `Payout risk detection for seller ${detection.sellerId || 'unknown'}. Type: ${detection.type || 'unknown'}. Severity: ${detection.severity || 'MEDIUM'}.`,
            category: 'payout-risk',
            sellerId: detection.sellerId,
            domain: 'payout',
            outcome: detection.severity === 'CRITICAL' ? 'fraud' : 'suspicious',
            riskScore: detection.riskScore || 50,
            source: this.agentId
          }]);
        }
      } catch (e) {
        // Knowledge base write failure is non-fatal
      }
    }

    // Cap detections at 200
    if (this.detections.length > 200) {
      this.detections = this.detections.slice(-200);
    }

    return { detectionsEmitted, timestamp: new Date().toISOString() };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance = null;

/**
 * Get the singleton PayoutRiskAgent instance.
 * @returns {PayoutRiskAgent}
 */
export function getPayoutRiskAgent() {
  if (!instance) {
    instance = new PayoutRiskAgent();
  }
  return instance;
}

export default PayoutRiskAgent;
