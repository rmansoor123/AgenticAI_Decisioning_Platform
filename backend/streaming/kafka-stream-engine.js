/**
 * KafkaStreamEngine - Real Apache Kafka streaming engine via KafkaJS.
 * Implements the same interface as the in-process StreamEngine so it can
 * be used interchangeably via the streaming-factory.
 *
 * Interface parity with stream-engine.js:
 *   produce(topicName, key, value)
 *   createConsumerGroup(groupId, topicName)
 *   getTopics()
 *   getTopic(name)
 *   getConsumerGroups()
 *   getStats()
 *   connect()
 */

import { Kafka, logLevel } from 'kafkajs';

// ---------------------------------------------------------------------------
// Event bus bridge - lazy loaded so the engine works standalone
// ---------------------------------------------------------------------------
let eventBus = null;
try {
  const mod = await import('../gateway/websocket/event-bus.js');
  eventBus = mod.getEventBus();
} catch (e) {
  // Event bus not available; bridge disabled
}

// ---------------------------------------------------------------------------
// Topic-name-to-event-type mapping for the event bus bridge
// Mirrors the mapping in stream-engine.js exactly.
// ---------------------------------------------------------------------------
const TOPIC_EVENT_MAP = {
  'transactions.received': 'transaction:received',
  'transactions.enriched': 'transaction:enriched',
  'transactions.scored': 'transaction:scored',
  'transactions.decided': 'transaction:decided',
  'risk.events': 'risk:event',
  'alerts.created': 'alert:created',
  'agent.actions': 'agent:action',
  'features.materialized': 'features:materialized',
  // Onboarding ML pipeline events
  'onboarding.received': 'onboarding:received',
  'onboarding.enriched': 'onboarding:enriched',
  'onboarding.features': 'onboarding:features',
  'onboarding.scored': 'onboarding:ml:scored',
  'onboarding.decided': 'onboarding:ml:decided',
  'onboarding.emitted': 'onboarding:emitted'
};

const DEFAULT_TOPICS = Object.keys(TOPIC_EVENT_MAP);

// ---------------------------------------------------------------------------
// KafkaStreamEngine
// ---------------------------------------------------------------------------

export class KafkaStreamEngine {
  constructor() {
    const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');

    this.kafka = new Kafka({
      clientId: 'fraud-detection-dashboard',
      brokers,
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 300,
        retries: 8
      }
    });

    /** @type {import('kafkajs').Producer} */
    this.producer = this.kafka.producer();

    /** @type {import('kafkajs').Admin} */
    this.admin = this.kafka.admin();

    /** @type {boolean} */
    this.connected = false;

    /** @type {Map<string, import('kafkajs').Consumer>} compositeKey -> Consumer */
    this._consumerGroups = new Map();

    /** @type {Map<string, {groupId: string, topicName: string, createdAt: string}>} */
    this._consumerGroupMeta = new Map();

    /** @type {Set<string>} known topic names */
    this._topics = new Set(DEFAULT_TOPICS);

    this.createdAt = new Date().toISOString();

