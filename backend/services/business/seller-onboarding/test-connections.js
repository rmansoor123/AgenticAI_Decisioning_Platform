/**
 * Test Data Generator for Network Analysis
 * Creates sellers with intentional connections for testing account linking
 */

import { db_ops } from '../../../shared/common/database.js';
import { sellerOnboarding } from '../../../agents/index.js';

// Test seller groups with connections
const TEST_SELLER_GROUPS = [
  {
    groupName: 'Duplicate Email Group',
    sellers: [
      {
        businessName: 'Tech Solutions Inc',
        email: 'shared@example.com', // Same email
        phone: '+1-555-1001',
        country: 'US',
        businessCategory: 'Electronics',
        address: '123 Main St, New York, NY 10001',
        ipAddress: '192.168.1.100',
        accountNumber: '1234567890',
        taxId: 'TAX-001'
      },
      {
        businessName: 'Digital Services LLC',
        email: 'shared@example.com', // Same email
        phone: '+1-555-1002',
        country: 'US',
        businessCategory: 'Services',
        address: '456 Oak Ave, Los Angeles, CA 90001',
        ipAddress: '192.168.1.101',
        accountNumber: '2345678901',
        taxId: 'TAX-002'
      },
      {
        businessName: 'Online Retail Co',
        email: 'shared@example.com', // Same email
        phone: '+1-555-1003',
        country: 'US',
        businessCategory: 'Fashion',
        address: '789 Pine Rd, Chicago, IL 60601',
        ipAddress: '192.168.1.102',
        accountNumber: '3456789012',
        taxId: 'TAX-003'
      }
    ]
  },
  {
    groupName: 'Same Phone Group',
    sellers: [
      {
        businessName: 'Global Trading Ltd',
        email: 'global1@example.com',
        phone: '+1-555-2000', // Same phone
        country: 'UK',
        businessCategory: 'Electronics',
        address: '10 Downing Street, London, UK',
        ipAddress: '10.0.0.50',
        accountNumber: '9876543210',
        taxId: 'TAX-101'
      },
      {
        businessName: 'International Commerce',
        email: 'global2@example.com',
        phone: '+1-555-2000', // Same phone
        country: 'UK',
        businessCategory: 'Automotive',
        address: '20 Baker Street, London, UK',
        ipAddress: '10.0.0.51',
        accountNumber: '8765432109',
        taxId: 'TAX-102'
      }
    ]
  },
  {
    groupName: 'Similar Address Group',
    sellers: [
      {
        businessName: 'ABC Corporation',
        email: 'abc1@example.com',
        phone: '+1-555-3001',
        country: 'CA',
        businessCategory: 'Home & Garden',
        address: '100 Commerce Blvd, Toronto, ON M5H 2N2', // Similar
        ipAddress: '172.16.0.10',
        accountNumber: '1111222233',
        taxId: 'TAX-201'
      },
      {
        businessName: 'ABC Enterprises',
        email: 'abc2@example.com',
        phone: '+1-555-3002',
        country: 'CA',
        businessCategory: 'Sports',
        address: '100 Commerce Boulevard, Toronto, ON M5H 2N2', // Similar (different format)
        ipAddress: '172.16.0.11',
        accountNumber: '2222333344',
        taxId: 'TAX-202'
      }
    ]
  },
  {
    groupName: 'Same IP Group',
    sellers: [
      {
        businessName: 'Network Seller 1',
        email: 'network1@example.com',
        phone: '+1-555-4001',
        country: 'DE',
        businessCategory: 'Electronics',
        address: 'Berliner Str 1, Berlin, Germany',
        ipAddress: '185.220.101.1', // Same IP
        accountNumber: '5555666677',
        taxId: 'TAX-301'
      },
      {
        businessName: 'Network Seller 2',
        email: 'network2@example.com',
        phone: '+1-555-4002',
        country: 'DE',
        businessCategory: 'Fashion',
        address: 'Münchener Str 2, Munich, Germany',
        ipAddress: '185.220.101.1', // Same IP
        accountNumber: '6666777788',
        taxId: 'TAX-302'
      },
      {
        businessName: 'Network Seller 3',
        email: 'network3@example.com',
        phone: '+1-555-4003',
        country: 'DE',
        businessCategory: 'Health & Beauty',
        address: 'Hamburger Str 3, Hamburg, Germany',
        ipAddress: '185.220.101.1', // Same IP
        accountNumber: '7777888899',
        taxId: 'TAX-303'
      }
    ]
  },
  {
    groupName: 'Bank Account Match',
    sellers: [
      {
        businessName: 'Finance Corp A',
        email: 'finance1@example.com',
        phone: '+1-555-5001',
        country: 'US',
        businessCategory: 'Jewelry',
        address: '500 Wall St, New York, NY',
        ipAddress: '192.168.5.10',
        accountNumber: '9999888877', // Last 4: 8877
        routingNumber: '021000021',
        accountHolderName: 'John Smith',
        taxId: 'TAX-401'
      },
      {
        businessName: 'Finance Corp B',
        email: 'finance2@example.com',
        phone: '+1-555-5002',
        country: 'US',
        businessCategory: 'Gift Cards',
        address: '600 Market St, San Francisco, CA',
        ipAddress: '192.168.5.11',
        accountNumber: '1111222233', // Last 4: 2233 (different, but let's make one match)
        routingNumber: '021000021',
        accountHolderName: 'Jane Doe',
        taxId: 'TAX-402'
      },
      {
        businessName: 'Finance Corp C',
        email: 'finance3@example.com',
        phone: '+1-555-5003',
        country: 'US',
        businessCategory: 'Electronics',
        address: '700 State St, Boston, MA',
        ipAddress: '192.168.5.12',
        accountNumber: '9999888877', // Same last 4: 8877
        routingNumber: '021000021',
        accountHolderName: 'Bob Johnson',
        taxId: 'TAX-403'
      }
    ]
  },
  {
    groupName: 'Multi-Connection Group',
    sellers: [
      {
        businessName: 'Connected Seller Alpha',
        email: 'connected@test.com',
        phone: '+1-555-9999',
        country: 'US',
        businessCategory: 'Electronics',
        address: '999 Tech Park, Austin, TX',
        ipAddress: '203.0.113.1',
        accountNumber: '8888777766',
        taxId: 'TAX-999',
        businessRegistrationNumber: 'REG-ALPHA'
      },
      {
        businessName: 'Connected Seller Beta',
        email: 'connected@test.com', // Same email
        phone: '+1-555-9999', // Same phone
        country: 'US',
        businessCategory: 'Fashion',
        address: '999 Tech Park Drive, Austin, TX 78701', // Similar address
        ipAddress: '203.0.113.1', // Same IP
        accountNumber: '8888777766', // Same bank account
        taxId: 'TAX-999', // Same tax ID
        businessRegistrationNumber: 'REG-BETA'
      }
    ]
  }
];

