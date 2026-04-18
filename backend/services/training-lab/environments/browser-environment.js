/**
 * Browser/UI Environment — simulates web application workflows
 * for evaluating computer-use and browser-use agents.
 *
 * The agent must navigate a simulated web UI: click buttons, fill forms,
 * read page content, and complete multi-step workflows.
 */

class BrowserEnvironment {
  constructor() {
    this.workflows = new Map();
    this.stats = { runs: 0, completed: 0, failed: 0 };
    this._seedWorkflows();
  }

  _seedWorkflows() {
    // Workflow 1: Seller Onboarding Form
    this.workflows.set('seller-onboarding-form', {
      name: 'Seller Onboarding Form',
      description: 'Navigate the seller onboarding UI: fill business info, upload documents, submit for review',
      pages: [
        {
          pageId: 'business-info', title: 'Business Information',
          elements: [
            { id: 'input-business-name', type: 'text_input', label: 'Business Name', required: true },
            { id: 'select-category', type: 'dropdown', label: 'Business Category', options: ['Electronics', 'Fashion', 'Software', 'Food'], required: true },
            { id: 'input-country', type: 'dropdown', label: 'Country', options: ['US', 'UK', 'DE', 'FR', 'JP'], required: true },
            { id: 'input-email', type: 'text_input', label: 'Email', required: true },
            { id: 'btn-next', type: 'button', label: 'Next Step', action: 'navigate', target: 'identity-verification' }
          ]
        },
        {
          pageId: 'identity-verification', title: 'Identity Verification',
          elements: [
            { id: 'select-doc-type', type: 'dropdown', label: 'Document Type', options: ['Passport', 'Driver License', 'National ID'], required: true },
            { id: 'input-doc-number', type: 'text_input', label: 'Document Number', required: true },
            { id: 'btn-upload', type: 'button', label: 'Upload Document', action: 'upload' },
            { id: 'btn-next', type: 'button', label: 'Next Step', action: 'navigate', target: 'bank-info' }
          ]
        },
        {
          pageId: 'bank-info', title: 'Bank Information',
          elements: [
            { id: 'input-bank-name', type: 'text_input', label: 'Bank Name', required: true },
            { id: 'input-account', type: 'text_input', label: 'Account Number', required: true },
            { id: 'input-routing', type: 'text_input', label: 'Routing Number', required: true },
            { id: 'btn-submit', type: 'button', label: 'Submit Application', action: 'submit' }
          ]
        }
      ],
      expectedActions: ['fill:input-business-name', 'select:select-category', 'select:input-country', 'fill:input-email', 'click:btn-next', 'select:select-doc-type', 'fill:input-doc-number', 'click:btn-upload', 'click:btn-next', 'fill:input-bank-name', 'fill:input-account', 'fill:input-routing', 'click:btn-submit'],
      maxSteps: 25
    });

    // Workflow 2: Fraud Investigation Dashboard
    this.workflows.set('fraud-investigation-dashboard', {
      name: 'Fraud Investigation Dashboard',
      description: 'Navigate the fraud investigation UI: review alerts, examine evidence, make decision',
      pages: [
        {
          pageId: 'alert-queue', title: 'Alert Queue',
          elements: [
            { id: 'table-alerts', type: 'table', label: 'Active Alerts', rows: 10 },
            { id: 'btn-select-alert', type: 'button', label: 'Select Alert', action: 'navigate', target: 'investigation' },
            { id: 'filter-severity', type: 'dropdown', label: 'Filter Severity', options: ['All', 'Critical', 'High', 'Medium', 'Low'] }
          ]
        },
        {
          pageId: 'investigation', title: 'Investigation View',
          elements: [
            { id: 'panel-seller-info', type: 'info_panel', label: 'Seller Information' },
            { id: 'panel-evidence', type: 'info_panel', label: 'Evidence Summary' },
            { id: 'btn-check-identity', type: 'button', label: 'Verify Identity', action: 'tool_call' },
            { id: 'btn-check-fraud-db', type: 'button', label: 'Check Fraud DB', action: 'tool_call' },
            { id: 'btn-check-network', type: 'button', label: 'Network Analysis', action: 'tool_call' },
            { id: 'btn-approve', type: 'button', label: 'Approve', action: 'decision', decision: 'APPROVE' },
            { id: 'btn-reject', type: 'button', label: 'Reject', action: 'decision', decision: 'REJECT' },
            { id: 'btn-escalate', type: 'button', label: 'Escalate', action: 'decision', decision: 'ESCALATE' },
            { id: 'textarea-notes', type: 'text_area', label: 'Investigation Notes' }
          ]
        }
      ],
      expectedActions: ['click:btn-select-alert', 'read:panel-seller-info', 'read:panel-evidence', 'click:btn-check-identity', 'click:btn-check-fraud-db', 'fill:textarea-notes', 'click:btn-approve'],
      maxSteps: 20
    });

    // Workflow 3: Payment Review
    this.workflows.set('payment-review', {
      name: 'Payment Review Workflow',
      description: 'Review flagged payment: check transaction details, verify buyer, approve or block',
      pages: [
        {
          pageId: 'payment-detail', title: 'Payment Detail',
          elements: [
            { id: 'panel-tx-info', type: 'info_panel', label: 'Transaction Info: $5,432 from NG via new card' },
            { id: 'panel-risk-signals', type: 'info_panel', label: 'Risk Signals: High-risk country, new device, velocity spike' },
            { id: 'btn-check-device', type: 'button', label: 'Device Intelligence', action: 'tool_call' },
            { id: 'btn-check-velocity', type: 'button', label: 'Velocity Check', action: 'tool_call' },
            { id: 'btn-3ds', type: 'button', label: 'Trigger 3D Secure', action: 'tool_call' },
            { id: 'btn-authorize', type: 'button', label: 'Authorize Payment', action: 'decision', decision: 'AUTHORIZE' },
            { id: 'btn-decline', type: 'button', label: 'Decline Payment', action: 'decision', decision: 'DECLINE' },
            { id: 'btn-hold', type: 'button', label: 'Hold for Review', action: 'decision', decision: 'HOLD' }
          ]
        }
      ],
      maxSteps: 15
    });
  }

