/**
 * Network Intelligence Agent
 *
 * Detects fraud rings and coordinated abuse through shill ring detection,
 * mule network analysis, seller collusion, entity resolution, and dormant
 * account reactivation patterns.
 *
 * Decisions: CLEAR / FLAG / BLOCK
 * Safe default on error: FLAG
 * Domain weight: 0.08 (network)
 */

import { BaseAgent } from '../core/base-agent.js';
import { db_ops } from '../../shared/common/database.js';
import { CONFIDENCE } from '../core/chain-of-thought.js';
import { getKnowledgeBase } from '../core/knowledge-base.js';
import { createSelfCorrection } from '../core/self-correction.js';
import { getThresholdManager } from '../core/threshold-manager.js';

export class NetworkIntelligenceAgent extends BaseAgent {
  constructor() {
    super({
      agentId: 'NETWORK_INTELLIGENCE',
      name: 'Network Intelligence Agent',
      role: 'NETWORK_INTELLIGENCE',
      capabilities: [
        'ring_detection',
        'mule_network_analysis',
        'collusion_detection',
        'entity_resolution',
        'dormant_monitoring'
      ]
    });

    this.riskThresholds = {
      CLEAR: { max: 30 },
      FLAG: { min: 31, max: 65 },
      BLOCK: { min: 66 }
    };

    this.registerTools();
    this.knowledgeBase = getKnowledgeBase();
    this.selfCorrection = createSelfCorrection(this.agentId);
    this._thresholdManager = getThresholdManager();
  }

  get autonomyThresholds() {
    return this._thresholdManager.getThresholds(this.agentId);
  }

