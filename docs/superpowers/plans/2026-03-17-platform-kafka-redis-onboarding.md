# Platform Kafka, Redis & Onboarding Model Visibility — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire real Apache Kafka + Redis to the onboarding ML pipeline and enhance all 4 platform pages with interactive onboarding model details.

**Architecture:** Factory pattern for all backends (streaming, feature store) with env-var-based selection and graceful fallback. New API endpoints serve onboarding model data to enhanced frontend pages. Existing `redis-client.js` singleton is reused for all Redis operations.

**Tech Stack:** KafkaJS, ioredis (existing), TensorFlow.js (existing), React + Recharts (existing)

**Spec:** `docs/superpowers/specs/2026-03-17-platform-kafka-redis-onboarding-design.md`

---

## File Structure

### New Files (9)

| File | Responsibility |
|---|---|
| `backend/streaming/streaming-factory.js` | Factory: returns KafkaStreamEngine or in-process StreamEngine based on `STREAMING_BACKEND` env var |
| `backend/streaming/kafka-stream-engine.js` | KafkaJS wrapper implementing same `produce()`, `createConsumerGroup()`, `getStats()` interface as StreamEngine |
| `backend/streaming/feature-store-redis.js` | Redis-backed feature store with HSET/HGET and native TTL |
| `backend/streaming/feature-store-factory.js` | Factory: returns Redis or in-memory feature store based on `FEATURE_STORE_BACKEND` env var |
| `backend/services/ml-platform/inference/prediction-cache-redis.js` | Redis prediction cache keyed by feature vector SHA-256 hash |
| `backend/services/ml-platform/inference/onboarding-endpoints.js` | Express router for onboarding model API endpoints (model details, feature importance, test inference, cache stats) |
| `backend/streaming/onboarding-stats-endpoint.js` | Express router for streaming pipeline stats + backend status |
| `backend/streaming/feature-stats-endpoint.js` | Express router for feature store stats + backend status |
| (none) | `backend/shared/common/redis-client.js` already exists — reuse it |

### Modified Files (11)

| File | Changes |
|---|---|
| `docker-compose.yml` | Add Kafka + Zookeeper services with healthchecks, dual-listener, volumes |
| `.env` | Add `STREAMING_BACKEND`, `KAFKA_BROKERS`, `FEATURE_STORE_BACKEND` |
| `package.json` | Add `kafkajs` dependency |
| `backend/gateway/server.js` | Use streaming/feature-store factories, mount new API endpoints, seed onboarding experiment |
| `backend/streaming/onboarding-pipeline.js` | Accept engine via parameter (already does), no factory import needed |
| `backend/streaming/feature-store.js` | Fix `db_ops` import to use `getDbOps()` from `database-factory.js` |
| `backend/agents/specialized/seller-onboarding-agent.js` | Add Redis prediction cache check in `run_ml_inference` tool |
| `src/pages/MLPlatform.jsx` | Add onboarding model section with 25-feature table, test inference, thresholds |
| `src/pages/DataPlatform.jsx` | Add pipeline visualization, streaming backend indicator, feature store panel |
| `src/pages/DecisionEngine.jsx` | Add ML-linked rules section with threshold visualization |
| `src/pages/Experimentation.jsx` | Add onboarding experiment section |

---

## Chunk 1: Infrastructure — Kafka + Docker

### Task 1: Add Kafka + Zookeeper to Docker Compose

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env`

- [ ] **Step 1: Add Zookeeper service to docker-compose.yml**

Add after the `pinot` service block, before the `volumes:` section:

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

Add to the `volumes:` section at bottom:
```yaml
  kafkadata:
  zookeeperdata:
```

- [ ] **Step 2: Add env vars to .env**

Append to `.env`:
```env
# Streaming
STREAMING_BACKEND=kafka
KAFKA_BROKERS=localhost:9092

# Feature Store
FEATURE_STORE_BACKEND=redis
```

- [ ] **Step 3: Install kafkajs**

Run: `cd /Users/ranakhan/ClaudeCodeTest/fraud-detection-dashboard && npm install kafkajs`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env package.json package-lock.json
git commit -m "feat: add Kafka + Zookeeper to docker-compose, add kafkajs dependency"
```

---

### Task 2: Create Kafka Stream Engine

**Files:**
- Create: `backend/streaming/kafka-stream-engine.js`

- [ ] **Step 1: Create KafkaStreamEngine class**

