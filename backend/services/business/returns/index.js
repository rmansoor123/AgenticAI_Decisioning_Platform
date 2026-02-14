import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';

const router = express.Router();
const COLLECTION = 'returns';
const ID_FIELD = 'return_id';

// GET / — List with filters/pagination
router.get('/', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status } = req.query;
    let records = db_ops.getAll(COLLECTION, parseInt(limit), parseInt(offset)).map(r => r.data);
    if (sellerId) records = records.filter(r => r.sellerId === sellerId);
    if (status) records = records.filter(r => r.status === status);
    res.json({
      success: true,
      data: records,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: db_ops.count(COLLECTION)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats — Domain statistics
router.get('/stats', (req, res) => {
  try {
    const all = db_ops.getAll(COLLECTION, 10000, 0).map(r => r.data);
    const byStatus = {};
    const byReason = {};
    let flagged = 0;
    let totalRefunds = 0;

    for (const record of all) {
      byStatus[record.status] = (byStatus[record.status] || 0) + 1;
      const reason = record.reason || 'unknown';
      byReason[reason] = (byReason[reason] || 0) + 1;
      if (record.riskScore > 0) flagged++;
      totalRefunds += record.refundAmount || 0;
    }

    res.json({
      success: true,
      data: { total: all.length, byStatus, byReason, flagged, totalRefunds }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id — Get by ID
router.get('/:id', (req, res) => {
  try {
    const record = db_ops.getAll(COLLECTION, 10000, 0)
      .map(r => r.data)
      .find(r => r[ID_FIELD] === req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / — Create new record, assess risk, emit event if riskScore > 0
router.post('/', (req, res) => {
  try {
    const id = `RET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    let riskScore = 0;
    const riskFactors = [];

    if (req.body.serialReturner) {
      riskScore += 40;
      riskFactors.push('serialReturner');
    }
    if (req.body.emptyBox) {
      riskScore += 35;
      riskFactors.push('emptyBox');
    }
    if (req.body.refundExceedsPurchase) {
      riskScore += 50;
      riskFactors.push('refundExceedsPurchase');
    }
    if (req.body.wardrobing) {
      riskScore += 25;
      riskFactors.push('wardrobing');
    }
    if (req.body.fundsWithdrawn) {
      riskScore += 45;
      riskFactors.push('fundsWithdrawn');
    }

    const record = {
      [ID_FIELD]: id,
      ...req.body,
      status: 'REQUESTED',
      riskScore,
      riskFactors,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db_ops.insert(COLLECTION, record);

    if (riskScore > 0) {
      emitRiskEvent({
        domain: 'returns',
        eventType: 'RETURN_RISK',
        entityId: id,
        sellerId: req.body.sellerId,
        riskScore,
        riskFactors,
        data: record
      });
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /:id/status — Update status
router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const records = db_ops.getAll(COLLECTION, 10000, 0);
    const entry = records.find(r => r.data[ID_FIELD] === req.params.id);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    const updated = { ...entry.data, status, updatedAt: new Date().toISOString() };
    db_ops.update(COLLECTION, entry.id, updated);

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
