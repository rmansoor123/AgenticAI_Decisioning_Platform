/**
 * Model Loader and Cache Manager
 * Handles loading, caching, and lifecycle of ML models
 */

import { FraudDetectionModel, getFraudModel } from './fraud-model.js';

// Model registry
const modelRegistry = new Map();

// Model types
const MODEL_TYPES = {
  FRAUD_DETECTION: 'fraud-detector',
  ATO_PREVENTION: 'ato-detector',
  SELLER_RISK: 'seller-risk',
  TRANSACTION_SCORING: 'tx-scorer'
};

/**
 * Model Loader Class
 */
class ModelLoader {
  constructor() {
    this.loadedModels = new Map();
    this.loadingPromises = new Map();
    this.defaultModel = 'fraud-detector-v3';
  }

  /**
   * Load a model by ID
   * @param {string} modelId - Model identifier
   * @returns {Object} - Loaded model instance
   */
  async loadModel(modelId) {
    // Check if already loaded
    if (this.loadedModels.has(modelId)) {
      return this.loadedModels.get(modelId);
    }

    // Check if currently loading (prevent duplicate loads)
    if (this.loadingPromises.has(modelId)) {
      return this.loadingPromises.get(modelId);
    }

    // Start loading
    const loadPromise = this._loadModelInternal(modelId);
    this.loadingPromises.set(modelId, loadPromise);

    try {
      const model = await loadPromise;
      this.loadedModels.set(modelId, model);
      this.loadingPromises.delete(modelId);
      return model;
    } catch (error) {
      this.loadingPromises.delete(modelId);
      throw error;
    }
  }

  /**
   * Internal model loading logic
   */
  async _loadModelInternal(modelId) {
    console.log(`Loading model: ${modelId}`);

    // For now, all models use the fraud detection architecture
    // In production, different model types would have different architectures
    const model = getFraudModel();
    await model.load();

    // Register model metadata
    modelRegistry.set(modelId, {
      id: modelId,
      loadedAt: new Date().toISOString(),
      type: this._getModelType(modelId),
      instance: model
    });

    console.log(`Model ${modelId} loaded successfully`);
    return model;
  }

  /**
   * Determine model type from ID
   */
  _getModelType(modelId) {
    if (modelId.includes('fraud')) return MODEL_TYPES.FRAUD_DETECTION;
    if (modelId.includes('ato')) return MODEL_TYPES.ATO_PREVENTION;
    if (modelId.includes('seller')) return MODEL_TYPES.SELLER_RISK;
    return MODEL_TYPES.TRANSACTION_SCORING;
  }

  /**
   * Get a loaded model
   * @param {string} modelId - Model identifier (optional, uses default if not provided)
   * @returns {Object} - Model instance or null
   */
  getModel(modelId = null) {
    const id = modelId || this.defaultModel;

    // Check cache first
    if (this.loadedModels.has(id)) {
      return this.loadedModels.get(id);
    }

    // Check registry (for metadata lookup)
    const registered = modelRegistry.get(id);
    if (registered) {
      return registered.instance;
    }

    return null;
  }

  /**
   * Ensure a model is loaded and ready
   * @param {string} modelId - Model identifier
   */
  async ensureLoaded(modelId = null) {
    const id = modelId || this.defaultModel;

    if (!this.loadedModels.has(id)) {
      await this.loadModel(id);
    }

    return this.loadedModels.get(id);
  }

  /**
   * Preload all required models for startup
   */
  async preloadModels() {
    console.log('Preloading ML models...');

    const modelsToLoad = [
      'fraud-detector-v3',
      // Add more models here as needed
    ];

    const loadPromises = modelsToLoad.map(id =>
      this.loadModel(id).catch(err => {
        console.error(`Failed to load model ${id}:`, err.message);
        return null;
      })
    );

    await Promise.all(loadPromises);
    console.log(`Preloaded ${this.loadedModels.size} model(s)`);
  }

  /**
   * Warm up all loaded models
   */
  async warmupModels() {
    console.log('Warming up ML models...');

    const warmupPromises = [];
    for (const [id, model] of this.loadedModels) {
      if (model && typeof model.warmup === 'function') {
        warmupPromises.push(
          model.warmup().catch(err => {
            console.error(`Failed to warmup model ${id}:`, err.message);
          })
        );
      }
    }

    await Promise.all(warmupPromises);
    console.log('Model warmup complete');
  }

  /**
   * Unload a model to free memory
   * @param {string} modelId - Model identifier
   */
  unloadModel(modelId) {
    if (this.loadedModels.has(modelId)) {
      this.loadedModels.delete(modelId);
      modelRegistry.delete(modelId);
      console.log(`Model ${modelId} unloaded`);
      return true;
    }
    return false;
  }

  /**
   * Get list of loaded models
   */
  getLoadedModels() {
    return Array.from(modelRegistry.entries()).map(([id, meta]) => ({
      id,
      type: meta.type,
      loadedAt: meta.loadedAt,
      info: meta.instance?.getInfo?.() || {}
    }));
  }

  /**
   * Get loader statistics
   */
  getStats() {
    const stats = {
      loadedModels: this.loadedModels.size,
      pendingLoads: this.loadingPromises.size,
      models: []
    };

    for (const [id, model] of this.loadedModels) {
      if (model && typeof model.getInfo === 'function') {
        stats.models.push({
          id,
          ...model.getInfo()
        });
      }
    }

    return stats;
  }
}

// Singleton instance
let loaderInstance = null;

export function getModelLoader() {
  if (!loaderInstance) {
    loaderInstance = new ModelLoader();
  }
  return loaderInstance;
}

/**
 * Initialize ML models on startup
 */
export async function initializeMLModels() {
  const loader = getModelLoader();
  await loader.preloadModels();
  await loader.warmupModels();
  return loader;
}

export default { ModelLoader, getModelLoader, initializeMLModels, MODEL_TYPES };