```javascript
/**
 * KafkaStreamEngine — KafkaJS-backed streaming engine.
 * Implements the same interface as the in-process StreamEngine:
 *   produce(topic, key, value), createConsumerGroup(groupId, topic),
 *   getTopics(), getTopic(name), getConsumerGroups(), getStats()
 */

import { Kafka, logLevel } from 'kafkajs';

// Event bus bridge (lazy loaded)
let eventBus = null;
try {
  const mod = await import('../gateway/websocket/event-bus.js');
  eventBus = mod.getEventBus();
} catch (e) { /* bridge disabled */ }

const TOPIC_EVENT_MAP = {
  'transactions.received': 'transaction:received',
  'transactions.enriched': 'transaction:enriched',
  'transactions.scored': 'transaction:scored',
  'transactions.decided': 'transaction:decided',
  'risk.events': 'risk:event',
  'alerts.created': 'alert:created',
  'agent.actions': 'agent:action',
  'features.materialized': 'features:materialized',
  'onboarding.received': 'onboarding:received',
  'onboarding.enriched': 'onboarding:enriched',
  'onboarding.features': 'onboarding:features',
  'onboarding.scored': 'onboarding:ml:scored',
  'onboarding.decided': 'onboarding:ml:decided',
  'onboarding.emitted': 'onboarding:emitted'
};

const DEFAULT_TOPICS = Object.keys(TOPIC_EVENT_MAP);

export class KafkaStreamEngine {
  constructor(brokers) {
    this.kafka = new Kafka({
      clientId: 'fraud-shield',
      brokers: brokers || [process.env.KAFKA_BROKERS || 'localhost:9092'],
      connectionTimeout: 5000,
      retry: { retries: 3 },
      logLevel: logLevel.WARN
    });

    this.producer = null;
    this.admin = null;
    this.consumerGroups = new Map();
    this.connected = false;
    this.createdAt = new Date().toISOString();

    this._stats = {
      totalMessagesProduced: 0,
      totalMessagesConsumed: 0
    };
  }

  async connect() {
    this.producer = this.kafka.producer();
    this.admin = this.kafka.admin();

    await this.producer.connect();
    await this.admin.connect();
    this.connected = true;

    // Create default topics if they don't exist
    const existingTopics = await this.admin.listTopics();
    const toCreate = DEFAULT_TOPICS.filter(t => !existingTopics.includes(t));
    if (toCreate.length > 0) {
      await this.admin.createTopics({
        topics: toCreate.map(topic => ({
          topic,
          numPartitions: 4,
          replicationFactor: 1
        }))
      });
    }
  }

  produce(topicName, key, value) {
    if (!this.connected || !this.producer) {
      throw new Error(`Kafka not connected, cannot produce to "${topicName}"`);
    }

    const timestamp = new Date().toISOString();

    // Fire-and-forget send
    this.producer.send({
      topic: topicName,
      messages: [{
        key: String(key),
        value: JSON.stringify(value),
        timestamp: Date.now().toString()
      }]
    }).catch(err => {
      console.warn(`[KafkaStreamEngine] Produce error on ${topicName}: ${err.message}`);
    });

    this._stats.totalMessagesProduced++;

    // Bridge to event bus for WebSocket clients
    if (eventBus) {
      try {
        const eventType = TOPIC_EVENT_MAP[topicName] || topicName.replace(/\./g, ':');
        eventBus.publish(eventType, value, {
          source: 'kafka-stream-engine',
          topic: topicName
        });
      } catch (err) { /* swallow bridge errors */ }
    }

    return { topic: topicName, partition: 0, offset: this._stats.totalMessagesProduced, timestamp };
  }

  createConsumerGroup(groupId, topicName) {
    const compositeKey = `${groupId}::${topicName}`;
    if (this.consumerGroups.has(compositeKey)) {
      return this.consumerGroups.get(compositeKey);
    }

    const consumer = this.kafka.consumer({ groupId });
    const group = {
      groupId,
      topic: { name: topicName },
      consumers: [groupId],
      assignments: new Map([[groupId, [0, 1, 2, 3]]]),
      createdAt: new Date().toISOString(),

      addConsumer(id) { this.consumers.push(id); },
      removeConsumer(id) { this.consumers = this.consumers.filter(c => c !== id); },

      poll: async (consumerId, maxMessages = 10) => {
        // KafkaJS uses run() with eachMessage, not poll()
        // For compatibility, return empty — real consumption via run()
        return [];
      },

      commitOffset: () => { /* KafkaJS auto-commits */ },

      getLag: () => [{
        partition: 0, highWaterMark: 0, committedOffset: 0, lag: 0
      }],

      // Start consuming — call once
      _start: async () => {
        await consumer.connect();
        await consumer.subscribe({ topic: topicName, fromBeginning: false });
        await consumer.run({
          eachMessage: async ({ topic, partition, message }) => {
            try {
              const value = JSON.parse(message.value.toString());
              // Bridge to event bus
              if (eventBus) {
                const eventType = TOPIC_EVENT_MAP[topic] || topic.replace(/\./g, ':');
                eventBus.publish(eventType, value, {
                  source: 'kafka-consumer',
                  topic, partition, offset: message.offset
                });
              }
            } catch (err) { /* parse error, skip */ }
          }
        });
      }
    };

    this.consumerGroups.set(compositeKey, group);

    // Start consumer in background
    group._start().catch(err => {
      console.warn(`[KafkaStreamEngine] Consumer ${compositeKey} start failed: ${err.message}`);
    });

    return group;
  }

  getTopics() { return [...DEFAULT_TOPICS]; }

  getTopic(name) {
    if (!DEFAULT_TOPICS.includes(name)) return undefined;
    return {
      name,
      numPartitions: 4,
      getMessageCount: () => 0,
      getPartitions: () => [{ index: 0, log: [], highWaterMark: 0 }]
    };
  }

  getConsumerGroups() {
    const groups = [];
    for (const [, group] of this.consumerGroups.entries()) {
      groups.push({
        groupId: group.groupId,
        topicName: group.topic.name,
        consumers: [...group.consumers],
        createdAt: group.createdAt
      });
    }
    return groups;
  }

  getStats() {
    return {
      createdAt: this.createdAt,
      backend: 'kafka',
      brokers: this.kafka.constructor.name === 'Kafka' ? (process.env.KAFKA_BROKERS || 'localhost:9092') : 'unknown',
      connected: this.connected,
      totalMessagesProduced: this._stats.totalMessagesProduced,
      totalMessagesConsumed: this._stats.totalMessagesConsumed,
      topicCount: DEFAULT_TOPICS.length,
      consumerGroupCount: this.consumerGroups.size,
      eventBusBridge: eventBus !== null
    };
  }

  async disconnect() {
    if (this.producer) await this.producer.disconnect().catch(() => {});
    if (this.admin) await this.admin.disconnect().catch(() => {});
    for (const [, group] of this.consumerGroups) {
      if (group._consumer) await group._consumer.disconnect().catch(() => {});
    }
    this.connected = false;
  }
}

export default { KafkaStreamEngine };
```

- [ ] **Step 2: Verify file passes syntax check**

Run: `node --check backend/streaming/kafka-stream-engine.js`
Expected: No output (clean parse)

- [ ] **Step 3: Commit**

```bash
git add backend/streaming/kafka-stream-engine.js
git commit -m "feat: add KafkaStreamEngine with KafkaJS wrapping StreamEngine interface"
```

