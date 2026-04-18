/**
 * MCP-Based Environment — simulates MCP tool-use for function-calling agents.
 *
 * MCP defines a standard protocol for LLMs to call external tools.
 * This environment provides a set of MCP-compatible tools and evaluates
 * how well an agent selects and sequences tool calls.
 */

class MCPEnvironment {
  constructor() {
    this.toolRegistries = new Map();
    this.stats = { runs: 0, toolCalls: 0 };
    this._seedToolRegistries();
  }

  _seedToolRegistries() {
    // Registry 1: Fraud Detection Tools
    this.toolRegistries.set('fraud-detection', {
      name: 'Fraud Detection MCP Tools',
      tools: [
        { name: 'verify_identity', description: 'Verify seller identity documents', inputSchema: { type: 'object', properties: { sellerId: { type: 'string' }, documentType: { type: 'string' } }, required: ['sellerId'] }, returns: { verified: 'boolean', confidence: 'number', issues: 'array' } },
        { name: 'check_fraud_database', description: 'Check against known fraud database', inputSchema: { type: 'object', properties: { email: { type: 'string' }, phone: { type: 'string' } }, required: ['email'] }, returns: { isBlocked: 'boolean', riskScore: 'number' } },
        { name: 'screen_watchlist', description: 'Screen against OFAC/PEP watchlists', inputSchema: { type: 'object', properties: { name: { type: 'string' }, country: { type: 'string' } }, required: ['name'] }, returns: { matched: 'boolean', matches: 'array' } },
        { name: 'run_ml_inference', description: 'Run ML model for risk scoring', inputSchema: { type: 'object', properties: { features: { type: 'object' } }, required: ['features'] }, returns: { score: 'number', decision: 'string', contributors: 'array' } },
        { name: 'check_device_reputation', description: 'Check device fingerprint reputation', inputSchema: { type: 'object', properties: { fingerprint: { type: 'string' } }, required: ['fingerprint'] }, returns: { trustScore: 'number', isBot: 'boolean', isEmulator: 'boolean' } },
        { name: 'analyze_network', description: 'Graph-based network analysis for fraud rings', inputSchema: { type: 'object', properties: { sellerId: { type: 'string' } }, required: ['sellerId'] }, returns: { connections: 'number', riskEntities: 'number', clusterRisk: 'string' } },
        { name: 'make_decision', description: 'Submit final fraud decision', inputSchema: { type: 'object', properties: { decision: { type: 'string', enum: ['APPROVE', 'REJECT', 'REVIEW'] }, confidence: { type: 'number' }, reasoning: { type: 'string' } }, required: ['decision'] }, returns: { accepted: 'boolean' } }
      ]
    });

    // Registry 2: Financial Services Tools
    this.toolRegistries.set('financial-services', {
      name: 'Financial Services MCP Tools',
      tools: [
        { name: 'check_credit_bureau', description: 'Query credit bureau for business credit score', inputSchema: { type: 'object', properties: { businessId: { type: 'string' } }, required: ['businessId'] }, returns: { creditScore: 'number', paymentHistory: 'string' } },
        { name: 'verify_bank_account', description: 'Verify bank account ownership', inputSchema: { type: 'object', properties: { routingNumber: { type: 'string' }, accountNumber: { type: 'string' } }, required: ['routingNumber'] }, returns: { verified: 'boolean', accountType: 'string' } },
        { name: 'calculate_credit_limit', description: 'Calculate recommended credit limit', inputSchema: { type: 'object', properties: { gmv30d: { type: 'number' }, riskScore: { type: 'number' }, tier: { type: 'string' } }, required: ['gmv30d'] }, returns: { limit: 'number', tier: 'string', rate: 'number' } },
        { name: 'process_payout', description: 'Process seller payout', inputSchema: { type: 'object', properties: { sellerId: { type: 'string' }, amount: { type: 'number' } }, required: ['sellerId', 'amount'] }, returns: { approved: 'boolean', holdReason: 'string' } },
        { name: 'forecast_cashflow', description: 'Generate 30-day cash flow forecast', inputSchema: { type: 'object', properties: { sellerId: { type: 'string' } }, required: ['sellerId'] }, returns: { projected30d: 'number', confidence: 'number', trend: 'string' } }
      ]
    });

    // Registry 3: Data Platform Tools
    this.toolRegistries.set('data-platform', {
      name: 'Data Platform MCP Tools',
      tools: [
        { name: 'query_data_sources', description: 'Query federated data from registered connectors', inputSchema: { type: 'object', properties: { entity: { type: 'string' }, entityId: { type: 'string' }, sources: { type: 'array' } }, required: ['entity'] }, returns: { results: 'object', lineage: 'array' } },
        { name: 'ingest_document', description: 'Ingest a document into the training pipeline', inputSchema: { type: 'object', properties: { content: { type: 'string' }, format: { type: 'string' } }, required: ['content'] }, returns: { docId: 'string', quality: 'number' } },
        { name: 'search_knowledge_base', description: 'Search the knowledge base for relevant patterns', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, returns: { results: 'array', count: 'number' } }
      ]
    });
  }

