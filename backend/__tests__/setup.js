/**
 * Test setup — ensures USE_LLM=false and DB_BACKEND=sqlite for tests.
 */
process.env.USE_LLM = 'false';
process.env.DB_BACKEND = 'sqlite';
process.env.STREAMING_BACKEND = 'memory';
process.env.FEATURE_STORE_BACKEND = 'memory';
process.env.CACHE_BACKEND = 'memory';
process.env.GRAPH_BACKEND = 'memory';
process.env.OBSERVABILITY_BACKEND = 'sqlite';