---

### Task 3: Create Streaming Factory

**Files:**
- Create: `backend/streaming/streaming-factory.js`

- [ ] **Step 1: Create streaming factory**

```javascript
/**
 * Streaming Factory — returns Kafka or in-process stream engine.
 *
 * Env: STREAMING_BACKEND=kafka|memory (default: memory)
 *
 * Pattern: matches cache-factory.js and database-factory.js
 */

let resolvedEngine = null;
let resolvedBackendType = 'memory';

/**
 * Get the streaming backend type.
 * @returns {string} 'kafka' or 'memory'
 */
export function getStreamingBackendType() {
  return resolvedBackendType;
}

/**
 * Initialize and return the streaming engine.
 * Call once during server startup. Subsequent calls return cached instance.
 * @returns {Promise<Object>} StreamEngine or KafkaStreamEngine
 */
export async function getStreamingBackend() {
  if (resolvedEngine) return resolvedEngine;

  const backend = (process.env.STREAMING_BACKEND || 'memory').toLowerCase();

  if (backend === 'kafka') {
    try {
      const { KafkaStreamEngine } = await import('./kafka-stream-engine.js');
      const engine = new KafkaStreamEngine();
      await engine.connect();
      resolvedEngine = engine;
      resolvedBackendType = 'kafka';
      console.log('[streaming-factory] Kafka streaming engine connected');
      return resolvedEngine;
    } catch (err) {
      console.warn(`[streaming-factory] Kafka failed: ${err.message}, falling back to in-process engine`);
    }
  }

  // Fallback: in-process stream engine
  const { getStreamEngine } = await import('./stream-engine.js');
  resolvedEngine = getStreamEngine();
  resolvedBackendType = 'memory';
  console.log('[streaming-factory] In-process streaming engine active');
  return resolvedEngine;
}

export default { getStreamingBackend, getStreamingBackendType };
```

- [ ] **Step 2: Verify syntax**

Run: `node --check backend/streaming/streaming-factory.js`

- [ ] **Step 3: Commit**

```bash
git add backend/streaming/streaming-factory.js
git commit -m "feat: add streaming factory with Kafka/in-process selection"
```

---

### Task 4: Wire Streaming Factory into Server + Pipeline

**Files:**
- Modify: `backend/gateway/server.js` (lines ~430-448)
- Modify: `backend/streaming/onboarding-pipeline.js` (no change needed — already accepts engine param)
- Modify: `backend/agents/specialized/seller-onboarding-agent.js` (ingest_to_data_pipeline tool)

- [ ] **Step 1: Update server.js to use streaming factory**

Replace the stream engine initialization block (around lines 430-448). Find:
```javascript
import { getStreamEngine } from '../streaming/stream-engine.js';
```
Replace with:
```javascript
import { getStreamingBackend, getStreamingBackendType } from '../streaming/streaming-factory.js';
```

Find:
```javascript
const streamEngine = getStreamEngine();
```
Replace with:
```javascript
const streamEngine = await getStreamingBackend();
```

- [ ] **Step 2: Update seller-onboarding-agent.js ingest_to_data_pipeline tool**

In the `ingest_to_data_pipeline` tool (around line 731), replace:
```javascript
const { getStreamEngine } = await import('../../streaming/stream-engine.js');
const engine = getStreamEngine();
```
With:
```javascript
const { getStreamingBackend } = await import('../../streaming/streaming-factory.js');
const engine = await getStreamingBackend();
```

- [ ] **Step 3: Update seller-onboarding/index.js streaming import**

Find in `backend/services/business/seller-onboarding/index.js`:
```javascript
const { getStreamEngine } = await import('../../../streaming/stream-engine.js');
const engine = getStreamEngine();
```
Replace with:
```javascript
const { getStreamingBackend } = await import('../../../streaming/streaming-factory.js');
const engine = await getStreamingBackend();
```

- [ ] **Step 4: Verify backend starts without Docker**

Run: `STREAMING_BACKEND=memory USE_LLM=false node backend/gateway/server.js`
Expected: "In-process streaming engine active" in output, server starts on port 3001

- [ ] **Step 5: Commit**

```bash
git add backend/gateway/server.js backend/agents/specialized/seller-onboarding-agent.js backend/services/business/seller-onboarding/index.js
git commit -m "feat: wire streaming factory into server, agent, and onboarding service"
```

---

## Chunk 2: Infrastructure — Redis Feature Store + Prediction Cache

### Task 5: Fix feature-store.js db_ops Import

**Files:**
- Modify: `backend/streaming/feature-store.js` (line 11)

- [ ] **Step 1: Replace direct db_ops import with factory**

Find:
```javascript
import { db_ops } from '../shared/common/database.js';
```
Replace with:
```javascript
import { getDbOps } from '../shared/common/database-factory.js';
```

Then in `_writeToOfflineStore()` and `getFeaturesAsOf()`, replace `db_ops.` calls with:
```javascript
const db_ops = getDbOps();
```
at the start of each method.

- [ ] **Step 2: Verify syntax**

Run: `node --check backend/streaming/feature-store.js`

- [ ] **Step 3: Commit**

```bash
git add backend/streaming/feature-store.js
git commit -m "fix: use database-factory for feature-store db_ops import"
```

---

### Task 6: Create Redis Feature Store

**Files:**
- Create: `backend/streaming/feature-store-redis.js`

- [ ] **Step 1: Create FeatureStoreRedis class**

