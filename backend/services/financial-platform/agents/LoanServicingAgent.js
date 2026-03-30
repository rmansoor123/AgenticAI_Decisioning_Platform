/**
 * Loan Servicing Agent — manages loan lifecycle.
 * Inputs: loanId, repaymentSchedule, paymentReceived
 * Outputs: loanStatus, daysPastDue, defaultRiskScore, nextAction
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

const LOAN_POLICY = {
  gracePeriodDays: 5,
  lateFeeRate: 0.02, // 2% of payment amount
  defaultThresholdDays: 90,
  collectionThresholdDays: 120,
  earlyPaymentDiscount: 0.005 // 0.5% discount
};

export class LoanServicingAgent {
  constructor() {
    this.stats = { processed: 0, onTime: 0, late: 0, defaults: 0 };
  }

  async evaluate(input) {
    const { loanId, sellerId, paymentAmount = 0, expectedAmount = 0, dueDate,
            outstandingBalance = 0, totalLoanAmount = 0, paymentsCompleted = 0,
            totalPayments = 12 } = input;
    const startTime = Date.now();

    const now = new Date();
    const due = new Date(dueDate || now);
    const daysPastDue = Math.max(0, Math.floor((now - due) / 86400000));

    // Payment status
    let paymentStatus = 'ON_TIME';
    let lateFee = 0;
    let earlyPaymentDiscount = 0;

    if (daysPastDue > LOAN_POLICY.gracePeriodDays) {
      paymentStatus = 'LATE';
      lateFee = Math.round(expectedAmount * LOAN_POLICY.lateFeeRate * 100) / 100;
    }
    if (daysPastDue > LOAN_POLICY.defaultThresholdDays) {
      paymentStatus = 'DEFAULT';
    }
    if (daysPastDue > LOAN_POLICY.collectionThresholdDays) {
      paymentStatus = 'COLLECTIONS';
    }
    if (daysPastDue === 0 && paymentAmount >= expectedAmount) {
      earlyPaymentDiscount = Math.round(paymentAmount * LOAN_POLICY.earlyPaymentDiscount * 100) / 100;
    }

    // Default risk scoring (0-100)
    let defaultRiskScore = 0;
    defaultRiskScore += Math.min(40, daysPastDue * 0.5); // Past due contribution
    defaultRiskScore += paymentAmount < expectedAmount ? 20 : 0; // Underpayment
    defaultRiskScore += paymentsCompleted < totalPayments * 0.25 ? 15 : 0; // Early stage
    defaultRiskScore += outstandingBalance > totalLoanAmount * 0.8 ? 10 : 0; // High balance
    if (paymentStatus === 'DEFAULT') defaultRiskScore = Math.max(defaultRiskScore, 75);
    if (paymentStatus === 'COLLECTIONS') defaultRiskScore = 95;
    defaultRiskScore = Math.min(100, Math.round(defaultRiskScore));

    // Loan status
    let loanStatus = 'ACTIVE';
    if (outstandingBalance <= 0 && paymentsCompleted >= totalPayments) loanStatus = 'PAID_OFF';
    if (paymentStatus === 'DEFAULT') loanStatus = 'IN_DEFAULT';
    if (paymentStatus === 'COLLECTIONS') loanStatus = 'IN_COLLECTIONS';

    // Next action
    let nextAction = { action: 'NONE', description: 'No action required' };
    if (paymentStatus === 'LATE' && daysPastDue <= 30) {
      nextAction = { action: 'SEND_REMINDER', description: `Payment ${daysPastDue} days overdue — send reminder`, priority: 'MEDIUM' };
    } else if (daysPastDue > 30 && daysPastDue <= 60) {
      nextAction = { action: 'SEND_WARNING', description: `Payment ${daysPastDue} days overdue — send formal warning`, priority: 'HIGH' };
    } else if (daysPastDue > 60 && daysPastDue <= 90) {
      nextAction = { action: 'RESTRICT_SERVICES', description: `Payment ${daysPastDue} days overdue — restrict platform services`, priority: 'HIGH' };
    } else if (paymentStatus === 'DEFAULT') {
      nextAction = { action: 'INITIATE_DEFAULT', description: 'Loan in default — initiate recovery process', priority: 'CRITICAL' };
    } else if (paymentStatus === 'COLLECTIONS') {
      nextAction = { action: 'SEND_TO_COLLECTIONS', description: 'Transfer to collections agency', priority: 'CRITICAL' };
    } else if (paymentAmount > expectedAmount) {
      nextAction = { action: 'PROCESS_OVERPAYMENT', description: `Overpayment of $${(paymentAmount - expectedAmount).toFixed(2)} — apply to principal`, priority: 'LOW' };
    }

    // New balance
    const newBalance = Math.max(0, outstandingBalance - paymentAmount + lateFee - earlyPaymentDiscount);

    this.stats.processed++;
    if (paymentStatus === 'ON_TIME') this.stats.onTime++;
    else if (paymentStatus === 'LATE') this.stats.late++;
    else if (paymentStatus === 'DEFAULT' || paymentStatus === 'COLLECTIONS') this.stats.defaults++;

    // Persist
    const db_ops = getDbOps();
    try {
      await db_ops.insert('financial_decisions', 'decision_id', `LS-${Date.now().toString(36).toUpperCase()}`, {
        type: 'LOAN_SERVICING', loanId, sellerId,
        paymentStatus, daysPastDue, defaultRiskScore,
        loanStatus, nextAction, paymentAmount, expectedAmount,
        lateFee, earlyPaymentDiscount, newBalance,
        createdAt: new Date().toISOString()
      });
    } catch (_) {}

    return {
      loanId, sellerId, loanStatus, paymentStatus,
      daysPastDue, defaultRiskScore, nextAction,
      paymentAmount, expectedAmount, lateFee, earlyPaymentDiscount,
      outstandingBalance: newBalance,
      progressPct: Math.round((paymentsCompleted / totalPayments) * 100),
      latencyMs: Date.now() - startTime
    };
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getLoanServicingAgent() {
  if (!instance) instance = new LoanServicingAgent();
  return instance;
}
export default { LoanServicingAgent, getLoanServicingAgent };
