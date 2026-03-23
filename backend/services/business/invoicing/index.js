import express from 'express';
import { getDbOps } from '../../../shared/common/database-factory.js';

const router = express.Router();
const COLLECTION = 'invoices';
const ID_FIELD = 'invoice_id';

let seeded = false;

const FEE_TYPES = [
  { description: 'Listing Fees', feeType: 'LISTING', unitPriceRange: [0.30, 2.50] },
  { description: 'Transaction Commission', feeType: 'COMMISSION', unitPriceRange: [1.50, 25.00] },
  { description: 'Payout Processing Fee', feeType: 'PAYOUT_PROCESSING', unitPriceRange: [0.25, 1.50] },
  { description: 'Monthly Subscription', feeType: 'SUBSCRIPTION', unitPriceRange: [9.99, 49.99] },
  { description: 'Platform Credit', feeType: 'CREDIT', unitPriceRange: [-15.00, -2.00] }
];

function generateLineItems(count) {
  const items = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let idx;
    do {
      idx = Math.floor(Math.random() * FEE_TYPES.length);
    } while (used.has(idx) && used.size < FEE_TYPES.length);
    used.add(idx);
    const fee = FEE_TYPES[idx];
    const quantity = fee.feeType === 'SUBSCRIPTION' ? 1 : Math.floor(Math.random() * 50) + 1;
    const unitPrice = parseFloat((fee.unitPriceRange[0] + Math.random() * (fee.unitPriceRange[1] - fee.unitPriceRange[0])).toFixed(2));
    const amount = parseFloat((quantity * unitPrice).toFixed(2));
    items.push({
      description: fee.description,
      quantity,
      unitPrice,
      amount,
      feeType: fee.feeType
    });
  }
  return items;
}

async function seedInvoices() {
  if (seeded) return;
  const db_ops = getDbOps();
  if (!db_ops) return;

  const existing = await db_ops.getAll(COLLECTION, 1, 0);
  if (existing && existing.length > 0) {
    seeded = true;
    return;
  }

  const sellers = (await db_ops.getAll('sellers', 200, 0)).map(s => s.data || s);
  if (!sellers.length) {
    seeded = true;
    return;
  }

  const now = new Date();
  const statuses = [];
  // 60% PAID, 25% SENT, 10% OVERDUE, 5% DRAFT
  for (let i = 0; i < 18; i++) statuses.push('PAID');
  for (let i = 0; i < 8; i++) statuses.push('SENT');
  for (let i = 0; i < 3; i++) statuses.push('OVERDUE');
  for (let i = 0; i < 1; i++) statuses.push('DRAFT');

  for (let i = 0; i < 30; i++) {
    const seller = sellers[Math.floor(Math.random() * sellers.length)];
    const sellerId = seller.sellerId || seller.seller_id;
    const sellerName = seller.businessName || seller.business_name || 'Unknown Seller';
    const invoiceId = `INV-${Date.now().toString(36).toUpperCase()}${i.toString(36).toUpperCase()}`;

    // Monthly periods over last 3 months
    const monthOffset = Math.floor(Math.random() * 3);
    const periodStart = new Date(now.getFullYear(), now.getMonth() - monthOffset - 1, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() - monthOffset, 0);

    const lineItemCount = Math.floor(Math.random() * 6) + 3; // 3-8
    const lineItems = generateLineItems(lineItemCount);
    const subtotal = parseFloat(lineItems.reduce((sum, li) => sum + li.amount, 0).toFixed(2));
    const tax = parseFloat((subtotal * 0.085).toFixed(2));
    const total = parseFloat((subtotal + tax).toFixed(2));

    const status = statuses[i % statuses.length];
    const createdAt = new Date(periodEnd.getTime() + 86400000).toISOString();
    const dueDate = new Date(periodEnd.getTime() + 30 * 86400000).toISOString();
    const paidAt = status === 'PAID' ? new Date(periodEnd.getTime() + (Math.floor(Math.random() * 20) + 5) * 86400000).toISOString() : null;

    const invoice = {
      invoiceId,
      sellerId,
      sellerName,
      sellerAddress: seller.address || `${Math.floor(Math.random() * 9999)} Commerce St, Suite ${Math.floor(Math.random() * 500)}, ${seller.city || 'San Francisco'}, ${seller.state || 'CA'} ${seller.zip || '94105'}`,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      lineItems,
      subtotal,
      tax,
      total,
      status,
      dueDate,
      paidAt,
      paymentTerms: 'Net 30',
      currency: 'USD',
      createdAt,
      updatedAt: createdAt
    };

    await db_ops.insert(COLLECTION, ID_FIELD, invoiceId, invoice);
  }

  seeded = true;
  console.log('[InvoicingService] Seeded 30 invoices');
}

