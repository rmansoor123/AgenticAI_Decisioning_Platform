# Platform Enhancement: Kafka, Redis & Onboarding Model Visibility

**Date:** 2026-03-17
**Status:** Approved
**Scope:** Infrastructure wiring (Kafka + Redis) and platform page enhancements for onboarding ML model

---

## Problem

The onboarding ML decisioning pipeline uses a custom in-process stream engine instead of real Kafka, Redis is configured but not wired into the onboarding flow, and the platform layer pages (Data, ML, Decisioning, Experimentation) don't surface onboarding model details. A user exploring the platform cannot see how the layers connect for the onboarding use case.

## Goals

1. Wire real Apache Kafka + Zookeeper to the onboarding streaming pipeline
2. Wire Redis for feature store caching and ML prediction caching
3. Update all 4 platform pages to show onboarding-specific details with interactive elements
4. Maintain graceful fallback — everything works without Docker

## Non-Goals

- Training the model on real fraud data (weights remain deterministic)
- Adding new onboarding features beyond the existing 25
- Replacing the in-process stream engine entirely (it becomes the fallback)

---

## 1. Infrastructure: Kafka

### Docker Compose

Add Apache Kafka + Zookeeper to `docker-compose.yml`:

```yaml
zookeeper:
  image: confluentinc/cp-zookeeper:7.6.0
  ports:
    - "2181:2181"
  environment:
    ZOOKEEPER_CLIENT_PORT: 2181
    ZOOKEEPER_TICK_TIME: 2000
  healthcheck:
    test: ["CMD-SHELL", "echo ruok | nc localhost 2181 | grep imok"]
    interval: 5s
    timeout: 3s
    retries: 5
  volumes:
    - zookeeperdata:/var/lib/zookeeper/data

kafka:
  image: confluentinc/cp-kafka:7.6.0
  depends_on:
    zookeeper:
      condition: service_healthy
  ports:
    - "9092:9092"
    - "29092:29092"
  environment:
    KAFKA_BROKER_ID: 1
    KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
    KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,HOST:PLAINTEXT
    KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:29092,HOST://0.0.0.0:9092
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,HOST://localhost:9092
    KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
  healthcheck:
    test: ["CMD-SHELL", "kafka-broker-api-versions --bootstrap-server localhost:9092"]
    interval: 10s
    timeout: 5s
    retries: 10
    start_period: 30s
  volumes:
    - kafkadata:/var/lib/kafka/data
```

Named volumes added to the volumes section:
```yaml
volumes:
  kafkadata:
  zookeeperdata:
```

### Environment Variables

```env
STREAMING_BACKEND=kafka           # Options: kafka, memory (default: memory)
KAFKA_BROKERS=localhost:9092
FEATURE_STORE_BACKEND=redis       # Options: redis, memory (default: memory)
```

Note: `FEATURE_STORE_BACKEND` is separate from `CACHE_BACKEND` (which controls LLM cache and pattern memory). This allows running Redis for feature store but in-memory for LLM cache, or vice versa.

### Streaming Factory

New file: `backend/streaming/streaming-factory.js`

```
getStreamingBackend()
  ├── STREAMING_BACKEND=kafka  → KafkaStreamEngine (KafkaJS)
  └── STREAMING_BACKEND=memory → existing StreamEngine (default)
```

### KafkaStreamEngine

New file: `backend/streaming/kafka-stream-engine.js`

Wraps KafkaJS client. Implements the same interface as `StreamEngine`:
- `produce(topicName, key, value)` — KafkaJS producer.send()
- `createConsumerGroup(groupId, topicName)` — KafkaJS consumer.subscribe() + run()
- `getTopics()` — admin.listTopics()
- `getStats()` — broker metadata, partition info, consumer lag
- Constructor auto-creates the 14 default topics (8 transaction + 6 onboarding)
- Bridges to event bus for WebSocket clients (same as in-process engine)
- Graceful fallback: 5-second connection timeout, 3 retries with exponential backoff. If Kafka unreachable after retries, logs warning and returns in-process engine singleton. Matches the pattern in `database-factory.js` for Postgres connection failure

### Dependencies

```
npm install kafkajs
```

### Integration Points

- `server.js`: Replace `getStreamEngine()` with `getStreamingBackend()`
- `onboarding-pipeline.js`: Use factory instead of direct import
- `seller-onboarding/index.js`: Use factory for event publishing
- `seller-onboarding-agent.js`: `ingest_to_data_pipeline` tool uses factory

---

## 2. Infrastructure: Redis

### Feature Store Redis Backend

New file: `backend/streaming/feature-store-redis.js`

- Key pattern: `features:{entityId}:{group}`
- Operations: Redis HSET/HGET for features, EXPIRE for TTL
- Same API as `FeatureStore`: `getFeatures(entityId, group)`, `putFeatures(entityId, group, features)`
- Stats tracking: reads, writes, hits, misses (same interface)

### Feature Store Factory

New file: `backend/streaming/feature-store-factory.js`

