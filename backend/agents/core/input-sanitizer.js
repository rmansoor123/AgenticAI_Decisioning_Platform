/**
 * Input Sanitizer — Prompt injection detection for LLM inputs.
 * Scans for injection patterns in seller-provided text before
 * it's included in agent prompts.
 * Singleton: getInputSanitizer()
 */

// Patterns that indicate prompt injection attempts
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?(previous|above|prior)/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?:/i,
  /system\s*prompt/i,
  /\bdo\s+not\s+follow\b.*\brules\b/i,
  /override\s+(all\s+)?safety/i,
  /act\s+as\s+(a\s+)?different/i,
  /pretend\s+(you('re|\s+are)\s+)/i,
  /jailbreak/i,
  /\bDAN\b/,
  /forget\s+(everything|all|your)/i,
  /<\/?(?:system|user|assistant|prompt|instruction)/i,
  /\[\/?(?:INST|SYS)\]/i,
  /```\s*(?:system|prompt)/i,
  /\bhuman:\s*$/im,
  /\bassistant:\s*$/im,
];

// Suspicious character sequences
const SUSPICIOUS_CHARS = [
  /[\u200B-\u200F\u2028-\u202F\uFEFF]/, // Zero-width/invisible chars
  /[\u0000-\u0008\u000E-\u001F]/, // Control characters
];

class InputSanitizer {
  constructor() {
    this.stats = { scanned: 0, flagged: 0, sanitized: 0 };
  }

  scan(text) {
    if (!text || typeof text !== 'string') return { safe: true, threats: [], sanitized: text || '' };
    this.stats.scanned++;
    const threats = [];
    for (const pattern of INJECTION_PATTERNS) {
      const match = text.match(pattern);
      if (match) threats.push({ type: 'injection_pattern', pattern: pattern.source, matched: match[0] });
    }
    for (const pattern of SUSPICIOUS_CHARS) {
      if (pattern.test(text)) threats.push({ type: 'suspicious_chars', pattern: pattern.source });
    }
    // Excessive special characters
    const specialRatio = (text.match(/[{}\[\]<>|\\`~]/g) || []).length / Math.max(text.length, 1);
    if (specialRatio > 0.15) threats.push({ type: 'excessive_special_chars', ratio: specialRatio });
    if (threats.length > 0) this.stats.flagged++;
    return { safe: threats.length === 0, threats, riskLevel: threats.length >= 3 ? 'HIGH' : threats.length > 0 ? 'MEDIUM' : 'LOW', sanitized: text };
  }

  sanitize(text) {
    if (!text || typeof text !== 'string') return '';
    this.stats.sanitized++;
    let cleaned = text;
    // Remove invisible characters
    cleaned = cleaned.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');
    cleaned = cleaned.replace(/[\u0000-\u0008\u000E-\u001F]/g, '');
    // Escape angle brackets to prevent XML/HTML-like injection
    cleaned = cleaned.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return cleaned;
  }

  scanAndSanitize(text) {
    const result = this.scan(text);
    if (!result.safe) {
      result.sanitized = this.sanitize(text);
    }
    return result;
  }

  getStats() { return { ...this.stats }; }
}

let instance = null;
export function getInputSanitizer() {
  if (!instance) instance = new InputSanitizer();
  return instance;
}
export default { InputSanitizer, getInputSanitizer };