  /**
   * Run an MCP tool-calling episode.
   * Agent receives a task and must select + sequence tools to complete it.
   */
  async runEpisode(registryId, task, agentFn = null) {
    const registry = this.toolRegistries.get(registryId);
    if (!registry) throw new Error(`Registry ${registryId} not found`);

    const startTime = Date.now();
    const trajectory = [];
    let totalReward = 0;
    let completed = false;
    let step = 0;
    const maxSteps = 15;
    const context = { toolResults: {}, evidenceGathered: 0 };

    while (!completed && step < maxSteps) {
      const state = {
        task: task.description || task,
        availableTools: registry.tools.map(t => ({ name: t.name, description: t.description })),
        toolResults: context.toolResults,
        step, evidenceGathered: context.evidenceGathered
      };

      // Agent selects tool + params
      let toolCall;
      if (agentFn) {
        toolCall = await agentFn(state);
      } else {
        // Random tool selection
        const tool = registry.tools[Math.floor(Math.random() * registry.tools.length)];
        toolCall = { tool: tool.name, params: {} };
      }

      // Execute tool
      const tool = registry.tools.find(t => t.name === toolCall.tool);
      let reward = -0.5;
      let result = null;

      if (tool) {
        // Simulate tool execution
        result = this._simulateToolResult(tool);
        context.toolResults[tool.name] = result;
        context.evidenceGathered++;
        this.stats.toolCalls++;

        // Reward based on tool relevance
        if (tool.name === 'make_decision' || tool.name === 'process_payout') {
          completed = true;
          reward = 10;
        } else if (tool.name.includes('verify') || tool.name.includes('check')) {
          reward = 2; // evidence gathering
        } else if (tool.name.includes('ml') || tool.name.includes('inference')) {
          reward = 3; // ML is high value
        } else {
          reward = 1;
        }

        // Penalty for redundant calls
        const prevCalls = trajectory.filter(t => t.tool === tool.name).length;
        if (prevCalls > 0) reward -= 3; // penalize repeats
      } else {
        reward = -5; // invalid tool
        result = { error: `Tool ${toolCall.tool} not found` };
      }

      totalReward += reward;
      trajectory.push({
        step, tool: toolCall.tool, params: toolCall.params,
        result, reward, completed,
        timestamp: new Date().toISOString()
      });
      step++;
    }

    this.stats.runs++;

    return {
      registryId, task: typeof task === 'string' ? task : task.description,
      completed, totalReward: Math.round(totalReward * 100) / 100,
      steps: step, toolCalls: trajectory.filter(t => t.result && !t.result.error).length,
      uniqueTools: new Set(trajectory.map(t => t.tool)).size,
      trajectory, latencyMs: Date.now() - startTime
    };
  }

  _simulateToolResult(tool) {
    // Generate plausible results based on tool type
    const results = {
      verify_identity: { verified: Math.random() > 0.2, confidence: 0.7 + Math.random() * 0.3, issues: [] },
      check_fraud_database: { isBlocked: Math.random() > 0.9, riskScore: Math.round(Math.random() * 100) },
      screen_watchlist: { matched: Math.random() > 0.95, matches: [] },
      run_ml_inference: { score: Math.round(Math.random() * 1000) / 1000, decision: Math.random() > 0.5 ? 'APPROVE' : 'REVIEW', contributors: [] },
      check_device_reputation: { trustScore: Math.round(Math.random() * 100) / 100, isBot: Math.random() > 0.9, isEmulator: Math.random() > 0.95 },
      analyze_network: { connections: Math.floor(Math.random() * 50), riskEntities: Math.floor(Math.random() * 5), clusterRisk: ['LOW', 'MEDIUM', 'HIGH'][Math.floor(Math.random() * 3)] },
      make_decision: { accepted: true },
      check_credit_bureau: { creditScore: 500 + Math.floor(Math.random() * 350), paymentHistory: ['GOOD', 'FAIR', 'POOR'][Math.floor(Math.random() * 3)] },
      verify_bank_account: { verified: Math.random() > 0.1, accountType: 'CHECKING' },
      calculate_credit_limit: { limit: Math.round(Math.random() * 200000), tier: ['A', 'B', 'C'][Math.floor(Math.random() * 3)], rate: 0.05 + Math.random() * 0.15 },
      process_payout: { approved: Math.random() > 0.3, holdReason: null },
      forecast_cashflow: { projected30d: Math.round(Math.random() * 500000), confidence: 0.5 + Math.random() * 0.5, trend: ['GROWING', 'STABLE', 'DECLINING'][Math.floor(Math.random() * 3)] },
      query_data_sources: { results: {}, lineage: [] },
      ingest_document: { docId: `DOC-${Date.now().toString(36)}`, quality: Math.round(Math.random() * 100) },
      search_knowledge_base: { results: [], count: Math.floor(Math.random() * 10) }
    };
    return results[tool.name] || { success: true };
  }

  listRegistries() {
    return Array.from(this.toolRegistries.entries()).map(([id, reg]) => ({
      registryId: id, name: reg.name, toolCount: reg.tools.length
    }));
  }

  getRegistry(registryId) { return this.toolRegistries.get(registryId) || null; }
  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getMCPEnvironment() {
  if (!instance) instance = new MCPEnvironment();
  return instance;
}
export default { MCPEnvironment, getMCPEnvironment };
