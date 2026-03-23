import express from 'express';
import { getDbOps } from '../../../shared/common/database-factory.js';

const router = express.Router();

// --- Fee Schedule ---

const FEE_SCHEDULE = {
  New:        { listingFee: 0.35, transactionFee: 0.12, payoutFee: 0.025, monthlySubscription: 0,      discount: 0 },
  Bronze:     { listingFee: 0.30, transactionFee: 0.10, payoutFee: 0.020, monthlySubscription: 9.99,   discount: 0 },
  Silver:     { listingFee: 0.25, transactionFee: 0.08, payoutFee: 0.015, monthlySubscription: 29.99,  discount: 0.05 },
  Gold:       { listingFee: 0.20, transactionFee: 0.07, payoutFee: 0.010, monthlySubscription: 59.99,  discount: 0.10 },
  Platinum:   { listingFee: 0.15, transactionFee: 0.06, payoutFee: 0.005, monthlySubscription: 99.99,  discount: 0.15 },
  Enterprise: { listingFee: 0.10, transactionFee: 0.05, payoutFee: 0.003, monthlySubscription: 299.99, discount: 0.20 }
};

const TIER_ORDER = ['New', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Enterprise'];
const BILLING_TX_TYPES = ['FEE', 'COMMISSION', 'SUBSCRIPTION', 'CREDIT'];

let seeded = false;

// --- Helpers ---

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return +(Math.random() * (max - min) + min).toFixed(2);
}

function randomDate(daysBack) {
  const now = Date.now();
  return new Date(now - Math.random() * daysBack * 24 * 60 * 60 * 1000).toISOString();
}

function tierForSegment(tier) {
  if (TIER_ORDER.includes(tier)) return tier;
  return 'New';
}

// --- Seed billing data ---

