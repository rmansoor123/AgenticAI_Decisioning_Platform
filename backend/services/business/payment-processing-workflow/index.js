import express from 'express';
import { getDbOps } from '../../../shared/common/database-factory.js';

const router = express.Router();

// ── Seed data helpers ──────────────────────────────────────────────────────

const STATUSES = ['PENDING', 'CAPTURED', 'HELD', 'RELEASED', 'REFUNDED', 'CHARGEDBACK'];
const METHODS = [
  { type: 'CARD', detail: 'Visa' },
  { type: 'CARD', detail: 'Mastercard' },
  { type: 'CARD', detail: 'Amex' },
  { type: 'BANK_TRANSFER', detail: 'ACH' },
  { type: 'BANK_TRANSFER', detail: 'Wire' },
  { type: 'DIGITAL_WALLET', detail: 'PayPal' },
  { type: 'DIGITAL_WALLET', detail: 'Apple Pay' },
  { type: 'CRYPTO', detail: 'Bitcoin' },
  { type: 'CRYPTO', detail: 'Ethereum' }
];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD'];
const GATEWAYS = ['Stripe', 'Adyen', 'Braintree', 'Square', 'PayPal Commerce'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randAmount() { return +(10 + Math.random() * 4990).toFixed(2); }
function ts36() { return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(); }

function randomDate(daysBack) {
  const d = new Date(Date.now() - Math.random() * daysBack * 86400000);
  return d.toISOString();
}

let seedPromise = null;

async function ensureSeeded() {
  const db_ops = getDbOps();
  // Quick check — if any payments exist, skip
  const existing = await db_ops.getAll('workflow_payments', 1, 0);
  if (existing.length > 0) return;

  // Only seed once even if concurrent requests arrive
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    console.log('[PaymentWorkflow] Seeding 50 payment records...');

    // Grab sellers from DB
    const allSellers = (await db_ops.getAll('sellers', 200, 0)).map(s => s.data);
    const sellerIds = allSellers.length > 0
      ? allSellers.map(s => s.sellerId)
      : Array.from({ length: 10 }, (_, i) => `SLR-SEED${i}`);

    for (let i = 0; i < 50; i++) {
      const method = pick(METHODS);
      const status = pick(STATUSES);
      const createdAt = randomDate(30);
      const paymentId = `PAY-${ts36()}`;
      const record = {
        paymentId,
        orderId: `ORD-${ts36()}`,
        sellerId: pick(sellerIds),
        buyerId: `BYR-${ts36()}`,
        amount: randAmount(),
        currency: pick(CURRENCIES),
        method: method.type,
        methodDetail: method.detail,
        gateway: pick(GATEWAYS),
        status,
        createdAt,
        updatedAt: createdAt
      };

      // Add escrow data for HELD/RELEASED
      if (status === 'HELD' || status === 'RELEASED') {
        record.escrowId = `ESC-${ts36()}`;
        record.escrowCreatedAt = createdAt;
        if (status === 'RELEASED') {
          record.escrowReleasedAt = new Date(new Date(createdAt).getTime() + 3 * 86400000).toISOString();
        }
      }
      // Add refund data for REFUNDED
      if (status === 'REFUNDED') {
        record.refundId = `REF-${ts36()}`;
        record.refundAmount = +(record.amount * (0.5 + Math.random() * 0.5)).toFixed(2);
        record.refundReason = pick(['Customer request', 'Item not as described', 'Duplicate charge', 'Fraud', 'Shipping issue']);
        record.refundedAt = new Date(new Date(createdAt).getTime() + 5 * 86400000).toISOString();
      }

      await db_ops.insert('workflow_payments', 'payment_id', paymentId, record);
    }
    console.log('[PaymentWorkflow] Seeded 50 payments.');
  })();
  return seedPromise;
}

// ── GET /stats  (placed BEFORE /:paymentId to avoid route collision) ───────

