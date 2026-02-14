import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';

const router = express.Router();
const COLLECTION = 'pricing_records';
const ID_FIELD = 'pricing_id';

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
    const byChangeType = {};
    let flagged = 0;
    let totalPrice = 0;

    for (const record of all) {
      byStatus[record.status] = (byStatus[record.status] || 0) + 1;
      const ct = record.changeType || 'unknown';
      byChangeType[ct] = (byChangeType[ct] || 0) + 1;
      if (record.riskScore > 0) flagged++;
      totalPrice += record.price || 0;
    }

    const avgPrice = all.length > 0 ? totalPrice / all.length : 0;

    res.json({
      success: true,
      data: { total: all.length, byStatus, byChangeType, flagged, avgPrice }
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
    const id = `PRC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    let riskScore = 0;
    const riskFactors = [];

    if (req.body.belowCost) {
      riskScore += 30;
      riskFactors.push('belowCost');
    }
    if (req.body.priceManipulation) {
      riskScore += 35;
      riskFactors.push('priceManipulation');
    }
    if (req.body.arbitrage) {
      riskScore += 25;
      riskFactors.push('arbitrage');
    }
    if (req.body.priceChanges24h > 5) {
      riskScore += 15;
      riskFactors.push('excessivePriceChanges');
    }

    const record = {
      [ID_FIELD]: id,
      ...req.body,
      status: 'ACTIVE',
      riskScore,
      riskFactors,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db_ops.insert(COLLECTION, record);

    if (riskScore > 0) {
      emitRiskEvent({
        domain: 'pricing',
        eventType: 'PRICING_RISK',
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
