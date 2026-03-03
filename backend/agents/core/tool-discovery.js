/**
 * Tool Discovery — Runtime tool discovery via MCP servers.
 *
 * Agents can discover and temporarily register new tools at runtime
 * by querying MCP servers for their available tool listings.
 * Discovered tools are cached to avoid repeated lookups.
 *
 * Singleton: getToolDiscovery()
 */

const DEFAULT_TIMEOUT = 5000;

class ToolDiscovery {
  constructor() {
    this.mcpEndpoints = [];
    this.discoveredTools = new Map(); // Cache: toolName → { name, description, handler, endpoint }
    this.toolListCache = new Map(); // Cache: endpoint → [tools]
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.stats = {
      discoveries: 0,
      cacheHits: 0,
      failures: 0,
    };

    // Initialize from environment
    const mcpUrl = process.env.MCP_SERVER_URL;
    if (mcpUrl) {
      this.addEndpoint(mcpUrl);
    }
    // Default local MCP endpoint
    this.addEndpoint(process.env.BACKEND_URL || 'http://localhost:3001');
  }

  /**
   * Register an MCP server endpoint for tool discovery.
   *
   * @param {string} endpoint - Base URL of the MCP server
   */
  addEndpoint(endpoint) {
    if (!this.mcpEndpoints.includes(endpoint)) {
      this.mcpEndpoints.push(endpoint);
    }
  }

  /**
   * Discover tools matching a capability name across all registered MCP endpoints.
   *
   * @param {string} capability - Tool name or capability to search for
   * @returns {Promise<Array<{ name: string, description: string, handler: Function }>>}
   */
  async discoverTools(capability) {
    if (!capability || typeof capability !== 'string') return [];

    // Check cache first
    const cached = this.discoveredTools.get(capability);
    if (cached && Date.now() - cached._cachedAt < this.cacheExpiry) {
      this.stats.cacheHits++;
      return [cached];
    }

    const matches = [];

    for (const endpoint of this.mcpEndpoints) {
      try {
        const tools = await this._fetchToolListing(endpoint);
        const matched = tools.filter(t =>
          t.name === capability ||
          t.name.includes(capability) ||
          (t.description || '').toLowerCase().includes(capability.toLowerCase())
        );

        for (const tool of matched) {
          const discovered = {
            name: tool.name,
            description: tool.description || `Discovered tool: ${tool.name}`,
            handler: this._createHandler(endpoint, tool.name),
            endpoint,
            _cachedAt: Date.now(),
          };
          this.discoveredTools.set(tool.name, discovered);
          matches.push(discovered);
        }
      } catch (e) {
        this.stats.failures++;
        // Endpoint failed; try next
      }
    }

    if (matches.length > 0) {
      this.stats.discoveries++;
    }
    return matches;
  }

  /**
   * Get a list of all known tools across all endpoints.
   *
   * @returns {Promise<Array<{ name: string, description: string, endpoint: string }>>}
   */
  async listAllTools() {
    const allTools = [];
    for (const endpoint of this.mcpEndpoints) {
      try {
        const tools = await this._fetchToolListing(endpoint);
        for (const t of tools) {
          allTools.push({ name: t.name, description: t.description, endpoint });
        }
      } catch (e) {
        // Skip failed endpoints
      }
    }
    return allTools;
  }

  /**
   * Get discovery statistics.
   * @returns {Object}
   */
  getStats() {
    return {
      endpoints: this.mcpEndpoints.length,
      cachedTools: this.discoveredTools.size,
      ...this.stats,
    };
  }

  // ── Private methods ──

  /**
   * Fetch tool listing from an MCP endpoint. Results are cached.
   */
  async _fetchToolListing(endpoint) {
    const cacheKey = endpoint;
    const cached = this.toolListCache.get(cacheKey);
    if (cached && Date.now() - cached._cachedAt < this.cacheExpiry) {
      return cached.tools;
    }

    // Try MCP tool listing endpoint
    const urls = [
      `${endpoint}/mcp/tools`,
      `${endpoint}/api/tools`,
      `${endpoint}/tools`,
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
        });

        if (response.ok) {
          const data = await response.json();
          const tools = Array.isArray(data) ? data : (data.tools || []);
          this.toolListCache.set(cacheKey, { tools, _cachedAt: Date.now() });
          return tools;
        }
      } catch (e) {
        // Try next URL pattern
      }
    }

    return [];
  }

  /**
   * Create an async handler function that calls an MCP server's tool.
   *
   * @param {string} endpoint - MCP server base URL
   * @param {string} toolName - The tool name to invoke
   * @returns {Function} Async handler accepting params and returning result
   */
  _createHandler(endpoint, toolName) {
    return async (params) => {
      const urls = [
        `${endpoint}/api/onboarding/tools/execute`,
        `${endpoint}/mcp/tools/${toolName}`,
      ];

      for (const url of urls) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toolName, params }),
            signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
          });

          if (response.ok) {
            const data = await response.json();
            return { success: true, data: data.result || data };
          }
        } catch (e) {
          // Try next URL
        }
      }

      return { success: false, error: `Failed to call discovered tool: ${toolName}` };
    };
  }
}

// Singleton
let instance = null;

export function getToolDiscovery() {
  if (!instance) {
    instance = new ToolDiscovery();
  }
  return instance;
}

export default { ToolDiscovery, getToolDiscovery };
