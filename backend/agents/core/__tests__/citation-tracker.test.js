/**
 * Unit test: verifies citation parsing, enrichment, and stripping for LLM output grounding.
 * Run with: node backend/agents/core/__tests__/citation-tracker.test.js
 */

import { getCitationTracker } from '../citation-tracker.js';

async function runTests() {
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

  // ── Test 1: Singleton pattern ──
  console.log('\nTest 1: Singleton pattern');
  const tracker1 = getCitationTracker();
  const tracker2 = getCitationTracker();
  assert(tracker1 === tracker2, 'getCitationTracker() returns same instance');

  // ── Test 2: parseCitations extracts single citation ──
  console.log('\nTest 2: parseCitations extracts single citation');
  const text1 = 'The seller has a high chargeback rate [source:chargeback_check:0] which is concerning.';
  const citations1 = tracker1.parseCitations(text1);
  assert(Array.isArray(citations1), 'parseCitations returns an array');
  assert(citations1.length === 1, `Extracted 1 citation (got ${citations1.length})`);
  assert(citations1[0].toolName === 'chargeback_check', `toolName is chargeback_check (got ${citations1[0].toolName})`);
  assert(citations1[0].index === 0, `index is 0 (got ${citations1[0].index})`);
  assert(typeof citations1[0].claim === 'string', 'claim is a string');
  assert(citations1[0].claim.length > 0, 'claim is not empty');

  // ── Test 3: parseCitations extracts multiple citations ──
  console.log('\nTest 3: parseCitations extracts multiple citations');
  const text2 = 'Business is registered [source:business_registry:0] and has good credit [source:credit_check:1] with clean history [source:background_check:2].';
  const citations2 = tracker1.parseCitations(text2);
  assert(citations2.length === 3, `Extracted 3 citations (got ${citations2.length})`);
  assert(citations2[0].toolName === 'business_registry', `First toolName is business_registry`);
  assert(citations2[1].toolName === 'credit_check', `Second toolName is credit_check`);
  assert(citations2[2].toolName === 'background_check', `Third toolName is background_check`);
  assert(citations2[1].index === 1, `Second citation index is 1 (got ${citations2[1].index})`);

  // ── Test 4: parseCitations handles text with no citations ──
  console.log('\nTest 4: parseCitations handles text with no citations');
  const text3 = 'This is a plain text with no citations at all.';
  const citations3 = tracker1.parseCitations(text3);
  assert(Array.isArray(citations3), 'Returns an array for no-citation text');
  assert(citations3.length === 0, `No citations extracted (got ${citations3.length})`);

  // ── Test 5: parseCitations handles empty/null input ──
  console.log('\nTest 5: parseCitations handles empty/null input');
  assert(tracker1.parseCitations('').length === 0, 'Empty string returns empty array');
  assert(tracker1.parseCitations(null).length === 0, 'null returns empty array');
  assert(tracker1.parseCitations(undefined).length === 0, 'undefined returns empty array');

  // ── Test 6: parseCitations extracts surrounding claim text ──
  console.log('\nTest 6: parseCitations extracts surrounding claim text');
  const text4 = 'The transaction amount of $5000 exceeds the threshold [source:amount_check:0] and should be reviewed.';
  const citations4 = tracker1.parseCitations(text4);
  assert(citations4[0].claim.includes('transaction amount'), 'Claim includes surrounding context');

  // ── Test 7: enrichCitations matches evidence by toolName ──
  console.log('\nTest 7: enrichCitations matches evidence by toolName');
  const rawCitations = [
    { claim: 'High chargeback rate', toolName: 'chargeback_check', index: 0, confidence: 0, evidenceSnippet: null },
    { claim: 'Business is verified', toolName: 'business_registry', index: 1, confidence: 0, evidenceSnippet: null },
  ];
  const evidence = [
    { action: { type: 'chargeback_check' }, result: { success: true, data: { rate: 0.08, threshold: 0.05 } } },
    { action: { type: 'business_registry' }, result: { success: true, data: { verified: true, name: 'Acme Corp' } } },
  ];
  const enriched = tracker1.enrichCitations(rawCitations, evidence);
  assert(enriched.length === 2, 'Enriched citations count matches input');
  assert(enriched[0].evidenceSnippet !== null, 'First citation has evidenceSnippet');
  assert(enriched[0].confidence > 0, `First citation confidence > 0 (got ${enriched[0].confidence})`);
  assert(enriched[1].evidenceSnippet !== null, 'Second citation has evidenceSnippet');

  // ── Test 8: enrichCitations sets lower confidence for failed evidence ──
  console.log('\nTest 8: enrichCitations sets lower confidence for failed evidence');
  const failedCitations = [
    { claim: 'Score is normal', toolName: 'score_check', index: 0, confidence: 0, evidenceSnippet: null },
  ];
  const failedEvidence = [
    { action: { type: 'score_check' }, result: { success: false, data: null } },
  ];
  const failedEnriched = tracker1.enrichCitations(failedCitations, failedEvidence);
  assert(failedEnriched[0].confidence < 1.0, `Failed evidence gets reduced confidence (got ${failedEnriched[0].confidence})`);

  // ── Test 9: enrichCitations handles unmatched citations ──
  console.log('\nTest 9: enrichCitations handles unmatched citations');
  const unmatchedCitations = [
    { claim: 'Something happened', toolName: 'nonexistent_tool', index: 0, confidence: 0, evidenceSnippet: null },
  ];
  const unmatchedEnriched = tracker1.enrichCitations(unmatchedCitations, evidence);
  assert(unmatchedEnriched[0].confidence < 0.5, `Unmatched citation gets low confidence (got ${unmatchedEnriched[0].confidence})`);
  assert(unmatchedEnriched[0].evidenceSnippet === null || unmatchedEnriched[0].evidenceSnippet === undefined,
    'Unmatched citation has no evidenceSnippet');

  // ── Test 10: enrichCitations handles empty evidence ──
  console.log('\nTest 10: enrichCitations handles empty evidence');
  const emptyEvidence = tracker1.enrichCitations(rawCitations, []);
  assert(emptyEvidence.length === 2, 'Returns same count with empty evidence');
  assert(emptyEvidence[0].confidence < 0.5, 'Low confidence with no matching evidence');

  // ── Test 11: stripCitations removes markers ──
  console.log('\nTest 11: stripCitations removes markers');
  const textWithCitations = 'Rate is high [source:chargeback_check:0] and score is low [source:score_check:1].';
  const stripped = tracker1.stripCitations(textWithCitations);
  assert(!stripped.includes('[source:'), 'No [source:] markers remain');
  assert(stripped.includes('Rate is high'), 'Original text preserved');
  assert(stripped.includes('and score is low'), 'All segments preserved');

  // ── Test 12: stripCitations cleans up double spaces ──
  console.log('\nTest 12: stripCitations cleans up double spaces');
  const textWithSpaces = 'A claim [source:tool:0] followed by more text.';
  const strippedSpaces = tracker1.stripCitations(textWithSpaces);
  assert(!strippedSpaces.includes('  '), `No double spaces remain (got "${strippedSpaces}")`);

  // ── Test 13: stripCitations handles text without markers ──
  console.log('\nTest 13: stripCitations handles text without markers');
  const plainText = 'No citations here at all.';
  assert(tracker1.stripCitations(plainText) === plainText, 'Plain text unchanged');

  // ── Test 14: stripCitations handles empty/null input ──
  console.log('\nTest 14: stripCitations handles empty/null input');
  assert(tracker1.stripCitations('') === '', 'Empty string returns empty string');
  assert(tracker1.stripCitations(null) === '', 'null returns empty string');
  assert(tracker1.stripCitations(undefined) === '', 'undefined returns empty string');

  // ── Test 15: enrichCitations sets high confidence for successful evidence ──
  console.log('\nTest 15: enrichCitations sets high confidence for successful evidence');
  const successCitations = [
    { claim: 'All checks pass', toolName: 'identity_check', index: 0, confidence: 0, evidenceSnippet: null },
  ];
  const successEvidence = [
    { action: { type: 'identity_check' }, result: { success: true, data: { verified: true, score: 95 } } },
  ];
  const successEnriched = tracker1.enrichCitations(successCitations, successEvidence);
  assert(successEnriched[0].confidence >= 0.8, `Successful evidence gets high confidence (got ${successEnriched[0].confidence})`);

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
