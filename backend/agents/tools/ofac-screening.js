/**
 * OFAC SDN List Screening Module
 *
 * Downloads the US Treasury OFAC Specially Designated Nationals (SDN) list,
 * parses it into a compact JSON index, and provides fuzzy name matching
 * using Jaro-Winkler similarity (no npm dependency).
 *
 * - initOFACScreening() — call once at server startup (fire-and-forget)
 * - screenName(fullName, threshold) — fuzzy match against SDN list
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SDN_URL = 'https://www.treasury.gov/ofac/downloads/sdn.xml';
const CACHE_PATH = join(__dirname, '../../data/ofac-sdn-cache.json');
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let sdnIndex = [];      // Array of { name, sdnType, programs }
let lastRefresh = null;
let isInitialized = false;
let refreshTimer = null;

// ============================================================================
// JARO-WINKLER SIMILARITY (self-contained, no dependency)
// ============================================================================

function jaroSimilarity(s1, s2) {
  if (s1 === s2) return 1.0;
  if (!s1.length || !s2.length) return 0.0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

function jaroWinklerSimilarity(s1, s2) {
  const jaro = jaroSimilarity(s1, s2);

  // Find common prefix (up to 4 characters)
  let prefix = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  const p = 0.1; // standard Winkler scaling factor
  return jaro + prefix * p * (1 - jaro);
}

// ============================================================================
// XML PARSING (lightweight, no npm dependency)
// ============================================================================

function parseSDNXml(xmlText) {
  const entries = [];

  // Match each <sdnEntry> block
  const entryRegex = /<sdnEntry>([\s\S]*?)<\/sdnEntry>/g;
  let match;

  while ((match = entryRegex.exec(xmlText)) !== null) {
    const block = match[1];

    // Extract fields
    const firstName = extractTag(block, 'firstName') || '';
    const lastName = extractTag(block, 'lastName') || '';
    const sdnType = extractTag(block, 'sdnType') || '';

    // Extract programs
    const programs = [];
    const programRegex = /<program>([\s\S]*?)<\/program>/g;
    let progMatch;
    while ((progMatch = programRegex.exec(block)) !== null) {
      programs.push(progMatch[1].trim());
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (fullName) {
      entries.push({
        name: fullName,
        sdnType,
        programs
      });
    }
  }

  return entries;
}

function extractTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

// ============================================================================
// DOWNLOAD & CACHE
// ============================================================================

async function downloadAndParse() {
  console.log('[OFAC] Downloading SDN list from treasury.gov...');

  const response = await fetch(SDN_URL);
  if (!response.ok) {
    throw new Error(`OFAC download failed: ${response.status} ${response.statusText}`);
  }

  const xmlText = await response.text();
  console.log(`[OFAC] Downloaded ${(xmlText.length / 1024 / 1024).toFixed(1)}MB XML`);

  const entries = parseSDNXml(xmlText);
  console.log(`[OFAC] Parsed ${entries.length} SDN entries`);

  // Ensure data directory exists
  const dataDir = dirname(CACHE_PATH);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Write cache
  const cache = {
    downloadedAt: new Date().toISOString(),
    entryCount: entries.length,
    entries
  };
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
  console.log(`[OFAC] Cached ${entries.length} entries to ${CACHE_PATH}`);

  return entries;
}

function loadFromCache() {
  if (!existsSync(CACHE_PATH)) return null;

  try {
    const raw = readFileSync(CACHE_PATH, 'utf-8');
    const cache = JSON.parse(raw);

    // Check age
    const cacheAge = Date.now() - new Date(cache.downloadedAt).getTime();
    if (cacheAge > REFRESH_INTERVAL_MS) {
      console.log('[OFAC] Cache expired, will re-download');
      return null;
    }

    console.log(`[OFAC] Loaded ${cache.entryCount} entries from cache (age: ${(cacheAge / 3600000).toFixed(1)}h)`);
    return cache.entries;
  } catch (e) {
    console.warn('[OFAC] Cache read failed:', e.message);
    return null;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize OFAC screening. Call once at server startup.
 * Fire-and-forget — never throws.
 */
export async function initOFACScreening() {
  try {
    // Try cache first
    const cached = loadFromCache();
    if (cached) {
      sdnIndex = cached;
      lastRefresh = new Date();
      isInitialized = true;
    } else {
      // Download fresh
      sdnIndex = await downloadAndParse();
      lastRefresh = new Date();
      isInitialized = true;
    }

    // Schedule periodic refresh
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => {
      try {
        sdnIndex = await downloadAndParse();
        lastRefresh = new Date();
        console.log(`[OFAC] Refreshed: ${sdnIndex.length} entries`);
      } catch (e) {
        console.warn('[OFAC] Refresh failed, keeping stale data:', e.message);
      }
    }, REFRESH_INTERVAL_MS);

    // Don't prevent process exit
    if (refreshTimer.unref) refreshTimer.unref();

    console.log(`[OFAC] Screening initialized: ${sdnIndex.length} entries`);
  } catch (e) {
    console.warn('[OFAC] Initialization failed (screening will return no matches):', e.message);
    isInitialized = false;
  }
}

/**
 * Screen a name against the OFAC SDN list using fuzzy matching.
 *
 * @param {string} fullName - The name to screen
 * @param {number} threshold - Minimum Jaro-Winkler similarity (0-1, default 0.85)
 * @returns {{ matched: boolean, matches: Array, screenedAt: string, source: string }}
 */
export function screenName(fullName, threshold = 0.85) {
  if (!fullName || typeof fullName !== 'string') {
    return {
      matched: false,
      matches: [],
      screenedAt: new Date().toISOString(),
      source: 'ofac-local',
      error: 'Invalid name provided'
    };
  }

  if (!isInitialized || sdnIndex.length === 0) {
    return {
      matched: false,
      matches: [],
      screenedAt: new Date().toISOString(),
      source: 'ofac-local',
      warning: 'OFAC index not loaded — screening skipped'
    };
  }

  const normalizedInput = fullName.toUpperCase().trim();
  const matches = [];

  for (const entry of sdnIndex) {
    const normalizedEntry = entry.name.toUpperCase().trim();
    const score = jaroWinklerSimilarity(normalizedInput, normalizedEntry);

    if (score >= threshold) {
      matches.push({
        name: entry.name,
        score: Math.round(score * 1000) / 1000,
        sdnType: entry.sdnType,
        programs: entry.programs
      });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  return {
    matched: matches.length > 0,
    matches: matches.slice(0, 10), // Top 10
    screenedAt: new Date().toISOString(),
    source: 'ofac-local',
    indexSize: sdnIndex.length,
    lastRefresh: lastRefresh?.toISOString() || null
  };
}

/**
 * Get OFAC screening status.
 */
export function getOFACStatus() {
  return {
    initialized: isInitialized,
    entryCount: sdnIndex.length,
    lastRefresh: lastRefresh?.toISOString() || null,
    cachePath: CACHE_PATH
  };
}
