/**
 * Profile Mutation Agent
 *
 * Autonomous agent that monitors seller profile changes (bank account, address,
 * email, phone, identity documents) to detect account takeover follow-through,
 * identity manipulation, and evasion patterns. Profile changes are the canary
 * signal for ATO and pre-cash-out activity.
 *
 * Extends AutonomousAgent with a 10-minute scan interval and 5 registered tools.
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

export class ProfileMutationAgent extends AutonomousAgent {
  constructor() {
    super({
      agentId: 'PROFILE_MUTATION',
      name: 'Profile Mutation Tracker',
      role: 'profile_analyst',
      capabilities: [
        'profile_monitoring',
        'identity_change_detection',
        'ato_followthrough_analysis'
      ],
      scanIntervalMs: 600000, // 10 minutes
      eventAccelerationThreshold: 3,
      subscribedTopics: ['risk:event:created', 'profile:updated']
    });

    this.knowledgeBase = getKnowledgeBase ? getKnowledgeBase() : null;
    this.calibrator = getConfidenceCalibrator ? getConfidenceCalibrator() : null;
    this.selfCorrection = getSelfCorrection ? getSelfCorrection(this.agentId) : null;
    this.profileMessenger = getAgentMessenger ? getAgentMessenger() : null;
    this.detections = [];

    this._registerTools();
  }

  // ============================================================================
  // TOOL REGISTRATION
  // ============================================================================

  _registerTools() {
    // 1. get_profile_change_history
    this.tools.set('get_profile_change_history', {
      name: 'get_profile_change_history',
      description: 'Retrieve full profile change timeline for a seller',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) return { success: false, error: 'sellerId is required' };

        try {
          const allUpdates = db_ops.getAll('profile_updates', 1000, 0);
          const updates = allUpdates
            .map(e => e.data || e)
            .filter(u => u.sellerId === sellerId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

          return {
            success: true,
            data: { sellerId, updates, total: updates.length }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // 2. get_change_velocity
    this.tools.set('get_change_velocity', {
      name: 'get_change_velocity',
      description: 'Compute profile change frequency by type over time windows',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) return { success: false, error: 'sellerId is required' };

        try {
          const allUpdates = db_ops.getAll('profile_updates', 1000, 0);
          const updates = allUpdates
            .map(e => e.data || e)
            .filter(u => u.sellerId === sellerId);

          const now = Date.now();
          const windows = {};
          for (const [label, ms] of [['24h', 86400000], ['7d', 604800000], ['30d', 2592000000]]) {
            const cutoff = now - ms;
            const inWindow = updates.filter(u => new Date(u.createdAt).getTime() >= cutoff);
            const byType = {};
            for (const u of inWindow) {
              const t = u.type || u.updateType || 'unknown';
              byType[t] = (byType[t] || 0) + 1;
            }
            windows[label] = { count: inWindow.length, byType };
          }

          return {
            success: true,
            data: { sellerId, windows, totalChanges: updates.length }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // 3. check_device_history
    this.tools.set('check_device_history', {
      name: 'check_device_history',
      description: 'Check whether the device used for profile changes is known for this seller',
      handler: async (params) => {
        const { sellerId, deviceId } = params;
        if (!sellerId) return { success: false, error: 'sellerId is required' };

        try {
          const allAto = db_ops.getAll('ato_events', 500, 0);
          const sellerDevices = allAto
            .map(e => e.data || e)
            .filter(a => a.sellerId === sellerId)
            .map(a => a.deviceId || a.device_id || a.deviceFingerprint)
            .filter(Boolean);

          const knownDevices = [...new Set(sellerDevices)];
          const isKnown = deviceId ? knownDevices.includes(deviceId) : null;

          return {
            success: true,
            data: {
              sellerId,
              knownDevices,
              deviceCount: knownDevices.length,
              queriedDevice: deviceId || null,
              isKnownDevice: isKnown
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // 4. get_dispute_context
    this.tools.set('get_dispute_context', {
      name: 'get_dispute_context',
      description: 'Check open disputes and their timing relative to profile changes',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) return { success: false, error: 'sellerId is required' };

        try {
          const allCases = db_ops.getAll('cases', 500, 0);
          const sellerCases = allCases
            .map(e => e.data || e)
            .filter(c => c.sellerId === sellerId);

          const openCases = sellerCases.filter(c =>
            (c.status || '').toLowerCase() === 'open' || (c.status || '').toLowerCase() === 'in_review'
          );

          const allUpdates = db_ops.getAll('profile_updates', 1000, 0);
          const recentChanges = allUpdates
            .map(e => e.data || e)
            .filter(u => u.sellerId === sellerId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);

          const changesNearDisputes = recentChanges.filter(change => {
            const changeTime = new Date(change.createdAt).getTime();
            return openCases.some(c => {
              const caseTime = new Date(c.createdAt).getTime();
              return Math.abs(changeTime - caseTime) < 7 * 86400000; // within 7 days
            });
          });

          return {
            success: true,
            data: {
              sellerId,
              openDisputes: openCases.length,
              totalDisputes: sellerCases.length,
              recentChanges: recentChanges.length,
              changesNearDisputes: changesNearDisputes.length,
              riskIndicator: openCases.length > 0 && changesNearDisputes.length > 0
            }
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });

    // 5. compare_identity_documents
    this.tools.set('compare_identity_documents', {
      name: 'compare_identity_documents',
      description: 'Compare current vs previous identity document submissions',
      handler: async (params) => {
        const { sellerId } = params;
        if (!sellerId) return { success: false, error: 'sellerId is required' };

        try {
          const allUpdates = db_ops.getAll('profile_updates', 1000, 0);
          const docChanges = allUpdates
            .map(e => e.data || e)
            .filter(u => {
              if (u.sellerId !== sellerId) return false;
              const t = (u.type || u.updateType || '').toLowerCase();
              return t.includes('identity') || t.includes('document') || t.includes('kyc');
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

          const reuploadCount = docChanges.length;
          const last24h = docChanges.filter(d =>
            Date.now() - new Date(d.createdAt).getTime() < 86400000
          ).length;

          return {
            success: true,
            data: {
              sellerId,
              documentChanges: docChanges.slice(0, 10),
              totalReUploads: reuploadCount,
              reUploadsLast24h: last24h,
              rapidReUpload: last24h >= 3
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
    const profileEvents = this.eventBuffer.filter(event => {
      const domain = event.data?.domain || event.domain || '';
      const eventType = event.data?.eventType || event.eventType || '';
      return (
        domain.toLowerCase().includes('profile') ||
        eventType.toLowerCase().includes('profile') ||
        eventType.toLowerCase().includes('identity') ||
        eventType.toLowerCase().includes('bank_change')
      );
    });

    const sellerMap = {};
    for (const event of profileEvents) {
      const sellerId = event.data?.sellerId || event.sellerId || 'unknown';
      if (!sellerMap[sellerId]) sellerMap[sellerId] = [];
      sellerMap[sellerId].push(event);
    }

    return {
      sellers: Object.entries(sellerMap).map(([sellerId, events]) => ({
        sellerId, events, eventCount: events.length
      })),
      totalEvents: profileEvents.length,
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
          eventBus.emit('profile-mutation:detection', {
            agentId: this.agentId,
            sellerId: detection.sellerId,
            type: detection.type || 'profile_mutation',
            severity: detection.severity || 'MEDIUM'
          });
        }
      } catch (e) { /* non-fatal */ }

      try {
        const messenger = this.profileMessenger || this.messenger;
        if (messenger && typeof messenger.broadcast === 'function') {
          messenger.broadcast({
            from: this.agentId,
            content: { type: 'profile_mutation_detection', sellerId: detection.sellerId, details: detection },
            priority: detection.severity === 'CRITICAL' ? 3 : 2
          });
        }
      } catch (e) { /* non-fatal */ }

      try {
        if (this.knowledgeBase && typeof this.knowledgeBase.addKnowledge === 'function') {
          this.knowledgeBase.addKnowledge('risk-events', [{
            _id: `PM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            text: `Profile mutation detection for seller ${detection.sellerId || 'unknown'}. Type: ${detection.type || 'unknown'}.`,
            category: 'profile-mutation',
            sellerId: detection.sellerId,
            domain: 'profile_updates',
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

export function getProfileMutationAgent() {
  if (!instance) {
    instance = new ProfileMutationAgent();
  }
  return instance;
}

export default ProfileMutationAgent;
