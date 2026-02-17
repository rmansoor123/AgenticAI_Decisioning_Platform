import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Helper to call the backend tool execution endpoint
async function callTool(toolName, params) {
  const response = await fetch(`${BACKEND_URL}/api/onboarding/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolName, params })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Tool execution failed: ${error.error || response.statusText}`);
  }

  const data = await response.json();
  return data.result;
}

// Create MCP server
const server = new McpServer({
  name: 'fraud-detection-tools',
  version: '1.0.0',
  description: 'Fraud detection platform agent tools for seller onboarding verification'
});

// ============================================================================
// KYC & IDENTITY VERIFICATION
// ============================================================================

server.registerTool(
  'verify_identity',
  {
    description: 'Verify identity documents (ID, passport, etc.) using OCR and ML verification',
    inputSchema: {
      documentType: z.enum(['PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID', 'OTHER']).describe('Type of identity document'),
      documentNumber: z.string().describe('Document number'),
      country: z.string().describe('ISO country code (e.g. US, GB, DE)')
    }
  },
  async ({ documentType, documentNumber, country }) => {
    const result = await callTool('verify_identity', { documentType, documentNumber, country });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'verify_business',
  {
    description: 'Verify business registration and legitimacy against government databases',
    inputSchema: {
      businessName: z.string().describe('Legal business name'),
      registrationNumber: z.string().describe('Business registration/company number'),
      country: z.string().describe('ISO country code'),
      businessCategory: z.string().optional().describe('Business category (e.g. ELECTRONICS, CLOTHING)')
    }
  },
  async ({ businessName, registrationNumber, country, businessCategory }) => {
    const result = await callTool('verify_business', { businessName, registrationNumber, country, businessCategory });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'verify_address',
  {
    description: 'Verify business and mailing address validity',
    inputSchema: {
      address: z.string().describe('Full address string'),
      country: z.string().describe('ISO country code'),
      addressType: z.enum(['BUSINESS', 'MAILING', 'RESIDENTIAL']).optional().describe('Type of address')
    }
  },
  async ({ address, country, addressType }) => {
    const result = await callTool('verify_address', { address, country, addressType });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================================
// WATCHLIST & COMPLIANCE
// ============================================================================

server.registerTool(
  'screen_watchlist',
  {
    description: 'Screen individual or business against sanctions lists, PEP databases, and global watchlists',
    inputSchema: {
      name: z.string().describe('Individual name to screen'),
      dateOfBirth: z.string().optional().describe('Date of birth (YYYY-MM-DD)'),
      country: z.string().describe('ISO country code'),
      businessName: z.string().optional().describe('Business name to screen')
    }
  },
  async ({ name, dateOfBirth, country, businessName }) => {
    const result = await callTool('screen_watchlist', { name, dateOfBirth, country, businessName });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'check_fraud_databases',
  {
    description: 'Check seller against fraud databases and industry consortium data',
    inputSchema: {
      email: z.string().optional().describe('Seller email address'),
      businessName: z.string().optional().describe('Business name'),
      phone: z.string().optional().describe('Phone number'),
      taxId: z.string().optional().describe('Tax ID / EIN')
    }
  },
  async ({ email, businessName, phone, taxId }) => {
    const result = await callTool('check_fraud_databases', { email, businessName, phone, taxId });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================================
// BANK & FINANCIAL VERIFICATION
// ============================================================================

server.registerTool(
  'verify_bank_account',
  {
    description: 'Verify bank account details and ownership match',
    inputSchema: {
      accountNumber: z.string().describe('Bank account number'),
      routingNumber: z.string().describe('Bank routing number'),
      accountHolderName: z.string().describe('Name on the account'),
      bankName: z.string().optional().describe('Bank name'),
      country: z.string().optional().describe('ISO country code')
    }
  },
  async ({ accountNumber, routingNumber, accountHolderName, bankName, country }) => {
    const result = await callTool('verify_bank_account', { accountNumber, routingNumber, accountHolderName, bankName, country });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'check_financial_history',
  {
    description: 'Check credit score, bankruptcy records, liens, and financial risk',
    inputSchema: {
      businessName: z.string().describe('Business name'),
      taxId: z.string().optional().describe('Tax ID / EIN'),
      country: z.string().optional().describe('ISO country code')
    }
  },
  async ({ businessName, taxId, country }) => {
    const result = await callTool('check_financial_history', { businessName, taxId, country });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================================
// EMAIL & IP VERIFICATION
// ============================================================================

server.registerTool(
  'verify_email',
  {
    description: 'Verify email address validity, deliverability, and risk (disposable, free, etc.)',
    inputSchema: {
      email: z.string().email().describe('Email address to verify')
    }
  },
  async ({ email }) => {
    const result = await callTool('verify_email', { email });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'check_ip_reputation',
  {
    description: 'Check IP address reputation for proxy, VPN, tor, and abuse history',
    inputSchema: {
      ipAddress: z.string().describe('IP address to check')
    }
  },
  async ({ ipAddress }) => {
    const result = await callTool('check_ip_reputation', { ipAddress });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================================
// BUSINESS ANALYSIS
// ============================================================================

server.registerTool(
  'analyze_business_category',
  {
    description: 'Assess risk level of a business category (e.g. GAMBLING=HIGH, ELECTRONICS=MEDIUM)',
    inputSchema: {
      businessCategory: z.string().describe('Business category (e.g. ELECTRONICS, GAMBLING, CLOTHING)'),
      country: z.string().optional().describe('ISO country code')
    }
  },
  async ({ businessCategory, country }) => {
    const result = await callTool('analyze_business_category', { businessCategory, country });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'check_duplicates',
  {
    description: 'Check for duplicate or related seller accounts by email, phone, business name, or tax ID',
    inputSchema: {
      email: z.string().optional().describe('Email to check'),
      phone: z.string().optional().describe('Phone number to check'),
      businessName: z.string().optional().describe('Business name to check'),
      taxId: z.string().optional().describe('Tax ID to check')
    }
  },
  async ({ email, phone, businessName, taxId }) => {
    const result = await callTool('check_duplicates', { email, phone, businessName, taxId });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'analyze_historical_patterns',
  {
    description: 'Analyze historical fraud rates and risk patterns for similar sellers in the same category/country',
    inputSchema: {
      businessCategory: z.string().describe('Business category'),
      country: z.string().describe('ISO country code'),
      businessAge: z.number().optional().describe('Business age in days')
    }
  },
  async ({ businessCategory, country, businessAge }) => {
    const result = await callTool('analyze_historical_patterns', { businessCategory, country, businessAge });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ============================================================================
// INTER-AGENT & AI TOOLS
// ============================================================================

server.registerTool(
  'request_fraud_investigation',
  {
    description: 'Request a deep fraud investigation from the Fraud Investigation Agent for a specific seller',
    inputSchema: {
      sellerId: z.string().describe('Seller ID to investigate'),
      riskFactors: z.array(z.string()).optional().describe('Known risk factors to investigate')
    }
  },
  async ({ sellerId, riskFactors }) => {
    const result = await callTool('request_fraud_investigation', { sellerId, riskFactors });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'search_knowledge_base',
  {
    description: 'Search the knowledge base for similar past fraud cases, patterns, and investigations',
    inputSchema: {
      query: z.string().describe('Search query'),
      namespace: z.string().optional().describe('Knowledge base namespace to search'),
      sellerId: z.string().optional().describe('Filter by seller ID')
    }
  },
  async ({ query, namespace, sellerId }) => {
    const result = await callTool('search_knowledge_base', { query, namespace, sellerId });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'query_risk_profile',
  {
    description: 'Get the current unified risk profile for a seller across all checkpoints',
    inputSchema: {
      sellerId: z.string().describe('Seller ID to query')
    }
  },
  async ({ sellerId }) => {
    const result = await callTool('query_risk_profile', { sellerId });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'retrieve_memory',
  {
    description: 'Retrieve relevant patterns from the agent long-term memory store',
    inputSchema: {
      context: z.string().describe('Context description to match against stored patterns')
    }
  },
  async ({ context }) => {
    const result = await callTool('retrieve_memory', { context });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  'vector_search',
  {
    description: 'Search the vector knowledge base (Pinecone) for semantically similar fraud cases, patterns, or investigation records',
    inputSchema: {
      query: z.string().describe('Search query text'),
      namespace: z.enum(['fraud-cases', 'onboarding-knowledge', 'risk-patterns', 'investigations']).describe('Which namespace to search'),
      topK: z.number().optional().describe('Number of results (default 5)')
    }
  },
  async ({ query, namespace, topK }) => {
    const evalServiceUrl = process.env.EVAL_SERVICE_URL || 'http://localhost:8000';
    const response = await fetch(`${evalServiceUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, namespace, top_k: topK || 5 })
    });
    const data = await response.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Fraud Detection MCP Server running on stdio');
  console.error(`Backend URL: ${BACKEND_URL}`);
  console.error(`Tools registered: 17`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
