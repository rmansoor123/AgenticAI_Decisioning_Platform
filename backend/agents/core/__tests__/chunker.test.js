/**
 * Unit test: verifies adaptive text chunking for knowledge base entries.
 * Run with: node backend/agents/core/__tests__/chunker.test.js
 */

import { getChunker } from '../chunker.js';

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  const chunker = getChunker();

  // ── Test 1: Singleton pattern ──
  console.log('\nTest 1: Singleton pattern');
  const chunker2 = getChunker();
  assert(chunker === chunker2, 'getChunker() returns same instance');

  // ── Test 2: Short text stays as single chunk ──
  console.log('\nTest 2: Short text stays as single chunk');
  const shortText = 'This is a short sentence. It has two sentences.';
  const shortChunks = chunker.chunk(shortText, { parentId: 'KB-001', namespace: 'transactions' });
  assert(shortChunks.length === 1, `Single chunk for short text (got ${shortChunks.length})`);
  assert(shortChunks[0].text === shortText, 'Chunk text matches input');
  assert(shortChunks[0].parentId === 'KB-001', 'parentId carried through');
  assert(shortChunks[0].chunkIndex === 0, 'chunkIndex is 0');
  assert(shortChunks[0].totalChunks === 1, 'totalChunks is 1');
  assert(shortChunks[0].namespace === 'transactions', 'metadata.namespace carried through');

  // ── Test 3: Long text is split into multiple chunks ──
  console.log('\nTest 3: Long text split into multiple chunks');
  // Generate text with many sentences, each ~80 chars, to exceed 1024 char target
  const sentences = [];
  for (let i = 0; i < 30; i++) {
    sentences.push(`Sentence number ${i} contains important fraud detection information about risk patterns and anomaly scores.`);
  }
  const longText = sentences.join(' ');
  const longChunks = chunker.chunk(longText, { parentId: 'KB-002' });
  assert(longChunks.length > 1, `Multiple chunks for long text (got ${longChunks.length})`);
  assert(longChunks.every(c => c.parentId === 'KB-002'), 'All chunks carry parentId');
  assert(longChunks.every((c, i) => c.chunkIndex === i), 'chunkIndex is sequential');
  assert(longChunks.every(c => c.totalChunks === longChunks.length), 'totalChunks consistent');

  // ── Test 4: Chunk size within limits ──
  console.log('\nTest 4: Chunk sizes within limits');
  const maxChars = 2048; // 512 tokens * ~4 chars/token
  assert(
    longChunks.every(c => c.text.length <= maxChars),
    `All chunks <= ${maxChars} chars (max was ${Math.max(...longChunks.map(c => c.text.length))})`
  );

  // ── Test 5: 2-sentence overlap between consecutive chunks ──
  console.log('\nTest 5: 2-sentence overlap between consecutive chunks');
  if (longChunks.length >= 2) {
    // The last 2 sentences of chunk[0] should appear at the start of chunk[1]
    const chunk0Sentences = longChunks[0].text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    const chunk1Sentences = longChunks[1].text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    const overlapSentences = chunk0Sentences.slice(-2);
    const chunk1Start = chunk1Sentences.slice(0, 2);

    // Check overlap: the last 2 sentences of chunk 0 should match the first 2 of chunk 1
    const hasOverlap = overlapSentences.length === 2 &&
      chunk1Start[0] === overlapSentences[0] &&
      chunk1Start[1] === overlapSentences[1];
    assert(hasOverlap, 'Last 2 sentences of chunk N overlap with first 2 sentences of chunk N+1');
  } else {
    assert(false, 'Need at least 2 chunks to test overlap');
  }

  // ── Test 6: Sentence boundary splitting ──
  console.log('\nTest 6: Sentence boundary splitting');
  const boundaryText = 'First sentence. Second sentence? Third sentence! Fourth sentence. Fifth sentence.';
  const boundarySentences = chunker._splitSentences(boundaryText);
  assert(boundarySentences.length === 5, `Found ${boundarySentences.length} sentences (expected 5)`);
  assert(boundarySentences[0] === 'First sentence.', `First sentence correct: "${boundarySentences[0]}"`);
  assert(boundarySentences[1] === 'Second sentence?', `Second sentence correct: "${boundarySentences[1]}"`);
  assert(boundarySentences[2] === 'Third sentence!', `Third sentence correct: "${boundarySentences[2]}"`);

  // ── Test 7: Empty and null input handling ──
  console.log('\nTest 7: Empty and null input handling');
  const emptyChunks = chunker.chunk('', { parentId: 'KB-003' });
  assert(emptyChunks.length === 0, 'Empty string returns no chunks');
  const nullChunks = chunker.chunk(null, { parentId: 'KB-004' });
  assert(nullChunks.length === 0, 'Null input returns no chunks');
  const undefinedChunks = chunker.chunk(undefined, { parentId: 'KB-005' });
  assert(undefinedChunks.length === 0, 'Undefined input returns no chunks');

  // ── Test 8: Metadata preservation ──
  console.log('\nTest 8: Metadata preservation');
  const metaChunks = chunker.chunk('Sentence one. Sentence two. Sentence three.', {
    parentId: 'KB-006',
    namespace: 'onboarding',
    sellerId: 'S-123',
    domain: 'kyc',
    category: 'verification'
  });
  assert(metaChunks.length >= 1, 'Got at least one chunk');
  const firstChunk = metaChunks[0];
  assert(firstChunk.namespace === 'onboarding', 'namespace preserved');
  assert(firstChunk.sellerId === 'S-123', 'sellerId preserved');
  assert(firstChunk.domain === 'kyc', 'domain preserved');
  assert(firstChunk.category === 'verification', 'category preserved');

  // ── Test 9: estimateTokens utility ──
  console.log('\nTest 9: estimateTokens utility');
  const tokenEstimate = chunker.estimateTokens('This is a test sentence with eight words total.');
  assert(typeof tokenEstimate === 'number', 'estimateTokens returns a number');
  assert(tokenEstimate > 0, 'Token estimate is positive');
  // ~50 chars / 4 = ~12 tokens
  assert(tokenEstimate >= 8 && tokenEstimate <= 20, `Token estimate reasonable: ${tokenEstimate}`);

  // ── Test 10: Chunk IDs are unique ──
  console.log('\nTest 10: Chunk IDs are unique');
  const idSet = new Set(longChunks.map(c => c.chunkId));
  assert(idSet.size === longChunks.length, 'All chunkIds are unique');

  // ── Test 11: Text with no sentence boundaries ──
  console.log('\nTest 11: Text with no sentence boundaries');
  // A long string with no periods/questions/exclamations
  const noBoundary = 'word '.repeat(600).trim(); // ~3000 chars, well above target
  const noBoundaryChunks = chunker.chunk(noBoundary, { parentId: 'KB-007' });
  assert(noBoundaryChunks.length >= 1, `Handles text with no sentence boundaries (got ${noBoundaryChunks.length} chunks)`);
  assert(
    noBoundaryChunks.every(c => c.text.length <= maxChars),
    'Chunks without sentence boundaries still respect max size'
  );

  // ── Test 12: getStats returns chunking statistics ──
  console.log('\nTest 12: getStats returns statistics');
  const stats = chunker.getStats();
  assert(stats.totalChunkOperations > 0, `totalChunkOperations > 0 (got ${stats.totalChunkOperations})`);
  assert(stats.totalChunksProduced > 0, `totalChunksProduced > 0 (got ${stats.totalChunksProduced})`);

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