  /**
   * Run a browser workflow episode.
   */
  async runWorkflow(workflowId, agentFn = null) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    const startTime = Date.now();
    const trajectory = [];
    let currentPageIdx = 0;
    let totalReward = 0;
    let completed = false;
    let step = 0;

    while (!completed && step < workflow.maxSteps) {
      const page = workflow.pages[currentPageIdx];
      const state = {
        page: page.pageId, title: page.title,
        elements: page.elements.map(e => ({ id: e.id, type: e.type, label: e.label })),
        step, pageIndex: currentPageIdx
      };

      // Get action from agent or random
      let action;
      if (agentFn) {
        action = await agentFn(state);
      } else {
        const element = page.elements[Math.floor(Math.random() * page.elements.length)];
        const actionType = element.type === 'button' ? 'click' : element.type.includes('input') ? 'fill' : element.type === 'dropdown' ? 'select' : 'read';
        action = `${actionType}:${element.id}`;
      }

      // Process action
      let reward = -0.5; // small penalty per step
      const [actionType, elementId] = action.split(':');
      const element = page.elements.find(e => e.id === elementId);

      if (element) {
        if (element.action === 'navigate' && element.target) {
          const targetIdx = workflow.pages.findIndex(p => p.pageId === element.target);
          if (targetIdx >= 0) { currentPageIdx = targetIdx; reward = 2; }
        } else if (element.action === 'submit' || element.action === 'decision') {
          completed = true;
          reward = 10;
        } else if (element.action === 'tool_call') {
          reward = 1.5; // gathering evidence
        } else if (actionType === 'fill' || actionType === 'select') {
          reward = element.required ? 1 : 0.5;
        } else if (actionType === 'read') {
          reward = 0.5;
        }
      } else {
        reward = -2; // invalid element
      }

      // Bonus for following expected sequence
      if (workflow.expectedActions && step < workflow.expectedActions.length) {
        if (action === workflow.expectedActions[step]) reward += 3;
      }

      totalReward += reward;
      trajectory.push({
        step, page: page.pageId, action, reward,
        elementFound: !!element, completed,
        timestamp: new Date().toISOString()
      });
      step++;
    }

    this.stats.runs++;
    if (completed) this.stats.completed++; else this.stats.failed++;

    return {
      workflowId, workflowName: workflow.name,
      completed, totalReward: Math.round(totalReward * 100) / 100,
      steps: step, maxSteps: workflow.maxSteps,
      trajectory, latencyMs: Date.now() - startTime
    };
  }

  listWorkflows() {
    return Array.from(this.workflows.values()).map(w => ({
      id: Array.from(this.workflows.entries()).find(([, v]) => v === w)?.[0],
      name: w.name, description: w.description,
      pages: w.pages.length, maxSteps: w.maxSteps
    }));
  }

  getWorkflow(workflowId) { return this.workflows.get(workflowId) || null; }
  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getBrowserEnvironment() {
  if (!instance) instance = new BrowserEnvironment();
  return instance;
}
export default { BrowserEnvironment, getBrowserEnvironment };
