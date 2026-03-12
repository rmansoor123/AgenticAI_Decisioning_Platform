import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getComplianceAgent } from '../../../agents/specialized/compliance-agent.js';

const router = express.Router();

// Get all compliance checks
router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status, checkType } = req.query;

    let checks = db_ops.getAll('compliance_checks', parseInt(limit), parseInt(offset));
    checks = checks.map(c => c.data);

    if (sellerId) checks = checks.filter(c => c.sellerId === sellerId);
    if (status) checks = checks.filter(c => c.status === status);
    if (checkType) checks = checks.filter(c => c.checkType === checkType);

    res.json({
      success: true,
      data: checks,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: db_ops.count('compliance_checks')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get compliance check statistics
router.get('/stats', (req, res) => {
  try {
    const allChecks = db_ops.getAll('compliance_checks', 10000, 0).map(c => c.data);

    const stats = {
      total: allChecks.length,
      byStatus: {},
      byCheckType: {},
      byJurisdiction: {},
      last24Hours: {
        total: 0,
        blocked: 0,
        reviewed: 0
      },
      cryptoActivityCount: 0
    };

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    allChecks.forEach(c => {
      stats.byStatus[c.status] = (stats.byStatus[c.status] || 0) + 1;
      if (c.checkType) stats.byCheckType[c.checkType] = (stats.byCheckType[c.checkType] || 0) + 1;
      if (c.jurisdiction) stats.byJurisdiction[c.jurisdiction] = (stats.byJurisdiction[c.jurisdiction] || 0) + 1;
      if (c.cryptoActivity) stats.cryptoActivityCount++;

      if (new Date(c.createdAt) > oneDayAgo) {
        stats.last24Hours.total++;
        if (c.status === 'BLOCK') stats.last24Hours.blocked++;
        if (c.status === 'REVIEW') stats.last24Hours.reviewed++;
      }
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get compliance check by ID
router.get('/:id', (req, res) => {
  try {
    const check = db_ops.getById('compliance_checks', 'check_id', req.params.id);
    if (!check) {
      return res.status(404).json({ success: false, error: 'Compliance check not found' });
    }
    res.json({ success: true, data: check.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create compliance check and evaluate
router.post('/', async (req, res) => {
  try {
    const { sellerId, checkType, transactionVolume, linkedAccounts, jurisdiction, cryptoActivity } = req.body;

    const seller = db_ops.getById('sellers', 'seller_id', sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const checkId = `CMP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const correlationId = `CMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const record = {
      checkId,
      sellerId,
      checkType,
      transactionVolume,
      linkedAccounts,
      jurisdiction,
      cryptoActivity,
      status: 'EVALUATING',
      riskScore: null,
      riskLevel: null,
      createdAt: new Date().toISOString()
    };

    db_ops.insert('compliance_checks', 'check_id', checkId, record);

    res.status(202).json({
      success: true,
      correlationId,
      checkId,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    // Fire-and-forget: run ComplianceAgent asynchronously
    console.log(`[ComplianceService] Evaluating check: ${checkId} (correlation: ${correlationId})`);

    const agent = getComplianceAgent();
    agent.reason({
      type: 'compliance_aml',
      checkId,
      sellerId,
      checkType,
      transactionVolume,
      linkedAccounts,
      jurisdiction,
      cryptoActivity,
      sellerData: seller.data,
      submittedAt: new Date().toISOString()
    }, {
      entityId: checkId,
      evaluationType: 'compliance_aml',
      _correlationId: correlationId
    })
      .then(agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'BLOCK';
        const riskScore = agentResult.result?.overallRisk?.score ?? 75;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'COMPLIANCE_AML';

        const riskLevel = riskScore >= 66 ? 'CRITICAL' : riskScore >= 40 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW';

        db_ops.update('compliance_checks', 'check_id', checkId, {
          ...record,
          status: decision,
          riskScore,
          riskLevel,
          riskAssessment: { riskScore, decision, reasoning, agentId, evaluatedAt: new Date().toISOString() }
        });

        emitRiskEvent({
          sellerId, domain: 'compliance',
          eventType: decision === 'APPROVE' ? 'COMPLIANCE_APPROVED' : decision === 'REVIEW' ? 'COMPLIANCE_REVIEW' : 'COMPLIANCE_BLOCKED',
          riskScore, metadata: { decision, checkId, checkType, jurisdiction }
        });

        if (decision !== 'APPROVE') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          const caseData = {
            caseId, checkpoint: 'COMPLIANCE_AML',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN', sellerId, entityId: checkId, entityType: 'COMPLIANCE_CHECK',
            decision, riskScore, reasoning, agentId, createdAt: new Date().toISOString()
          };
          db_ops.insert('cases', 'case_id', caseId, caseData);
        }

        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:complete', {
              correlationId, sellerId, entityId: checkId, decision, riskScore, reasoning,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}

        console.log(`[ComplianceService] Completed: ${checkId} → ${decision} (risk: ${riskScore})`);
      })
      .catch(error => {
        console.error(`[ComplianceService] Agent error for ${checkId}:`, error.message);
        db_ops.update('compliance_checks', 'check_id', checkId, {
          ...record,
          status: 'BLOCK',
          riskScore: 75,
          riskLevel: 'HIGH',
          riskAssessment: { riskScore: 75, decision: 'BLOCK', reasoning: `Agent error — defaulting to BLOCK: ${error.message}`, agentId: 'COMPLIANCE_AML', evaluatedAt: new Date().toISOString() }
        });
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:error', {
              correlationId, sellerId, entityId: checkId, error: error.message,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}
      });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update compliance check status
router.patch('/:id/status', (req, res) => {
  try {
    const { status, reason } = req.body;
    const check = db_ops.getById('compliance_checks', 'check_id', req.params.id);
    if (!check) {
      return res.status(404).json({ success: false, error: 'Compliance check not found' });
    }

    const validStatuses = ['APPROVE', 'REVIEW', 'BLOCK', 'EVALUATING'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    db_ops.update('compliance_checks', 'check_id', req.params.id, {
      ...check.data,
      status,
      statusReason: reason,
      statusUpdatedAt: new Date().toISOString()
    });

    res.json({ success: true, data: { checkId: req.params.id, status, updatedAt: new Date().toISOString() } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
