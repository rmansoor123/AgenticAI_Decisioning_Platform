/**
 * Stream Engine - In-process Kafka-like streaming engine
 * Provides append-only partitioned logs with consumer groups,
 * offset tracking, and retention policies.
 */

import crypto from 'crypto';

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
// ---------------------------------------------------------------------------
const TOPIC_EVENT_MAP = {
  'transactions.received': 'transaction:received',
  'transactions.enriched': 'transaction:enriched',
  'transactions.scored': 'transaction:scored',
  'transactions.decided': 'transaction:decided',
  'risk.events': 'risk:event',
  'alerts.created': 'alert:created',
  'agent.actions': 'agent:action',
  'features.materialized': 'features:materialized'
};

// ---------------------------------------------------------------------------
// Partition
// ---------------------------------------------------------------------------

/**
 * Partition - an append-only, ordered log of messages.
 * Each message is assigned a monotonically increasing offset starting at 0.
 * Consumer offsets are tracked per consumerId via an internal Map.
 */
export class Partition {
  constructor(index) {
    /** @type {number} Partition index within the parent topic */
    this.index = index;

    /** @type {Array<{offset: number, key: string, value: any, timestamp: string}>} */
    this.log = [];

    /** @type {Map<string, number>} consumerId -> committed offset */
    this.offsets = new Map();
  }

  /**
   * Append a message to the log.
   * @param {{key: string, value: any}} message
   * @returns {{offset: number, timestamp: string}} Written record metadata
   */
  append(message) {
    const offset = this.log.length;
    const record = {
      offset,
      key: message.key,
      value: message.value,
      timestamp: new Date().toISOString()
    };
    this.log.push(record);
    return record;
  }

  /**
   * Read messages starting at `fromOffset` up to `maxCount`.
   * @param {number} fromOffset - inclusive start offset
   * @param {number} [maxCount=10] - maximum number of messages to return
   * @returns {Array} Slice of the log
   */
  read(fromOffset, maxCount = 10) {
    if (fromOffset < 0 || fromOffset >= this.log.length) {
      return [];
    }
    return this.log.slice(fromOffset, fromOffset + maxCount);
  }

  /**
   * Get the next offset that would be assigned (i.e. current log length).
   * @returns {number}
   */
  get highWaterMark() {
    return this.log.length;
  }
}

// ---------------------------------------------------------------------------
// Topic
// ---------------------------------------------------------------------------

/**
 * Topic - a named collection of partitions with configurable retention.
 * Messages are routed to partitions by hashing the key.
 */
export class Topic {
  /**
   * @param {string} name
   * @param {number} [numPartitions=4]
   * @param {number} [retentionMs=3600000] Retention period in ms (default 1 hr)
   */
  constructor(name, numPartitions = 4, retentionMs = 3600000) {
    this.name = name;
    this.numPartitions = numPartitions;
    this.retentionMs = retentionMs;
    this.createdAt = new Date().toISOString();

    /** @type {Partition[]} */
    this.partitions = [];
    for (let i = 0; i < numPartitions; i++) {
      this.partitions.push(new Partition(i));
    }

    // Schedule periodic retention cleanup
    this._retentionTimer = setInterval(() => this._enforceRetention(), 60000);
    // Allow the process to exit even if the timer is active
    if (this._retentionTimer.unref) {
      this._retentionTimer.unref();
    }
  }

  /**
   * Deterministic partition selection based on key hash.
   * @param {string} key
   * @returns {number} Partition index
   */
  getPartition(key) {
    const hash = crypto.createHash('md5').update(String(key)).digest();
    // Use first 4 bytes as an unsigned 32-bit int
    const num = hash.readUInt32BE(0);
    return num % this.numPartitions;
  }

  /**
   * Produce a message onto the topic.
   * @param {string} key - Routing key
   * @param {*} value - Message payload
   * @returns {{partition: number, offset: number, timestamp: string}}
   */
  produce(key, value) {
    const partitionIndex = this.getPartition(key);
    const partition = this.partitions[partitionIndex];
    const record = partition.append({ key, value });
    return {
      partition: partitionIndex,
      offset: record.offset,
      timestamp: record.timestamp
    };
  }

  /**
   * Total number of messages across all partitions.
   * @returns {number}
   */
  getMessageCount() {
    return this.partitions.reduce((sum, p) => sum + p.log.length, 0);
  }

  /**
   * Return the array of partitions.
   * @returns {Partition[]}
   */
  getPartitions() {
    return this.partitions;
  }

  /**
   * Remove messages older than the retention period.
   */
  _enforceRetention() {
    const cutoff = Date.now() - this.retentionMs;
    for (const partition of this.partitions) {
      let removeCount = 0;
      for (const record of partition.log) {
        if (new Date(record.timestamp).getTime() < cutoff) {
          removeCount++;
        } else {
          break; // Log is ordered by time; stop at first non-expired
        }
      }
      if (removeCount > 0) {
        partition.log.splice(0, removeCount);
        // Adjust committed offsets downward so they still point to the right record
        for (const [consumerId, offset] of partition.offsets.entries()) {
          partition.offsets.set(consumerId, Math.max(0, offset - removeCount));
        }
      }
    }
  }