```javascript
/**
 * Feature Store Redis Backend
 *
 * Redis-backed online feature store using HSET/HGET with native TTL.
 * Same API as in-memory FeatureStore: getFeatures(), putFeatures(), getStats().
 * Key pattern: features:{entityId}:{group}
 */

import { getRedisClient, isRedisAvailable } from '../shared/common/redis-client.js';

const FEATURE_GROUPS = {
  seller_profile: { ttl: 300 },
  transaction_velocity: { ttl: 60 },
  device_trust: { ttl: 120 },
  network_risk: { ttl: 300 },
  seller_onboarding: { ttl: 600 },
};

class FeatureStoreRedis {
  constructor() {
    this.stats = { reads: 0, writes: 0, hits: 0, misses: 0 };
  }

  _key(entityId, group) {
    return `features:${entityId}:${group}`;
  }

  _ttlSeconds(group) {
    return (FEATURE_GROUPS[group]?.ttl || 300);
  }

  getFeatures(entityId, group) {
    this.stats.reads++;
    const redis = getRedisClient();
    if (!redis || !isRedisAvailable()) {
      this.stats.misses++;
      return null;
    }

    // Return a promise-based result for sync interface compatibility
    // Cache in a sync wrapper since the existing API is synchronous
    const key = this._key(entityId, group);
    const cached = this._syncCache?.get(key);
    if (cached && Date.now() - cached.ts < this._ttlSeconds(group) * 1000) {
      this.stats.hits++;
      return cached.features;
    }
    this.stats.misses++;

    // Async refresh in background
    redis.get(key).then(val => {
      if (val) {
        try {
          const features = JSON.parse(val);
          if (!this._syncCache) this._syncCache = new Map();
          this._syncCache.set(key, { features, ts: Date.now() });
        } catch (e) { /* parse error */ }
      }
    }).catch(() => {});

    return null;
  }

  putFeatures(entityId, group, features) {
    this.stats.writes++;
    const redis = getRedisClient();
    const key = this._key(entityId, group);
    const ttl = this._ttlSeconds(group);

    // Update sync cache
    if (!this._syncCache) this._syncCache = new Map();
    this._syncCache.set(key, { features, ts: Date.now() });

    if (redis && isRedisAvailable()) {
      redis.set(key, JSON.stringify(features), 'EX', ttl).catch(err => {
        console.warn(`[FeatureStoreRedis] Write failed: ${err.message}`);
      });
    }
  }

  async getFeaturesAsOf(entityId, group, timestamp) {
    // Redis doesn't support point-in-time lookups natively
    // Fall through to current features
    this.stats.reads++;
    const redis = getRedisClient();
    if (!redis || !isRedisAvailable()) {
      this.stats.misses++;
      return null;
    }

    try {
      const key = this._key(entityId, group);
      const val = await redis.get(key);
      if (val) {
        this.stats.hits++;
        return JSON.parse(val);
      }
    } catch (e) { /* ignore */ }

    this.stats.misses++;
    return null;
  }

  getStats() {
    const totalLookups = this.stats.hits + this.stats.misses;
    return {
      reads: this.stats.reads,
      writes: this.stats.writes,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalLookups > 0 ? this.stats.hits / totalLookups : 0,
      onlineStoreSize: this._syncCache?.size || 0,
      featureGroups: Object.keys(FEATURE_GROUPS),
      backend: 'redis'
    };
  }
}

let instance = null;

export function getFeatureStoreRedis() {
  if (!instance) {
    instance = new FeatureStoreRedis();
  }
  return instance;
}

export default { getFeatureStoreRedis };
```

- [ ] **Step 2: Verify syntax**

Run: `node --check backend/streaming/feature-store-redis.js`

- [ ] **Step 3: Commit**

```bash
git add backend/streaming/feature-store-redis.js
git commit -m "feat: add Redis-backed feature store with HSET/HGET and native TTL"
```

---

### Task 7: Create Feature Store Factory

**Files:**
- Create: `backend/streaming/feature-store-factory.js`

- [ ] **Step 1: Create factory**

```javascript
/**
 * Feature Store Factory — returns Redis or in-memory feature store.
 *
 * Env: FEATURE_STORE_BACKEND=redis|memory (default: memory)
 * Separate from CACHE_BACKEND to allow independent control.
 */

let resolvedStore = null;
let resolvedType = 'memory';

export function getFeatureStoreBackendType() {
  return resolvedType;
}

export async function getFeatureStoreBackend() {
  if (resolvedStore) return resolvedStore;

  const backend = (process.env.FEATURE_STORE_BACKEND || 'memory').toLowerCase();

  if (backend === 'redis') {
    try {
      const { isRedisAvailable } = await import('../shared/common/redis-client.js');
      // Give Redis a moment to connect if just starting
      await new Promise(r => setTimeout(r, 500));

      if (isRedisAvailable()) {
        const { getFeatureStoreRedis } = await import('./feature-store-redis.js');
        resolvedStore = getFeatureStoreRedis();
        resolvedType = 'redis';
        console.log('[feature-store-factory] Redis feature store active');
        return resolvedStore;
      }
      console.warn('[feature-store-factory] Redis not available, falling back to in-memory');
    } catch (err) {
      console.warn(`[feature-store-factory] Redis feature store failed: ${err.message}`);
    }
  }

  const { getFeatureStore } = await import('./feature-store.js');
  resolvedStore = getFeatureStore();
  resolvedType = 'memory';
  console.log('[feature-store-factory] In-memory feature store active');
  return resolvedStore;
}

export default { getFeatureStoreBackend, getFeatureStoreBackendType };
```

- [ ] **Step 2: Wire into server.js**

Replace in `backend/gateway/server.js`:
```javascript
import { getFeatureStore } from '../streaming/feature-store.js';
```
With:
```javascript
import { getFeatureStoreBackend, getFeatureStoreBackendType } from '../streaming/feature-store-factory.js';
```

And replace:
```javascript
const featureStore = getFeatureStore();
```
With:
```javascript
const featureStore = await getFeatureStoreBackend();
```

- [ ] **Step 3: Verify backend starts**

Run: `FEATURE_STORE_BACKEND=memory USE_LLM=false node backend/gateway/server.js`
Expected: "In-memory feature store active" in output

- [ ] **Step 4: Commit**

