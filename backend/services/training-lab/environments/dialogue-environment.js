/**
 * Dialogue Environment — multi-turn conversations where agent asks
 * clarifying questions before making decisions.
 *
 * Tests: When to ask vs decide, question quality, information efficiency.
 */

class DialogueEnvironment {
  constructor() {
    this.scenarios = new Map();
    this.stats = { runs: 0, avgTurns: 0, totalTurns: 0 };
    this._seedScenarios();
  }

  _seedScenarios() {
    this.scenarios.set('ambiguous-onboarding', {
      name: 'Ambiguous Seller Onboarding',
      description: 'Seller application with missing/conflicting information. Agent must ask clarifying questions.',
      initialContext: {
        businessName: 'Global Trading Partners',
        country: 'US',
        businessCategory: 'Electronics',
        email: 'info@globaltrading.com',
        // Missing: phone, documents, bank info -- agent should ask
        riskSignals: ['Business name matches known shell company pattern', 'Email domain registered 2 days ago']
      },
      hiddenInfo: {
        phone: '+1-555-123-4567',
        hasValidDocuments: true,
        bankVerified: true,
        actualRisk: 'LOW', // looks suspicious but is actually legitimate
        shellCompanyMatch: false // the pattern match is a false positive
      },
      expectedQuestions: [
        'Can you provide a phone number?',
        'Please upload identity documents',
        'Can you verify bank account ownership?',
        'Can you explain the business name similarity to [shell company]?',
        'When was the business incorporated?'
      ],
      optimalTurns: 3, // good agent asks 3 targeted questions then decides
      maxTurns: 10
    });

    this.scenarios.set('suspicious-transaction', {
      name: 'Suspicious Transaction Investigation',
      description: 'High-value transaction with mixed signals. Agent must investigate before deciding.',
      initialContext: {
        transactionId: 'TXN-SUSPICIOUS-001',
        amount: 8500,
        buyerCountry: 'NG',
        sellerCountry: 'US',
        deviceTrust: 0.3,
        sellerAccountAge: 365, // 1 year -- established seller
        previousTransactions: 200, // lots of history
        riskSignals: ['High-risk buyer country', 'Low device trust score']
      },
      hiddenInfo: {
        buyerIsRepeat: true, // has bought from this seller before
        deviceIsNewButLegitimate: true, // new phone, same buyer
        buyerVerified: true,
        actualRisk: 'LOW'
      },
      expectedQuestions: [
        'Is this buyer a repeat customer of this seller?',
        'Has the buyer been verified?',
        'Is the device new or has the buyer used it before?',
        'What is the typical transaction amount for this seller?'
      ],
      optimalTurns: 2,
      maxTurns: 8
    });

    this.scenarios.set('credit-edge-case', {
      name: 'Credit Underwriting Edge Case',
      description: 'Seller at the boundary of credit approval. Agent must gather specific information.',
      initialContext: {
        sellerId: 'SLR-EDGE-001',
        businessName: 'Artisan Woodworks',
        tier: 'Silver',
        gmv30d: 45000,
        riskScore: 52, // right at the boundary
        accountAgeDays: 90,
        requestedCredit: 75000 // ambitious for Silver tier
      },
      hiddenInfo: {
        hasCollateral: true,
        perfectRepaymentHistory: true,
        revenueGrowing: true, // 20% month over month
        existingDebt: 0,
        actualCreditWorthiness: 'APPROVE_WITH_CONDITIONS'
      },
      expectedQuestions: [
        'Does the seller have any existing debt or loans?',
        'What is the revenue growth trend?',
        'Does the seller have collateral?',
        'What is the repayment history on previous credit?'
      ],
      optimalTurns: 3,
      maxTurns: 8
    });
  }

  /**
   * Run a dialogue episode.
   */
  async runDialogue(scenarioId, agentFn = null) {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);

    const startTime = Date.now();
    const turns = [];
    let turn = 0;
    let totalReward = 0;
    let decided = false;

