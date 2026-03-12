import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getNetworkIntelligenceAgent } from '../../../agents/specialized/network-intelligence-agent.js';

const router = express.Router();

// Get all network scans
router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status, scanType } = req.query;

    let scans = db_ops.getAll('network_scans', parseInt(limit), parseInt(offset));
    scans = scans.map(s => s.data);

    if (sellerId) scans = scans.filter(s => s.sellerId === sellerId);
    if (status) scans = scans.filter(s => s.status === status);
    if (scanType) scans = scans.filter(s => s.scanType === scanType);

    res.json({
      success: true,
      data: scans,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: db_ops.count('network_scans')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get network scan statistics
router.get('/stats', (req, res) => {
  try {
    const allScans = db_ops.getAll('network_scans', 10000, 0).map(s => s.data);

    const stats = {
      total: allScans.length,
      byStatus: {},
      byScanType: {},
      last24Hours: {
        total: 0,
        blocked: 0,
        flagged: 0
      },
      linkedSellersDetected: 0,
      sharedInfrastructureDetected: 0
    };

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    allScans.forEach(s => {
      stats.byStatus[s.status] = (stats.byStatus[s.status] || 0) + 1;
      if (s.scanType) stats.byScanType[s.scanType] = (stats.byScanType[s.scanType] || 0) + 1;
      if (s.linkedSellers?.length > 0) stats.linkedSellersDetected++;
      if (s.sharedInfrastructure?.length > 0) stats.sharedInfrastructureDetected++;

      if (new Date(s.createdAt) > oneDayAgo) {
        stats.last24Hours.total++;
        if (s.status === 'BLOCK') stats.last24Hours.blocked++;
        if (s.status === 'FLAG') stats.last24Hours.flagged++;
      }
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get network scan by ID
router.get('/:id', (req, res) => {
  try {
    const scan = db_ops.getById('network_scans', 'scan_id', req.params.id);
    if (!scan) {
      return res.status(404).json({ success: false, error: 'Network scan not found' });
    }
    res.json({ success: true, data: scan.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create network scan and evaluate
router.post('/', async (req, res) => {
  try {
    const { sellerId, scanType, linkedSellers, sharedInfrastructure, deviceFingerprints, bankAccounts } = req.body;

    const seller = db_ops.getById('sellers', 'seller_id', sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const scanId = `NET-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const correlationId = `NET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const record = {
      scanId,
      sellerId,
      scanType,
      linkedSellers,
      sharedInfrastructure,
      deviceFingerprints,
      bankAccounts,
      status: 'EVALUATING',
      riskScore: null,
      riskLevel: null,
      createdAt: new Date().toISOString()
    };

    db_ops.insert('network_scans', 'scan_id', scanId, record);

    res.status(202).json({
      success: true,
      correlationId,
      scanId,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    // Fire-and-forget: run NetworkIntelligenceAgent asynchronously
    console.log(`[NetworkService] Evaluating scan: ${scanId} (correlation: ${correlationId})`);

    const agent = getNetworkIntelligenceAgent();
    agent.reason({
      type: 'network_intelligence',
      scanId,
      sellerId,
      scanType,
      linkedSellers,
      sharedInfrastructure,
      deviceFingerprints,
      bankAccounts,
      sellerData: seller.data,
      submittedAt: new Date().toISOString()
    }, {
      entityId: scanId,
      evaluationType: 'network_intelligence',
      _correlationId: correlationId
    })
      .then(agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'BLOCK';
        const riskScore = agentResult.result?.overallRisk?.score ?? 75;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'NETWORK_INTELLIGENCE';

        const riskLevel = riskScore >= 66 ? 'CRITICAL' : riskScore >= 40 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW';

        db_ops.update('network_scans', 'scan_id', scanId, {
          ...record,
          status: decision,
          riskScore,
          riskLevel,
          riskAssessment: { riskScore, decision, reasoning, agentId, evaluatedAt: new Date().toISOString() }
        });

        emitRiskEvent({
          sellerId, domain: 'network',
          eventType: decision === 'CLEAR' ? 'NETWORK_CLEARED' : decision === 'FLAG' ? 'NETWORK_FLAGGED' : 'NETWORK_BLOCKED',
          riskScore, metadata: { decision, scanId, scanType }
        });

        if (decision !== 'CLEAR') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          const caseData = {
            caseId, checkpoint: 'NETWORK_INTELLIGENCE',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN', sellerId, entityId: scanId, entityType: 'NETWORK_SCAN',
            decision, riskScore, reasoning, agentId, createdAt: new Date().toISOString()
          };
          db_ops.insert('cases', 'case_id', caseId, caseData);
        }

        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:complete', {
              correlationId, sellerId, entityId: scanId, decision, riskScore, reasoning,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}

        console.log(`[NetworkService] Completed: ${scanId} → ${decision} (risk: ${riskScore})`);
      })
      .catch(error => {
        console.error(`[NetworkService] Agent error for ${scanId}:`, error.message);
        db_ops.update('network_scans', 'scan_id', scanId, {
          ...record,
          status: 'BLOCK',
          riskScore: 75,
          riskLevel: 'HIGH',
          riskAssessment: { riskScore: 75, decision: 'BLOCK', reasoning: `Agent error — defaulting to BLOCK: ${error.message}`, agentId: 'NETWORK_INTELLIGENCE', evaluatedAt: new Date().toISOString() }
        });
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:error', {
              correlationId, sellerId, entityId: scanId, error: error.message,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}
      });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update network scan status
router.patch('/:id/status', (req, res) => {
  try {
    const { status, reason } = req.body;
    const scan = db_ops.getById('network_scans', 'scan_id', req.params.id);
    if (!scan) {
      return res.status(404).json({ success: false, error: 'Network scan not found' });
    }

    const validStatuses = ['CLEAR', 'FLAG', 'BLOCK', 'EVALUATING'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    db_ops.update('network_scans', 'scan_id', req.params.id, {
      ...scan.data,
      status,
      statusReason: reason,
      statusUpdatedAt: new Date().toISOString()
    });

    res.json({ success: true, data: { scanId: req.params.id, status, updatedAt: new Date().toISOString() } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