  /**
   * Clean up timers when the topic is removed.
   */
  destroy() {
    if (this._retentionTimer) {
      clearInterval(this._retentionTimer);
      this._retentionTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// ConsumerGroup
// ---------------------------------------------------------------------------

/**
 * ConsumerGroup - manages a set of consumers reading from a topic.
 * Provides round-robin partition assignment, offset commits, and polling.
 */
export class ConsumerGroup {
  /**
   * @param {string} groupId
   * @param {Topic} topic
   */
  constructor(groupId, topic) {
    this.groupId = groupId;
    this.topic = topic;
    this.createdAt = new Date().toISOString();

    /** @type {string[]} Registered consumer ids */
    this.consumers = [];

    /** @type {Map<string, number[]>} consumerId -> assigned partition indices */
    this.assignments = new Map();
  }

  /**
   * Register a consumer in this group.
   * Triggers a rebalance so partitions are re-distributed.
   * @param {string} consumerId
   */
  addConsumer(consumerId) {
    if (!this.consumers.includes(consumerId)) {
      this.consumers.push(consumerId);
      this.rebalance();
    }
  }

  /**
   * Remove a consumer from this group and rebalance.
   * @param {string} consumerId
   */
  removeConsumer(consumerId) {
    const idx = this.consumers.indexOf(consumerId);
    if (idx !== -1) {
      this.consumers.splice(idx, 1);
      this.rebalance();
    }
  }

  /**
   * Round-robin partition assignment across registered consumers.
   * Partitions are distributed as evenly as possible.
   */
  rebalance() {
    this.assignments.clear();

    if (this.consumers.length === 0) return;

    // Initialise empty arrays for every consumer
    for (const cid of this.consumers) {
      this.assignments.set(cid, []);
    }

    // Round-robin: partition i goes to consumer i % numConsumers
    for (let i = 0; i < this.topic.numPartitions; i++) {
      const consumer = this.consumers[i % this.consumers.length];
      this.assignments.get(consumer).push(i);
    }
  }

  /**
   * Commit an offset for a specific consumer and partition.
   * @param {string} consumerId
   * @param {number} partitionIndex
   * @param {number} offset
   */
  commitOffset(consumerId, partitionIndex, offset) {
    const partition = this.topic.partitions[partitionIndex];
    if (!partition) {
      throw new Error(`Partition ${partitionIndex} does not exist on topic ${this.topic.name}`);
    }
    // Store offset keyed by "groupId:consumerId" so multiple groups can track independently
    partition.offsets.set(`${this.groupId}:${consumerId}`, offset);
  }

  /**
   * Poll for new messages for the given consumer.
   * Returns up to `maxMessages` unread messages across all assigned partitions.
   * Automatically commits the new offset after reading.
   * @param {string} consumerId
   * @param {number} [maxMessages=10]
   * @returns {Array<{partition: number, offset: number, key: string, value: any, timestamp: string}>}
   */
  poll(consumerId, maxMessages = 10) {
    const assigned = this.assignments.get(consumerId);
    if (!assigned || assigned.length === 0) {
      return [];
    }

    const messages = [];
    const perPartitionMax = Math.max(1, Math.ceil(maxMessages / assigned.length));

    for (const pIndex of assigned) {
      const partition = this.topic.partitions[pIndex];
      const offsetKey = `${this.groupId}:${consumerId}`;
      const committedOffset = partition.offsets.get(offsetKey) || 0;

      const records = partition.read(committedOffset, perPartitionMax);
      for (const record of records) {
        messages.push({
          partition: pIndex,
          offset: record.offset,
          key: record.key,
          value: record.value,
          timestamp: record.timestamp
        });
      }

      // Auto-commit the new offset
      if (records.length > 0) {
        const newOffset = records[records.length - 1].offset + 1;
        partition.offsets.set(offsetKey, newOffset);
      }
    }

    // Trim to maxMessages in case we fetched more across partitions
    return messages.slice(0, maxMessages);
  }

  /**
   * Calculate per-partition consumer lag (high water mark minus committed offset).
   * @returns {Array<{partition: number, highWaterMark: number, committedOffset: number, lag: number}>}
   */
  getLag() {
    const result = [];
    for (let i = 0; i < this.topic.numPartitions; i++) {
      const partition = this.topic.partitions[i];
      const hwm = partition.highWaterMark;

      // Find the minimum committed offset across consumers assigned to this partition
      let minCommitted = hwm;
      for (const cid of this.consumers) {
        const assigned = this.assignments.get(cid) || [];
        if (assigned.includes(i)) {
          const offsetKey = `${this.groupId}:${cid}`;
          const committed = partition.offsets.get(offsetKey) || 0;
          minCommitted = Math.min(minCommitted, committed);
        }
      }

      result.push({
        partition: i,
        highWaterMark: hwm,
        committedOffset: minCommitted,
        lag: hwm - minCommitted
      });
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// StreamEngine (singleton)
// ---------------------------------------------------------------------------

const DEFAULT_TOPICS = [
  'transactions.received',
  'transactions.enriched',
  'transactions.scored',
  'transactions.decided',
  'risk.events',
  'alerts.created',
  'agent.actions',
  'features.materialized'
];

/**
 * StreamEngine - central orchestrator for topics, producers, and consumer groups.
 * Obtained via `getStreamEngine()` which enforces the singleton pattern.
 */
class StreamEngine {
  constructor() {
    /** @type {Map<string, Topic>} */
    this.topics = new Map();

    /** @type {Map<string, ConsumerGroup>} groupId -> ConsumerGroup */
    this.consumerGroups = new Map();

    this.createdAt = new Date().toISOString();

    this._stats = {
      totalMessagesProduced: 0,
      totalMessagesConsumed: 0
    };

    // Create default topics
    for (const name of DEFAULT_TOPICS) {
      this.createTopic(name);
    }
  }

  /**
   * Create a new topic (or return the existing one if it already exists).
   * @param {string} name
   * @param {number} [numPartitions=4]
   * @returns {Topic}
   */
  createTopic(name, numPartitions = 4) {
    if (this.topics.has(name)) {
      return this.topics.get(name);
    }
    const topic = new Topic(name, numPartitions);
    this.topics.set(name, topic);
    return topic;
  }

  /**
   * Produce a message to a topic.
   * Also bridges the message to the event bus so existing WebSocket
   * subscribers continue to receive real-time updates.
   * @param {string} topicName
   * @param {string} key
   * @param {*} value
   * @returns {{topic: string, partition: number, offset: number, timestamp: string}}
   */
  produce(topicName, key, value) {
    const topic = this.topics.get(topicName);
    if (!topic) {
      throw new Error(`Topic "${topicName}" does not exist`);
    }

    const result = topic.produce(key, value);
    this._stats.totalMessagesProduced++;

    // Bridge to event bus for WebSocket clients
    if (eventBus) {
      try {
        const eventType = TOPIC_EVENT_MAP[topicName] || topicName.replace(/\./g, ':');
        eventBus.publish(eventType, value, {
          source: 'stream-engine',
          topic: topicName,
          partition: result.partition,
          offset: result.offset
        });
      } catch (err) {
        // Swallow bridge errors so they never disrupt the streaming pipeline
      }
    }

    return {
      topic: topicName,
      partition: result.partition,
      offset: result.offset,
      timestamp: result.timestamp
    };
  }

  /**
   * Create (or retrieve) a consumer group for a topic.
   * @param {string} groupId
   * @param {string} topicName
   * @returns {ConsumerGroup}
   */
  createConsumerGroup(groupId, topicName) {
    const compositeKey = `${groupId}::${topicName}`;
    if (this.consumerGroups.has(compositeKey)) {
      return this.consumerGroups.get(compositeKey);
    }

    const topic = this.topics.get(topicName);
    if (!topic) {
      throw new Error(`Topic "${topicName}" does not exist`);
    }

    const group = new ConsumerGroup(groupId, topic);
    this.consumerGroups.set(compositeKey, group);
    return group;
  }

  /**
   * List all topic names.
   * @returns {string[]}
   */
  getTopics() {
    return Array.from(this.topics.keys());
  }

  /**
   * Get a topic by name.
   * @param {string} name
   * @returns {Topic|undefined}
   */
  getTopic(name) {
    return this.topics.get(name);
  }

  /**
   * List all consumer groups with their metadata.
   * @returns {Array<{groupId: string, topicName: string, consumers: string[]}>}
   */
  getConsumerGroups() {
    const groups = [];
    for (const [compositeKey, group] of this.consumerGroups.entries()) {
      groups.push({
        groupId: group.groupId,
        topicName: group.topic.name,
        consumers: [...group.consumers],
        createdAt: group.createdAt
      });
    }
    return groups;
  }

  /**
   * Aggregate statistics for the engine.
   * @returns {Object}
   */
  getStats() {
    const topicStats = {};
    for (const [name, topic] of this.topics.entries()) {
      topicStats[name] = {
        partitions: topic.numPartitions,
        messageCount: topic.getMessageCount(),
        retentionMs: topic.retentionMs
      };
    }

    const groupStats = {};
    for (const [compositeKey, group] of this.consumerGroups.entries()) {
      groupStats[compositeKey] = {
        groupId: group.groupId,
        topic: group.topic.name,
        consumers: group.consumers.length,
        lag: group.getLag()
      };
    }

    return {
      createdAt: this.createdAt,
      totalMessagesProduced: this._stats.totalMessagesProduced,
      totalMessagesConsumed: this._stats.totalMessagesConsumed,
      topicCount: this.topics.size,
      consumerGroupCount: this.consumerGroups.size,
      topics: topicStats,
      consumerGroups: groupStats,
      eventBusBridge: eventBus !== null
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance = null;

/**
 * Get (or create) the singleton StreamEngine instance.
 * @returns {StreamEngine}
 */
export function getStreamEngine() {
  if (!instance) {
    instance = new StreamEngine();
  }
  return instance;
}

export default { getStreamEngine };
