/**
 * Citation Tracker — Parses, enriches, and strips source citations from LLM output.
 *
 * The LLM is instructed to tag claims with [source:tool_name:index] markers.
 * This module extracts those markers, matches them against actual tool evidence,
 * and assigns confidence scores based on whether evidence was found and succeeded.
 *
 * Singleton: getCitationTracker()
 */

/**
 * Regex pattern for matching [source:tool_name:index] markers in text.
 * Captures: tool_name (group 1) and index (group 2).
 */
const CITATION_PATTERN = /\[source:([a-zA-Z0-9_-]+):(\d+)\]/g;

class CitationTracker {
  /**
   * Parse [source:tool_name:index] markers from LLM text.
   * Extracts the surrounding claim text for each citation.
   *
   * @param {string} text - LLM output text containing citation markers
   * @returns {Array<{ claim: string, toolName: string, index: number, confidence: number, evidenceSnippet: string|null }>}
   */
  parseCitations(text) {
    if (!text || typeof text !== 'string') return [];

    const citations = [];
    const regex = new RegExp(CITATION_PATTERN.source, CITATION_PATTERN.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
      const toolName = match[1];
      const index = parseInt(match[2], 10);
      const markerStart = match.index;
      const markerEnd = markerStart + match[0].length;

      // Extract surrounding claim text: from the previous sentence boundary
      // (or start of text) to the next sentence boundary (or end of text).
      const claim = this._extractClaim(text, markerStart, markerEnd);

      citations.push({
        claim,
        toolName,
        index,
        confidence: 0,
        evidenceSnippet: null,
      });
    }

    return citations;
  }

  /**
   * Match citations to evidence by toolName. Sets evidenceSnippet from evidence
   * data and confidence based on evidence success.
   *
   * @param {Array<{ claim: string, toolName: string, index: number, confidence: number, evidenceSnippet: string|null }>} citations
   * @param {Array<{ action: { type: string }, result: { success: boolean, data: any } }>} evidence
   * @returns {Array<{ claim: string, toolName: string, index: number, confidence: number, evidenceSnippet: string|null }>}
   */
  enrichCitations(citations, evidence) {
    if (!citations || !Array.isArray(citations)) return [];

    const evidenceMap = new Map();
    if (evidence && Array.isArray(evidence)) {
      for (const entry of evidence) {
        const toolName = entry.action?.type;
        if (toolName) {
          evidenceMap.set(toolName, entry);
        }
      }
    }

    return citations.map(citation => {
      const enriched = { ...citation };
      const evidenceEntry = evidenceMap.get(citation.toolName);

      if (!evidenceEntry) {
        // No matching evidence found — low confidence, no snippet
        enriched.confidence = 0.2;
        enriched.evidenceSnippet = null;
        return enriched;
      }

      const success = evidenceEntry.result?.success !== false;
      const data = evidenceEntry.result?.data;

      if (success && data) {
        enriched.confidence = 0.9;
        enriched.evidenceSnippet = JSON.stringify(data).slice(0, 300);
      } else if (success) {
        enriched.confidence = 0.6;
        enriched.evidenceSnippet = null;
      } else {
        // Tool call failed
        enriched.confidence = 0.3;
        enriched.evidenceSnippet = data ? JSON.stringify(data).slice(0, 300) : null;
      }

      return enriched;
    });
  }

  /**
   * Remove all [source:...] markers from text and clean up double spaces.
   *
   * @param {string} text - Text containing citation markers
   * @returns {string} Clean text without markers
   */
  stripCitations(text) {
    if (!text || typeof text !== 'string') return '';

    return text
      .replace(new RegExp(CITATION_PATTERN.source, CITATION_PATTERN.flags), '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Extract the claim text surrounding a citation marker.
   * Looks backwards to the previous sentence-ending punctuation or start of text,
   * and forwards to the next sentence-ending punctuation or citation marker.
   *
   * @param {string} text - Full text
   * @param {number} markerStart - Start position of the [source:...] marker
   * @param {number} markerEnd - End position of the [source:...] marker
   * @returns {string} Extracted claim text
   * @private
   */
  _extractClaim(text, markerStart, markerEnd) {
    // Look backwards for sentence boundary (period, exclamation, question mark followed by space)
    let claimStart = 0;
    for (let i = markerStart - 1; i >= 0; i--) {
      if ((text[i] === '.' || text[i] === '!' || text[i] === '?') && i < markerStart - 1) {
        claimStart = i + 1;
        break;
      }
    }

    // Look forwards from after the marker for sentence boundary
    let claimEnd = text.length;
    for (let i = markerEnd; i < text.length; i++) {
      if (text[i] === '.' || text[i] === '!' || text[i] === '?') {
        claimEnd = i + 1;
        break;
      }
      // Stop at next citation marker
      if (text[i] === '[' && text.slice(i).match(/^\[source:/)) {
        claimEnd = i;
        break;
      }
    }

    // Strip the citation marker itself from the claim text
    const rawClaim = text.slice(claimStart, claimEnd);
    return rawClaim
      .replace(new RegExp(CITATION_PATTERN.source, CITATION_PATTERN.flags), '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}

// ── Singleton ──
let instance = null;

/**
 * Get the singleton CitationTracker instance.
 * @returns {CitationTracker}
 */
export function getCitationTracker() {
  if (!instance) {
    instance = new CitationTracker();
  }
  return instance;
}

export default CitationTracker;
