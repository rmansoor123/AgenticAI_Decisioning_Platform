import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../shared/common/database.js';

const router = express.Router();

// POST / — Create a new case (used by all services or direct submission)
router.post('/', async (req, res) => {
  try {
    const {
      checkpoint, sellerId, entityId, entityType,
      decision, riskScore, reasoning, agentId, priority
    } = req.body;

    if (!checkpoint || !sellerId) {
      return res.status(400).json({ success: false, error: 'checkpoint and sellerId are required' });
    }

    const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
    const computedPriority = priority || (
      riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW'
    );

    const caseData = {
      caseId,
      checkpoint,
      priority: computedPriority,
      status: 'OPEN',
      sellerId,
      entityId: entityId || null,
      entityType: entityType || null,
      decision: decision || null,
      riskScore: riskScore || 0,
      reasoning: reasoning || null,
      agentId: agentId || null,
      createdAt: new Date().toISOString()
    };

    db_ops.insert('cases', 'case_id', caseId, caseData);

    // Non-blocking: run AlertTriageAgent to evaluate priority + routing
    triageCase(caseData).catch(() => {});

    res.status(201).json({ success: true, data: caseData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /cases — List cases with filters
router.get('/', (req, res) => {
  try {
    const { status, priority, checkpoint, assignee, limit = 100, offset = 0 } = req.query;

    let cases = db_ops.getAll('cases', 10000, 0).map(r => r.data);

    if (status) cases = cases.filter(c => c.status === status.toUpperCase());
    if (priority) cases = cases.filter(c => c.priority === priority.toUpperCase());
    if (checkpoint) cases = cases.filter(c => c.checkpoint === checkpoint);
    if (assignee) cases = cases.filter(c => c.assignee === assignee);

    // Sort by priority (CRITICAL first) then by creation date (newest first)
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    cases.sort((a, b) => {
      const pDiff = (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
      if (pDiff !== 0) return pDiff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const total = cases.length;
    cases = cases.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({ success: true, data: cases, total });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /cases/stats — Queue statistics
router.get('/stats', (req, res) => {
  try {
    const allCases = db_ops.getAll('cases', 10000, 0).map(r => r.data);

    const byStatus = { OPEN: 0, IN_REVIEW: 0, RESOLVED: 0 };
    const byPriority = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const byCheckpoint = {};
    let totalAge = 0;
    let openCount = 0;

    allCases.forEach(c => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      byPriority[c.priority] = (byPriority[c.priority] || 0) + 1;
      byCheckpoint[c.checkpoint] = (byCheckpoint[c.checkpoint] || 0) + 1;

      if (c.status !== 'RESOLVED') {
        const age = Date.now() - new Date(c.createdAt).getTime();
        totalAge += age;
        openCount++;
      }
    });

    const avgAgeMs = openCount > 0 ? totalAge / openCount : 0;
    const avgAgeHours = Math.round(avgAgeMs / (1000 * 60 * 60) * 10) / 10;

    res.json({
      success: true,
      data: {
        total: allCases.length,
        byStatus,
        byPriority,
        byCheckpoint,
        avgAgeHours,
        openCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /cases/:caseId — Full case detail
router.get('/:caseId', (req, res) => {
  try {
    const record = db_ops.getById('cases', 'case_id', req.params.caseId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const caseData = { ...record.data };

    // Enrich with seller info
    if (caseData.sellerId) {
      const sellerRecord = db_ops.getById('sellers', 'seller_id', caseData.sellerId);
      if (sellerRecord) {
        caseData.seller = {
          businessName: sellerRecord.data.businessName,
          email: sellerRecord.data.email,
          country: sellerRecord.data.country,
          status: sellerRecord.data.status,
          riskTier: sellerRecord.data.riskTier
        };
      }
    }

    // Enrich with triggered rule details
    if (caseData.triggeredRules && caseData.triggeredRules.length > 0) {
      caseData.ruleDetails = caseData.triggeredRules.map(ruleId => {
        const ruleRecord = db_ops.getById('rules', 'rule_id', ruleId);
        return ruleRecord ? { ruleId, name: ruleRecord.data.name, type: ruleRecord.data.type, severity: ruleRecord.data.severity, action: ruleRecord.data.action } : { ruleId, name: 'Unknown Rule' };
      });
    }

    res.json({ success: true, data: caseData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /cases/:caseId/status — Update case status
router.patch('/:caseId/status', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['OPEN', 'IN_REVIEW', 'RESOLVED'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const record = db_ops.getById('cases', 'case_id', req.params.caseId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const updated = {
      ...record.data,
      status,
      updatedAt: new Date().toISOString()
    };

    if (status === 'RESOLVED' && req.body.resolution) {
      const validResolutions = ['CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'ESCALATED'];
      if (!validResolutions.includes(req.body.resolution)) {
        return res.status(400).json({ success: false, error: `Invalid resolution. Must be one of: ${validResolutions.join(', ')}` });
      }
      updated.resolution = req.body.resolution;
      updated.resolvedAt = new Date().toISOString();
    }

    db_ops.update('cases', 'case_id', req.params.caseId, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /cases/:caseId/assign — Assign case
router.patch('/:caseId/assign', (req, res) => {
  try {
    const { assignee } = req.body;
    if (!assignee) {
      return res.status(400).json({ success: false, error: 'assignee is required' });
    }

    const record = db_ops.getById('cases', 'case_id', req.params.caseId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const updated = {
      ...record.data,
      assignee,
      status: record.data.status === 'OPEN' ? 'IN_REVIEW' : record.data.status,
      updatedAt: new Date().toISOString()
    };

    db_ops.update('cases', 'case_id', req.params.caseId, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /cases/:caseId/notes — Add note
router.post('/:caseId/notes', (req, res) => {
  try {
    const { author, text } = req.body;
    if (!author || !text) {
      return res.status(400).json({ success: false, error: 'author and text are required' });
    }

    const record = db_ops.getById('cases', 'case_id', req.params.caseId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const note = { author, text, timestamp: new Date().toISOString() };
    const updated = {
      ...record.data,
      notes: [...(record.data.notes || []), note],
      updatedAt: new Date().toISOString()
    };

    db_ops.update('cases', 'case_id', req.params.caseId, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Non-blocking AlertTriageAgent call for case prioritization
async function triageCase(caseData) {
  try {
    const { alertTriage } = await import('../../agents/index.js');
    const result = await alertTriage.reason({
      type: 'case_triage',
      caseId: caseData.caseId,
      checkpoint: caseData.checkpoint,
      sellerId: caseData.sellerId,
      entityId: caseData.entityId,
      entityType: caseData.entityType,
      decision: caseData.decision,
      riskScore: caseData.riskScore,
      reasoning: caseData.reasoning,
      submittedAt: new Date().toISOString()
    }, {
      entityId: caseData.caseId,
      evaluationType: 'case_triage'
    });

    const rec = result.result?.recommendation || result.result?.decision;
    const updates = { ...caseData };
    let changed = false;

    // Update priority if agent suggests different
    const agentPriority = rec?.priority;
    if (agentPriority && ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(agentPriority)) {
      updates.priority = agentPriority;
      changed = true;
    }

    // Update assigned team if agent suggests routing
    const assignedTeam = rec?.assignedTeam || rec?.team;
    if (assignedTeam) {
      updates.assignedTeam = assignedTeam;
      changed = true;
    }

    // Store triage metadata
    updates.triageResult = {
      agentId: 'ALERT_TRIAGE',
      suggestedPriority: agentPriority,
      suggestedTeam: assignedTeam,
      reasoning: result.result?.reasoning || rec?.reason,
      evaluatedAt: new Date().toISOString()
    };
    changed = true;

    if (changed) {
      db_ops.update('cases', 'case_id', caseData.caseId, updates);
      console.log(`[CaseQueue] Triage: ${caseData.caseId} → priority: ${updates.priority}, team: ${updates.assignedTeam || 'unassigned'}`);
    }
  } catch (err) {
    console.warn(`[CaseQueue] AlertTriageAgent failed for ${caseData.caseId}:`, err.message);
    // Non-blocking: case keeps its original priority
  }
}

export default router;