```
getFeatureStoreBackend()
  ├── FEATURE_STORE_BACKEND=redis  → FeatureStoreRedis
  └── FEATURE_STORE_BACKEND=memory → existing FeatureStore (default)
```

Uses separate env var `FEATURE_STORE_BACKEND` (not `CACHE_BACKEND`) to avoid collision with the LLM cache factory.

### Shared Redis Client

New file: `backend/shared/common/redis-client.js`

Singleton Redis client shared by all Redis-backed components (feature store, prediction cache, and existing LLM cache/pattern memory). All import via `getRedisClient()` factory. Reads `REDIS_URL` from env (default: `redis://localhost:6380`).

### Fix existing feature-store.js

The existing `feature-store.js` imports `db_ops` directly from `database.js`, violating the factory pattern. Update to use `getDbOps()` from `database-factory.js` for offline store persistence.

### ML Prediction Cache

New file: `backend/services/ml-platform/inference/prediction-cache-redis.js`

- Key pattern: `prediction_cache:{featureVectorHash}`
- Value: `{ score, decision, confidence, modelVersion, cachedAt }`
- TTL: 5 minutes
- Hash: SHA-256 of normalized feature vector JSON

Integration in `run_ml_inference` tool (seller-onboarding-agent.js):
1. Hash the 25-feature normalized vector
2. Check Redis: `GET prediction_cache:{hash}`
3. If hit → return cached result (skip TF.js forward pass)
4. If miss → run TF.js inference → `SET prediction_cache:{hash}` with 5min TTL

### Graceful Fallback

- Redis unavailable → in-memory feature store (existing behavior)
- Prediction cache miss or Redis down → always runs TF.js (no cache, no error)

---

## 3. Platform Pages: ML Platform (`/ml`)

### New "Onboarding Risk Model" Section

**Model Card:**
- Model ID: `onboarding-risk-v1`
- Framework: TensorFlow.js
- Architecture visualization: `25 → 128 (ReLU, dropout 0.3) → 64 (ReLU, dropout 0.2) → 32 (ReLU, dropout 0.15) → 1 (sigmoid)`
- Version: 1.0.0
- Live stats: predictions count, avg latency, loaded status (from `/api/ml/inference/health`)

**25-Feature Table (expandable):**
- Feature name, description, min/max range, importance weight
- Sortable by importance
- Data from new endpoint `/api/ml/inference/feature-importance/onboarding`

**Test Inference (interactive):**
- Form with key seller parameters (country, category, business age, etc.)
- "Run Inference" button calls new endpoint `POST /api/ml/inference/test`
- Shows: score with color bar, decision, SHAP feature contributions, latency
- Risk breakdown radar/bar chart (identity, financial, compliance, behavioral, network)

**Decision Thresholds (two layers):**

There are two threshold layers that work together:

1. **Pipeline thresholds** (in `onboarding-pipeline.js` and `platform-integrator.js`): score > 0.75 → REJECT, > 0.45 → REVIEW, ≤ 0.45 → APPROVE. These are the primary decisioning thresholds applied during the TPAOR agent loop.

2. **Decision rules** (in rules engine): `RULE-ML-ONBOARDING-001` (score > 0.55 → REVIEW) and `RULE-ML-ONBOARDING-002` (score > 0.80 → BLOCK). These are overlay rules evaluated by the platform integrator's rules layer, applied after the ML layer.

The UI should show both layers with a visual score bar marking all thresholds, and explain that pipeline thresholds are the primary layer while rules provide additional override capability.

---

## 4. Platform Pages: Data Platform (`/data`)

### New "Onboarding Streaming Pipeline" Section

**Pipeline Visualization:**
- 6-stage flow: Ingest → Enrich → Feature Extract → Score → Decide → Emit
- Each stage shows: messages processed, avg latency, error count
- Live stats from new endpoint `GET /api/streaming/onboarding/stats`

**Streaming Backend Indicator:**
- Shows "Apache Kafka" or "In-Process Engine" with connection status (green/red dot)
- If Kafka: broker info, partition count, consumer group lag
- If in-process: topic count, message count, retention policy

**Feature Store Panel:**
- Backend indicator: "Redis" or "In-Memory"
- Feature group: `seller_onboarding` — TTL: 10min, status, hit/miss rate
- Sample features from last write (same data as Platform Integration panel)

**Data Catalog Entry:**
- `DS-ONBOARDING-FEATURES` dataset card
- Schema: 25 fields with types and descriptions
- Lineage: Seller Application → Feature Extraction → Feature Store → ML Model
- Model reference: `onboarding-risk-v1`

---

## 5. Platform Pages: Decision Engine (`/decisions`)

### New "ML-Linked Rules" Section

**Onboarding Rules Highlight:**
- `RULE-ML-ONBOARDING-001`: ML score > 0.55 → REVIEW (priority 10)
- `RULE-ML-ONBOARDING-002`: ML score > 0.80 → BLOCK (priority 5)
- Status badge (ACTIVE), last triggered timestamp, trigger count

