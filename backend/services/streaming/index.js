/**
 * Streaming Service Router
 *
 * REST API endpoints for the streaming engine (topics, consumer groups)
 * and the online feature store (stats, feature lookups).
 */

import express from 'express';
import { getStreamEngine } from '../../streaming/stream-engine.js';
import { getFeatureStore } from '../../streaming/feature-store.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

// GET /topics — List all topics with message counts and throughput
router.get('/topics', (req, res) => {
  try {
    const engine = getStreamEngine();
    const topicNames = engine.getTopics(); // returns string[]

    const topics = topicNames.map((name) => {
      const topic = engine.getTopic(name);
      const partitions = topic.getPartitions();
      const messageCount = topic.getMessageCount();

      // Estimate throughput from the most recent messages across partitions.
      // We look at messages produced in the last 10 seconds to derive a rate.
      const windowMs = 10000;
      const cutoff = Date.now() - windowMs;
      let recentCount = 0;
      for (const partition of partitions) {
        // Walk backwards from the end of the log for efficiency
        for (let i = partition.log.length - 1; i >= 0; i--) {
          if (new Date(partition.log[i].timestamp).getTime() >= cutoff) {
            recentCount++;
          } else {
            break;
          }
        }
      }
      const messagesPerSec = recentCount / (windowMs / 1000);

      return {
        name: topic.name,
        partitionCount: topic.numPartitions,
        messageCount,
        messagesPerSec: Math.round(messagesPerSec * 100) / 100,
        retentionMs: topic.retentionMs,
      };
    });

    res.json({ success: true, data: topics });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /topics/:name — Get specific topic detail with partition info
router.get('/topics/:name', (req, res) => {
  try {
    const engine = getStreamEngine();
    const topic = engine.getTopic(req.params.name);

    if (!topic) {
      return res.status(404).json({ success: false, error: `Topic "${req.params.name}" not found` });
    }

    const partitions = topic.getPartitions().map((p) => ({
      id: p.index,
      messageCount: p.log.length,
      oldestOffset: p.log.length > 0 ? p.log[0].offset : 0,
      newestOffset: p.log.length > 0 ? p.log[p.log.length - 1].offset : 0,
    }));

    res.json({
      success: true,
      data: {
        name: topic.name,
        partitionCount: topic.numPartitions,
        messageCount: topic.getMessageCount(),
        retentionMs: topic.retentionMs,
        createdAt: topic.createdAt,
        partitions,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Consumer Groups
// ---------------------------------------------------------------------------

// GET /consumer-groups — List all consumer groups with lag per partition
router.get('/consumer-groups', (req, res) => {
  try {
    const engine = getStreamEngine();
    const groups = engine.getConsumerGroups(); // returns array of { groupId, topicName, consumers, createdAt }

    const data = groups.map((group) => {
      // Retrieve the full ConsumerGroup instance to access getLag()
      const cg = engine.createConsumerGroup(group.groupId, group.topicName);
      const lag = cg.getLag();

      return {
        groupId: group.groupId,
        topic: group.topicName,
        consumers: group.consumers.length,
        createdAt: group.createdAt,
        partitions: lag,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Feature Store
// ---------------------------------------------------------------------------

// GET /feature-store/stats — Feature store statistics
router.get('/feature-store/stats', (req, res) => {
  try {
    const store = getFeatureStore();
    const stats = store.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /feature-store/:entityId — All features for an entity
router.get('/feature-store/:entityId', (req, res) => {
  try {
    const store = getFeatureStore();
    const { entityId } = req.params;
    const stats = store.getStats();
    const featureGroups = stats.featureGroups; // string[] of group names

    const result = {};
    for (const group of featureGroups) {
      const features = store.getFeatures(entityId, group);
      if (features !== null) {
        result[group] = features;
      }
    }

    res.json({ success: true, data: { entityId, features: result } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /feature-store/:entityId/:group — Specific feature group for entity
router.get('/feature-store/:entityId/:group', (req, res) => {
  try {
    const store = getFeatureStore();
    const { entityId, group } = req.params;
    const features = store.getFeatures(entityId, group);

    if (features === null) {
      return res.status(404).json({
        success: false,
        error: `No features found for entity "${entityId}" in group "${group}"`,
      });
    }

    res.json({ success: true, data: { entityId, group, features } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