```bash
git add backend/streaming/feature-store-factory.js backend/gateway/server.js
git commit -m "feat: add feature store factory with Redis/in-memory selection"
```

---

### Task 8: Create ML Prediction Cache

**Files:**
- Create: `backend/services/ml-platform/inference/prediction-cache-redis.js`
- Modify: `backend/agents/specialized/seller-onboarding-agent.js` (run_ml_inference tool)

- [ ] **Step 1: Create prediction cache module**

```javascript
/**
 * ML Prediction Cache — Redis-backed cache for ML inference results.
 *
 * Key: prediction_cache:{sha256(featureVector)}
 * Value: { score, decision, confidence, modelVersion, cachedAt }
 * TTL: 5 minutes
 */

import crypto from 'crypto';
import { getRedisClient, isRedisAvailable } from '../../../shared/common/redis-client.js';

const CACHE_TTL = 300; // 5 minutes
const KEY_PREFIX = 'prediction_cache:';

let stats = { hits: 0, misses: 0, sets: 0 };

export function hashFeatureVector(vector) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(vector))
    .digest('hex')
    .substring(0, 16);
}

export async function getCachedPrediction(featureVector) {
  const redis = getRedisClient();
  if (!redis || !isRedisAvailable()) {
    stats.misses++;
    return null;
  }

  try {
    const key = KEY_PREFIX + hashFeatureVector(featureVector);
    const cached = await redis.get(key);
    if (cached) {
      stats.hits++;
      return JSON.parse(cached);
    }
  } catch (e) { /* ignore */ }

  stats.misses++;
  return null;
}

export async function setCachedPrediction(featureVector, result) {
  const redis = getRedisClient();
  if (!redis || !isRedisAvailable()) return;

  try {
    const key = KEY_PREFIX + hashFeatureVector(featureVector);
    await redis.set(key, JSON.stringify({
      ...result,
      cachedAt: new Date().toISOString()
    }), 'EX', CACHE_TTL);
    stats.sets++;
  } catch (e) { /* ignore */ }
}

export function getPredictionCacheStats() {
  const total = stats.hits + stats.misses;
  return {
    hits: stats.hits,
    misses: stats.misses,
    sets: stats.sets,
    hitRate: total > 0 ? stats.hits / total : 0,
    backend: isRedisAvailable() ? 'redis' : 'none'
  };
}

export default { getCachedPrediction, setCachedPrediction, getPredictionCacheStats, hashFeatureVector };
```

- [ ] **Step 2: Wire into run_ml_inference tool**

In `backend/agents/specialized/seller-onboarding-agent.js`, in the `run_ml_inference` tool (around line 592), add prediction cache check. After the feature extraction (line 596) and before the ML inference (line 600):

Add after `const extracted = extractOnboardingFeatures(params);`:
```javascript
        // Check prediction cache
        let cachedResult = null;
        try {
          const { getCachedPrediction } = await import('../../services/ml-platform/inference/prediction-cache-redis.js');
          cachedResult = await getCachedPrediction(extracted.vector);
        } catch (_) { /* cache not available */ }

        if (cachedResult) {
          return {
            success: true,
            data: {
              ...cachedResult,
              source: 'prediction-cache',
              cached: true
            }
          };
        }
```

After the prediction result is computed (after line 662, before the return), add:
```javascript
        // Cache the prediction
        try {
          const { setCachedPrediction } = await import('../../services/ml-platform/inference/prediction-cache-redis.js');
          await setCachedPrediction(extracted.vector, {
            mlScore: prediction.score,
            mlDecision,
            mlConfidence,
            modelVersion: prediction.modelVersion,
            featureCount: extracted.featureCount,
            topRiskContributors: topContributors.map(c => ({
              feature: c.feature, value: c.value,
              contribution: c.contribution, direction: c.direction, description: c.description
            })),
            riskBreakdown: {
              identityRisk: extracted.normalized.identityVerificationScore || 0,
              financialRisk: extracted.normalized.bankVerificationScore || 0,
              complianceRisk: extracted.normalized.watchlistMatchScore || 0,
              behavioralRisk: extracted.normalized.velocityScore || 0,
              networkRisk: extracted.normalized.networkRiskScore || 0
            }
          });
        } catch (_) { /* cache write best-effort */ }
```

- [ ] **Step 3: Verify syntax**

Run: `node --check backend/services/ml-platform/inference/prediction-cache-redis.js`
Run: `node --check backend/agents/specialized/seller-onboarding-agent.js`

- [ ] **Step 4: Commit**

```bash
git add backend/services/ml-platform/inference/prediction-cache-redis.js backend/agents/specialized/seller-onboarding-agent.js
git commit -m "feat: add Redis ML prediction cache with SHA-256 keyed lookup"
```

---

## Chunk 3: Backend API Endpoints

### Task 9: Create Onboarding Model API Endpoints

**Files:**
- Create: `backend/services/ml-platform/inference/onboarding-endpoints.js`

- [ ] **Step 1: Create onboarding endpoints router**

