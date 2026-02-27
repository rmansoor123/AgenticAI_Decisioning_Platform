/**
 * Returns Abuse Agent
 *
 * Autonomous agent that monitors return requests and refund patterns to detect
 * buyer-side fraud: serial returners, empty box schemes, wardrobing, and refund
 * abuse. Returns are the primary vector for buyer-initiated fraud on the platform.
 *
 * Extends AutonomousAgent with a 20-minute scan interval and 5 registered tools.
 */

import { AutonomousAgent } from '../core/autonomous-agent.js';
import { db_ops } from '../../shared/common/database.js';

// Optional imports
let getKnowledgeBase = null;
try {
  const mod = await import('../core/knowledge-base.js');
  getKnowledgeBase = mod.getKnowledgeBase;
} catch (e) { /* not available */ }

let getConfidenceCalibrator = null;
try {
  const mod = await import('../core/confidence-calibrator.js');
  getConfidenceCalibrator = mod.getConfidenceCalibrator;
} catch (e) { /* not available */ }

let getSelfCorrection = null;
try {
  const mod = await import('../core/self-correction.js');
  getSelfCorrection = mod.createSelfCorrection;
} catch (e) { /* not available */ }

let getAgentMessenger = null;
try {
  const mod = await import('../core/agent-messenger.js');
  getAgentMessenger = mod.getAgentMessenger;
} catch (e) { /* not available */ }

let eventBus = null;
try {
  const mod = await import('../../gateway/websocket/event-bus.js');
  eventBus = mod.getEventBus();
} catch (e) { /* not available */ }

export class ReturnsAbuseAgent extends AutonomousAgent {
  constructor() {
    super({
      agentId: 'RETURNS_ABUSE',
      name: 'Returns Abuse Detector',
      role: 'returns_analyst',
      capabilities: [
        'returns_monitoring',
        'serial_returner_detection',
        'refund_abuse_analysis'
      ],
      scanIntervalMs: 1200000, // 20 minutes
      eventAccelerationThreshold: 4,
      subscribedTopics: ['risk:event:created', 'return:created']
    });

    this.knowledgeBase = getKnowledgeBase ? getKnowledgeBase() : null;
    this.calibrator = getConfidenceCalibrator ? getConfidenceCalibrator() : null;
    this.selfCorrection = getSelfCorrection ? getSelfCorrection(this.agentId) : null;
    this.returnsMessenger = getAgentMessenger ? getAgentMessenger() : null;
    this.detections = [];

    this._registerTools();
  }

  // ============================================================================
  // TOOL REGISTRATION
  // ============================================================================