    while (!decided && turn < scenario.maxTurns) {
      const state = {
        scenario: scenario.name,
        context: scenario.initialContext,
        previousTurns: turns,
        turn, maxTurns: scenario.maxTurns
      };

      let agentResponse;
      if (agentFn) {
        agentResponse = await agentFn(state);
      } else {
        // Random: 60% ask question, 40% make decision
        if (Math.random() > 0.4 && turn < scenario.maxTurns - 1) {
          const q = scenario.expectedQuestions[Math.floor(Math.random() * scenario.expectedQuestions.length)];
          agentResponse = { type: 'QUESTION', content: q };
        } else {
          agentResponse = { type: 'DECISION', decision: Math.random() > 0.5 ? 'APPROVE' : 'REJECT', reasoning: 'Based on available evidence' };
        }
      }

      let reward = 0;
      let systemResponse = '';

      if (agentResponse.type === 'QUESTION') {
        // Check if question is relevant
        const isExpected = scenario.expectedQuestions.some(eq =>
          agentResponse.content.toLowerCase().includes(eq.toLowerCase().substring(0, 20)) ||
          eq.toLowerCase().includes(agentResponse.content.toLowerCase().substring(0, 20))
        );

        if (isExpected) {
          reward = 3; // good question
          // Reveal relevant hidden info
          systemResponse = this._answerQuestion(agentResponse.content, scenario.hiddenInfo);
        } else {
          reward = -1; // irrelevant question
          systemResponse = 'That information is not available.';
        }

        // Penalty for too many questions
        if (turn > scenario.optimalTurns + 2) reward -= 1;
      } else if (agentResponse.type === 'DECISION') {
        decided = true;

        // Score decision correctness
        const actualRisk = scenario.hiddenInfo.actualRisk;
        const isCorrect = (
          (actualRisk === 'LOW' && agentResponse.decision === 'APPROVE') ||
          (actualRisk === 'HIGH' && agentResponse.decision === 'REJECT') ||
          (actualRisk === 'APPROVE_WITH_CONDITIONS' && (agentResponse.decision === 'APPROVE' || agentResponse.decision === 'REVIEW'))
        );

        if (isCorrect) {
          reward = 10;
          // Bonus for deciding at optimal turn count
          if (turn <= scenario.optimalTurns) reward += 5;
        } else {
          reward = -15;
        }

        systemResponse = `Decision: ${agentResponse.decision}. Actual risk: ${actualRisk}. ${isCorrect ? 'CORRECT' : 'INCORRECT'}`;
      }

      totalReward += reward;
      turns.push({
        turn, agentResponse, systemResponse, reward,
        timestamp: new Date().toISOString()
      });
      turn++;
    }

    this.stats.runs++;
    this.stats.totalTurns += turn;
    this.stats.avgTurns = Math.round(this.stats.totalTurns / this.stats.runs * 10) / 10;

    return {
      scenarioId, scenarioName: scenario.name,
      decided, totalReward: Math.round(totalReward * 100) / 100,
      turns: turn, optimalTurns: scenario.optimalTurns,
      efficiency: turn <= scenario.optimalTurns ? 'OPTIMAL' : turn <= scenario.optimalTurns + 2 ? 'ACCEPTABLE' : 'INEFFICIENT',
      questionsAsked: turns.filter(t => t.agentResponse.type === 'QUESTION').length,
      dialogue: turns,
      latencyMs: Date.now() - startTime
    };
  }

  _answerQuestion(question, hiddenInfo) {
    const q = question.toLowerCase();
    if (q.includes('phone')) return `Phone: ${hiddenInfo.phone || 'Not provided'}`;
    if (q.includes('document') || q.includes('identity')) return `Documents: ${hiddenInfo.hasValidDocuments ? 'Valid documents on file' : 'No documents submitted'}`;
    if (q.includes('bank')) return `Bank: ${hiddenInfo.bankVerified ? 'Bank account verified' : 'Not verified'}`;
    if (q.includes('shell') || q.includes('company')) return `Shell company match: ${hiddenInfo.shellCompanyMatch ? 'Confirmed match' : 'False positive -- different entity'}`;
    if (q.includes('repeat') || q.includes('customer')) return `Repeat buyer: ${hiddenInfo.buyerIsRepeat ? 'Yes, 5 previous purchases' : 'No, first-time buyer'}`;
    if (q.includes('device')) return `Device: ${hiddenInfo.deviceIsNewButLegitimate ? 'New device but same buyer identity verified' : 'Unknown device'}`;
    if (q.includes('verified') || q.includes('verify')) return `Verified: ${hiddenInfo.buyerVerified ? 'Buyer identity verified' : 'Not verified'}`;
    if (q.includes('typical') || q.includes('average')) return `Typical transaction: $500-$2000. This is above average but within 3x range.`;
    if (q.includes('debt') || q.includes('loan')) return `Existing debt: $${hiddenInfo.existingDebt || 0}`;
    if (q.includes('growth') || q.includes('revenue')) return `Revenue: ${hiddenInfo.revenueGrowing ? 'Growing 20% month-over-month' : 'Stable'}`;
    if (q.includes('collateral')) return `Collateral: ${hiddenInfo.hasCollateral ? 'Yes, real estate valued at $200K' : 'No collateral available'}`;
    if (q.includes('repayment') || q.includes('history')) return `Repayment: ${hiddenInfo.perfectRepaymentHistory ? 'Perfect -- 12/12 on-time payments' : 'Mixed history'}`;
    if (q.includes('incorporat')) return `Incorporated: 5 years ago. Active status.`;
    return 'Additional context not available for that question.';
  }

  listScenarios() {
    return Array.from(this.scenarios.entries()).map(([id, s]) => ({
      scenarioId: id, name: s.name, description: s.description,
      optimalTurns: s.optimalTurns, maxTurns: s.maxTurns
    }));
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getDialogueEnvironment() {
  if (!instance) instance = new DialogueEnvironment();
  return instance;
}
export default { DialogueEnvironment, getDialogueEnvironment };
