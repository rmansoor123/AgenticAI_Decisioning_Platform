# Production Stack Upgrade — Design Document

**Date:** 2026-03-03
**Status:** Approved
**Approach:** Local-first, open source, Docker Compose, $0/month, SQLite as universal fallback

---

## Principles

1. **Everything runs locally** — no cloud dependencies except Claude API
2. **SQLite is always the fallback** — app never goes down regardless of which services are running
3. **Docker Compose for all infrastructure** — one `docker-compose up` starts everything
4. **Gradual migration** — each layer is independent, migrate one at a time
5. **Same interfaces** — existing code adapters (db_ops, messenger, etc.) get new backends behind the same API

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              docker-compose.yml                            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  postgres:16-alpine          port 5432                    │
│  ├─ Agent state (12 tables)                               │
│  ├─ pgvector extension                                    │
│  └─ Langfuse database                                     │
│                                                           │
│  redis:7-alpine              port 6379                    │
│  ├─ LLM response cache                                    │
│  ├─ Tool result cache                                     │
│  ├─ Agent message streams                                 │
│  └─ Pattern memory hashes                                 │
│                                                           │
│  qdrant/qdrant               port 6333                    │
│  ├─ onboarding-knowledge collection                       │
│  ├─ fraud-cases collection                                │
│  └─ risk-patterns collection                              │
│                                                           │
│  neo4j:5-community           port 7474 (browser), 7687    │
│  ├─ Entity graph (sellers, devices, IPs, etc.)            │
│  └─ Fraud ring detection via Cypher                       │
│                                                           │
│  langfuse/langfuse           port 3100                    │
│  ├─ Tracing dashboard                                     │
│  ├─ Prompt management                                     │
│  └─ Cost tracking                                         │
│                                                           │
│  RESOURCES                                                │
│  RAM:  ~2-3 GB total for all services                     │
│  DISK: ~500MB Docker images                               │
│  COST: $0/month                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Layer 1: PostgreSQL — Primary Database

**Replaces:** SQLite as primary store (SQLite stays as fallback)
**Docker image:** `postgres:16-alpine` + `pgvector/pgvector:pg16`
**Migration effort:** Medium

### What Changes

| SQLite Table | Postgres Table | Notes |
|---|---|---|
| `agent_short_term_memory` | `agent_short_term_memory` | Add index on `(agent_id, session_id)`, TTL via `expires_at` |
| `agent_long_term_memory` | `agent_long_term_memory` | Add GIN index on `content` for full-text search |
| `agent_shared_memory` | `agent_shared_memory` | Add index on `topic` |
| `agent_episodes` | `agent_episodes` | Add index on `(agent_id, decision)` |
| `knowledge_entries` | `knowledge_entries` | Add `tsvector` column for native Postgres full-text search (replaces custom TF-IDF) |
| `reasoning_checkpoints` | `reasoning_checkpoints` | Add index on `(session_id, phase)` |
| `workflow_checkpoints` | `workflow_checkpoints` | Add index on `execution_id` |
| `agent_decisions` | `agent_decisions` | Add index on `(agent_id, timestamp)` |
| `agent_traces` | `agent_traces` | Add index on `trace_id` |
| `agent_metrics` | `agent_metrics` | Add index on `(agent_id, timestamp)` |
| `agent_evaluations` | `agent_evaluations` | Add index on `agent_id` |
| `agent_calibration` | `agent_calibration` | Small table, no special indexing |
| `agent_costs` | `agent_costs` | Add index on `(agent_id, timestamp)` |

### Implementation Approach

1. Create `backend/shared/common/database-pg.js` — Postgres adapter implementing the same `db_ops` interface
2. Create `backend/shared/common/database-factory.js` — factory that returns SQLite or Postgres adapter based on `DB_BACKEND` env var
3. All existing code continues using `db_ops.insert/getById/getAll/query/update/delete` — zero changes to business logic
4. Postgres full-text search (`tsvector` + `ts_rank`) replaces custom TF-IDF in knowledge-base.js for better performance

### pgvector Bonus