  _registerTools() {
    // 1. get_return_history
    this.tools.set('get_return_history', {
      name: 'get_return_history',
      description: 'Retrieve full return timeline for a seller with reasons and statuses',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) return { success: false, error: 'sellerId is required' };

        try {
          const allReturns = db_ops.getAll('returns', 1000, 0);
          const returns = allReturns
            .map(e => e.data || e)
            .filter(r => r.sellerId === sellerId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

          return {
            success: true,
            data: { sellerId, returns, total: returns.length }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // 2. get_return_rate_stats
    this.tools.set('get_return_rate_stats', {
      name: 'get_return_rate_stats',
      description: 'Compute return rates by category and time window',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) return { success: false, error: 'sellerId is required' };

        try {
          const allReturns = db_ops.getAll('returns', 1000, 0);
          const returns = allReturns
            .map(e => e.data || e)
            .filter(r => r.sellerId === sellerId);

          const allTxns = db_ops.getAll('transactions', 5000, 0);
          const transactions = allTxns
            .map(e => e.data || e)
            .filter(t => t.sellerId === sellerId);

          const returnRate = transactions.length > 0 ? returns.length / transactions.length : 0;

          // Group by reason
          const byReason = {};
          for (const r of returns) {
            const reason = r.reason || r.returnReason || 'unknown';
            byReason[reason] = (byReason[reason] || 0) + 1;
          }

          // Time window counts
          const now = Date.now();
          const windows = {};
          for (const [label, ms] of [['7d', 604800000], ['30d', 2592000000], ['90d', 7776000000]]) {
            const cutoff = now - ms;
            windows[label] = returns.filter(r => new Date(r.createdAt).getTime() >= cutoff).length;
          }

          return {
            success: true,
            data: { sellerId, returnRate: Math.round(returnRate * 100) / 100, totalReturns: returns.length, totalTransactions: transactions.length, byReason, windows }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // 3. check_refund_amount_validity
    this.tools.set('check_refund_amount_validity', {
      name: 'check_refund_amount_validity',
      description: 'Compare refund amounts to original transaction amounts',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) return { success: false, error: 'sellerId is required' };

        try {
          const allReturns = db_ops.getAll('returns', 1000, 0);
          const returns = allReturns
            .map(e => e.data || e)
            .filter(r => r.sellerId === sellerId);

          let anomalousRefunds = 0;
          const details = [];

          for (const ret of returns) {
            const refundAmount = ret.refundAmount || ret.amount || 0;
            const originalAmount = ret.originalAmount || ret.transactionAmount || 0;

            if (originalAmount > 0 && refundAmount > originalAmount) {
              anomalousRefunds++;
              details.push({
                returnId: ret.returnId || ret.id,
                refundAmount,
                originalAmount,
                overage: refundAmount - originalAmount
              });
            }
          }

          return {
            success: true,
            data: {
              sellerId,
              totalReturns: returns.length,
              anomalousRefunds,
              anomalyRate: returns.length > 0 ? anomalousRefunds / returns.length : 0,
              details: details.slice(0, 10)
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // 4. get_buyer_return_profile
    this.tools.set('get_buyer_return_profile', {
      name: 'get_buyer_return_profile',
      description: 'Analyze buyer return patterns across all sellers for serial returner detection',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) return { success: false, error: 'sellerId is required' };

        try {
          const allReturns = db_ops.getAll('returns', 1000, 0);
          const sellerReturns = allReturns
            .map(e => e.data || e)
            .filter(r => r.sellerId === sellerId);

          // Group by buyerId
          const buyerMap = {};
          for (const r of sellerReturns) {
            const buyerId = r.buyerId || r.customerId || 'unknown';
            if (!buyerMap[buyerId]) buyerMap[buyerId] = [];
            buyerMap[buyerId].push(r);
          }

          const serialReturners = Object.entries(buyerMap)
            .filter(([, returns]) => returns.length >= 3)
            .map(([buyerId, returns]) => ({
              buyerId,
              returnCount: returns.length,
              totalRefunded: returns.reduce((sum, r) => sum + (r.refundAmount || r.amount || 0), 0)
            }))
            .sort((a, b) => b.returnCount - a.returnCount);

          return {
            success: true,
            data: {
              sellerId,
              uniqueBuyers: Object.keys(buyerMap).length,
              serialReturners,
              serialReturnerCount: serialReturners.length
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // 5. check_payout_return_timing
    this.tools.set('check_payout_return_timing', {
      name: 'check_payout_return_timing',
      description: 'Correlate seller payout times with return filing times for collusion detection',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) return { success: false, error: 'sellerId is required' };

        try {
          const allPayouts = db_ops.getAll('payouts', 1000, 0);
          const payouts = allPayouts
            .map(e => e.data || e)
            .filter(p => p.sellerId === sellerId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

          const allReturns = db_ops.getAll('returns', 1000, 0);
          const returns = allReturns
            .map(e => e.data || e)
            .filter(r => r.sellerId === sellerId);

          // Check returns filed within 48h of payouts
          let returnsNearPayouts = 0;
          for (const payout of payouts) {
            const payoutTime = new Date(payout.createdAt).getTime();
            for (const ret of returns) {
              const retTime = new Date(ret.createdAt).getTime();
              if (retTime >= payoutTime && retTime - payoutTime < 48 * 3600000) {
                returnsNearPayouts++;
              }
            }
          }

          return {
            success: true,
            data: {
              sellerId,
              totalPayouts: payouts.length,
              totalReturns: returns.length,
              returnsNearPayouts,
              collusionIndicator: returnsNearPayouts >= 3
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

  _buildScanInput() {
    const returnEvents = this.eventBuffer.filter(event => {
      const domain = event.data?.domain || event.domain || '';
      const eventType = event.data?.eventType || event.eventType || '';
      return (
        domain.toLowerCase().includes('return') ||
        eventType.toLowerCase().includes('return') ||
        eventType.toLowerCase().includes('refund')
      );
    });

    const sellerMap = {};
    for (const event of returnEvents) {
      const sellerId = event.data?.sellerId || event.sellerId || 'unknown';
      if (!sellerMap[sellerId]) sellerMap[sellerId] = [];
      sellerMap[sellerId].push(event);
    }

    return {
      sellers: Object.entries(sellerMap).map(([sellerId, events]) => ({
        sellerId, events, eventCount: events.length
      })),
      totalEvents: returnEvents.length,
      scanTimestamp: new Date().toISOString()
    };
  }

  async _postCycle(result) {
    if (!Array.isArray(this.detections)) this.detections = [];

    const detections = result?.actions || result?.findings
      || result?.result?.actions || result?.result?.findings
      || result?.detections || [];

    if (!Array.isArray(detections) || detections.length === 0) {
      return { detectionsEmitted: 0, timestamp: new Date().toISOString() };
    }

    let detectionsEmitted = 0;

    for (const detection of detections) {
      this.detections.push({ ...detection, detectedAt: new Date().toISOString() });
      detectionsEmitted++;

      try {
        if (eventBus) {
          eventBus.emit('returns-abuse:detection', {
            agentId: this.agentId,
            sellerId: detection.sellerId,
            type: detection.type || 'returns_abuse',
            severity: detection.severity || 'MEDIUM'
          });
        }
      } catch (e) { /* non-fatal */ }

      try {
        const messenger = this.returnsMessenger || this.messenger;
        if (messenger && typeof messenger.broadcast === 'function') {
          messenger.broadcast({
            from: this.agentId,
            content: { type: 'returns_abuse_detection', sellerId: detection.sellerId, details: detection },
            priority: detection.severity === 'CRITICAL' ? 3 : 2
          });
        }
      } catch (e) { /* non-fatal */ }

      try {
        if (this.knowledgeBase && typeof this.knowledgeBase.addKnowledge === 'function') {
          this.knowledgeBase.addKnowledge('risk-events', [{
            _id: `RA-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            text: `Returns abuse detection for seller ${detection.sellerId || 'unknown'}. Type: ${detection.type || 'unknown'}.`,
            category: 'returns-abuse',
            sellerId: detection.sellerId,
            domain: 'returns',
            riskScore: detection.riskScore || 50,
            source: this.agentId
          }]);
        }
      } catch (e) { /* non-fatal */ }
    }

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

export function getReturnsAbuseAgent() {
  if (!instance) {
    instance = new ReturnsAbuseAgent();
  }
  return instance;
}

export default ReturnsAbuseAgent;
