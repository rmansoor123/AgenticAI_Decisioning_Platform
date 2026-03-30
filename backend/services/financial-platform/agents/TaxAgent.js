/**
 * Tax Agent — calculates taxes, generates tax reports.
 * Supports: sales tax, VAT, income withholding, 1099 generation.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

const TAX_RATES = {
  US: { salesTax: { CA: 0.0725, NY: 0.08, TX: 0.0625, FL: 0.06, WA: 0.065, default: 0.05 }, withholding: 0.24 },
  UK: { vat: 0.20, withholding: 0.20 },
  EU: { vat: { DE: 0.19, FR: 0.20, IT: 0.22, ES: 0.21, NL: 0.21, default: 0.20 }, withholding: 0.15 },
  CA: { gst: 0.05, pst: { BC: 0.07, ON: 0.08, QC: 0.0975, default: 0 }, withholding: 0.25 },
  default: { salesTax: 0.05, withholding: 0.10 }
};

const WITHHOLDING_THRESHOLD = 600; // 1099 threshold

export class TaxAgent {
  constructor() {
    this.stats = { calculations: 0, reports: 0 };
  }

  async evaluate(input) {
    const { sellerId, action = 'CALCULATE', amount = 0, country = 'US', state, transactionType = 'SALE', period } = input;
    const startTime = Date.now();

    if (action === 'CALCULATE') {
      this.stats.calculations++;
      const taxBreakdown = this._calculateTax(amount, country, state, transactionType);
      return { sellerId, action: 'CALCULATE', ...taxBreakdown, latencyMs: Date.now() - startTime };
    }

    if (action === 'ANNUAL_REPORT') {
      this.stats.reports++;
      return await this._generateAnnualReport(sellerId, period || new Date().getFullYear(), startTime);
    }

    if (action === 'WITHHOLDING_CHECK') {
      return await this._checkWithholding(sellerId, startTime);
    }

    return { error: `Unknown action: ${action}` };
  }

  _calculateTax(amount, country, state, type) {
    let salesTax = 0, vat = 0, gst = 0, pst = 0, withholding = 0;
    const rates = TAX_RATES[country] || TAX_RATES.default;

    if (country === 'US') {
      const stateRate = rates.salesTax[state] || rates.salesTax.default;
      salesTax = Math.round(amount * stateRate * 100) / 100;
    } else if (country === 'UK') {
      vat = Math.round(amount * rates.vat * 100) / 100;
    } else if (country === 'CA') {
      gst = Math.round(amount * rates.gst * 100) / 100;
      const pstRate = rates.pst[state] || rates.pst.default;
      pst = Math.round(amount * pstRate * 100) / 100;
    } else if (TAX_RATES.EU && ['DE','FR','IT','ES','NL'].includes(country)) {
      const vatRate = TAX_RATES.EU.vat[country] || TAX_RATES.EU.vat.default;
      vat = Math.round(amount * vatRate * 100) / 100;
    }

    const totalTax = salesTax + vat + gst + pst;
    const netAmount = Math.round((amount - totalTax) * 100) / 100;

    return {
      grossAmount: amount, totalTax, netAmount,
      breakdown: {
        ...(salesTax > 0 && { salesTax }),
        ...(vat > 0 && { vat }),
        ...(gst > 0 && { gst }),
        ...(pst > 0 && { pst })
      },
      country, state, effectiveRate: amount > 0 ? Math.round((totalTax / amount) * 10000) / 100 : 0
    };
  }

  async _generateAnnualReport(sellerId, year, startTime) {
    const db_ops = getDbOps();
    const allTx = (await db_ops.getAll('transactions', 50000, 0)).map(t => t.data);
    const sellerTx = allTx.filter(t => t.sellerId === sellerId && new Date(t.createdAt || 0).getFullYear() === year);

    const totalRevenue = sellerTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const transactionCount = sellerTx.length;
    const requires1099 = totalRevenue >= WITHHOLDING_THRESHOLD;

    return {
      sellerId, year, action: 'ANNUAL_REPORT',
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      transactionCount,
      estimatedTax: Math.round(totalRevenue * 0.25 * 100) / 100, // rough estimate
      requires1099,
      form1099Status: requires1099 ? 'REQUIRED' : 'NOT_REQUIRED',
      quarterlyBreakdown: [1,2,3,4].map(q => {
        const qTx = sellerTx.filter(t => Math.ceil((new Date(t.createdAt || 0).getMonth() + 1) / 3) === q);
        return { quarter: `Q${q}`, revenue: Math.round(qTx.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0) * 100) / 100, transactions: qTx.length };
      }),
      latencyMs: Date.now() - startTime
    };
  }

  async _checkWithholding(sellerId, startTime) {
    const db_ops = getDbOps();
    const allTx = (await db_ops.getAll('transactions', 50000, 0)).map(t => t.data);
    const ytdRevenue = allTx
      .filter(t => t.sellerId === sellerId && new Date(t.createdAt || 0).getFullYear() === new Date().getFullYear())
      .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

    return {
      sellerId, action: 'WITHHOLDING_CHECK',
      ytdRevenue: Math.round(ytdRevenue * 100) / 100,
      threshold: WITHHOLDING_THRESHOLD,
      withholdingRequired: ytdRevenue >= WITHHOLDING_THRESHOLD,
      withholdingRate: TAX_RATES.US.withholding,
      estimatedWithholding: ytdRevenue >= WITHHOLDING_THRESHOLD ? Math.round(ytdRevenue * TAX_RATES.US.withholding * 100) / 100 : 0,
      latencyMs: Date.now() - startTime
    };
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getTaxAgent() {
  if (!instance) instance = new TaxAgent();
  return instance;
}
export default { TaxAgent, getTaxAgent };