With pgvector enabled, Postgres can also serve as a secondary vector store. This doesn't replace Qdrant but gives you vector search capability inside your relational queries (e.g., "find similar decisions within the last 24 hours").

### Environment Variables

```
DB_BACKEND=postgres              # or "sqlite" for fallback
POSTGRES_URL=postgresql://user:pass@localhost:5432/fraud_detection
DB_PATH=./data/fraud_detection.db  # SQLite fallback path (existing)
```

### Fallback Behavior

```
if DB_BACKEND=postgres && Postgres is reachable → use Postgres
if DB_BACKEND=postgres && Postgres is down → fall back to SQLite, log warning
if DB_BACKEND=sqlite → use SQLite (existing behavior, zero changes)
```

---

## Layer 2: Redis — Cache + Message Queue

**Replaces:** In-memory Maps (LLM cache, tool cache, message queue, pattern memory)
**Docker image:** `redis:7-alpine`
**Migration effort:** Low

### What Changes

| Current (In-Memory) | Redis Structure | Key Pattern | TTL |
|---|---|---|---|
| LLM cache (Map, SHA-256 keys) | String | `llm:{sha256hash}` | 15 min |
| Tool result cache (LRU Map) | String | `tool:{toolName}:{paramHash}` | 5 min |
| Agent message queue (Map) | Stream | `agent:messages:{agentId}` | None (trimmed at 1000) |
| Help request queue (Array) | Stream | `agent:help:pending` | None |
| Pattern memory (Map + indexes) | Hash + Sorted Set | `pattern:{patternId}`, `pattern:idx:type:{type}` | None |
| Agent load tracking (Map) | Hash | `agent:load:{agentId}` | None |

### Implementation Approach

1. Create `backend/shared/common/redis-client.js` — singleton Redis connection (using `ioredis` package)
2. Update `llm-cache.js` — replace Map with Redis GET/SET + TTL
3. Update `agent-messenger.js` — replace Map queue with Redis Streams (`XADD` to send, `XREAD BLOCK` to receive)
4. Update `pattern-memory.js` — replace Maps with Redis Hashes + Sorted Sets
5. Update `tool-executor.js` — replace LRU Map with Redis GET/SET + TTL

### Agent Messaging Upgrade

The biggest win here. Current flow:
```
Agent A → helpRequest → Map queue → Orchestrator polls every 100ms → routes → response
```

New flow with Redis Streams:
```
Agent A → XADD agent:help:pending → Orchestrator XREAD BLOCK 0 → instant route → XADD response
```

No polling. Instant delivery. Messages survive restarts.

### Environment Variables

```
REDIS_URL=redis://localhost:6379   # Redis connection
CACHE_BACKEND=redis                # or "memory" for fallback
```

### Fallback Behavior

```
if CACHE_BACKEND=redis && Redis is reachable → use Redis
if CACHE_BACKEND=redis && Redis is down → fall back to in-memory Maps, log warning
if CACHE_BACKEND=memory → use in-memory Maps (existing behavior)
```

---

## Layer 3: Qdrant — Local Vector Search

**Replaces:** Pinecone cloud dependency (Pinecone stays as optional cloud upgrade)
**Docker image:** `qdrant/qdrant:latest`
**Migration effort:** Medium

### What Changes

| Current (Pinecone) | Qdrant Equivalent |
|---|---|
| Pinecone index with namespaces | Qdrant collections (one per namespace) |
| Pinecone `/search` via Python eval service | Qdrant REST API `POST /collections/{name}/points/search` |
| Pinecone `/ingest` via Python eval service | Qdrant REST API `PUT /collections/{name}/points` |
| Pinecone integrated embedding | Local embedding model (see below) |
| Pinecone reranking | Keep LLM-based reranker or add BGE Reranker locally |

### Embedding Model

Pinecone handled embedding internally. With Qdrant, we need a local embedding model:

**Recommended:** `sentence-transformers/all-MiniLM-L6-v2` via Python
- 384 dimensions, fast, ~80MB model
- Run in the existing Python eval service (already has FastAPI)
- Or upgrade to `BAAI/bge-base-en-v1.5` (768 dimensions, better quality)

### Collections

