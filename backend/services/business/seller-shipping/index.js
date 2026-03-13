import express from 'express';
import { randomUUID } from 'crypto';
import { db_ops } from '../../../shared/common/database.js';
import { generateShipment } from '../../../shared/synthetic-data/generators.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';
import { getShippingRiskAgent } from '../../../agents/specialized/shipping-risk-agent.js';

const router = express.Router();

// Get all shipments
router.get('/shipments', async (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status, carrier } = req.query;

    let shipments = await db_ops.getAll('shipments', parseInt(limit), parseInt(offset));
    shipments = shipments.map(s => s.data);

    if (sellerId) shipments = shipments.filter(s => s.sellerId === sellerId);
    if (status) shipments = shipments.filter(s => s.status === status);
    if (carrier) shipments = shipments.filter(s => s.carrier === carrier);

    res.json({
      success: true,
      data: shipments,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: await db_ops.count('shipments')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get shipment by ID
router.get('/shipments/:shipmentId', async (req, res) => {
  try {
    const shipment = await db_ops.getById('shipments', 'shipment_id', req.params.shipmentId);
    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }
    res.json({ success: true, data: shipment.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create shipment — async fire-and-forget with real-time TPAOR streaming
router.post('/shipments', async (req, res) => {
  try {
    const { sellerId, address, carrier, weight, value, category, transactionId } = req.body;

    const seller = await db_ops.getById('sellers', 'seller_id', sellerId || req.body.sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Seller not found' });
    }

    const shipmentData = req.body.shipmentId ? req.body : generateShipment(sellerId || req.body.sellerId, transactionId);
    const shipmentId = shipmentData.shipmentId;
    const correlationId = `SHP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    shipmentData.status = 'EVALUATING';
    shipmentData.riskAssessment = null;
    await db_ops.insert('shipments', 'shipment_id', shipmentId, shipmentData);

    res.status(202).json({
      success: true,
      correlationId,
      shipmentId,
      status: 'EVALUATING',
      message: 'Agent evaluation started. Watch the Agent Flow panel for real-time progress.'
    });

    console.log(`[ShippingService] Evaluating shipment: ${shipmentId} (correlation: ${correlationId})`);

    const agent = getShippingRiskAgent();
    agent.reason({
      type: 'shipping_risk_evaluation',
      shipmentId,
      sellerId: sellerId || req.body.sellerId,
      address: address || shipmentData.destination,
      destination: shipmentData.destination,
      carrier: carrier || shipmentData.carrier,
      weight: weight || shipmentData.weight,
      value: value || shipmentData.value,
      category,
      sellerData: seller.data,
      submittedAt: new Date().toISOString()
    }, {
      entityId: shipmentId,
      evaluationType: 'shipping_risk',
      _correlationId: correlationId
    })
      .then(async agentResult => {
        const rec = agentResult.result?.recommendation || agentResult.result?.decision;
        const decision = rec?.action || 'FLAG';
        const riskScore = agentResult.result?.overallRisk?.score ?? 50;
        const reasoning = agentResult.result?.reasoning || rec?.reason || 'Agent evaluation complete';
        const agentId = agentResult.result?.agentId || 'SHIPPING_RISK';

        let shipmentStatus;
        if (decision === 'APPROVE') shipmentStatus = 'SHIPPED';
        else if (decision === 'HOLD') shipmentStatus = 'ON_HOLD';
        else shipmentStatus = 'FLAGGED';

        await db_ops.update('shipments', 'shipment_id', shipmentId, {
          ...shipmentData,
          status: shipmentStatus,
          riskAssessment: { riskScore, decision, reasoning, agentId, evaluatedAt: new Date().toISOString() }
        });

        emitRiskEvent({
          sellerId: sellerId || req.body.sellerId, domain: 'shipping',
          eventType: decision === 'APPROVE' ? 'SHIPPING_APPROVED' : decision === 'HOLD' ? 'SHIPPING_HELD' : 'SHIPPING_FLAGGED',
          riskScore, metadata: { decision, shipmentId }
        });

        if (decision === 'HOLD' || decision === 'FLAG') {
          const caseId = 'CASE-' + randomUUID().substring(0, 8).toUpperCase();
          await db_ops.insert('cases', 'case_id', caseId, {
            caseId, checkpoint: 'SHIPPING_RISK',
            priority: riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'MEDIUM',
            status: 'OPEN', sellerId: sellerId || req.body.sellerId, entityId: shipmentId, entityType: 'SHIPMENT',
            decision, riskScore, reasoning, agentId, createdAt: new Date().toISOString()
          });
        }

        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:complete', {
              correlationId, sellerId: sellerId || req.body.sellerId, entityId: shipmentId, decision, riskScore, reasoning,
              timestamp: new Date().toISOString()
            });
          }).catch(() => {});
        } catch {}

        console.log(`[ShippingService] Completed: ${shipmentId} → ${decision} (risk: ${riskScore})`);
      })
      .catch(async error => {
        console.error(`[ShippingService] Agent error for ${shipmentId}:`, error.message);
        await db_ops.update('shipments', 'shipment_id', shipmentId, {
          ...shipmentData,
          status: 'FLAGGED',
          riskAssessment: { riskScore: 50, decision: 'FLAG', reasoning: `Agent error — defaulting to FLAG: ${error.message}`, agentId: 'SHIPPING_RISK', evaluatedAt: new Date().toISOString() }
        });
        try {
          import('../../../gateway/websocket/event-bus.js').then(({ getEventBus }) => {
            getEventBus().publish('agent:decision:error', { correlationId, sellerId: sellerId || req.body.sellerId, entityId: shipmentId, error: error.message, timestamp: new Date().toISOString() });
          }).catch(() => {});
        } catch {}
      });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update shipment status
router.patch('/shipments/:shipmentId/status', async (req, res) => {
  try {
    const { status, trackingUpdate } = req.body;
    const existing = await db_ops.getById('shipments', 'shipment_id', req.params.shipmentId);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }

    const updated = {
      ...existing.data,
      status,
      trackingHistory: [
        ...(existing.data.trackingHistory || []),
        {
          status,
          update: trackingUpdate,
          timestamp: new Date().toISOString()
        }
      ]
    };

    if (status === 'DELIVERED') {
      updated.actualDelivery = new Date().toISOString();
    }

    await db_ops.update('shipments', 'shipment_id', req.params.shipmentId, updated);

    if (req.body.status === 'DELIVERED') {
      emitRiskEvent({
        sellerId: existing.data.sellerId, domain: 'shipping', eventType: 'SHIPPING_DELIVERED',
        riskScore: -3, metadata: {}
      });
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get shipments for a seller
router.get('/sellers/:sellerId/shipments', async (req, res) => {
  try {
    const { limit = 50, status } = req.query;
    let shipments = (await db_ops.getAll('shipments', 1000, 0)).map(s => s.data)
      .filter(s => s.sellerId === req.params.sellerId);

    if (status) shipments = shipments.filter(s => s.status === status);

    res.json({ success: true, data: shipments.slice(0, parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get shipment by tracking number
router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const shipments = (await db_ops.getAll('shipments', 10000, 0)).map(s => s.data)
      .filter(s => s.trackingNumber === req.params.trackingNumber);

    if (shipments.length === 0) {
      return res.status(404).json({ success: false, error: 'Tracking number not found' });
    }

    res.json({ success: true, data: shipments[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get flagged shipments
router.get('/flagged', async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const flaggedShipments = (await db_ops.getAll('shipments', 1000, 0)).map(s => s.data)
      .filter(s => {
        const flags = s.riskFlags || {};
        return Object.values(flags).some(v => v === true);
      })
      .slice(0, parseInt(limit));

    res.json({ success: true, data: flaggedShipments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify address
router.post('/verify-address', async (req, res) => {
  try {
    const { address } = req.body;

    // Simulate address verification
    const verification = {
      valid: Math.random() > 0.1,
      normalized: {
        street: address.street,
        city: address.city,
        state: address.state,
        zip: address.zip,
        country: address.country
      },
      riskFactors: {
        isPoBox: address.street?.toLowerCase().includes('po box'),
        isReshippingService: Math.random() < 0.02,
        isHighRiskZip: Math.random() < 0.05,
        isCommercialAddress: Math.random() < 0.3
      },
      confidence: 0.85 + Math.random() * 0.15
    };

    res.json({ success: true, data: verification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Shipping statistics
router.get('/stats', async (req, res) => {
  try {
    const allShipments = (await db_ops.getAll('shipments', 10000, 0)).map(s => s.data);

    const stats = {
      total: allShipments.length,
      byStatus: {},
      byCarrier: {},
      riskFlags: {
        addressMismatch: 0,
        reshippingService: 0,
        highRiskZip: 0,
        poBoxDestination: 0
      },
      deliveryMetrics: {
        onTime: 0,
        late: 0,
        returned: 0,
        avgDeliveryDays: 0
      }
    };

    let totalDeliveryDays = 0;
    let deliveredCount = 0;

    allShipments.forEach(s => {
      stats.byStatus[s.status] = (stats.byStatus[s.status] || 0) + 1;
      stats.byCarrier[s.carrier] = (stats.byCarrier[s.carrier] || 0) + 1;

      if (s.riskFlags) {
        Object.entries(s.riskFlags).forEach(([flag, value]) => {
          if (value && stats.riskFlags.hasOwnProperty(flag)) {
            stats.riskFlags[flag]++;
          }
        });
      }

      if (s.status === 'DELIVERED' && s.actualDelivery && s.estimatedDelivery) {
        deliveredCount++;
        const actual = new Date(s.actualDelivery);
        const estimated = new Date(s.estimatedDelivery);
        const created = new Date(s.createdAt);

        totalDeliveryDays += (actual - created) / (1000 * 60 * 60 * 24);

        if (actual <= estimated) {
          stats.deliveryMetrics.onTime++;
        } else {
          stats.deliveryMetrics.late++;
        }
      }

      if (s.status === 'RETURNED') {
        stats.deliveryMetrics.returned++;
      }
    });

    stats.deliveryMetrics.avgDeliveryDays = deliveredCount > 0
      ? (totalDeliveryDays / deliveredCount).toFixed(1)
      : 0;

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function for shipping risk assessment
function performShippingRiskAssessment(shipment) {
  const signals = [];
  let riskScore = 0;

  // Check risk flags
  if (shipment.riskFlags) {
    if (shipment.riskFlags.addressMismatch) {
      signals.push({ signal: 'ADDRESS_MISMATCH', weight: 30 });
      riskScore += 30;
    }
    if (shipment.riskFlags.reshippingService) {
      signals.push({ signal: 'RESHIPPING_SERVICE', weight: 40 });
      riskScore += 40;
    }
    if (shipment.riskFlags.highRiskZip) {
      signals.push({ signal: 'HIGH_RISK_ZIP', weight: 25 });
      riskScore += 25;
    }
    if (shipment.riskFlags.poBoxDestination) {
      signals.push({ signal: 'PO_BOX_DESTINATION', weight: 15 });
      riskScore += 15;
    }
  }

  // International shipping check
  if (shipment.destination?.country && shipment.destination.country !== 'US') {
    signals.push({ signal: 'INTERNATIONAL_SHIPPING', weight: 10 });
    riskScore += 10;

    // High risk countries
    if (['NG', 'RO', 'ID', 'VN'].includes(shipment.destination.country)) {
      signals.push({ signal: 'HIGH_RISK_COUNTRY', weight: 30 });
      riskScore += 30;
    }
  }

  // Decision
  let riskLevel = 'LOW';
  if (riskScore >= 50) {
    riskLevel = 'HIGH';
  } else if (riskScore >= 25) {
    riskLevel = 'MEDIUM';
  }

  return {
    riskScore,
    riskLevel,
    signals,
    evaluatedAt: new Date().toISOString()
  };
}

export default router;
