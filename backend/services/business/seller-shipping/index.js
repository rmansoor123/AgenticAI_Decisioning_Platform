import express from 'express';
import { db_ops } from '../../../shared/common/database.js';
import { generateShipment } from '../../../shared/synthetic-data/generators.js';
import { emitRiskEvent } from '../../risk-profile/emit-event.js';

const router = express.Router();

// Get all shipments
router.get('/shipments', (req, res) => {
  try {
    const { limit = 50, offset = 0, sellerId, status, carrier } = req.query;

    let shipments = db_ops.getAll('shipments', parseInt(limit), parseInt(offset));
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
        total: db_ops.count('shipments')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get shipment by ID
router.get('/shipments/:shipmentId', (req, res) => {
  try {
    const shipment = db_ops.getById('shipments', 'shipment_id', req.params.shipmentId);
    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }
    res.json({ success: true, data: shipment.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create shipment
router.post('/shipments', (req, res) => {
  try {
    const shipmentData = req.body.shipmentId ? req.body : generateShipment(req.body.sellerId, req.body.transactionId);

    // Perform shipping risk assessment
    const riskAssessment = performShippingRiskAssessment(shipmentData);
    shipmentData.riskAssessment = riskAssessment;
    shipmentData.status = 'PENDING';

    db_ops.insert('shipments', 'shipment_id', shipmentData.shipmentId, shipmentData);

    // Emit risk events for shipping
    if (riskAssessment.riskLevel === 'HIGH' || riskAssessment?.riskScore >= 50) {
      emitRiskEvent({
        sellerId: shipmentData.sellerId, domain: 'shipping', eventType: 'SHIPPING_FLAGGED',
        riskScore: riskAssessment?.riskScore || 50, metadata: { shipmentId: shipmentData.shipmentId }
      });
    }

    res.status(201).json({
      success: true,
      data: shipmentData,
      riskAssessment
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update shipment status
router.patch('/shipments/:shipmentId/status', (req, res) => {
  try {
    const { status, trackingUpdate } = req.body;
    const existing = db_ops.getById('shipments', 'shipment_id', req.params.shipmentId);

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

    db_ops.update('shipments', 'shipment_id', req.params.shipmentId, updated);

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
router.get('/sellers/:sellerId/shipments', (req, res) => {
  try {
    const { limit = 50, status } = req.query;
    let shipments = db_ops.getAll('shipments', 1000, 0)
      .map(s => s.data)
      .filter(s => s.sellerId === req.params.sellerId);

    if (status) shipments = shipments.filter(s => s.status === status);

    res.json({ success: true, data: shipments.slice(0, parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get shipment by tracking number
router.get('/track/:trackingNumber', (req, res) => {
  try {
    const shipments = db_ops.getAll('shipments', 10000, 0)
      .map(s => s.data)
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
router.get('/flagged', (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const flaggedShipments = db_ops.getAll('shipments', 1000, 0)
      .map(s => s.data)
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
router.post('/verify-address', (req, res) => {
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
router.get('/stats', (req, res) => {
  try {
    const allShipments = db_ops.getAll('shipments', 10000, 0).map(s => s.data);

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