```
onboarding-knowledge  → Collection with 384/768-dim vectors + metadata payload
fraud-cases           → Collection with 384/768-dim vectors + metadata payload
risk-patterns         → Collection with 384/768-dim vectors + metadata payload
```

### Implementation Approach

1. Add embedding endpoint to Python eval service: `POST /embed` → returns vector
2. Create `backend/evaluation/services/qdrant_service.py` — mirrors `pinecone_service.py` API
3. Update `context-engine.js` — route vector search to `VECTOR_BACKEND` (qdrant or pinecone)
4. Update `knowledge-base.js` — add Qdrant write-back alongside TF-IDF

### Environment Variables

```
VECTOR_BACKEND=qdrant              # or "pinecone" for cloud
QDRANT_URL=http://localhost:6333
PINECONE_API_KEY=...               # only if VECTOR_BACKEND=pinecone
EMBEDDING_MODEL=all-MiniLM-L6-v2   # local embedding model
```

### Fallback Behavior

```
if VECTOR_BACKEND=qdrant && Qdrant is reachable → use Qdrant
if VECTOR_BACKEND=qdrant && Qdrant is down → fall back to TF-IDF knowledge-base.js
if VECTOR_BACKEND=pinecone → use Pinecone (existing behavior)
```

---

## Layer 4: Neo4j Community — Graph Database

**Replaces:** In-memory graph engine (graph-engine.js, graph-queries.js)
**Docker image:** `neo4j:5-community`
**Migration effort:** Medium

### What Changes

| Current (In-Memory) | Neo4j Equivalent |
|---|---|
| `Map<nodeId, node>` | `(:Entity {id, type, properties})` nodes |
| `Map<edgeId, edge>` | `-[:CONNECTED_TO {type, weight}]->` relationships |
| Property indexes (Map per property) | Native indexes on `email`, `phone`, `ip`, etc. |
| Custom BFS traversal | Cypher `MATCH (a)-[*1..3]-(b)` |
| Custom risk propagation | Cypher + APOC `apoc.path.expandConfig` |
| Custom ring detection | Cypher `MATCH path = (a)-[*3..6]-(a)` |
| Custom community detection | GDS `gds.louvain.stream` (if GDS plugin available) |

### Graph Tool Migration

| Tool | Current Implementation | Neo4j Cypher |
|---|---|---|
| `graph_find_connections` | Custom BFS on adjacency lists | `MATCH (n {id: $id})-[*1..$depth]-(connected) RETURN connected` |
| `graph_risk_propagation` | Custom BFS with decay | `MATCH path = (fraud {flagged: true})-[*1..3]-(target) RETURN target, reduce(risk = 1.0, r IN relationships(path) \| risk * 0.5)` |
| `graph_find_rings` | Custom cycle detection | `MATCH path = (a)-[*3..6]-(a) WHERE ALL(n IN nodes(path) WHERE n.type = 'seller') RETURN path` |
| `graph_community` | Custom clustering | Louvain community detection via GDS library |
| `graph_multi_hop_investigate` | Custom weighted traversal | `MATCH path = (n {id: $id})-[r*1..3]-(target) WHERE ALL(rel IN r WHERE rel.weight > $threshold) RETURN path` |

### Implementation Approach

1. Create `backend/graph/neo4j-client.js` — Neo4j driver singleton (`neo4j-driver` package)
2. Create `backend/graph/neo4j-queries.js` — Cypher query implementations for each graph tool
3. Update `graph-tools.js` — route to Neo4j or in-memory based on `GRAPH_BACKEND` env var
4. Create migration script to seed Neo4j from existing synthetic data

### Environment Variables

```
GRAPH_BACKEND=neo4j               # or "memory" for fallback
NEO4J_URL=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=fraud_detection
```

### Fallback Behavior

```
if GRAPH_BACKEND=neo4j && Neo4j is reachable → use Neo4j
if GRAPH_BACKEND=neo4j && Neo4j is down → fall back to in-memory graph-engine.js
if GRAPH_BACKEND=memory → use in-memory graph (existing behavior)
```

---

## Layer 5: Langfuse — Observability

