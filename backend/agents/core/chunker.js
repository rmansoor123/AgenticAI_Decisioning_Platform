/**
 * Adaptive Text Chunker for Knowledge Base Entries
 *
 * Splits long text into overlapping chunks suitable for vector embedding and retrieval.
 * Used by the Parent Document Retrieval system (Task 5) to chunk documents before
 * storing in the knowledge base and Pinecone.
 *
 * Strategy:
 *   1. Sentence-based splitting on `. `, `? `, `! ` boundaries
 *   2. Target chunk size: 256 tokens (~1024 chars)
 *   3. Max chunk size: 512 tokens (~2048 chars)
 *   4. 2-sentence overlap between consecutive chunks for context continuity
 *   5. Fallback: character-based splitting when no sentence boundaries exist
 *
 * Each chunk carries: parentId, chunkIndex, totalChunks, chunkId, plus original metadata.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 256;
const MAX_TOKENS = 512;
const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN;   // 1024
const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN;         // 2048
const OVERLAP_SENTENCES = 2;

// ── Chunker Class ────────────────────────────────────────────────────────────

class Chunker {
  constructor() {
    this.stats = {
      totalChunkOperations: 0,
      totalChunksProduced: 0
    };
    console.log('[Chunker] Initialized');
  }

  /**
   * Estimate token count for a text string (~4 chars per token).
   * @param {string} text
   * @returns {number}
   */
  estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Split text into sentences on `. `, `? `, `! ` boundaries.
   * Preserves the punctuation with the preceding sentence.
   * @param {string} text
   * @returns {string[]}
   */
  _splitSentences(text) {
    if (!text || typeof text !== 'string') return [];

    // Split on sentence-ending punctuation followed by whitespace or end-of-string.
    // The regex captures the punctuation with the preceding text.
    const parts = text.split(/(?<=[.!?])\s+/);
    return parts.map(s => s.trim()).filter(s => s.length > 0);
  }

  /**
   * Fallback: split text into chunks by character count when no sentence boundaries exist.
   * Tries to split on word boundaries within the max size.
   * @param {string} text
   * @returns {string[]}
   */
  _splitByChars(text) {
    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= TARGET_CHARS) {
        chunks.push(remaining);
        break;
      }

      // Try to find a word boundary near the target size
      let splitAt = TARGET_CHARS;
      const spaceIdx = remaining.lastIndexOf(' ', TARGET_CHARS);
      if (spaceIdx > TARGET_CHARS * 0.5) {
        splitAt = spaceIdx;
      }

      chunks.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }

    return chunks;
  }

  /**
   * Generate a unique chunk ID from parentId and index.
   * @param {string} parentId
   * @param {number} index
   * @returns {string}
   */
  _makeChunkId(parentId, index) {
    const ts = Date.now().toString(36);
    return `CHK-${parentId}-${index}-${ts}`;
  }

  /**
   * Chunk a text string into overlapping segments with metadata.
   *
   * @param {string} text - The text to chunk
   * @param {Object} metadata - Metadata to attach to each chunk
   * @param {string} metadata.parentId - Required: ID of the parent document
   * @param {string} [metadata.namespace] - Optional namespace
   * @param {string} [metadata.sellerId] - Optional seller ID
   * @param {string} [metadata.domain] - Optional domain
   * @param {string} [metadata.category] - Optional category
   * @returns {Array<Object>} Array of chunk objects
   */
  chunk(text, metadata = {}) {
    // Handle empty / invalid input
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return [];
    }

    this.stats.totalChunkOperations++;

    const { parentId, ...extraMeta } = metadata;
    const sentences = this._splitSentences(text);

    let rawChunks;

    if (sentences.length <= 1) {
      // No sentence boundaries (or single sentence): use character-based splitting
      if (text.length <= TARGET_CHARS) {
        rawChunks = [text];
      } else {
        rawChunks = this._splitByChars(text);
      }
    } else {
      // Sentence-based chunking with overlap
      rawChunks = this._buildSentenceChunks(sentences);
    }

    // Build final chunk objects
    const totalChunks = rawChunks.length;
    const chunks = rawChunks.map((chunkText, index) => ({
      chunkId: this._makeChunkId(parentId || 'unknown', index),
      parentId: parentId || null,
      chunkIndex: index,
      totalChunks,
      text: chunkText,
      tokenEstimate: this.estimateTokens(chunkText),
      ...extraMeta
    }));

    this.stats.totalChunksProduced += chunks.length;
    return chunks;
  }

  /**
   * Build chunks from an array of sentences, respecting target/max sizes
   * and adding 2-sentence overlap between consecutive chunks.
   *
   * @param {string[]} sentences
   * @returns {string[]} Array of chunk text strings
   */
  _buildSentenceChunks(sentences) {
    const chunks = [];
    let currentSentences = [];
    let currentLength = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceLen = sentence.length + 1; // +1 for joining space

      // If adding this sentence would exceed max, flush current chunk
      if (currentLength + sentenceLen > MAX_CHARS && currentSentences.length > 0) {
        chunks.push(currentSentences.join(' '));

        // Start next chunk with overlap: last OVERLAP_SENTENCES sentences
        const overlapStart = Math.max(0, currentSentences.length - OVERLAP_SENTENCES);
        const overlap = currentSentences.slice(overlapStart);
        currentSentences = [...overlap];
        currentLength = currentSentences.join(' ').length;
      }

      // If we've reached the target and have enough sentences for overlap, consider splitting
      if (currentLength + sentenceLen > TARGET_CHARS && currentSentences.length > OVERLAP_SENTENCES) {
        chunks.push(currentSentences.join(' '));

        // Start next chunk with overlap
        const overlapStart = Math.max(0, currentSentences.length - OVERLAP_SENTENCES);
        const overlap = currentSentences.slice(overlapStart);
        currentSentences = [...overlap];
        currentLength = currentSentences.join(' ').length;
      }

      currentSentences.push(sentence);
      currentLength = currentSentences.join(' ').length;
    }

    // Flush remaining sentences
    if (currentSentences.length > 0) {
      const remainingText = currentSentences.join(' ');
      // If the remaining text is very small and we already have chunks,
      // merge with the last chunk if it fits within max
      if (chunks.length > 0 && remainingText.length < TARGET_CHARS * 0.3) {
        const lastChunk = chunks[chunks.length - 1];
        const merged = lastChunk + ' ' + remainingText;
        if (merged.length <= MAX_CHARS) {
          chunks[chunks.length - 1] = merged;
        } else {
          chunks.push(remainingText);
        }
      } else {
        chunks.push(remainingText);
      }
    }

    return chunks;
  }

  /**
   * Get chunking statistics.
   * @returns {Object}
   */
  getStats() {
    return { ...this.stats };
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let instance = null;

/**
 * Get the singleton Chunker instance.
 * @returns {Chunker}
 */
export function getChunker() {
  if (!instance) {
    instance = new Chunker();
  }
  return instance;
}

export default { getChunker };