/**
 * Create test sellers with connections
 */
export async function createTestSellersWithConnections() {
  const createdSellers = [];
  
  for (const group of TEST_SELLER_GROUPS) {
    console.log(`Creating test group: ${group.groupName}`);
    
    for (const sellerData of group.sellers) {
      const sellerId = `SLR-TEST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      const fullSellerData = {
        sellerId,
        ...sellerData,
        kycVerified: true,
        bankVerified: true,
        status: 'ACTIVE',
        riskTier: 'LOW',
        riskScore: 25,
        createdAt: new Date().toISOString()
      };

      // Evaluate with agent
      try {
        const agentResult = await sellerOnboarding.evaluateSeller(sellerId, fullSellerData);
        const decision = agentResult.result?.decision || { action: 'APPROVE', confidence: 0.85 };
        
        fullSellerData.onboardingRiskAssessment = {
          riskScore: agentResult.result?.overallRisk?.score || 25,
          signals: agentResult.result?.riskFactors || [],
          decision: decision.action,
          confidence: decision.confidence,
          agentEvaluation: {
            agentId: sellerOnboarding.agentId,
            agentName: sellerOnboarding.name,
            evidenceGathered: agentResult.result?.evidence?.length || 0,
            riskFactors: agentResult.result?.riskFactors?.length || 0
          }
        };

        fullSellerData.status = decision.action === 'REJECT' ? 'BLOCKED' :
                                decision.action === 'REVIEW' ? 'UNDER_REVIEW' : 'ACTIVE';
      } catch (error) {
        console.error(`Error evaluating seller ${sellerId}:`, error);
      }

      // Store seller
      db_ops.insert('sellers', 'seller_id', sellerId, fullSellerData);
      createdSellers.push(fullSellerData);
      
      // Small delay to ensure unique IDs
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  return createdSellers;
}

export default { createTestSellersWithConnections, TEST_SELLER_GROUPS };