// GET / — List all invoices with optional filters
router.get('/', async (req, res) => {
  try {
    const db_ops = getDbOps();
    await seedInvoices();

    const { status, sellerId, limit = 100, offset = 0 } = req.query;
    let invoices = (await db_ops.getAll(COLLECTION, 10000, 0)).map(r => r.data || r);

    if (status) invoices = invoices.filter(inv => inv.status === status);
    if (sellerId) invoices = invoices.filter(inv => inv.sellerId === sellerId);

    // Sort by createdAt desc
    invoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = invoices.length;
    invoices = invoices.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: invoices,
      pagination: { limit: parseInt(limit), offset: parseInt(offset), total }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats — Invoice statistics
router.get('/stats', async (req, res) => {
  try {
    const db_ops = getDbOps();
    await seedInvoices();

    const all = (await db_ops.getAll(COLLECTION, 10000, 0)).map(r => r.data || r);

    let totalInvoiced = 0;
    let paidAmount = 0;
    let overdueAmount = 0;
    const byStatus = { DRAFT: 0, SENT: 0, PAID: 0, OVERDUE: 0 };

    for (const inv of all) {
      totalInvoiced += inv.total || 0;
      if (inv.status === 'PAID') paidAmount += inv.total || 0;
      if (inv.status === 'OVERDUE') overdueAmount += inv.total || 0;
      byStatus[inv.status] = (byStatus[inv.status] || 0) + 1;
    }

    const averageInvoice = all.length > 0 ? totalInvoiced / all.length : 0;

    res.json({
      success: true,
      data: {
        totalInvoiced: parseFloat(totalInvoiced.toFixed(2)),
        paidAmount: parseFloat(paidAmount.toFixed(2)),
        overdueAmount: parseFloat(overdueAmount.toFixed(2)),
        averageInvoice: parseFloat(averageInvoice.toFixed(2)),
        invoiceCount: all.length,
        byStatus
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:invoiceId/pdf — Structured JSON for PDF rendering
router.get('/:invoiceId/pdf', async (req, res) => {
  try {
    const db_ops = getDbOps();
    const all = (await db_ops.getAll(COLLECTION, 10000, 0)).map(r => r.data || r);
    const invoice = all.find(inv => inv.invoiceId === req.params.invoiceId);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    res.json({
      success: true,
      data: {
        companyHeader: {
          name: 'Fraud Shield Platform',
          address: '100 Market Street, Suite 400, San Francisco, CA 94105',
          email: 'billing@fraudshield.io',
          phone: '+1 (415) 555-0100'
        },
        invoiceNumber: invoice.invoiceId,
        issueDate: invoice.createdAt,
        dueDate: invoice.dueDate,
        sellerAddress: {
          name: invoice.sellerName,
          sellerId: invoice.sellerId,
          address: invoice.sellerAddress
        },
        period: {
          start: invoice.periodStart,
          end: invoice.periodEnd
        },
        lineItems: invoice.lineItems,
        subtotal: invoice.subtotal,
        taxRate: 0.085,
        tax: invoice.tax,
        total: invoice.total,
        currency: invoice.currency,
        paymentTerms: invoice.paymentTerms,
        status: invoice.status,
        paidAt: invoice.paidAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:invoiceId — Invoice detail
router.get('/:invoiceId', async (req, res) => {
  try {
    const db_ops = getDbOps();
    const all = (await db_ops.getAll(COLLECTION, 10000, 0)).map(r => r.data || r);
    const invoice = all.find(inv => inv.invoiceId === req.params.invoiceId);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /generate — Generate new invoices for current period
router.post('/generate', async (req, res) => {
  try {
    const db_ops = getDbOps();
    const sellers = (await db_ops.getAll('sellers', 200, 0)).map(s => s.data || s);
    const activeSellers = sellers.filter(s => (s.status || '').toUpperCase() === 'ACTIVE' || (s.status || '').toUpperCase() === 'APPROVED');

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    let generated = 0;

    for (const seller of activeSellers) {
      const sellerId = seller.sellerId || seller.seller_id;
      const invoiceId = `INV-${Date.now().toString(36).toUpperCase()}${generated.toString(36).toUpperCase()}`;

      const lineItemCount = Math.floor(Math.random() * 6) + 3;
      const lineItems = generateLineItems(lineItemCount);
      const subtotal = parseFloat(lineItems.reduce((sum, li) => sum + li.amount, 0).toFixed(2));
      const tax = parseFloat((subtotal * 0.085).toFixed(2));
      const total = parseFloat((subtotal + tax).toFixed(2));

      const invoice = {
        invoiceId,
        sellerId,
        sellerName: seller.businessName || seller.business_name || 'Unknown Seller',
        sellerAddress: seller.address || `${Math.floor(Math.random() * 9999)} Commerce St, ${seller.city || 'San Francisco'}, ${seller.state || 'CA'}`,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        lineItems,
        subtotal,
        tax,
        total,
        status: 'SENT',
        dueDate: new Date(periodEnd.getTime() + 30 * 86400000).toISOString(),
        paidAt: null,
        paymentTerms: 'Net 30',
        currency: 'USD',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };

      await db_ops.insert(COLLECTION, ID_FIELD, invoiceId, invoice);
      generated++;
    }

    res.json({
      success: true,
      data: {
        generated,
        period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
        message: `Generated ${generated} invoices for current period`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
