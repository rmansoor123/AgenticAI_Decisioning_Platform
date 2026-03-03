/**
 * Reasoning Graph — State graph with conditional edges for agent reasoning.
 *
 * Models the TPAOR (Think-Plan-Act-Observe-Reflect) flow as a configurable
 * state graph. Nodes are processing phases, edges are transitions with
 * optional conditions. This allows agents to skip steps, add steps, or
 * loop based on runtime conditions.
 *
 * The default graph preserves backward compatibility with the existing
 * linear flow. Agents can customize by adding/removing edges in constructors.
 *
 * Inspired by LangGraph state machine patterns.
 *
 * Usage:
 *   const graph = new ReasoningGraph();
 *   graph.addNode('think', async (ctx) => agent.think(ctx.input));
 *   graph.addEdge('think', 'plan');
 *   const result = await graph.execute('think', { input });
 */

const MAX_VISITED = 20; // Safety: prevent infinite loops

class ReasoningGraph {
  constructor() {
    /** @type {Map<string, Function>} Node name → async handler */
    this.nodes = new Map();
    /** @type {Array<{ from: string, to: string, condition: Function|null, priority: number }>} */
    this.edges = [];
  }

  /**
   * Add a processing node to the graph.
   *
   * @param {string} name - Unique node identifier (e.g., 'think', 'plan', 'act')
   * @param {Function} handler - Async function(context) → result. Result is stored in context[name].
   */
  addNode(name, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler for node '${name}' must be a function`);
    }
    this.nodes.set(name, handler);
  }

  /**
   * Add a directed edge (transition) between nodes.
   *
   * @param {string} from - Source node name
   * @param {string} to - Target node name
   * @param {Function|null} [condition=null] - Optional condition(context) → boolean.
   *   If null, this is an unconditional edge (default path).
   *   Conditional edges are evaluated before unconditional ones.
   * @param {number} [priority=0] - Higher priority edges are checked first among conditionals.
   */
  addEdge(from, to, condition = null, priority = 0) {
    this.edges.push({ from, to, condition, priority });
  }

  /**
   * Remove all edges from a specific source node.
   * Useful for replacing the default routing from a node.
   *
   * @param {string} from - Source node name
   */
  removeEdgesFrom(from) {
    this.edges = this.edges.filter(e => e.from !== from);
  }

  /**
   * Remove a specific edge.
   *
   * @param {string} from - Source node
   * @param {string} to - Target node
   */
  removeEdge(from, to) {
    this.edges = this.edges.filter(e => !(e.from === from && e.to === to));
  }

  /**
   * Execute the graph starting from a given node.
   *
   * Traverses nodes sequentially, evaluating conditional edges at each step.
   * Stores each node's output in context[nodeName].
   *
   * @param {string} startNode - The node to begin execution from
   * @param {Object} context - Shared context passed to all nodes. Modified in-place.
   * @returns {Promise<Object>} The final context with all node results
   */
  async execute(startNode, context = {}) {
    if (!this.nodes.has(startNode)) {
      throw new Error(`Start node '${startNode}' not found in graph`);
    }

    let current = startNode;
    const visited = [];
    context._graphTrace = [];

    while (current && visited.length < MAX_VISITED) {
      const handler = this.nodes.get(current);
      if (!handler) {
        throw new Error(`Node '${current}' not found in graph`);
      }

      const nodeStart = Date.now();
      const result = await handler(context);
      context[current] = result;

      const nodeInfo = {
        node: current,
        durationMs: Date.now() - nodeStart,
        hasResult: result !== undefined && result !== null,
      };
      visited.push(current);
      context._graphTrace.push(nodeInfo);

      // Find next node via edges
      const outEdges = this.edges
        .filter(e => e.from === current)
        .sort((a, b) => {
          // Conditional edges first (they have conditions), then by priority (descending)
          if (a.condition && !b.condition) return -1;
          if (!a.condition && b.condition) return 1;
          return b.priority - a.priority;
        });

      current = null;
      for (const edge of outEdges) {
        if (!edge.condition || edge.condition(context)) {
          current = edge.to;
          break;
        }
      }
    }

    context._visitedNodes = visited;
    return context;
  }

  /**
   * Get a description of the graph structure for debugging.
   *
   * @returns {{ nodes: string[], edges: Array<{ from: string, to: string, conditional: boolean }> }}
   */
  describe() {
    return {
      nodes: Array.from(this.nodes.keys()),
      edges: this.edges.map(e => ({
        from: e.from,
        to: e.to,
        conditional: !!e.condition,
        priority: e.priority,
      })),
    };
  }
}

/**
 * Build the default TPAOR reasoning graph for an agent.
 * This mirrors the existing linear flow but as a configurable graph.
 *
 * Nodes: think → plan → act → observe → reflect → judge → conclude
 * With conditional edges for: replan (on act failure), deepen (on low confidence), judge (on high stakes)
 *
 * @param {Object} agent - The BaseAgent instance
 * @returns {ReasoningGraph}
 */
export function buildDefaultGraph(agent) {
  const graph = new ReasoningGraph();

  // Define nodes
  graph.addNode('think', async (ctx) => {
    return agent.think(ctx.input, ctx.context);
  });

  graph.addNode('plan', async (ctx) => {
    const analysis = ctx.think || ctx.input;
    return agent.plan(analysis, ctx.context);
  });

  graph.addNode('act', async (ctx) => {
    const plan = ctx.plan;
    const results = [];
    for (const action of (plan?.actions || [])) {
      const result = await agent.act(action);
      results.push({ action, result });
    }
    return results;
  });

  graph.addNode('replan', async (ctx) => {
    // Re-plan is handled inline; this node just marks it happened
    return { replanned: true };
  });

  graph.addNode('observe', async (ctx) => {
    const actions = ctx.act || [];
    return agent.observe(actions, ctx.context);
  });

  graph.addNode('reflect', async (ctx) => {
    return agent.reflect(ctx.observe, ctx.act || [], ctx.input, ctx.context);
  });

  graph.addNode('deepen', async (ctx) => {
    // Multi-turn investigation
    return { deepened: true, round: (ctx._investigationRound || 0) + 1 };
  });

  graph.addNode('judge', async (ctx) => {
    const { getAgentJudge: getJudge } = await import('./agent-judge.js');
    const judge = getJudge();
    return judge.evaluate({ result: ctx.observe, actions: ctx.act, reflection: ctx.reflect }, agent.agentId);
  });

  graph.addNode('conclude', async (ctx) => {
    return {
      decision: ctx.observe?.recommendation?.action || ctx.observe?.decision,
      confidence: ctx.observe?.confidence,
      summary: ctx.observe?.summary,
      judgeReview: ctx.judge || null,
      investigationRounds: ctx._investigationRound || 1,
    };
  });

  // Define edges (order matters for conditional evaluation)

  // Linear flow
  graph.addEdge('think', 'plan');
  graph.addEdge('plan', 'act');

  // Act → replan (if majority failed)
  graph.addEdge('act', 'replan', (ctx) => {
    const results = ctx.act || [];
    if (results.length === 0) return false;
    const failCount = results.filter(a => a.result?.success === false).length;
    return failCount / results.length > 0.5;
  }, 10);

  // Act → observe (default)
  graph.addEdge('act', 'observe');

  // Replan loops back to act
  graph.addEdge('replan', 'act');

  graph.addEdge('observe', 'reflect');

  // Reflect → deepen (if uncertain and not already deepened)
  graph.addEdge('reflect', 'deepen', (ctx) => {
    if ((ctx._investigationRound || 0) >= 2) return false;
    const confidence = ctx.observe?.confidence || 0;
    const concerns = ctx.reflect?.concerns?.length || 0;
    return confidence < 0.5 || concerns >= 3;
  }, 10);

  // Deepen → plan (loop back for round 2)
  graph.addEdge('deepen', 'plan');

  // Reflect → judge (high-stakes decisions)
  graph.addEdge('reflect', 'judge', (ctx) => {
    const decision = ctx.observe?.recommendation?.action || ctx.observe?.decision;
    const confidence = ctx.observe?.confidence || 0;
    return ['REJECT', 'BLOCK'].includes(decision) && confidence >= 0.7;
  }, 5);

  // Reflect → conclude (default, low-stakes)
  graph.addEdge('reflect', 'conclude');

  // Judge → conclude
  graph.addEdge('judge', 'conclude');

  return graph;
}

export { ReasoningGraph };
export default { ReasoningGraph, buildDefaultGraph };
