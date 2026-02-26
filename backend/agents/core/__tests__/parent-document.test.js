/**
 * Unit test: verifies parent document retrieval — storing full documents
 * alongside their chunks and retrieving them by document ID.
 * Run with: node backend/agents/core/__tests__/parent-document.test.js
 */

import { getKnowledgeBase } from '../knowledge-base.js';

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

  const kb = getKnowledgeBase();

  // ── Test 1: addDocumentWithChunks returns documentId and chunkIds ──
  console.log('\nTest 1: addDocumentWithChunks returns documentId and chunkIds');
  const shortRecord = {
    text: 'This is a short document that does not need chunking.',
    category: 'fraud-report',
    sellerId: 'S-100',
    domain: 'payments'
  };
  const shortResult = kb.addDocumentWithChunks('transactions', shortRecord);
  assert(shortResult.documentId && shortResult.documentId.startsWith('DOC-'), `documentId starts with DOC- (got ${shortResult.documentId})`);
  assert(Array.isArray(shortResult.chunkIds), 'chunkIds is an array');
  assert(shortResult.chunkIds.length >= 1, `At least 1 chunkId (got ${shortResult.chunkIds.length})`);

  // ── Test 2: getParentDocument retrieves stored document ──
  console.log('\nTest 2: getParentDocument retrieves stored document');
  const doc = kb.getParentDocument(shortResult.documentId);
  assert(doc !== null, 'Document retrieved (not null)');
  assert(doc.documentId === shortResult.documentId, 'documentId matches');
  assert(doc.text === shortRecord.text, 'Full text preserved');
  assert(doc.category === shortRecord.category, 'Category preserved');
  assert(doc.sellerId === shortRecord.sellerId, 'sellerId preserved');
  assert(doc.domain === shortRecord.domain, 'Domain preserved');
  assert(doc.namespace === 'transactions', 'Namespace stored on document');

  // ── Test 3: Short text stored as document + single chunk ──
  console.log('\nTest 3: Short text creates single chunk');
  assert(shortResult.chunkIds.length === 1, `Short text produces exactly 1 chunk (got ${shortResult.chunkIds.length})`);

  // ── Test 4: Long text stored as document + multiple chunks ──
  console.log('\nTest 4: Long text creates multiple chunks');
  const sentences = [];
  for (let i = 0; i < 30; i++) {
    sentences.push(`Sentence ${i} describes a complex fraud pattern involving multiple transactions and risk indicators.`);
  }
  const longRecord = {
    text: sentences.join(' '),
    category: 'investigation',
    sellerId: 'S-200',
    domain: 'risk'
  };
  const longResult = kb.addDocumentWithChunks('decisions', longRecord);
  assert(longResult.documentId.startsWith('DOC-'), 'Long document gets DOC- prefixed ID');
  assert(longResult.chunkIds.length > 1, `Multiple chunks for long text (got ${longResult.chunkIds.length})`);

  // Verify the full document is still retrievable
  const longDoc = kb.getParentDocument(longResult.documentId);
  assert(longDoc !== null, 'Long document retrieved');
  assert(longDoc.text === longRecord.text, 'Full long text preserved without chunking');

  // ── Test 5: Chunks carry parentDocumentId field ──
  console.log('\nTest 5: Chunks carry parentDocumentId field');
  // Search for chunks by the sellerId used in the long record
  const searchResults = kb.searchKnowledge('decisions', 'fraud pattern risk', { sellerId: 'S-200' });
  const chunksWithParent = searchResults.filter(r => r.parentDocumentId === longResult.documentId);
  assert(chunksWithParent.length > 0, `Found chunks with parentDocumentId (got ${chunksWithParent.length})`);

  // ── Test 6: getParentDocument returns null for unknown document ──
  console.log('\nTest 6: getParentDocument returns null for unknown documentId');
  const notFound = kb.getParentDocument('DOC-nonexistent-id');
  assert(notFound === null, 'Returns null for unknown documentId');

  // ── Test 7: Invalid namespace throws error ──
  console.log('\nTest 7: Invalid namespace throws error');
  let threw = false;
  try {
    kb.addDocumentWithChunks('invalid-namespace', { text: 'test' });
  } catch (e) {
    threw = true;
  }
  assert(threw, 'Throws for invalid namespace');

  // ── Test 8: Document stores chunkCount and timestamp ──
  console.log('\nTest 8: Document stores chunkCount and timestamp');
  assert(typeof longDoc.chunkCount === 'number', 'chunkCount is a number');
  assert(longDoc.chunkCount === longResult.chunkIds.length, `chunkCount matches chunkIds.length (${longDoc.chunkCount} === ${longResult.chunkIds.length})`);
  assert(typeof longDoc.timestamp === 'string', 'timestamp is stored');

  // ── Test 9: Document with empty text ──
  console.log('\nTest 9: Empty text record');
  const emptyResult = kb.addDocumentWithChunks('transactions', { text: '' });
  assert(emptyResult.documentId.startsWith('DOC-'), 'Empty text still gets a documentId');
  assert(emptyResult.chunkIds.length === 0, 'Empty text produces 0 chunks');

  // ── Test 10: Multiple documents are independent ──
  console.log('\nTest 10: Multiple documents are independent');
  const doc1 = kb.addDocumentWithChunks('rules', { text: 'Document one content.', category: 'rule-update' });
  const doc2 = kb.addDocumentWithChunks('rules', { text: 'Document two content.', category: 'rule-update' });
  assert(doc1.documentId !== doc2.documentId, 'Different documents get different IDs');
  const retrieved1 = kb.getParentDocument(doc1.documentId);
  const retrieved2 = kb.getParentDocument(doc2.documentId);
  assert(retrieved1.text === 'Document one content.', 'Document 1 text correct');
  assert(retrieved2.text === 'Document two content.', 'Document 2 text correct');

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