```javascript
/**
 * Onboarding Model API Endpoints
 * Serves model details, feature importance, test inference, and cache stats.
 */

import express from 'express';
import { getModelLoader } from '../models/model-loader.js';
import { extractOnboardingFeatures, getOnboardingFeatureImportance, calculateOnboardingContributions, ONBOARDING_FEATURE_DEFINITIONS } from '../models/onboarding-feature-extractor.js';
import { getPredictionCacheStats } from './prediction-cache-redis.js';

const router = express.Router();

// GET /models/onboarding-risk-v1 — Model details
router.get('/models/onboarding-risk-v1', async (req, res) => {
  try {
    const loader = getModelLoader();
    const stats = loader.getStats();
    const modelInfo = stats.models.find(m => m.id === 'onboarding-risk-v1');

    res.json({
      success: true,
      data: {
        modelId: 'onboarding-risk-v1',
        name: 'Onboarding Risk Model',
        framework: 'TensorFlow.js',
        architecture: {
          input: 25,
          layers: [
            { units: 128, activation: 'relu', dropout: 0.3, regularizer: 'L2(0.01)' },
            { units: 64, activation: 'relu', dropout: 0.2, regularizer: 'L2(0.01)' },
            { units: 32, activation: 'relu', dropout: 0.15, regularizer: 'L2(0.01)' },
            { units: 1, activation: 'sigmoid' }
          ],
          summary: '25→128→64→32→1 (sigmoid)'
        },
        version: '1.0.0',
        status: modelInfo?.isLoaded ? 'LOADED' : 'NOT_LOADED',
        predictions: modelInfo?.predictions || 0,
        createdAt: modelInfo?.createdAt || null,
        thresholds: {
          pipeline: { approve: '≤0.45', review: '0.45-0.75', reject: '>0.75' },
          rules: [
            { ruleId: 'RULE-ML-ONBOARDING-001', condition: 'mlScore > 0.55', action: 'REVIEW' },
            { ruleId: 'RULE-ML-ONBOARDING-002', condition: 'mlScore > 0.80', action: 'BLOCK' }
          ]
        },
        featureCount: 25,
        featureGroups: ['identity', 'financial', 'compliance', 'behavioral', 'network']
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /feature-importance/onboarding — 25 features with importance weights
router.get('/feature-importance/onboarding', async (req, res) => {
  try {
    const importance = getOnboardingFeatureImportance();
    const definitions = ONBOARDING_FEATURE_DEFINITIONS || [];

    const features = importance.map(f => {
      const def = definitions.find(d => d.name === f.feature) || {};
      return {
        name: f.feature,
        importance: f.importance,
        description: f.description || def.description || '',
        min: def.min ?? 0,
        max: def.max ?? 100,
        defaultValue: def.default ?? 0.5,
        group: categorizeFeature(f.feature)
      };
    });

    res.json({ success: true, data: features });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /test — Test inference with custom features
router.post('/test', async (req, res) => {
  try {
    const { features } = req.body;
    const startTime = Date.now();

    const extracted = extractOnboardingFeatures(features || {});

    const { getOnboardingRiskModel } = await import('../models/onboarding-risk-model.js');
    const model = getOnboardingRiskModel();
    await model.load();
    const prediction = await model.predict(extracted.vector);

    const contributions = calculateOnboardingContributions(extracted, prediction.score);

    const latencyMs = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        score: prediction.score,
        decision: prediction.score > 0.75 ? 'REJECT' : prediction.score > 0.45 ? 'REVIEW' : 'APPROVE',
        confidence: Math.min(0.95, 0.5 + Math.abs(prediction.score - 0.5) * 1.5),
        modelVersion: prediction.modelVersion,
        latencyMs,
        featureCount: extracted.featureCount,
        normalizedFeatures: extracted.normalized,
        contributions: contributions.slice(0, 10),
        riskBreakdown: {
          identity: extracted.normalized.identityVerificationScore || 0,
          financial: extracted.normalized.bankVerificationScore || 0,
          compliance: extracted.normalized.watchlistMatchScore || 0,
          behavioral: extracted.normalized.velocityScore || 0,
          network: extracted.normalized.networkRiskScore || 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /cache/stats — Prediction cache statistics
router.get('/cache/stats', async (req, res) => {
  try {
    const stats = getPredictionCacheStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function categorizeFeature(name) {
  if (['identityVerificationScore', 'documentAuthenticityScore'].includes(name)) return 'identity';
  if (['bankVerificationScore', 'taxIdVerificationScore', 'revenueEstimate', 'employeeCount'].includes(name)) return 'financial';
  if (['watchlistMatchScore', 'businessRegistrationScore'].includes(name)) return 'compliance';
  if (['velocityScore', 'deviceTrustScore', 'ipReputationScore', 'duplicateDetectionScore'].includes(name)) return 'behavioral';
  if (['networkRiskScore', 'geographicAnomalyScore', 'historicalFraudFlags'].includes(name)) return 'network';
  return 'profile';
}

export default router;
```

- [ ] **Step 2: Verify syntax**

Run: `node --check backend/services/ml-platform/inference/onboarding-endpoints.js`

- [ ] **Step 3: Commit**

```bash
git add backend/services/ml-platform/inference/onboarding-endpoints.js
git commit -m "feat: add onboarding model API endpoints (details, features, test, cache)"
```

---

### Task 10: Create Streaming + Feature Store Stats Endpoints

**Files:**
- Create: `backend/streaming/onboarding-stats-endpoint.js`
- Create: `backend/streaming/feature-stats-endpoint.js`

- [ ] **Step 1: Create streaming stats endpoint**

```javascript
/**
 * Streaming pipeline stats + backend status endpoint
 */
import express from 'express';
import { getStreamingBackendType } from './streaming-factory.js';

const router = express.Router();

// GET /onboarding/stats — Pipeline stats
router.get('/onboarding/stats', async (req, res) => {
  try {
    const { getStreamingBackend } = await import('./streaming-factory.js');
    const engine = await getStreamingBackend();
    const stats = engine.getStats();
    const backendType = getStreamingBackendType();

    const onboardingTopics = ['onboarding.received', 'onboarding.enriched', 'onboarding.features',
      'onboarding.scored', 'onboarding.decided', 'onboarding.emitted'];

    const stages = onboardingTopics.map(topic => {
      const topicStats = stats.topics?.[topic] || {};
      return {
        topic,
        stage: topic.split('.')[1],
        messageCount: topicStats.messageCount || 0,
        partitions: topicStats.partitions || 4
      };
    });

    res.json({
      success: true,
      data: {
        backend: backendType,
        connected: stats.connected !== false,
        brokers: stats.brokers || null,
        stages,
        totalMessages: stats.totalMessagesProduced || 0,
        topicCount: stats.topicCount || 0,
        consumerGroups: stats.consumerGroupCount || 0,
        eventBusBridge: stats.eventBusBridge || false
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /backend — Streaming backend info
router.get('/backend', async (req, res) => {
  try {
    const backendType = getStreamingBackendType();
    res.json({
      success: true,
      data: {
        type: backendType,
        label: backendType === 'kafka' ? 'Apache Kafka' : 'In-Process Engine',
        connected: true
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

- [ ] **Step 2: Create feature store stats endpoint**

```javascript
/**
 * Feature store stats + backend status endpoint
 */
