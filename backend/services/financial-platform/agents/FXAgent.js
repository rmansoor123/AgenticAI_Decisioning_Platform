/**
 * FX Agent — multi-currency management and conversion.
 * Handles: conversion quotes, auto-conversion, multi-currency wallets.
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

// Simulated FX rates (would be real-time in production)
const FX_RATES = {
  USD: { EUR: 0.92, GBP: 0.79, CAD: 1.36, JPY: 149.50, AUD: 1.53, INR: 83.10, BRL: 4.97, MXN: 17.15, CNY: 7.24 },
  EUR: { USD: 1.087, GBP: 0.859, CAD: 1.478 },
  GBP: { USD: 1.266, EUR: 1.164, CAD: 1.721 }
};

const FX_MARKUP = 0.015; // 1.5% markup on conversion

export class FXAgent {
  constructor() {
    this.stats = { quotes: 0, conversions: 0, totalConverted: 0 };
  }

  async evaluate(input) {
    const { sellerId, action = 'QUOTE', fromCurrency = 'USD', toCurrency = 'EUR', amount = 0 } = input;
    const startTime = Date.now();

    if (action === 'QUOTE') {
      this.stats.quotes++;
      const rate = this._getRate(fromCurrency, toCurrency);
      if (!rate) return { error: `No rate available for ${fromCurrency}→${toCurrency}` };

      const midMarketRate = rate;
      const ourRate = rate * (1 - FX_MARKUP); // We give slightly less
      const convertedAmount = Math.round(amount * ourRate * 100) / 100;
      const fee = Math.round(amount * FX_MARKUP * 100) / 100;

      return {
        sellerId, action: 'QUOTE', fromCurrency, toCurrency, amount,
        midMarketRate, ourRate: Math.round(ourRate * 10000) / 10000,
        convertedAmount, fee, markup: `${(FX_MARKUP * 100).toFixed(1)}%`,
        validFor: '30 seconds',
        latencyMs: Date.now() - startTime
      };
    }

    if (action === 'CONVERT') {
      this.stats.conversions++;
      const rate = this._getRate(fromCurrency, toCurrency);
      const ourRate = rate * (1 - FX_MARKUP);
      const convertedAmount = Math.round(amount * ourRate * 100) / 100;
      this.stats.totalConverted += amount;

      const conversionId = `FX-${Date.now().toString(36).toUpperCase()}`;
      const db_ops = getDbOps();
      try {
        await db_ops.insert('financial_decisions', 'decision_id', conversionId, {
          type: 'FX_CONVERSION', sellerId, conversionId,
          fromCurrency, toCurrency, fromAmount: amount, toAmount: convertedAmount,
          rate: ourRate, createdAt: new Date().toISOString()
        });
      } catch (_) {}

      return {
        sellerId, action: 'CONVERT', conversionId,
        fromCurrency, toCurrency, fromAmount: amount,
        toAmount: convertedAmount, rate: Math.round(ourRate * 10000) / 10000,
        latencyMs: Date.now() - startTime
      };
    }

    if (action === 'RATES') {
      const rates = {};
      for (const [to, rate] of Object.entries(FX_RATES[fromCurrency] || {})) {
        rates[to] = { midMarket: rate, ourRate: Math.round(rate * (1 - FX_MARKUP) * 10000) / 10000 };
      }
      return { fromCurrency, rates, markup: FX_MARKUP, latencyMs: Date.now() - startTime };
    }

    return { error: `Unknown action: ${action}` };
  }

  _getRate(from, to) {
    if (from === to) return 1;
    return FX_RATES[from]?.[to] || (FX_RATES[to]?.[from] ? 1 / FX_RATES[to][from] : null);
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getFXAgent() {
  if (!instance) instance = new FXAgent();
  return instance;
}
export default { FXAgent, getFXAgent };