router.get('/stats', async (req, res) => {
  try {
    const db_ops = getDbOps();
    await ensureSeeded();

    const all = (await db_ops.getAll('workflow_payments', 10000, 0)).map(p => p.data);

    const byStatus = {};
    const byMethod = {};
    let totalVolume = 0;
    let successCount = 0;
    const dailyVolume = {};

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

    all.forEach(p => {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
      byMethod[p.method] = (byMethod[p.method] || 0) + 1;
      totalVolume += p.amount || 0;
      if (['CAPTURED', 'RELEASED'].includes(p.status)) successCount++;

      const d = new Date(p.createdAt);
      if (d >= sevenDaysAgo) {
        const day = d.toISOString().slice(0, 10);
        dailyVolume[day] = (dailyVolume[day] || 0) + (p.amount || 0);
      }
    });

    const total = all.length;
    const avgAmount = total > 0 ? +(totalVolume / total).toFixed(2) : 0;
    const successRate = total > 0 ? +((successCount / total) * 100).toFixed(1) : 0;
    const refundCount = byStatus.REFUNDED || 0;
    const refundRate = total > 0 ? +((refundCount / total) * 100).toFixed(1) : 0;

    // Sort daily volume into array
    const dailyVolumeArr = Object.entries(dailyVolume)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, volume]) => ({ date, volume: +volume.toFixed(2) }));

    res.json({
      success: true,
      data: {
        totalPayments: total,
        totalVolume: +totalVolume.toFixed(2),
        successRate,
        avgAmount,
        pendingCount: byStatus.PENDING || 0,
        refundRate,
        byStatus,
        byMethod,
        dailyVolume: dailyVolumeArr
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /methods ────────────────────────────────────────────────────────────

router.get('/methods', async (req, res) => {
  try {
    const db_ops = getDbOps();
    await ensureSeeded();

    const all = (await db_ops.getAll('workflow_payments', 10000, 0)).map(p => p.data);
    const total = all.length || 1;
    const counts = {};
    all.forEach(p => { counts[p.method] = (counts[p.method] || 0) + 1; });

    const distribution = {};
    for (const [method, count] of Object.entries(counts)) {
      distribution[method] = +((count / total) * 100).toFixed(1);
    }

    res.json({ success: true, data: distribution });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST / — Create payment ─────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const db_ops = getDbOps();
    const { orderId, sellerId, buyerId, amount, currency, method, gateway } = req.body;

    if (!orderId || !sellerId || !amount) {
      return res.status(400).json({ success: false, error: 'orderId, sellerId, and amount are required' });
    }

    const paymentId = `PAY-${ts36()}`;
    const now = new Date().toISOString();
    const record = {
      paymentId,
      orderId,
      sellerId,
      buyerId: buyerId || null,
      amount: +amount,
      currency: currency || 'USD',
      method: method || 'CARD',
      methodDetail: null,
      gateway: gateway || 'Stripe',
      status: 'PENDING',
      createdAt: now,
      updatedAt: now
    };

    await db_ops.insert('workflow_payments', 'payment_id', paymentId, record);

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET / — List payments ───────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const db_ops = getDbOps();
    await ensureSeeded();

    const { status, sellerId, method, limit = 200 } = req.query;

    let payments = (await db_ops.getAll('workflow_payments', parseInt(limit), 0)).map(p => p.data);

    if (status) payments = payments.filter(p => p.status === status);
    if (sellerId) payments = payments.filter(p => p.sellerId === sellerId);
    if (method) payments = payments.filter(p => p.method === method);

    // Sort by createdAt desc
    payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, data: payments, total: payments.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /:paymentId — Single payment ────────────────────────────────────────

router.get('/:paymentId', async (req, res) => {
  try {
    const db_ops = getDbOps();
    const payment = await db_ops.getById('workflow_payments', 'payment_id', req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }
    res.json({ success: true, data: payment.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /:paymentId/capture — PENDING → CAPTURED + escrow ─────────────────

router.post('/:paymentId/capture', async (req, res) => {
  try {
    const db_ops = getDbOps();
    const payment = await db_ops.getById('workflow_payments', 'payment_id', req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    if (payment.data.status !== 'PENDING') {
      return res.status(400).json({ success: false, error: `Cannot capture payment in ${payment.data.status} status. Must be PENDING.` });
    }

    const now = new Date().toISOString();
    const escrowId = `ESC-${ts36()}`;

    // Update payment to CAPTURED
    await db_ops.update('workflow_payments', 'payment_id', req.params.paymentId, {
      ...payment.data,
      status: 'CAPTURED',
      escrowId,
      escrowCreatedAt: now,
      updatedAt: now
    });

    // Create escrow hold record
    const escrowRecord = {
      escrowId,
      paymentId: req.params.paymentId,
      sellerId: payment.data.sellerId,
      amount: payment.data.amount,
      currency: payment.data.currency,
      status: 'HELD',
      createdAt: now
    };
    await db_ops.insert('escrow_holds', 'escrow_id', escrowId, escrowRecord);

    res.json({
      success: true,
      data: {
        paymentId: req.params.paymentId,
        status: 'CAPTURED',
        escrowId,
        escrowCreatedAt: now
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /:paymentId/refund — Move to REFUNDED ─────────────────────────────

router.post('/:paymentId/refund', async (req, res) => {
  try {
    const db_ops = getDbOps();
    const payment = await db_ops.getById('workflow_payments', 'payment_id', req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    const { amount, reason } = req.body || {};
    const refundAmount = amount ? +amount : payment.data.amount;
    const now = new Date().toISOString();
    const refundId = `REF-${ts36()}`;

    // Update payment to REFUNDED
    await db_ops.update('workflow_payments', 'payment_id', req.params.paymentId, {
      ...payment.data,
      status: 'REFUNDED',
      refundId,
      refundAmount,
      refundReason: reason || 'No reason provided',
      refundedAt: now,
      updatedAt: now
    });

    // Create refund record
    const refundRecord = {
      refundId,
      paymentId: req.params.paymentId,
      sellerId: payment.data.sellerId,
      originalAmount: payment.data.amount,
      refundAmount,
      reason: reason || 'No reason provided',
      currency: payment.data.currency,
      createdAt: now
    };
    await db_ops.insert('refunds', 'refund_id', refundId, refundRecord);

    res.json({
      success: true,
      data: {
        paymentId: req.params.paymentId,
        status: 'REFUNDED',
        refundId,
        refundAmount,
        reason: reason || 'No reason provided'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
