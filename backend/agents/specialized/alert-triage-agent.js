/**
 * Alert Triage Agent
 *
 * An autonomous agent that intelligently prioritizes and routes fraud alerts by:
 * - Assessing alert urgency and potential impact
 * - Grouping related alerts
 * - Routing to appropriate teams/analysts
 * - Managing alert queues
 * - Learning from resolution patterns
 */

import { BaseAgent } from '../core/base-agent.js';

export class AlertTriageAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Alert Triage Agent',
      role: 'ALERT_TRIAGE',
      capabilities: [
        'alert_prioritization',
        'alert_grouping',
        'routing_optimization',
        'workload_balancing',
        'sla_monitoring'
      ]
    });

    this.priorityWeights = {
      amount: 0.3,
      riskScore: 0.25,
      customerTier: 0.2,
      alertType: 0.15,
      timeInQueue: 0.1
    };

    this.routingRules = {
      HIGH_VALUE: 'senior_analyst',
      ATO: 'ato_team',
      CHARGEBACK: 'disputes_team',
      NEW_PATTERN: 'ml_team',
      DEFAULT: 'general_queue'
    };

    this.registerTools();
  }

  registerTools() {
    // Tool: Get pending alerts
    this.registerTool('get_pending_alerts', 'Retrieve all pending alerts', async (params) => {
      const alerts = Array.from({ length: 15 }, (_, i) => ({
        alertId: `ALERT-${(1000 + i).toString()}`,
        transactionId: `TXN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        alertType: ['HIGH_VALUE', 'VELOCITY', 'NEW_DEVICE', 'GEO_ANOMALY', 'ATO'][Math.floor(Math.random() * 5)],
        riskScore: Math.floor(Math.random() * 100),
        amount: Math.floor(Math.random() * 20000) + 100,
        customerTier: ['STANDARD', 'PREMIUM', 'VIP'][Math.floor(Math.random() * 3)],
        createdAt: new Date(Date.now() - Math.random() * 3600000).toISOString(),
        status: 'PENDING'
      }));
      return { success: true, data: alerts };
    });

    // Tool: Get analyst availability
    this.registerTool('get_analyst_availability', 'Check analyst workload and availability', async (params) => {
      const analysts = [
        { id: 'analyst_1', name: 'Alice', team: 'senior_analyst', currentLoad: 5, maxLoad: 10, skills: ['high_value', 'ato'] },
        { id: 'analyst_2', name: 'Bob', team: 'general_queue', currentLoad: 8, maxLoad: 10, skills: ['general'] },
        { id: 'analyst_3', name: 'Carol', team: 'ato_team', currentLoad: 3, maxLoad: 8, skills: ['ato', 'account_security'] },
        { id: 'analyst_4', name: 'David', team: 'disputes_team', currentLoad: 6, maxLoad: 10, skills: ['chargebacks', 'disputes'] }
      ];
      return { success: true, data: analysts };
    });

    // Tool: Check related alerts
    this.registerTool('find_related_alerts', 'Find alerts that may be related', async (params) => {
      const { alertId } = params;
      const related = Math.random() > 0.5 ? [
        { alertId: `ALERT-${Math.floor(Math.random() * 1000)}`, relationship: 'same_user', confidence: 0.92 },
        { alertId: `ALERT-${Math.floor(Math.random() * 1000)}`, relationship: 'same_device', confidence: 0.85 }
      ] : [];
      return { success: true, data: related };
    });

    // Tool: Get historical resolution data
    this.registerTool('get_resolution_history', 'Get historical alert resolution patterns', async (params) => {
      const { alertType } = params;
      return {
        success: true,
        data: {
          alertType,
          avgResolutionTime: Math.floor(Math.random() * 30) + 5, // minutes
          confirmationRate: 0.3 + Math.random() * 0.5,
          commonResolutions: ['CONFIRMED_FRAUD', 'FALSE_POSITIVE', 'NEEDS_MORE_INFO'],
          bestPerformingAnalyst: 'analyst_1'
        }
      };
    });

    // Tool: Assign alert
    this.registerTool('assign_alert', 'Assign an alert to an analyst', async (params) => {
      const { alertId, analystId, priority } = params;
      return {
        success: true,
        data: {
          alertId,
          assignedTo: analystId,
          priority,
          assignedAt: new Date().toISOString(),
          expectedSla: priority === 'CRITICAL' ? '15 min' : priority === 'HIGH' ? '30 min' : '2 hours'
        }
      };
    });
  }

  async think(input, context) {
    const { action } = input;

    if (action === 'triage_queue') {
      return {
        understanding: 'Triaging pending alert queue',
        tasks: ['get_pending_alerts', 'get_analyst_availability'],
        strategy: 'prioritize_and_route'
      };
    } else if (action === 'single_alert') {
      return {
        understanding: `Triaging single alert: ${input.alertId}`,
        tasks: ['find_related_alerts', 'get_resolution_history'],
        strategy: 'deep_analysis'
      };
    }

    return {
      understanding: 'General triage operation',
      tasks: ['get_pending_alerts'],
      strategy: 'standard'
    };
  }

  async plan(analysis, context) {
    const actions = analysis.tasks.map(task => ({
      type: task,
      params: context.input
    }));

    return { goal: 'Triage and route alerts', actions };
  }

  async observe(actions, context) {
    const alertsAction = actions.find(a => a.action.type === 'get_pending_alerts');
    const analystsAction = actions.find(a => a.action.type === 'get_analyst_availability');

    if (!alertsAction?.result?.data) {
      return { success: false, error: 'Could not retrieve alerts' };
    }

    const alerts = alertsAction.result.data;
    const analysts = analystsAction?.result?.data || [];

    // Prioritize alerts
    const prioritizedAlerts = this.prioritizeAlerts(alerts);

    // Group related alerts
    const groupedAlerts = this.groupAlerts(prioritizedAlerts);

    // Generate routing assignments
    const assignments = await this.generateAssignments(groupedAlerts, analysts);

    // Calculate queue health
    const queueHealth = this.calculateQueueHealth(alerts, analysts);

    return {
      success: true,
      triageId: `TRIAGE-${Date.now().toString(36).toUpperCase()}`,
      summary: `Triaged ${alerts.length} alerts, created ${assignments.length} assignments`,
      prioritizedAlerts,
      alertGroups: groupedAlerts,
      assignments,
      queueHealth,
      reasoning: this.generateTriageReport(prioritizedAlerts, assignments, queueHealth)
    };
  }

  prioritizeAlerts(alerts) {
    return alerts.map(alert => {
      const priorityScore = this.calculatePriorityScore(alert);
      return {
        ...alert,
        priorityScore,
        priorityLevel: priorityScore > 80 ? 'CRITICAL' : priorityScore > 60 ? 'HIGH' : priorityScore > 40 ? 'MEDIUM' : 'LOW'
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);
  }

  calculatePriorityScore(alert) {
    const w = this.priorityWeights;

    // Normalize values
    const amountScore = Math.min(100, (alert.amount / 10000) * 100);
    const riskScore = alert.riskScore;
    const tierScore = alert.customerTier === 'VIP' ? 100 : alert.customerTier === 'PREMIUM' ? 70 : 40;
    const typeScore = ['ATO', 'HIGH_VALUE'].includes(alert.alertType) ? 90 : 50;
    const timeScore = Math.min(100, ((Date.now() - new Date(alert.createdAt).getTime()) / 3600000) * 50);

    return Math.round(
      amountScore * w.amount +
      riskScore * w.riskScore +
      tierScore * w.customerTier +
      typeScore * w.alertType +
      timeScore * w.timeInQueue
    );
  }

  groupAlerts(alerts) {
    const groups = [];
    const processed = new Set();

    alerts.forEach(alert => {
      if (processed.has(alert.alertId)) return;

      // Find related alerts (same type within time window)
      const related = alerts.filter(a =>
        !processed.has(a.alertId) &&
        a.alertType === alert.alertType &&
        Math.abs(new Date(a.createdAt) - new Date(alert.createdAt)) < 3600000
      );

      if (related.length > 1) {
        groups.push({
          groupId: `GRP-${Date.now().toString(36).slice(-4).toUpperCase()}`,
          alertType: alert.alertType,
          alerts: related.map(a => a.alertId),
          count: related.length,
          totalAmount: related.reduce((sum, a) => sum + a.amount, 0),
          highestPriority: Math.max(...related.map(a => a.priorityScore))
        });
        related.forEach(a => processed.add(a.alertId));
      } else {
        processed.add(alert.alertId);
      }
    });

    return groups;
  }

  async generateAssignments(alerts, analysts) {
    // Try LLM-enhanced routing
    if (this.llmClient?.enabled && alerts.length > 0 && analysts.length > 0) {
      try {
        const systemPrompt = 'You are an alert triage agent. Route alerts to the best analysts. Return ONLY valid JSON array: [{"alertId":"...", "analystId":"...", "analystName":"...", "team":"...", "priority":"...", "reason":"..."}]';
        const userPrompt = `Alerts (top 5): ${JSON.stringify(alerts.slice(0, 5).map(a => ({ alertId: a.alertId || a.groupId, alertType: a.alertType, priorityLevel: a.priorityLevel })))}\nAnalysts: ${JSON.stringify(analysts.map(a => ({ id: a.id, name: a.name, team: a.team, currentLoad: a.currentLoad, maxLoad: a.maxLoad })))}`;

        const result = await this.llmClient.complete(systemPrompt, userPrompt);
        if (result?.content) {
          const jsonMatch = result.content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].alertId) {
              return parsed.map(a => ({ ...a, llmEnhanced: true }));
            }
          }
        }
      } catch (e) {
        // Fall through to hardcoded logic
      }
    }

    const assignments = [];
    const analystLoads = new Map(analysts.map(a => [a.id, a.currentLoad]));

    const sortedAlerts = Array.isArray(alerts[0]?.alerts)
      ? alerts // It's grouped
      : alerts.slice(0, 10); // Take top 10 individual alerts

    sortedAlerts.forEach(item => {
      const alertType = item.alertType;
      const targetTeam = this.routingRules[alertType] || this.routingRules.DEFAULT;

      // Find available analyst in target team
      const availableAnalyst = analysts.find(a =>
        a.team === targetTeam &&
        (analystLoads.get(a.id) || 0) < a.maxLoad
      ) || analysts.find(a => (analystLoads.get(a.id) || 0) < a.maxLoad);

      if (availableAnalyst) {
        assignments.push({
          alertId: item.alertId || item.groupId,
          isGroup: !!item.groupId,
          analystId: availableAnalyst.id,
          analystName: availableAnalyst.name,
          team: availableAnalyst.team,
          priority: item.priorityLevel || 'MEDIUM',
          reason: `Routed to ${targetTeam} based on alert type: ${alertType}`
        });
        analystLoads.set(availableAnalyst.id, (analystLoads.get(availableAnalyst.id) || 0) + 1);
      }
    });

    return assignments;
  }

  calculateQueueHealth(alerts, analysts) {
    const totalCapacity = analysts.reduce((sum, a) => sum + (a.maxLoad - a.currentLoad), 0);
    const pendingCount = alerts.length;
    const criticalCount = alerts.filter(a => a.riskScore > 80).length;

    const healthScore = Math.max(0, 100 - (pendingCount / totalCapacity) * 50 - criticalCount * 5);

    return {
      score: Math.round(healthScore),
      status: healthScore > 70 ? 'HEALTHY' : healthScore > 40 ? 'BUSY' : 'OVERLOADED',
      pendingAlerts: pendingCount,
      criticalAlerts: criticalCount,
      availableCapacity: totalCapacity,
      estimatedClearTime: `${Math.ceil(pendingCount / (analysts.length * 2))} hours`
    };
  }

  generateTriageReport(alerts, assignments, health) {
    const criticalAlerts = alerts.filter(a => a.priorityLevel === 'CRITICAL');
    const highAlerts = alerts.filter(a => a.priorityLevel === 'HIGH');

    return `
## Alert Triage Report

### Queue Status: ${health.status} (Score: ${health.score}/100)
- Pending Alerts: ${health.pendingAlerts}
- Critical Alerts: ${health.criticalAlerts}
- Available Capacity: ${health.availableCapacity}
- Est. Clear Time: ${health.estimatedClearTime}

### Priority Breakdown:
- CRITICAL: ${criticalAlerts.length} alerts
- HIGH: ${highAlerts.length} alerts
- MEDIUM/LOW: ${alerts.length - criticalAlerts.length - highAlerts.length} alerts

### Assignments Made: ${assignments.length}
${assignments.slice(0, 5).map(a => `- ${a.alertId} → ${a.analystName} (${a.priority})`).join('\n')}

### Recommendations:
${health.status === 'OVERLOADED' ? '1. Consider activating overflow team\n2. Prioritize critical alerts only' : '1. Queue is manageable\n2. Focus on high-priority items'}
    `.trim();
  }

  async triageQueue() {
    this.status = 'TRIAGING';
    const result = await this.reason({ action: 'triage_queue' });
    this.status = 'IDLE';
    return result;
  }
}

export default AlertTriageAgent;
