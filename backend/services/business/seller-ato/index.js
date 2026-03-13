import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { generateATOEvent } from '../../../shared/synthetic-data/generators.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getATODetectionAgent } from '../../../agents/specialized/ato-detection-agent.js';

const router = express.Router();

// Get all ATO events
router.get('/events', async (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, riskLevel, eventType } = req.query;

    let events = await db_ops.getAll('ato_events', parseInt(limit), parseInt(offset));
    events = events.map(e => e.data);

    if (sellerId) events = events.filter(e => e.sellerId === sellerId);
    if (riskLevel) events = events.filter(e => e.riskLevel === riskLevel);
    if (eventType) events = events.filter(e => e.eventType === eventType);

    res.json({
      success: true,
      data: events,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: await db_ops.count('ato_events')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get ATO event by ID
router.get('/events/:eventId', async (req, res) => {
  try {
    const event = await db_ops.getById('ato_events', 'event_id', req.params.eventId);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    res.json({ success: true, data: event.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Evaluate ATO risk for a login/action — async fire-and-forget with real-time TPAOR streaming
router.post('/evaluate', async (req, res) => {
  try {
    const { sellerId, eventType, deviceInfo, location, sessionData } = req.body;

    const seller = await db_ops.getById('sellers', 'seller_id', sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const eventId = `ATO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const correlationId = `ATO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Create event immediately with EVALUATING status
    const event = {
      eventId,
      sellerId,
      eventType,
      riskLevel: 'PENDING',
      riskScore: null,
      signals: {},
      deviceInfo,
      location,
      outcome: 'EVALUATING',
      timestamp: new Date().toISOString()
    };

    await db_ops.insert('ato_events', 'event_id', event.eventId, event);

    // Return HTTP 202 immediately
    res.status(202).json({
      success: true,
      correlationId,
      eventId,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    // Fire-and-forget: run ATODetectionAgent asynchronously
    console.log(`[ATOService] Evaluating event: ${eventId} (correlation: ${correlationId})`);

    const agent = getATODetectionAgent();
    agent.reason({
      type: 'ato_detection',
      eventId,
      sellerId,
      eventType,
      deviceFingerprint: deviceInfo?.fingerprint,
      location,
      sessionData,
      sellerData: seller.data,
      submittedAt: new Date().toISOString()
    }, {
      entityId: eventId,
      evaluationType: 'ato_detection',
      _correlationId: correlationId
    })
      .then(async agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'BLOCK';
        const riskScore = agentResult.result?.overallRisk?.score ?? 75;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'ATO_DETECTION';

        let outcome;
        if (decision === 'ALLOW') outcome = 'ALLOWED';
        else if (decision === 'CHALLENGE') outcome = 'CHALLENGED';
        else outcome = 'BLOCKED';

        const riskLevel = riskScore >= 66 ? 'CRITICAL' : riskScore >= 40 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW';

        await db_ops.update('ato_events', 'event_id', eventId, {
          ...event,
          riskLevel,
          riskScore,
          outcome,
          riskAssessment: { riskScore, decision, reasoning, agentId, evaluatedAt: new Date().toISOString() }
        });

        emitRiskEvent({
          sellerId, domain: 'ato',
          eventType: decision === 'ALLOW' ? 'ATO_ALLOWED' : decision === 'CHALLENGE' ? 'ATO_CHALLENGED' : 'ATO_BLOCKED',
          riskScore, metadata: { decision, eventId, eventType }
        });

        if (decision === 'BLOCK' || decision === 'CHALLENGE') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          const caseData = {
            caseId, checkpoint: 'ATO_DETECTION',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN', sellerId, entityId: eventId, entityType: 'ATO_EVENT',
            decision, riskScore, reasoning, agentId, createdAt: new Date().toISOString()
          };
          await db_ops.insert('cases', 'case_id', caseId, caseData);
        }

        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:complete', {
              correlationId, sellerId, entityId: eventId, decision, riskScore, reasoning,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}

        console.log(`[ATOService] Completed: ${eventId} → ${decision} (risk: ${riskScore})`);
      })
      .catch(async error => {
        console.error(`[ATOService] Agent error for ${eventId}:`, error.message);
        await db_ops.update('ato_events', 'event_id', eventId, {
          ...event,
          riskLevel: 'HIGH',
          riskScore: 75,
          outcome: 'BLOCKED',
          riskAssessment: { riskScore: 75, decision: 'BLOCK', reasoning: `Agent error — defaulting to BLOCK: ${error.message}`, agentId: 'ATO_DETECTION', evaluatedAt: new Date().toISOString() }
        });
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:error', {
              correlationId, sellerId, entityId: eventId, error: error.message,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}
      });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get ATO events for a specific seller
router.get('/sellers/:sellerId/events', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const events = (await db_ops.getAll('ato_events', 1000, 0)).map(e => e.data)
      .filter(e => e.sellerId === req.params.sellerId)
      .slice(0, parseInt(limit));

    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get ATO statistics
router.get('/stats', async (req, res) => {
  try {
    const allEvents = (await db_ops.getAll('ato_events', 10000, 0)).map(e => e.data);

    const stats = {
      total: allEvents.length,
      byRiskLevel: {},
      byEventType: {},
      byOutcome: {},
      last24Hours: {
        total: 0,
        blocked: 0,
        challenged: 0
      },
      topSignals: {}
    };

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    allEvents.forEach(e => {
      stats.byRiskLevel[e.riskLevel] = (stats.byRiskLevel[e.riskLevel] || 0) + 1;
      stats.byEventType[e.eventType] = (stats.byEventType[e.eventType] || 0) + 1;
      stats.byOutcome[e.outcome] = (stats.byOutcome[e.outcome] || 0) + 1;

      if (new Date(e.timestamp) > oneDayAgo) {
        stats.last24Hours.total++;
        if (e.outcome === 'BLOCKED') stats.last24Hours.blocked++;
        if (e.outcome === 'CHALLENGED') stats.last24Hours.challenged++;
      }

      // Count signals
      if (e.signals) {
        Object.entries(e.signals).forEach(([key, value]) => {
          if (value === true) {
            stats.topSignals[key] = (stats.topSignals[key] || 0) + 1;
          }
        });
      }
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get device trust score
router.get('/device/:fingerprint/trust', async (req, res) => {
  try {
    const { fingerprint } = req.params;

    // Find all events with this device
    const events = (await db_ops.getAll('ato_events', 10000, 0)).map(e => e.data)
      .filter(e => e.deviceInfo?.fingerprint === fingerprint);

    const trustScore = calculateDeviceTrust(events);

    res.json({
      success: true,
      data: {
        fingerprint,
        trustScore,
        eventsCount: events.length,
        firstSeen: events.length > 0 ? events[events.length - 1].timestamp : null,
        lastSeen: events.length > 0 ? events[0].timestamp : null,
        associatedSellers: [...new Set(events.map(e => e.sellerId))]
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function for ATO evaluation
function performATOEvaluation({ sellerId, eventType, deviceInfo, location, sessionData, sellerData, recentEvents }) {
  const signals = {
    newDevice: false,
    newLocation: false,
    impossibleTravel: false,
    bruteForce: false,
    credentialStuffing: false,
    unusualTime: false,
    suspiciousUserAgent: false
  };

  let riskScore = 0;

  // Check for new device
  const knownDevices = recentEvents.map(e => e.deviceInfo?.fingerprint).filter(Boolean);
  if (deviceInfo?.fingerprint && !knownDevices.includes(deviceInfo.fingerprint)) {
    signals.newDevice = true;
    riskScore += 20;
  }

  // Check for new location
  const knownCountries = recentEvents.map(e => e.location?.country).filter(Boolean);
  if (location?.country && !knownCountries.includes(location.country)) {
    signals.newLocation = true;
    riskScore += 15;
  }

  // Check for impossible travel
  if (recentEvents.length > 0) {
    const lastEvent = recentEvents[0];
    const timeDiff = new Date() - new Date(lastEvent.timestamp);
    if (timeDiff < 60 * 60 * 1000 && lastEvent.location?.country !== location?.country) {
      signals.impossibleTravel = true;
      riskScore += 40;
    }
  }

  // Check for brute force (multiple failed attempts)
  const recentFailedLogins = recentEvents.filter(e =>
    e.eventType === 'LOGIN_ATTEMPT' &&
    e.outcome === 'BLOCKED' &&
    new Date() - new Date(e.timestamp) < 15 * 60 * 1000
  );
  if (recentFailedLogins.length >= 3) {
    signals.bruteForce = true;
    riskScore += 35;
  }

  // Check for unusual time
  const hour = new Date().getHours();
  if (hour >= 2 && hour <= 5) {
    signals.unusualTime = true;
    riskScore += 10;
  }

  // Sensitive event type adjustments
  if (['PASSWORD_CHANGE', 'EMAIL_CHANGE', 'BANK_CHANGE', 'MFA_DISABLED'].includes(eventType)) {
    riskScore += 15;
  }

  // Determine risk level and decision
  let riskLevel, decision;
  if (riskScore >= 70) {
    riskLevel = 'CRITICAL';
    decision = 'BLOCKED';
  } else if (riskScore >= 50) {
    riskLevel = 'HIGH';
    decision = 'CHALLENGED';
  } else if (riskScore >= 30) {
    riskLevel = 'MEDIUM';
    decision = 'CHALLENGED';
  } else {
    riskLevel = 'LOW';
    decision = 'ALLOWED';
  }

  return {
    riskScore,
    riskLevel,
    signals,
    decision,
    evaluatedAt: new Date().toISOString()
  };
}

function calculateDeviceTrust(events) {
  if (events.length === 0) return 0;

  let trustScore = 50; // Start neutral

  // Positive factors
  const successfulLogins = events.filter(e => e.outcome === 'ALLOWED').length;
  trustScore += Math.min(successfulLogins * 2, 30);

  // Negative factors
  const blockedAttempts = events.filter(e => e.outcome === 'BLOCKED').length;
  trustScore -= blockedAttempts * 10;

  // Age factor
  const firstSeen = new Date(events[events.length - 1].timestamp);
  const daysSinceFirstSeen = (new Date() - firstSeen) / (1000 * 60 * 60 * 24);
  trustScore += Math.min(daysSinceFirstSeen, 20);

  return Math.max(0, Math.min(100, Math.round(trustScore)));
}

export default router;