**Replaces:** Custom trace-collector.js, metrics-collector.js, decision-logger.js, cost-tracker.js
**Docker image:** `langfuse/langfuse:latest` (needs Postgres from Layer 1)
**Migration effort:** Low

### What Changes

| Current Module | Langfuse Replacement | Benefit |
|---|---|---|
| `trace-collector.js` | Langfuse traces (auto-instrumented) | Visual trace explorer UI |
| `metrics-collector.js` | Langfuse metrics + dashboards | Real-time charts, no custom flush logic |
| `decision-logger.js` | Langfuse observations with metadata | Searchable, filterable, unlimited history |
| `cost-tracker.js` | Langfuse cost tracking (per-model) | Automatic token counting + cost calculation |
| `prompt-templates.js` | Langfuse prompt management | Version prompts, A/B test, roll back |

### Implementation Approach

1. Install `langfuse` npm package
2. Create `backend/shared/common/langfuse-client.js` — singleton Langfuse client
3. Instrument `base-agent.js` reasoning loop — wrap each phase in Langfuse spans
4. Instrument `llm-client.js` — auto-capture LLM calls with Langfuse generation tracking
5. Pipe TruLens/RAGAS eval scores into Langfuse as score annotations
6. Keep existing SQLite collectors as fallback (they still work independently)

### Environment Variables

```
OBSERVABILITY_BACKEND=langfuse      # or "sqlite" for fallback
LANGFUSE_HOST=http://localhost:3100
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
```

### Fallback Behavior

```
if OBSERVABILITY_BACKEND=langfuse && Langfuse is reachable → use Langfuse
if OBSERVABILITY_BACKEND=langfuse && Langfuse is down → fall back to SQLite collectors
if OBSERVABILITY_BACKEND=sqlite → use existing collectors (no change)
```

---

## Layer 6: Mem0 — Agent Memory

**Replaces:** Custom memory-store.js (short-term, long-term, shared memory)
**Install:** `pip install mem0ai` (runs in Python eval service)
**Migration effort:** Medium

### What Changes

| Current Memory | Mem0 Equivalent | Improvement |
|---|---|---|
| Short-term (SQLite, keyword search) | Mem0 session memory | Semantic search, auto-summarization |
| Long-term (SQLite, keyword + importance scoring) | Mem0 agent memory | Vector-based retrieval, auto-deduplication |
| Shared (SQLite, keyword search) | Mem0 shared memory (app-level) | Cross-agent semantic memory |

### What Stays

- **Pattern memory** — keeps its in-memory Map / Redis implementation. Mem0 doesn't do reinforcement-learning-style pattern tracking
- **Episodic memory** — stays in Postgres. Full investigation replays need relational structure
- **Knowledge base** — stays as Qdrant collections. Mem0 is for agent memories, not document retrieval

### Implementation Approach

1. Add Mem0 endpoints to Python eval service: `POST /memory/add`, `GET /memory/search`, `DELETE /memory`
2. Configure Mem0 to use local Qdrant as its vector store (shares Layer 3)
3. Create `backend/agents/core/memory-store-mem0.js` — adapter implementing same interface as `memory-store.js`
4. Route based on `MEMORY_BACKEND` env var

### Environment Variables

```
MEMORY_BACKEND=mem0               # or "sqlite" for fallback
MEM0_VECTOR_STORE=qdrant          # Mem0 uses Qdrant for storage
```

### Fallback Behavior

```
if MEMORY_BACKEND=mem0 && Mem0/Qdrant reachable → use Mem0
if MEMORY_BACKEND=mem0 && Mem0/Qdrant down → fall back to SQLite memory-store.js
if MEMORY_BACKEND=sqlite → use existing memory-store.js (no change)
```

---

## Docker Compose File