async function seedBillingData() {
  if (seeded) return;
  const db_ops = getDbOps();
  if (!db_ops) return;

  // Check if already seeded
  try {
    const existing = await db_ops.getAll('billing_accounts', 1, 0);
    if (existing && existing.length > 0) {
      seeded = true;
      return;
    }
  } catch {
    // Table may not exist yet, proceed with seeding
  }

  // Get all sellers
  let sellers = [];
  try {
    const raw = await db_ops.getAll('sellers', 10000, 0);
    sellers = raw.map(r => r.data || r);
  } catch {
    return;
  }

  if (sellers.length === 0) return;

  for (const seller of sellers) {
    const sellerId = seller.sellerId || seller.seller_id;
    if (!sellerId) continue;

    const tier = tierForSegment(seller.riskTier || seller.tier || seller.segmentTier || 'New');
    const fees = FEE_SCHEDULE[tier];
    const accountId = `BILL-${sellerId}`;

    // Create billing account
    const nextBilling = new Date(Date.now() + randomBetween(1, 30) * 24 * 60 * 60 * 1000).toISOString();
    let balance = 0;

    // Generate 10-20 billing transactions
    const txCount = randomBetween(10, 20);
    for (let i = 0; i < txCount; i++) {
      const txType = BILLING_TX_TYPES[Math.floor(Math.random() * BILLING_TX_TYPES.length)];
      let amount = 0;
      let description = '';

      switch (txType) {
        case 'FEE': {
          const feeKind = ['listing', 'transaction', 'payout'][Math.floor(Math.random() * 3)];
          if (feeKind === 'listing') {
            amount = fees.listingFee * randomBetween(1, 20);
            description = `Listing fees (${randomBetween(1, 20)} listings)`;
          } else if (feeKind === 'transaction') {
            const txAmt = randomFloat(10, 500);
            amount = +(txAmt * fees.transactionFee).toFixed(2);
            description = `Transaction fee on $${txAmt} sale`;
          } else {
            const payAmt = randomFloat(50, 2000);
            amount = +(payAmt * fees.payoutFee).toFixed(2);
            description = `Payout processing fee on $${payAmt}`;
          }
          break;
        }
        case 'COMMISSION': {
          const saleAmt = randomFloat(20, 1000);
          const rate = randomFloat(0.05, 0.15);
          amount = +(saleAmt * rate).toFixed(2);
          description = `Commission on $${saleAmt} sale (${(rate * 100).toFixed(1)}%)`;
          break;
        }
        case 'SUBSCRIPTION': {
          amount = fees.monthlySubscription;
          description = `${tier} plan monthly subscription`;
          break;
        }
        case 'CREDIT': {
          amount = -randomFloat(1, 25);
          description = 'Promotional credit applied';
          break;
        }
      }

      balance += amount;

      const txId = `BTX-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const txData = {
        txId,
        accountId,
        sellerId,
        type: txType,
        amount: +amount.toFixed(2),
        description,
        createdAt: randomDate(30),
        tier
      };

      try {
        await db_ops.insert('billing_transactions', 'txId', txId, txData);
      } catch {
        // ignore duplicate key errors
      }
    }

    const accountData = {
      accountId,
      sellerId,
      businessName: seller.businessName || seller.business_name || `Seller ${sellerId}`,
      tier,
      plan: `${tier} Plan`,
      balance: +balance.toFixed(2),
      nextBillingDate: nextBilling,
      totalCharged: +Math.max(balance, 0).toFixed(2),
      status: 'ACTIVE',
      createdAt: seller.createdAt || new Date().toISOString()
    };

    try {
      await db_ops.insert('billing_accounts', 'accountId', accountId, accountData);
    } catch {
      // ignore duplicate
    }
  }

  seeded = true;
  console.log(`[billing] Seeded billing data for ${sellers.length} sellers`);
}

// --- Routes ---

// GET /accounts — All billing accounts
router.get('/accounts', async (req, res) => {
  try {
    await seedBillingData();
    const db_ops = getDbOps();
    const raw = await db_ops.getAll('billing_accounts', 10000, 0);
    const accounts = raw.map(r => r.data || r);

    res.json({
      success: true,
      data: accounts,
      total: accounts.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /accounts/:sellerId — Single account + last 20 billing transactions
router.get('/accounts/:sellerId', async (req, res) => {
  try {
    await seedBillingData();
    const db_ops = getDbOps();
    const { sellerId } = req.params;
    const accountId = `BILL-${sellerId}`;

    // Find account
    const allAccounts = await db_ops.getAll('billing_accounts', 10000, 0);
    const account = allAccounts.map(r => r.data || r).find(a => a.sellerId === sellerId || a.accountId === accountId);

    if (!account) {
      return res.status(404).json({ success: false, error: 'Billing account not found' });
    }

    // Get transactions for this seller
    const allTx = await db_ops.getAll('billing_transactions', 10000, 0);
    const transactions = allTx
      .map(r => r.data || r)
      .filter(tx => tx.sellerId === sellerId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);

    res.json({
      success: true,
      data: { account, transactions }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /fees — Fee schedule for all tiers
router.get('/fees', async (req, res) => {
  try {
    const schedule = TIER_ORDER.map(tier => ({
      tier,
      ...FEE_SCHEDULE[tier]
    }));
    res.json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /revenue — Platform revenue breakdown
router.get('/revenue', async (req, res) => {
  try {
    await seedBillingData();
    const db_ops = getDbOps();
    const allTx = await db_ops.getAll('billing_transactions', 10000, 0);
    const transactions = allTx.map(r => r.data || r);

    let totalRevenue = 0;
    const byFeeType = { listing: 0, transaction: 0, payout: 0, subscription: 0, commission: 0, credit: 0 };
    const byTier = {};

    for (const tier of TIER_ORDER) {
      byTier[tier] = 0;
    }

    for (const tx of transactions) {
      const amt = tx.amount || 0;
      if (amt > 0) totalRevenue += amt;

      // Categorize by fee type
      if (tx.type === 'FEE') {
        if (tx.description?.includes('Listing')) byFeeType.listing += amt;
        else if (tx.description?.includes('Transaction')) byFeeType.transaction += amt;
        else if (tx.description?.includes('Payout')) byFeeType.payout += amt;
      } else if (tx.type === 'COMMISSION') {
        byFeeType.commission += amt;
      } else if (tx.type === 'SUBSCRIPTION') {
        byFeeType.subscription += amt;
      } else if (tx.type === 'CREDIT') {
        byFeeType.credit += amt;
      }

      // By tier
      const tier = tx.tier || 'New';
      if (byTier[tier] !== undefined) {
        byTier[tier] += Math.max(amt, 0);
      }
    }

    // Round all values
    for (const key of Object.keys(byFeeType)) {
      byFeeType[key] = +byFeeType[key].toFixed(2);
    }
    for (const key of Object.keys(byTier)) {
      byTier[key] = +byTier[key].toFixed(2);
    }

    const allAccounts = await db_ops.getAll('billing_accounts', 10000, 0);
    const accountCount = allAccounts.length || 1;
    const mrr = +(totalRevenue / 1).toFixed(2); // 30-day window = ~1 month
    const arpu = +(totalRevenue / accountCount).toFixed(2);

    res.json({
      success: true,
      data: {
        totalRevenue: +totalRevenue.toFixed(2),
        byFeeType,
        byTier,
        mrr,
        arpu,
        totalSellers: accountCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /calculate — Calculate fees for a hypothetical transaction
router.post('/calculate', async (req, res) => {
  try {
    const { sellerId, amount, tier, feeType } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be positive' });
    }

    const selectedTier = tier && FEE_SCHEDULE[tier] ? tier : 'New';
    const fees = FEE_SCHEDULE[selectedTier];

    const listingFee = +(amount * fees.listingFee).toFixed(2);
    const transactionFee = +(amount * fees.transactionFee).toFixed(2);
    const payoutFee = +(amount * fees.payoutFee).toFixed(2);
    const discount = fees.discount;
    const subtotal = +(listingFee + transactionFee + payoutFee).toFixed(2);
    const discountAmount = +(subtotal * discount).toFixed(2);
    const total = +(subtotal - discountAmount).toFixed(2);

    res.json({
      success: true,
      data: {
        sellerId: sellerId || null,
        amount,
        tier: selectedTier,
        breakdown: {
          listingFee,
          transactionFee,
          payoutFee,
          subtotal,
          discount: `${(discount * 100).toFixed(0)}%`,
          discountAmount,
          total
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats — Platform billing stats
router.get('/stats', async (req, res) => {
  try {
    await seedBillingData();
    const db_ops = getDbOps();

    const allAccounts = await db_ops.getAll('billing_accounts', 10000, 0);
    const accounts = allAccounts.map(r => r.data || r);
    const totalSellers = accounts.length;

    const allTx = await db_ops.getAll('billing_transactions', 10000, 0);
    const transactions = allTx.map(r => r.data || r);

    let totalRevenue = 0;
    const revenueByTier = {};
    for (const tier of TIER_ORDER) revenueByTier[tier] = 0;

    for (const tx of transactions) {
      const amt = tx.amount || 0;
      if (amt > 0) totalRevenue += amt;
      const tier = tx.tier || 'New';
      if (revenueByTier[tier] !== undefined) {
        revenueByTier[tier] += Math.max(amt, 0);
      }
    }

    // Round tier values
    for (const key of Object.keys(revenueByTier)) {
      revenueByTier[key] = +revenueByTier[key].toFixed(2);
    }

    const mrr = +totalRevenue.toFixed(2);
    const arpu = totalSellers > 0 ? +(totalRevenue / totalSellers).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        mrr,
        arpu,
        totalSellers,
        totalRevenue: +totalRevenue.toFixed(2),
        revenueByTier,
        churnRate: 2.3,
        growthRate: 8.5
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