**ML Score → Rule → Action Flow:**
- Visual: Score bar with threshold markers at 0.55 and 0.80
- Shows how ML output feeds into rule evaluation
- Rule performance stats: triggers, false positive rate

**Platform Integrator Connection:**
- Shows that rules are evaluated via `platform-integrator.js`
- Three-layer evaluation: ML Score → Rules Engine → Experimentation
- Domain routing: onboarding domain → onboarding model (vs fraud model)

---

## 6. Platform Pages: Experimentation (`/experiments`)

### New "Onboarding Model Experiment" Section

**Pre-seeded Experiment:**
- Type: CHAMPION_CHALLENGER
- Champion: Current thresholds (0.55 REVIEW, 0.80 BLOCK)
- Challenger: Adjusted thresholds (0.50 REVIEW, 0.75 BLOCK)
- Metrics: approval rate, review rate, block rate by variant

**How It Works:**
- Shows experimentation flow for ML model changes
- Traffic split visualization
- Statistical significance indicators (chi-square, p-value)
- Link to model on ML page, link to rules on Decisioning page

---

## 7. New API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/streaming/onboarding/stats` | GET | Per-stage pipeline metrics, backend type, Kafka status |
| `/api/ml/inference/models/onboarding-risk-v1` | GET | Model details, architecture, feature definitions, stats |
| `/api/ml/inference/feature-importance/onboarding` | GET | 25 features with importance weights and descriptions |
| `/api/ml/inference/test` | POST | Test inference with custom features, returns score + SHAP |
| `/api/streaming/backend` | GET | Current streaming backend (kafka/memory), connection info |
| `/api/features/stats` | GET | Feature store backend, hit rate, group status |
| `/api/ml/inference/cache/stats` | GET | Prediction cache hit/miss rate, entries, backend |

---

## 8. Graceful Fallback Chain

Every component degrades cleanly when Docker services aren't available:

| Component | Docker Up | Docker Down |
|---|---|---|
| Streaming | Apache Kafka (real topics, partitions, consumer groups) | In-process stream engine |
| Feature Store | Redis (HSET/HGET with native TTL) | In-memory Map with manual TTL |
| Prediction Cache | Redis (SHA-256 keyed, 5min TTL) | No cache, always runs TF.js |
| ML Inference | TF.js in-process (always) | TF.js in-process (always) |

---

## 9. File Inventory

### New Files (9)

| File | Purpose |
|---|---|
| `backend/streaming/streaming-factory.js` | Factory: Kafka vs in-process |
| `backend/streaming/kafka-stream-engine.js` | KafkaJS wrapper with same StreamEngine API |
| `backend/streaming/feature-store-redis.js` | Redis-backed feature store |
| `backend/streaming/feature-store-factory.js` | Factory: Redis vs in-memory feature store |
| `backend/shared/common/redis-client.js` | Shared Redis client singleton for all Redis-backed components |
| `backend/services/ml-platform/inference/prediction-cache-redis.js` | Redis ML prediction cache |
| `backend/services/ml-platform/inference/onboarding-endpoints.js` | New API endpoints for onboarding model details |
| `backend/streaming/onboarding-stats-endpoint.js` | API endpoint for pipeline stats |
| `backend/streaming/feature-stats-endpoint.js` | API endpoint for feature store stats |

### Modified Files (11)

| File | Changes |
|---|---|
| `docker-compose.yml` | Add Kafka + Zookeeper services with healthchecks, volumes |
| `.env` | Add STREAMING_BACKEND, KAFKA_BROKERS, FEATURE_STORE_BACKEND |
| `package.json` | Add kafkajs dependency |
| `backend/gateway/server.js` | Use streaming factory, mount new endpoints, seed experiment |
| `backend/streaming/onboarding-pipeline.js` | Use streaming factory |
| `backend/streaming/feature-store.js` | Fix db_ops import to use database-factory |
| `backend/agents/specialized/seller-onboarding-agent.js` | Add Redis prediction cache to run_ml_inference tool |
| `src/pages/MLPlatform.jsx` | Add onboarding model section with test inference |
| `src/pages/DataPlatform.jsx` | Add pipeline visualization and feature store panel |
| `src/pages/DecisionEngine.jsx` | Add ML-linked rules section |
| `src/pages/Experimentation.jsx` | Add onboarding experiment section |

---

## 10. Testing Checklist

- [ ] Backend starts without Docker (all fallbacks work)
- [ ] `docker-compose up kafka redis` starts cleanly
- [ ] Backend detects Kafka and switches streaming backend
- [ ] Onboarding events flow through real Kafka topics
- [ ] Feature store reads/writes use Redis when available
- [ ] Prediction cache hits avoid TF.js re-inference
- [ ] ML page shows model architecture and 25 features
- [ ] ML page test inference returns score + SHAP
- [ ] Data page shows pipeline stages with live metrics
- [ ] Data page shows streaming backend (Kafka/in-process) status
- [ ] Decisioning page highlights ML-linked onboarding rules
- [ ] Experimentation page shows onboarding experiment
- [ ] All pages load without errors when Docker is down