    this._stats = {
      totalMessagesProduced: 0,
      totalMessagesConsumed: 0
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Connect producer and admin client, then ensure all default topics exist.
   * Must be called before produce() or createConsumerGroup().
   */
  async connect() {
    await this.producer.connect();
    await this.admin.connect();

    // Auto-create default topics (Kafka may already have them — that's fine)
    try {
      const existing = await this.admin.listTopics();
      const toCreate = DEFAULT_TOPICS.filter(t => !existing.includes(t)).map(topic => ({
        topic,
        numPartitions: 4,
        replicationFactor: 1
      }));

      if (toCreate.length > 0) {
        await this.admin.createTopics({ topics: toCreate, waitForLeaders: true });
        console.log(`[kafka-stream-engine] Created ${toCreate.length} topic(s):`, toCreate.map(t => t.topic).join(', '));
      }
    } catch (err) {
      // Non-fatal: topics may have been created concurrently or auto-created by broker
      console.warn(`[kafka-stream-engine] Topic creation warning: ${err.message}`);
    }

    this.connected = true;
    console.log('[kafka-stream-engine] Producer and admin connected');
  }

  /**
   * Disconnect all clients gracefully.
   */
  async disconnect() {
    try {
      await this.producer.disconnect();
      await this.admin.disconnect();
      for (const consumer of this._consumerGroups.values()) {
        await consumer.disconnect();
      }
    } catch (err) {
      console.warn(`[kafka-stream-engine] Disconnect warning: ${err.message}`);
    }
    this.connected = false;
  }

  // -------------------------------------------------------------------------
  // Producer
  // -------------------------------------------------------------------------

  /**
   * Produce a message to a Kafka topic.
   * Also bridges the message to the WebSocket event bus.
   *
   * @param {string} topicName
   * @param {string} key - Routing/partition key
   * @param {*} value - Message payload (will be JSON-serialised)
   * @returns {Promise<{topic: string, partition: number, offset: string, timestamp: string}>}
   */
  async produce(topicName, key, value) {
    if (!this.connected) {
      throw new Error('[kafka-stream-engine] Not connected. Call connect() first.');
    }

    // Track the topic name so getTopics() stays accurate
    this._topics.add(topicName);

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    const [recordMeta] = await this.producer.send({
      topic: topicName,
      messages: [{ key: String(key), value: serialized }]
    });

    this._stats.totalMessagesProduced++;

    const result = {
      topic: topicName,
      partition: recordMeta.partition,
      offset: recordMeta.offset,        // string in KafkaJS
      timestamp: new Date().toISOString()
    };

    // Bridge to event bus for WebSocket clients
    if (eventBus) {
      try {
        const eventType = TOPIC_EVENT_MAP[topicName] || topicName.replace(/\./g, ':');
        eventBus.publish(eventType, value, {
          source: 'kafka-stream-engine',
          topic: topicName,
          partition: result.partition,
          offset: result.offset
        });
      } catch (err) {
        // Swallow bridge errors so they never disrupt the streaming pipeline
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Consumer Groups
  // -------------------------------------------------------------------------

  /**
   * Create (or retrieve) a KafkaJS consumer for the given group + topic.
   * The consumer is subscribed and ready to run.
   *
   * @param {string} groupId
   * @param {string} topicName
   * @returns {Promise<import('kafkajs').Consumer>}
   */
  async createConsumerGroup(groupId, topicName) {
    const compositeKey = `${groupId}::${topicName}`;

    if (this._consumerGroups.has(compositeKey)) {
      return this._consumerGroups.get(compositeKey);
    }

    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic: topicName, fromBeginning: false });

    this._consumerGroups.set(compositeKey, consumer);
    this._consumerGroupMeta.set(compositeKey, {
      groupId,
      topicName,
      createdAt: new Date().toISOString()
    });

    return consumer;
  }

  // -------------------------------------------------------------------------
  // Introspection (mirrors stream-engine.js interface)
  // -------------------------------------------------------------------------

  /**
   * List all known topic names.
   * @returns {string[]}
   */
  getTopics() {
    return Array.from(this._topics);
  }

  /**
   * Get lightweight metadata about a topic.
   * Returns an object with a `name` property for interface parity.
   * Full partition metadata requires an async admin call — use getStats() for that.
   *
   * @param {string} name
   * @returns {{name: string}|undefined}
   */
  getTopic(name) {
    if (!this._topics.has(name)) return undefined;
    return { name };
  }

  /**
   * List all consumer groups with their metadata.
   * @returns {Array<{groupId: string, topicName: string, createdAt: string}>}
   */
  getConsumerGroups() {
    return Array.from(this._consumerGroupMeta.values());
  }

  /**
   * Aggregate statistics for the engine.
   * @returns {Object}
   */
  getStats() {
    const topicStats = {};
    for (const name of this._topics) {
      topicStats[name] = {
        partitions: 4,  // default; real partition count requires async admin call
        messageCount: null,  // unavailable without consumer lag query
        retentionMs: null    // broker-configured
      };
    }

    const groupStats = {};
    for (const [compositeKey, meta] of this._consumerGroupMeta.entries()) {
      groupStats[compositeKey] = {
        groupId: meta.groupId,
        topic: meta.topicName,
        createdAt: meta.createdAt
      };
    }

    return {
      backend: 'kafka',
      createdAt: this.createdAt,
      connected: this.connected,
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      totalMessagesProduced: this._stats.totalMessagesProduced,
      totalMessagesConsumed: this._stats.totalMessagesConsumed,
      topicCount: this._topics.size,
      consumerGroupCount: this._consumerGroups.size,
      topics: topicStats,
      consumerGroups: groupStats,
      eventBusBridge: eventBus !== null
    };
  }
}

export default KafkaStreamEngine;