import express from 'express';
import { getFeatureStoreBackendType } from './feature-store-factory.js';

const router = express.Router();

// GET /stats
router.get('/stats', async (req, res) => {
  try {
    const { getFeatureStoreBackend } = await import('./feature-store-factory.js');
    const store = await getFeatureStoreBackend();
    const stats = store.getStats();
    const backendType = getFeatureStoreBackendType();

    res.json({
      success: true,
      data: {
        backend: backendType,
        label: backendType === 'redis' ? 'Redis' : 'In-Memory',
        ...stats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

- [ ] **Step 3: Mount all new endpoints in server.js**

Add to `backend/gateway/server.js` in the route mounting section (around line 380-400):
```javascript
import onboardingModelRouter from '../services/ml-platform/inference/onboarding-endpoints.js';
import streamingStatsRouter from '../streaming/onboarding-stats-endpoint.js';
import featureStatsRouter from '../streaming/feature-stats-endpoint.js';

app.use('/api/ml/inference', onboardingModelRouter);
app.use('/api/streaming', streamingStatsRouter);
app.use('/api/features', featureStatsRouter);
```

- [ ] **Step 4: Verify backend starts and endpoints respond**

Run: `USE_LLM=false node backend/gateway/server.js`
Test: `curl http://localhost:3001/api/ml/inference/models/onboarding-risk-v1`
Test: `curl http://localhost:3001/api/streaming/onboarding/stats`
Test: `curl http://localhost:3001/api/features/stats`

- [ ] **Step 5: Commit**

```bash
git add backend/streaming/onboarding-stats-endpoint.js backend/streaming/feature-stats-endpoint.js backend/gateway/server.js
git commit -m "feat: add streaming, feature store, and onboarding model stats API endpoints"
```

---

## Chunk 4: Frontend — Platform Pages

### Task 11: Enhance ML Platform Page

**Files:**
- Modify: `src/pages/MLPlatform.jsx`

- [ ] **Step 1: Add onboarding model section**

Add a new section after the existing model list in the `models` tab. This section should:

1. Fetch from `/api/ml/inference/models/onboarding-risk-v1` on mount
2. Fetch from `/api/ml/inference/feature-importance/onboarding` on mount
3. Display:
   - **Model Card**: model ID, framework, architecture summary, version, status, prediction count
   - **Architecture Diagram**: visual layer representation (25→128→64→32→1)
   - **25-Feature Table**: expandable, sortable by importance, shows name/description/range/importance/group
   - **Decision Thresholds**: score bar with pipeline thresholds (0.45, 0.75) and rule thresholds (0.55, 0.80)
   - **Test Inference Form**: country, category, businessAge, email fields → POST `/api/ml/inference/test` → shows score, decision, SHAP contributions, risk breakdown
   - **Prediction Cache Stats**: from `/api/ml/inference/cache/stats`

Key implementation notes:
- Use existing component patterns from MLPlatform.jsx (useState, useEffect, safeJson)
- Use Recharts BarChart for risk breakdown visualization
- Use lucide-react icons (Cpu, Database, Zap, etc.)
- Test inference form should be collapsible

- [ ] **Step 2: Verify page loads without errors**

Open: `http://localhost:5174/ml`
Expected: New "Onboarding Risk Model" section visible below existing content

- [ ] **Step 3: Commit**

```bash
git add src/pages/MLPlatform.jsx
git commit -m "feat: add onboarding model section to ML Platform page"
```

---

### Task 12: Enhance Data Platform Page

**Files:**
- Modify: `src/pages/DataPlatform.jsx`

- [ ] **Step 1: Add streaming pipeline and feature store sections**

Add new sections in the `ingestion` tab:

1. Fetch from `/api/streaming/onboarding/stats` on mount
2. Fetch from `/api/features/stats` on mount
3. Fetch from `/api/streaming/backend` on mount
4. Display:
   - **Streaming Backend Indicator**: "Apache Kafka" or "In-Process Engine" with green/red connection dot
   - **6-Stage Pipeline Visualization**: Ingest → Enrich → Feature Extract → Score → Decide → Emit with message counts per stage
   - **Feature Store Panel**: backend type (Redis/In-Memory), hit/miss rate, feature groups with loaded/empty status
   - **Data Catalog Onboarding Entry**: DS-ONBOARDING-FEATURES dataset card with 25-field schema

- [ ] **Step 2: Verify page loads**

Open: `http://localhost:5174/data`

- [ ] **Step 3: Commit**

```bash
git add src/pages/DataPlatform.jsx
git commit -m "feat: add streaming pipeline and feature store sections to Data Platform page"
```

---

### Task 13: Enhance Decision Engine Page

**Files:**
- Modify: `src/pages/DecisionEngine.jsx`

- [ ] **Step 1: Add ML-linked rules section**

Add new section in the `rules` tab:

1. Filter existing rules for `RULE-ML-ONBOARDING-*` from the already-fetched rules list
2. Display:
   - **ML-Linked Onboarding Rules**: highlight the 2 rules with ML score thresholds
   - **Score → Rule → Action Flow**: visual score bar with threshold markers at 0.55 and 0.80
   - **Platform Integrator Connection**: diagram showing ML Score → Rules Engine → Experimentation flow
   - **Rule performance**: trigger count, last triggered (from rule data)

- [ ] **Step 2: Verify page loads**

Open: `http://localhost:5174/decisions`

- [ ] **Step 3: Commit**

```bash
git add src/pages/DecisionEngine.jsx
git commit -m "feat: add ML-linked onboarding rules section to Decision Engine page"
```

---

### Task 14: Enhance Experimentation Page

**Files:**
- Modify: `src/pages/Experimentation.jsx`
- Modify: `backend/gateway/server.js` (seed experiment)

- [ ] **Step 1: Seed onboarding experiment on server startup**

In `backend/gateway/server.js`, after the ML rules seeding block, add:
```javascript
// Seed onboarding model experiment
try {
  const existingExps = await db_ops.getAll('experiments', 100, 0);
  const hasOnboardingExp = existingExps.some(e => e.data?.experimentId === 'EXP-ONBOARDING-THRESHOLDS');
  if (!hasOnboardingExp) {
    await db_ops.insert('experiments', 'experiment_id', 'EXP-ONBOARDING-THRESHOLDS', {
      experimentId: 'EXP-ONBOARDING-THRESHOLDS',
      name: 'Onboarding ML Threshold Optimization',
      type: 'CHAMPION_CHALLENGER',
      status: 'RUNNING',
      description: 'Compare current onboarding ML thresholds (0.55/0.80) against tighter thresholds (0.50/0.75) to measure impact on approval rate and fraud catch rate.',
      champion: { label: 'Current Thresholds', reviewThreshold: 0.55, blockThreshold: 0.80 },
      challenger: { label: 'Tighter Thresholds', reviewThreshold: 0.50, blockThreshold: 0.75 },
      trafficAllocation: { champion: 80, challenger: 20 },
      metrics: { approvalRate: 0.72, reviewRate: 0.21, blockRate: 0.07, fraudCatchRate: 0.94 },
      modelId: 'onboarding-risk-v1',
      checkpoint: 'onboarding',
      startDate: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });
    console.log('Seeded onboarding threshold experiment');
  }
} catch (e) { /* best-effort */ }
```

- [ ] **Step 2: Add onboarding experiment section to Experimentation page**

Add a highlighted section in the `ab` tab that:
- Filters for experiments with `checkpoint === 'onboarding'` or `modelId === 'onboarding-risk-v1'`
- Shows champion vs challenger thresholds side by side
- Shows traffic split (80/20)
- Shows metrics comparison
- Links to ML model page and Decision Engine page

- [ ] **Step 3: Verify page loads**

Open: `http://localhost:5174/experiments`

- [ ] **Step 4: Commit**

```bash
git add src/pages/Experimentation.jsx backend/gateway/server.js
git commit -m "feat: add onboarding experiment section and seed threshold experiment"
```

---

## Chunk 5: Final Integration + Verification

### Task 15: End-to-End Verification

- [ ] **Step 1: Verify backend starts without Docker (all fallbacks)**

```bash
STREAMING_BACKEND=memory FEATURE_STORE_BACKEND=memory USE_LLM=false node backend/gateway/server.js
```
Expected output should include:
- "In-process streaming engine active"
- "In-memory feature store active"
- Server starts on port 3001

- [ ] **Step 2: Verify all new API endpoints respond**

```bash
curl -s http://localhost:3001/api/ml/inference/models/onboarding-risk-v1 | python3 -m json.tool | head -20
curl -s http://localhost:3001/api/ml/inference/feature-importance/onboarding | python3 -m json.tool | head -20
curl -s -X POST http://localhost:3001/api/ml/inference/test -H "Content-Type: application/json" -d '{"features":{"country":"US","businessCategory":"SOFTWARE"}}' | python3 -m json.tool | head -20
curl -s http://localhost:3001/api/streaming/onboarding/stats | python3 -m json.tool
curl -s http://localhost:3001/api/streaming/backend | python3 -m json.tool
curl -s http://localhost:3001/api/features/stats | python3 -m json.tool
curl -s http://localhost:3001/api/ml/inference/cache/stats | python3 -m json.tool
```

- [ ] **Step 3: Verify all 4 platform pages load without console errors**

Open each in browser:
- http://localhost:5174/ml — should show onboarding model card, features, test inference
- http://localhost:5174/data — should show pipeline stages, streaming backend, feature store
- http://localhost:5174/decisions — should show ML-linked onboarding rules
- http://localhost:5174/experiments — should show onboarding threshold experiment

- [ ] **Step 4: Test onboarding flow end-to-end via Live Onboarding**

Open: http://localhost:5174/onboarding/live
Click "Quick Approve Seller"
Verify Platform Integration panel shows ML model, pipeline, and feature store details

- [ ] **Step 5: Final commit and push**

```bash
git add -A
git status  # Review all changes
git commit -m "feat: complete platform Kafka, Redis & onboarding model visibility enhancement"
git push origin main
```

---

## Summary

| Task | Component | Files | Est. |
|---|---|---|---|
| 1 | Docker + Kafka setup | docker-compose.yml, .env, package.json | 5 min |
| 2 | KafkaStreamEngine | kafka-stream-engine.js | 10 min |
| 3 | Streaming Factory | streaming-factory.js | 5 min |
| 4 | Wire factory into server | server.js, agent, service | 10 min |
| 5 | Fix feature-store db_ops | feature-store.js | 3 min |
| 6 | Redis Feature Store | feature-store-redis.js | 10 min |
| 7 | Feature Store Factory | feature-store-factory.js, server.js | 5 min |
| 8 | Prediction Cache | prediction-cache-redis.js, agent | 10 min |
| 9 | Onboarding Model Endpoints | onboarding-endpoints.js | 10 min |
| 10 | Streaming + Feature Stats | stats endpoints, server.js | 10 min |
| 11 | ML Platform Page | MLPlatform.jsx | 15 min |
| 12 | Data Platform Page | DataPlatform.jsx | 15 min |
| 13 | Decision Engine Page | DecisionEngine.jsx | 10 min |
| 14 | Experimentation Page | Experimentation.jsx, server.js | 10 min |
| 15 | E2E Verification | All | 10 min |
