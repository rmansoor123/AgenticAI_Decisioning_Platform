/**
 * Document Ingestion Engine — ingest from web, PDF, structured data, APIs.
 * Normalizes into training-ready format.
 *
 * Supports: HTML, PDF, JSON, CSV, plain text, API responses.
 * Pipeline: Source -> Fetch -> Extract -> Normalize -> Store
 */
import { getDbOps } from '../../../shared/common/database-factory.js';

const SUPPORTED_FORMATS = ['html', 'pdf', 'json', 'csv', 'text', 'api', 'markdown'];

class DocumentIngestionEngine {
  constructor() {
    this.stats = { ingested: 0, failed: 0, byFormat: {}, totalBytes: 0 };
  }

  async ingest(doc) {
    const { sourceId, url, content, format = 'text', metadata = {}, labels = [] } = doc;
    const startTime = Date.now();

    if (!SUPPORTED_FORMATS.includes(format)) {
      this.stats.failed++;
      return { success: false, error: `Unsupported format: ${format}` };
    }

    // Extract content based on format
    let extractedText = '';
    let extractedMetadata = { ...metadata };
    let tokens = 0;

    try {
      switch (format) {
        case 'html':
          extractedText = this._stripHtml(content || '');
          extractedMetadata.originalLength = (content || '').length;
          extractedMetadata.strippedLength = extractedText.length;
          break;
        case 'pdf':
          // In production: use pdf-parse or similar. Here: simulate extraction
          extractedText = content || `[PDF content from ${url || 'upload'}]`;
          extractedMetadata.pageCount = Math.ceil((content || '').length / 3000) || 1;
          break;
        case 'json':
          const parsed = typeof content === 'string' ? JSON.parse(content) : content;
          extractedText = JSON.stringify(parsed, null, 2);
          extractedMetadata.keys = Object.keys(parsed);
          break;
        case 'csv':
          extractedText = content || '';
          const lines = extractedText.split('\n');
          extractedMetadata.rows = lines.length;
          extractedMetadata.columns = lines[0]?.split(',').length || 0;
          break;
        case 'markdown':
          extractedText = content || '';
          extractedMetadata.headings = (extractedText.match(/^#+\s/gm) || []).length;
          break;
        case 'api':
          // Fetch from URL if provided
          if (url) {
            try {
              const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
              const data = await res.json();
              extractedText = JSON.stringify(data);
              extractedMetadata.statusCode = res.status;
            } catch (err) {
              extractedText = content || '';
              extractedMetadata.fetchError = err.message;
            }
          } else {
            extractedText = typeof content === 'string' ? content : JSON.stringify(content);
          }
          break;
        default:
          extractedText = content || '';
      }

      // Tokenize (rough estimate: 1 token ~ 4 chars)
      tokens = Math.ceil(extractedText.length / 4);

      // Quality scoring
      const quality = this._scoreQuality(extractedText, format);

      // Persist
      const docId = `DOC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const db_ops = getDbOps();

      const record = {
        docId, sourceId: sourceId || 'manual',
        format, url: url || null,
        content: extractedText.substring(0, 50000), // cap storage at 50K chars
        contentLength: extractedText.length,
        tokens, labels, metadata: extractedMetadata,
        quality, status: 'INGESTED',
        ingestedAt: new Date().toISOString()
      };

      try {
        await db_ops.insert('training_documents', 'doc_id', docId, record);
      } catch (_) {}

      this.stats.ingested++;
      this.stats.byFormat[format] = (this.stats.byFormat[format] || 0) + 1;
      this.stats.totalBytes += extractedText.length;

      return {
        success: true, docId, format, tokens,
        contentLength: extractedText.length,
        quality, labels,
        latencyMs: Date.now() - startTime
      };
    } catch (err) {
      this.stats.failed++;
      return { success: false, error: err.message, format };
    }
  }

  async batchIngest(documents) {
    const results = [];
    for (const doc of documents) {
      results.push(await this.ingest(doc));
    }
    return {
      total: documents.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  _stripHtml(html) {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _scoreQuality(text, format) {
    let score = 50; // base
    const factors = [];

    // Length
    if (text.length > 100) { score += 10; factors.push('sufficient_length'); }
    if (text.length > 1000) { score += 10; factors.push('substantial_content'); }
    if (text.length < 20) { score -= 20; factors.push('too_short'); }

    // Language quality (basic checks)
    const sentenceCount = (text.match(/[.!?]+/g) || []).length;
    if (sentenceCount > 3) { score += 10; factors.push('multiple_sentences'); }

    // No excessive repetition
    const words = text.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const diversity = words.length > 0 ? uniqueWords.size / words.length : 0;
    if (diversity > 0.5) { score += 10; factors.push('good_diversity'); }
    if (diversity < 0.2) { score -= 20; factors.push('repetitive'); }

    // Format-specific
    if (format === 'json') {
      try { JSON.parse(text); score += 10; factors.push('valid_json'); } catch { score -= 10; factors.push('invalid_json'); }
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      factors,
      diversity: Math.round(diversity * 100) / 100
    };
  }

  async getDocuments(filters = {}) {
    const db_ops = getDbOps();
    const all = (await db_ops.getAll('training_documents', 10000, 0)).map(d => d.data);
    let filtered = all;
    if (filters.format) filtered = filtered.filter(d => d.format === filters.format);
    if (filters.sourceId) filtered = filtered.filter(d => d.sourceId === filters.sourceId);
    if (filters.minQuality) filtered = filtered.filter(d => d.quality?.score >= filters.minQuality);
    return filtered.sort((a, b) => new Date(b.ingestedAt) - new Date(a.ingestedAt));
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getDocumentIngestionEngine() {
  if (!instance) instance = new DocumentIngestionEngine();
  return instance;
}
export default { DocumentIngestionEngine, getDocumentIngestionEngine };