```yaml
version: "3.8"

services:
  postgres:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: fraud_detection
      POSTGRES_USER: fraud_user
      POSTGRES_PASSWORD: fraud_pass
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fraud_user"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrantdata:/qdrant/storage
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/healthz"]
      interval: 5s
      timeout: 3s
      retries: 5

  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      NEO4J_AUTH: neo4j/fraud_detection
      NEO4J_PLUGINS: '["apoc"]'
    volumes:
      - neo4jdata:/data
    healthcheck:
      test: ["CMD", "neo4j", "status"]
      interval: 10s
      timeout: 5s
      retries: 5

  langfuse:
    image: langfuse/langfuse:latest
    ports:
      - "3100:3000"
    environment:
      DATABASE_URL: postgresql://fraud_user:fraud_pass@postgres:5432/langfuse
      NEXTAUTH_SECRET: my-secret-key
      NEXTAUTH_URL: http://localhost:3100
      SALT: my-salt-value
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
  redisdata:
  qdrantdata:
  neo4jdata:
```

**Start everything:** `docker-compose up -d`
**Stop everything:** `docker-compose down`
**Reset everything:** `docker-compose down -v` (deletes data)

---

## Backend Environment Variables (Full)

```bash
# Database
DB_BACKEND=postgres                              # postgres | sqlite
POSTGRES_URL=postgresql://fraud_user:fraud_pass@localhost:5432/fraud_detection
DB_PATH=./data/fraud_detection.db                # SQLite fallback

# Cache + Messaging
CACHE_BACKEND=redis                              # redis | memory
REDIS_URL=redis://localhost:6379

# Vector Search
VECTOR_BACKEND=qdrant                            # qdrant | pinecone
QDRANT_URL=http://localhost:6333
EMBEDDING_MODEL=all-MiniLM-L6-v2
PINECONE_API_KEY=                                # only if VECTOR_BACKEND=pinecone
PINECONE_INDEX_NAME=                             # only if VECTOR_BACKEND=pinecone

# Graph
GRAPH_BACKEND=neo4j                              # neo4j | memory
NEO4J_URL=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=fraud_detection

# Observability
OBSERVABILITY_BACKEND=langfuse                   # langfuse | sqlite
LANGFUSE_HOST=http://localhost:3100
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...

# Memory
MEMORY_BACKEND=mem0                              # mem0 | sqlite
MEM0_VECTOR_STORE=qdrant

# LLM (unchanged)
ANTHROPIC_API_KEY=sk-ant-...
USE_LLM=true

# Eval Service (unchanged)
EVAL_SERVICE_URL=http://localhost:8000

# Server (unchanged)
PORT=3001
```

---

## Migration Priority

| # | Layer | Effort | Impact | What It Unblocks |
|---|---|---|---|---|
| 1 | **Redis** (cache + messaging) | Low | High | Persistent caches, event-driven messaging, pattern survival |
| 2 | **PostgreSQL** (primary DB) | Medium | High | Concurrent writes, proper indexing, full-text search |
| 3 | **Qdrant** (vector search) | Medium | Medium | Remove Pinecone dependency, local embeddings |
| 4 | **Neo4j** (graph) | Medium | Medium | Persistent fraud networks, Cypher queries, visualization |
| 5 | **Langfuse** (observability) | Low | Medium | Visual tracing, prompt management, replace 4 custom modules |
| 6 | **Mem0** (memory) | Medium | Medium | Semantic memory retrieval, auto-deduplication |

Each layer is fully independent. You can do them in any order or skip any layer entirely.

---

## Fallback Summary

Every layer degrades gracefully. The app works with **zero Docker services running** (pure SQLite + in-memory, your current state):

```
PostgreSQL down  →  SQLite via db_ops
Redis down       →  In-memory Maps
Qdrant down      →  TF-IDF knowledge-base.js
Neo4j down       →  In-memory graph-engine.js
Langfuse down    →  SQLite trace/metrics/decision collectors
Mem0 down        →  SQLite memory-store.js
Claude API down  →  Hardcoded decision logic
```

---

## New npm Dependencies

```
ioredis          — Redis client (Layer 2)
pg               — PostgreSQL client (Layer 1)
neo4j-driver     — Neo4j Bolt driver (Layer 4)
langfuse         — Langfuse SDK (Layer 5)
```

## New pip Dependencies

```
mem0ai           — Mem0 memory layer (Layer 6)
qdrant-client    — Qdrant Python client (Layer 3)
sentence-transformers  — Local embedding model (Layer 3)
```

---

*Approved: 2026-03-03*