  registerTools() {
    // Tool 1: Detect shill ring — circular bidding patterns via shared IPs/devices
    this.registerTool('detect_shill_ring', 'Detect coordinated bidding rings via shared IPs, devices, or circular transaction patterns', async (params) => {
      const { sellerId } = params;

      const allTxns = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data);

      const sellerTxns = allTxns.filter(t => t.sellerId === sellerId);
      const buyers = [...new Set(sellerTxns.map(t => t.buyerId).filter(Boolean))];

      // Build IP-to-buyer and device-to-buyer maps
      const ipMap = {};
      const deviceMap = {};
      allTxns.forEach(t => {
        if (!t.buyerId) return;
        if (t.ipAddress) {
          if (!ipMap[t.ipAddress]) ipMap[t.ipAddress] = new Set();
          ipMap[t.ipAddress].add(t.buyerId);
        }
        if (t.deviceFingerprint) {
          if (!deviceMap[t.deviceFingerprint]) deviceMap[t.deviceFingerprint] = new Set();
          deviceMap[t.deviceFingerprint].add(t.buyerId);
        }
      });

      // Find IPs/devices shared by multiple buyers of this seller
      const sharedIPBuyers = Object.entries(ipMap)
        .filter(([ip, buyerSet]) => {
          const relevantBuyers = [...buyerSet].filter(b => buyers.includes(b));
          return relevantBuyers.length >= 2;
        })
        .map(([ip, buyerSet]) => ({ ip, buyers: [...buyerSet].filter(b => buyers.includes(b)) }));

      const sharedDeviceBuyers = Object.entries(deviceMap)
        .filter(([device, buyerSet]) => {
          const relevantBuyers = [...buyerSet].filter(b => buyers.includes(b));
          return relevantBuyers.length >= 2;
        })
        .map(([device, buyerSet]) => ({ device, buyers: [...buyerSet].filter(b => buyers.includes(b)) }));

      // Check for circular bidding: buyers who also sell to the seller's buyers
      const circularBidders = buyers.filter(buyerId => {
        const buyerAsSeller = allTxns.filter(t => t.sellerId === buyerId);
        return buyerAsSeller.some(t => buyers.includes(t.buyerId));
      });

      const ringDetected = sharedIPBuyers.length >= 2 || sharedDeviceBuyers.length >= 1 || circularBidders.length >= 2;
      const largeRing = (sharedIPBuyers.length + sharedDeviceBuyers.length) >= 5 || circularBidders.length >= 4;

      let riskScore = 0;
      if (ringDetected) riskScore += 35;
      if (largeRing) riskScore += 25;
      if (sharedDeviceBuyers.length > 0) riskScore += 20;
      if (circularBidders.length >= 3) riskScore += 20;

      return {
        success: true,
        data: {
          sellerId,
          totalBuyers: buyers.length,
          sharedIPClusters: sharedIPBuyers.length,
          sharedDeviceClusters: sharedDeviceBuyers.length,
          circularBidders: circularBidders.length,
          ringDetected,
          largeRing,
          ringSize: new Set([...sharedIPBuyers.flatMap(c => c.buyers), ...circularBidders]).size,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 2: Detect mule network — shared infrastructure across sellers
    this.registerTool('detect_mule_network', 'Detect mule networks via shared bank accounts, addresses, or devices across sellers', async (params) => {
      const { sellerId } = params;

      const seller = db_ops.getById('sellers', 'seller_id', sellerId);
      const sellerData = seller?.data || {};

      const allSellers = (db_ops.getAll('sellers', 5000, 0) || []).map(r => r.data);
      const otherSellers = allSellers.filter(s => s.seller_id !== sellerId);

      // Shared bank account
      const sharedBank = otherSellers.filter(s =>
        sellerData.bankAccount && s.bankAccount && sellerData.bankAccount === s.bankAccount
      );

      // Shared address (normalize and compare)
      const normalizeAddr = (addr) => (addr || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const sellerAddr = normalizeAddr(sellerData.address || sellerData.businessAddress);
      const sharedAddress = sellerAddr ? otherSellers.filter(s =>
        normalizeAddr(s.address || s.businessAddress) === sellerAddr && sellerAddr.length > 5
      ) : [];

      // Shared device fingerprint (from ATO events or transactions)
      const allAtoEvents = (db_ops.getAll('ato_events', 10000, 0) || []).map(r => r.data);
      const sellerDevices = new Set(
        allAtoEvents.filter(e => e.sellerId === sellerId).map(e => e.deviceInfo?.fingerprint).filter(Boolean)
      );
      const sharedDeviceSellers = otherSellers.filter(s => {
        const otherDevices = allAtoEvents.filter(e => e.sellerId === s.seller_id).map(e => e.deviceInfo?.fingerprint).filter(Boolean);
        return otherDevices.some(d => sellerDevices.has(d));
      });

      const muleNetworkDetected = sharedBank.length > 0 || sharedAddress.length > 0 || sharedDeviceSellers.length > 0;
      const networkSize = new Set([
        ...sharedBank.map(s => s.seller_id),
        ...sharedAddress.map(s => s.seller_id),
        ...sharedDeviceSellers.map(s => s.seller_id)
      ]).size;
      const largeMuleNetwork = networkSize >= 3;

      let riskScore = 0;
      if (sharedBank.length > 0) riskScore += 40;
      if (sharedAddress.length > 0) riskScore += 25;
      if (sharedDeviceSellers.length > 0) riskScore += 30;
      if (largeMuleNetwork) riskScore += 20;

      return {
        success: true,
        data: {
          sellerId,
          sharedBankAccounts: sharedBank.length,
          sharedAddresses: sharedAddress.length,
          sharedDevices: sharedDeviceSellers.length,
          muleNetworkDetected,
          networkSize,
          largeMuleNetwork,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 3: Detect seller collusion — shared warehouse or fulfillment
    this.registerTool('detect_seller_collusion', 'Detect seller collusion via shared shipping origins, warehouses, or fulfillment patterns', async (params) => {
      const { sellerId } = params;

      const allShipments = (db_ops.getAll('shipments', 10000, 0) || []).map(r => r.data);
      const sellerShipments = allShipments.filter(s => s.sellerId === sellerId);

      // Extract unique origin addresses/zip codes
      const sellerOrigins = new Set(sellerShipments.map(s => s.originZip || s.originAddress || s.warehouseId).filter(Boolean));

      // Find other sellers shipping from same origins
      const colludingSellers = new Set();
      const allSellers = (db_ops.getAll('sellers', 5000, 0) || []).map(r => r.data);

      allSellers.forEach(s => {
        if (s.seller_id === sellerId) return;
        const otherShipments = allShipments.filter(sh => sh.sellerId === s.seller_id);
        const otherOrigins = otherShipments.map(sh => sh.originZip || sh.originAddress || sh.warehouseId).filter(Boolean);
        if (otherOrigins.some(o => sellerOrigins.has(o))) {
          colludingSellers.add(s.seller_id);
        }
      });

      // Check for identical product listings across colluding sellers
      const allListings = (db_ops.getAll('listings', 10000, 0) || []).map(r => r.data);
      const sellerListings = allListings.filter(l => l.sellerId === sellerId);
      const sellerTitles = new Set(sellerListings.map(l => (l.title || '').toLowerCase().trim()).filter(Boolean));

      let duplicateListings = 0;
      colludingSellers.forEach(csId => {
        const otherListings = allListings.filter(l => l.sellerId === csId);
        otherListings.forEach(l => {
          if (sellerTitles.has((l.title || '').toLowerCase().trim())) duplicateListings++;
        });
      });

      const collusionDetected = colludingSellers.size >= 2;
      const strongCollusion = colludingSellers.size >= 2 && duplicateListings >= 3;

      let riskScore = 0;
      if (collusionDetected) riskScore += 30;
      if (strongCollusion) riskScore += 25;
      if (duplicateListings >= 5) riskScore += 20;
      if (colludingSellers.size >= 4) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          shippingOrigins: sellerOrigins.size,
          colludingSellers: colludingSellers.size,
          duplicateListings,
          collusionDetected,
          strongCollusion,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 4: Resolve entity links — cross-account linking via email/phone/IP/device
    this.registerTool('resolve_entity_links', 'Cross-reference accounts to identify multi-account operations via shared identifiers', async (params) => {
      const { sellerId } = params;

      const seller = db_ops.getById('sellers', 'seller_id', sellerId);
      const sellerData = seller?.data || {};
      const allSellers = (db_ops.getAll('sellers', 5000, 0) || []).map(r => r.data);
      const otherSellers = allSellers.filter(s => s.seller_id !== sellerId);

      const links = {
        email: [],
        phone: [],
        ip: [],
        device: [],
        taxId: []
      };

      // Email domain match (excluding common providers)
      const commonDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com'];
      const emailDomain = sellerData.email ? sellerData.email.split('@')[1] : null;
      if (emailDomain && !commonDomains.includes(emailDomain)) {
        links.email = otherSellers.filter(s => s.email && s.email.split('@')[1] === emailDomain).map(s => s.seller_id);
      }

      // Exact email prefix match (e.g., john123@gmail.com and john123@yahoo.com)
      const emailPrefix = sellerData.email ? sellerData.email.split('@')[0] : null;
      if (emailPrefix && emailPrefix.length > 4) {
        const prefixMatches = otherSellers.filter(s => s.email && s.email.split('@')[0] === emailPrefix && !links.email.includes(s.seller_id));
        links.email.push(...prefixMatches.map(s => s.seller_id));
      }

      // Phone match
      if (sellerData.phone) {
        links.phone = otherSellers.filter(s => s.phone && s.phone === sellerData.phone).map(s => s.seller_id);
      }

      // Tax ID match
      if (sellerData.taxId) {
        links.taxId = otherSellers.filter(s => s.taxId && s.taxId === sellerData.taxId).map(s => s.seller_id);
      }

      // IP match from ATO events
      const allAtoEvents = (db_ops.getAll('ato_events', 10000, 0) || []).map(r => r.data);
      const sellerIPs = new Set(allAtoEvents.filter(e => e.sellerId === sellerId).map(e => e.location?.ip).filter(Boolean));
      if (sellerIPs.size > 0) {
        const ipLinked = new Set();
        allAtoEvents.forEach(e => {
          if (e.sellerId !== sellerId && e.location?.ip && sellerIPs.has(e.location.ip)) {
            ipLinked.add(e.sellerId);
          }
        });
        links.ip = [...ipLinked];
      }

      // Device match from ATO events
      const sellerDevices = new Set(allAtoEvents.filter(e => e.sellerId === sellerId).map(e => e.deviceInfo?.fingerprint).filter(Boolean));
      if (sellerDevices.size > 0) {
        const deviceLinked = new Set();
        allAtoEvents.forEach(e => {
          if (e.sellerId !== sellerId && e.deviceInfo?.fingerprint && sellerDevices.has(e.deviceInfo.fingerprint)) {
            deviceLinked.add(e.sellerId);
          }
        });
        links.device = [...deviceLinked];
      }

      const allLinkedEntities = new Set([...links.email, ...links.phone, ...links.ip, ...links.device, ...links.taxId]);
      const multiAccountDetected = allLinkedEntities.size >= 2;
      const strongLink = links.taxId.length > 0 || links.device.length >= 2;

      let riskScore = 0;
      if (links.taxId.length > 0) riskScore += 35;
      if (links.device.length > 0) riskScore += 30;
      if (links.phone.length > 0) riskScore += 20;
      if (links.email.length > 0) riskScore += 15;
      if (links.ip.length > 0) riskScore += 10;
      if (multiAccountDetected) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          links,
          totalLinkedEntities: allLinkedEntities.size,
          multiAccountDetected,
          strongLink,
          linkTypes: Object.entries(links).filter(([, v]) => v.length > 0).map(([k]) => k),
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Tool 5: Detect dormant reactivation — dormant accounts reactivating in coordinated pattern
    this.registerTool('detect_dormant_reactivation', 'Detect dormant accounts reactivating in a coordinated burst pattern', async (params) => {
      const { sellerId } = params;

      const seller = db_ops.getById('sellers', 'seller_id', sellerId);
      const sellerData = seller?.data || {};

      // Calculate dormancy: time between account creation and latest activity
      const allTxns = (db_ops.getAll('transactions', 10000, 0) || [])
        .map(r => r.data)
        .filter(r => r.sellerId === sellerId);

      const accountCreated = sellerData.createdAt ? new Date(sellerData.createdAt) : null;
      const sortedTxns = allTxns.sort((a, b) => new Date(a.createdAt || a.timestamp) - new Date(b.createdAt || b.timestamp));

      let dormantPeriodDays = 0;
      let wasDormant = false;

      if (accountCreated && sortedTxns.length > 0) {
        const firstTxn = new Date(sortedTxns[0].createdAt || sortedTxns[0].timestamp);
        dormantPeriodDays = Math.round((firstTxn - accountCreated) / (1000 * 60 * 60 * 24));
        wasDormant = dormantPeriodDays > 90;
      }

      // Check for recent burst of activity after dormancy
      const recentTxns = allTxns.filter(t =>
        (Date.now() - new Date(t.createdAt || t.timestamp)) < 7 * 24 * 60 * 60 * 1000
      );
      const recentBurst = wasDormant && recentTxns.length >= 10;

      // Check for coordinated reactivation — other dormant sellers reactivating around the same time
      const allSellers = (db_ops.getAll('sellers', 5000, 0) || []).map(r => r.data);
      let coordinatedReactivation = 0;

      allSellers.forEach(s => {
        if (s.seller_id === sellerId) return;
        const sCreated = s.createdAt ? new Date(s.createdAt) : null;
        if (!sCreated) return;
        const sTxns = (db_ops.getAll('transactions', 10000, 0) || [])
          .map(r => r.data)
          .filter(r => r.sellerId === s.seller_id);
        const sSorted = sTxns.sort((a, b) => new Date(a.createdAt || a.timestamp) - new Date(b.createdAt || b.timestamp));
        if (sSorted.length === 0) return;
        const sFirstTxn = new Date(sSorted[0].createdAt || sSorted[0].timestamp);
        const sDormancy = (sFirstTxn - sCreated) / (1000 * 60 * 60 * 24);
        if (sDormancy > 90) {
          // Check if reactivation happened within same 7-day window
          const sRecent = sTxns.filter(t =>
            (Date.now() - new Date(t.createdAt || t.timestamp)) < 7 * 24 * 60 * 60 * 1000
          );
          if (sRecent.length >= 5) coordinatedReactivation++;
        }
      });

      const coordinatedPattern = coordinatedReactivation >= 2;
      const dormantReactivation = wasDormant && recentBurst;

      let riskScore = 0;
      if (dormantReactivation) riskScore += 30;
      if (coordinatedPattern) riskScore += 35;
      if (recentBurst && recentTxns.length >= 20) riskScore += 20;
      if (dormantPeriodDays > 180) riskScore += 15;

      return {
        success: true,
        data: {
          sellerId,
          accountAge: accountCreated ? Math.round((Date.now() - accountCreated) / (1000 * 60 * 60 * 24)) : null,
          dormantPeriodDays,
          wasDormant,
          recentActivityCount: recentTxns.length,
          recentBurst,
          coordinatedReactivation,
          coordinatedPattern,
          dormantReactivation,
          riskScore: Math.min(riskScore, 90),
          riskLevel: riskScore >= 50 ? 'CRITICAL' : riskScore >= 30 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW'
        }
      };
    });

    // Agentic tools
    this.registerTool('search_knowledge_base', 'Search knowledge base for similar network fraud cases', async (params) => {
      const { query, sellerId } = params;
      const results = this.knowledgeBase.searchKnowledge(null, query, sellerId ? { sellerId } : {}, 5);
      return { success: true, data: { results, count: results.length } };
    });

    this.registerTool('retrieve_memory', 'Retrieve relevant network fraud patterns from long-term memory', async (params) => {
      const { context } = params;
      const memories = this.memoryStore.queryLongTerm(this.agentId, context, 5);
      return { success: true, data: { memories, count: memories.length } };
    });
  }

  async think(input, context) {
    const { sellerId, scanType } = input;
    this.addObservation(`Starting network intelligence scan for seller: ${sellerId}, scan: ${scanType || 'full'}`);

    const llmThink = await super.think(input, context);
    if (llmThink.llmEnhanced) {
      return { ...llmThink, riskIndicators: this.identifyInitialRiskIndicators(input) };
    }

    const riskIndicators = this.identifyInitialRiskIndicators(input);
    this.addHypothesis(
      `Network intelligence assessment needed — ${riskIndicators.length} initial indicators`,
      CONFIDENCE.POSSIBLE
    );

    return {
      understanding: `Evaluating network intelligence for seller: ${sellerId}`,
      riskIndicators,
      relevantMemory: this.retrieveRelevantMemory(input),
      availableTools: Array.from(this.tools.keys())
    };
  }

  async plan(analysis, context) {
    const llmPlan = await super.plan(analysis, context);
    if (llmPlan.llmEnhanced && llmPlan.actions.length > 0) return llmPlan;

    const input = context.input || {};
    const actions = [
      { type: 'detect_shill_ring', params: { sellerId: input.sellerId } },
      { type: 'detect_mule_network', params: { sellerId: input.sellerId } },
      { type: 'detect_seller_collusion', params: { sellerId: input.sellerId } },
      { type: 'resolve_entity_links', params: { sellerId: input.sellerId } },
      { type: 'detect_dormant_reactivation', params: { sellerId: input.sellerId } },
      { type: 'search_knowledge_base', params: { query: `network fraud ring ${input.sellerId || ''}`, sellerId: input.sellerId } },
      { type: 'retrieve_memory', params: { context: `network intelligence ${input.scanType || ''}` } }
    ];

    return {
      goal: 'Complete network intelligence evaluation',
      actions,
      fallback: { type: 'default_flag', reason: 'incomplete_network_evaluation' }
    };
  }

  async observe(actions, context) {
    const safeActions = Array.isArray(actions) ? actions : [];
    const evidence = safeActions.map(a => ({
      source: a.action.type,
      data: a.result?.data,
      success: a.result?.success !== false,
      timestamp: new Date().toISOString()
    }));

    const riskFactors = this.analyzeEvidence(evidence);
    const overallRisk = this.calculateRisk(riskFactors);
    const decision = await this.generateDecision(overallRisk, riskFactors);

    for (const factor of riskFactors) {
      this.addEvidence(`Risk factor: ${factor.factor} (${factor.severity})`);
    }

    const isAutonomous = overallRisk.score < this.autonomyThresholds.ESCALATE_MIN_RISK;
    const needsHumanReview = !isAutonomous || decision.action === 'FLAG';

    if (context.input?.sellerId) {
      this.selfCorrection.logPrediction(
        `NET-${Date.now().toString(36).toUpperCase()}`,
        context.input.sellerId,
        decision.action,
        decision.confidence,
        this.generateReasoning(riskFactors, decision)
      );
    }

    this.knowledgeBase.addKnowledge('network', [{
      _id: `NET-${Date.now()}`,
      text: `Network evaluation for seller ${context.input?.sellerId || 'unknown'}. Decision: ${decision.action}. Risk: ${overallRisk.score}. Factors: ${riskFactors.map(f => f.factor).join(', ')}`,
      category: 'network', sellerId: context.input?.sellerId, domain: 'network',
      outcome: decision.action === 'CLEAR' ? 'legitimate' : decision.action === 'BLOCK' ? 'fraud' : 'pending',
      riskScore: overallRisk.score, source: this.agentId
    }]);

    return {
      success: true,
      evaluationId: `NET-${Date.now().toString(36).toUpperCase()}`,
      summary: `Network evaluation complete. ${riskFactors.length} risk factors. ${isAutonomous ? 'Autonomous.' : 'Needs review.'}`,
      evidence, riskFactors, overallRisk, decision,
      confidence: decision.confidence, isAutonomous, needsHumanReview,
      escalationReason: needsHumanReview ? `Risk score ${overallRisk.score} requires review` : null,
      selfCorrectionStats: this.selfCorrection.getAccuracy(),
      reasoning: this.generateReasoning(riskFactors, decision)
    };
  }

  identifyInitialRiskIndicators(input) {
    const indicators = [];
    if (input.linkedAccounts && input.linkedAccounts > 0) indicators.push('KNOWN_LINKED_ACCOUNTS');
    if (input.previousRingMember) indicators.push('PRIOR_RING_ASSOCIATION');
    if (input.dormantAccount) indicators.push('DORMANT_ACCOUNT');
    if (input.sharedInfrastructure) indicators.push('SHARED_INFRASTRUCTURE_FLAG');
    if (input.highVelocityOnboarding) indicators.push('RAPID_ONBOARDING');
    return indicators;
  }

  analyzeEvidence(evidence) {
    const factors = [];

    evidence.forEach(e => {
      if (!e.success || !e.data) return;

      if (e.source === 'detect_shill_ring') {
        if (e.data.largeRing) factors.push({ factor: 'LARGE_SHILL_RING', severity: 'CRITICAL', score: 45 });
        else if (e.data.ringDetected) factors.push({ factor: 'SHILL_RING_DETECTED', severity: 'HIGH', score: 35 });
        if (e.data.sharedDeviceClusters > 0) factors.push({ factor: 'SHARED_DEVICE_CLUSTER', severity: 'HIGH', score: 20 });
      }

      if (e.source === 'detect_mule_network') {
        if (e.data.largeMuleNetwork) factors.push({ factor: 'LARGE_MULE_NETWORK', severity: 'CRITICAL', score: 45 });
        else if (e.data.muleNetworkDetected) factors.push({ factor: 'MULE_NETWORK_DETECTED', severity: 'HIGH', score: 35 });
        if (e.data.sharedBankAccounts > 0) factors.push({ factor: 'SHARED_BANK_ACCOUNT', severity: 'CRITICAL', score: 30 });
      }

      if (e.source === 'detect_seller_collusion') {
        if (e.data.strongCollusion) factors.push({ factor: 'STRONG_SELLER_COLLUSION', severity: 'CRITICAL', score: 40 });
        else if (e.data.collusionDetected) factors.push({ factor: 'SELLER_COLLUSION', severity: 'HIGH', score: 30 });
        if (e.data.duplicateListings >= 5) factors.push({ factor: 'DUPLICATE_LISTINGS', severity: 'MEDIUM', score: 15 });
      }

      if (e.source === 'resolve_entity_links') {
        if (e.data.strongLink) factors.push({ factor: 'STRONG_ENTITY_LINK', severity: 'CRITICAL', score: 35 });
        if (e.data.multiAccountDetected) factors.push({ factor: 'MULTI_ACCOUNT_OPERATION', severity: 'HIGH', score: 25 });
        if (e.data.totalLinkedEntities >= 5) factors.push({ factor: 'LARGE_ENTITY_CLUSTER', severity: 'HIGH', score: 20 });
      }

      if (e.source === 'detect_dormant_reactivation') {
        if (e.data.coordinatedPattern) factors.push({ factor: 'COORDINATED_REACTIVATION', severity: 'CRITICAL', score: 40 });
        if (e.data.dormantReactivation) factors.push({ factor: 'DORMANT_REACTIVATION', severity: 'HIGH', score: 30 });
        if (e.data.recentBurst) factors.push({ factor: 'POST_DORMANCY_BURST', severity: 'MEDIUM', score: 15 });
      }
    });

    return factors;
  }

  calculateRisk(factors) {
    const totalScore = factors.reduce((sum, f) => sum + (f.score || 0), 0);
    const normalizedScore = Math.max(0, Math.min(100, totalScore));

    return {
      score: normalizedScore,
      level: normalizedScore > 65 ? 'CRITICAL' : normalizedScore > 40 ? 'HIGH' : normalizedScore > 20 ? 'MEDIUM' : 'LOW',
      factorCount: factors.length,
      criticalFactors: factors.filter(f => f.severity === 'CRITICAL').length,
      highFactors: factors.filter(f => f.severity === 'HIGH').length
    };
  }

  async generateDecision(risk, factors) {
    if (this.llmClient?.enabled) {
      try {
        let decisionContent = '';
        try {
          const { getPromptRegistry } = await import('../core/prompt-registry.js');
          const registry = getPromptRegistry();
          const prompt = registry.getPromptById('network-intelligence-decision');
          decisionContent = prompt?.content || '';
        } catch { /* fallback */ }
        const systemPrompt = decisionContent || 'You are the network intelligence authority. Return ONLY valid JSON: {"action":"CLEAR|FLAG|BLOCK", "confidence":0.0-1.0, "reason":"..."}';
        const userPrompt = `Risk score: ${risk.score}/100, Critical: ${risk.criticalFactors}, High: ${risk.highFactors}\nFactors: ${factors.map(f => `${f.factor} (${f.severity}, score:${f.score})`).join(', ')}`;
        const result = await this.llmClient.complete(systemPrompt, userPrompt);
        if (result?.content) {
          const jsonMatch = result.content.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (['CLEAR', 'FLAG', 'BLOCK'].includes(parsed.action)) {
              return { ...parsed, llmEnhanced: true };
            }
          }
        }
      } catch (e) { /* fallback */ }
    }

    const thresholds = this.autonomyThresholds;
    if (risk.score >= (thresholds.AUTO_REJECT_MIN_RISK || 66) || risk.criticalFactors > 0) {
      return { action: 'BLOCK', confidence: 0.90, reason: 'Fraud network indicators detected — blocking seller' };
    } else if (risk.score >= (thresholds.AUTO_APPROVE_MAX_RISK || 31)) {
      return { action: 'FLAG', confidence: 0.75, reason: 'Network anomalies detected — flagging for investigation' };
    }
    return { action: 'CLEAR', confidence: 0.85, reason: 'No network fraud indicators — seller cleared' };
  }

  generateReasoning(factors, decision) {
    const desc = factors.map(f => `- ${f.factor.replace(/_/g, ' ')}: ${f.severity} (score: ${f.score})`).join('\n');
    return `## Network Intelligence Summary\n\n### Risk Factors:\n${desc || '- No significant risk factors'}\n\n### Decision: ${decision.action}\n${decision.reason}\n\n### Confidence: ${(decision.confidence * 100).toFixed(0)}%`.trim();
  }

  async evaluateNetwork(sellerId, scanData, extraContext = {}) {
    this.status = 'EVALUATING';
    this.currentTask = sellerId;
    const input = { sellerId, ...scanData };
    const result = await this.reason(input, { input, ...extraContext });
    this.status = 'IDLE';
    this.currentTask = null;
    return result;
  }
}

let instance = null;
export function getNetworkIntelligenceAgent() {
  if (!instance) instance = new NetworkIntelligenceAgent();
  return instance;
}

export default NetworkIntelligenceAgent;
