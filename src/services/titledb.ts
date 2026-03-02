/**
 * TitleDB service for fetching and caching Nintendo Switch title metadata
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { TitleDBEntry, TitleDBVersionEntry, TitleDBCache } from "../types";
import {
  TITLEDB_ENABLED,
  TITLEDB_REGION,
  TITLEDB_LANGUAGE,
  TITLEDB_CACHE_DIR,
  TITLEDB_AUTO_UPDATE,
  TITLEDB_BASE_URL,
  TITLEDB_CACHE_TTL,
} from "../config";

let titleDBCache: TitleDBCache | null = null;
let isInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Metadata file tracking last update times for cached files
 */
interface CacheMetadata {
  [filename: string]: number; // timestamp
}

let cacheMetadata: CacheMetadata = {};

/**
 * Get the path to a cached TitleDB file
 */
function getCachePath(filename: string): string {
  return join(TITLEDB_CACHE_DIR, filename);
}

/**
 * Get the path to the cache metadata file
 */
function getMetadataPath(): string {
  return join(TITLEDB_CACHE_DIR, ".cache-metadata.json");
}

/**
 * Load cache metadata from disk
 */
async function loadCacheMetadata(): Promise<void> {
  const metadataPath = getMetadataPath();
  
  if (!existsSync(metadataPath)) {
    cacheMetadata = {};
    return;
  }
  
  try {
    const file = Bun.file(metadataPath);
    const data = await file.json();
    cacheMetadata = typeof data === "object" && data !== null ? data : {};
    console.log(`[TITLEDB] Loaded cache metadata from ${metadataPath}`);
  } catch (error) {
    console.warn(`[TITLEDB] Failed to load cache metadata, starting fresh:`, error);
    cacheMetadata = {};
  }
}

/**
 * Save cache metadata to disk
 */
async function saveCacheMetadata(): Promise<void> {
  try {
    ensureCacheDir();
    const metadataPath = getMetadataPath();
    await Bun.write(metadataPath, JSON.stringify(cacheMetadata));
  } catch (error) {
    console.warn(`[TITLEDB] Failed to save cache metadata:`, error);
  }
}

/**
 * Check if a cached file is still fresh based on TTL
 */
function isCacheFresh(filename: string): boolean {
  const lastUpdated = cacheMetadata[filename];
  if (!lastUpdated) return false;
  
  const now = Date.now();
  const ageSecs = (now - lastUpdated) / 1000;
  const isFresh = ageSecs < TITLEDB_CACHE_TTL;
  
  if (!isFresh) {
    const ageHours = Math.round(ageSecs / 3600);
    console.log(`[TITLEDB] Cache for ${filename} is stale (${ageHours} hours old, TTL: ${TITLEDB_CACHE_TTL / 3600} hours)`);
  }
  
  return isFresh;
}

/**
 * Ensure the TitleDB cache directory exists
 */
function ensureCacheDir(): void {
  if (!existsSync(TITLEDB_CACHE_DIR)) {
    mkdirSync(TITLEDB_CACHE_DIR, { recursive: true });
    console.log(`[TITLEDB] Created cache directory: ${TITLEDB_CACHE_DIR}`);
  }
}

/**
 * Download a TitleDB file from the remote repository
 */
async function downloadTitleDBFile(filename: string): Promise<any | null> {
  const url = `${TITLEDB_BASE_URL}/${filename}`;
  
  try {
    console.log(`[TITLEDB] Downloading ${filename} from ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`[TITLEDB] Failed to download ${filename}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    
    // Cache the downloaded file (minified to reduce disk usage)
    ensureCacheDir();
    const cachePath = getCachePath(filename);
    await Bun.write(cachePath, JSON.stringify(data));
    
    // Update metadata with current timestamp
    cacheMetadata[filename] = Date.now();
    await saveCacheMetadata();
    
    console.log(`[TITLEDB] Cached ${filename} to ${cachePath}`);
    
    return data;
  } catch (error) {
    console.error(`[TITLEDB] Error downloading ${filename}:`, error);
    return null;
  }
}

/**
 * Load a TitleDB file from cache or download it
 * 
 * When autoUpdate is true, downloads if cache is stale (based on TTL)
 * When autoUpdate is false, loads from cache and only downloads if missing
 */
async function loadTitleDBFile(filename: string, autoUpdate: boolean = true): Promise<any | null> {
  const cachePath = getCachePath(filename);
  
  // If auto-update is disabled, prefer cache over network
  if (!autoUpdate && existsSync(cachePath)) {
    try {
      const file = Bun.file(cachePath);
      const data = await file.json();
      console.log(`[TITLEDB] Loaded ${filename} from cache`);
      return data;
    } catch (error) {
      console.warn(`[TITLEDB] Failed to load cached ${filename}, will download:`, error);
    }
  }
  
  // If auto-update is enabled, check if cache is still fresh
  if (autoUpdate) {
    if (existsSync(cachePath) && isCacheFresh(filename)) {
      try {
        const file = Bun.file(cachePath);
        const data = await file.json();
        console.log(`[TITLEDB] Using fresh cached ${filename}`);
        return data;
      } catch (error) {
        console.warn(`[TITLEDB] Failed to load cached ${filename}, will re-download:`, error);
      }
    }
    
    // Cache is stale or missing - download fresh
    return await downloadTitleDBFile(filename);
  }
  
  // No cache and auto-update disabled - try stale cache or fail gracefully
  if (existsSync(cachePath)) {
    try {
      const file = Bun.file(cachePath);
      const data = await file.json();
      console.log(`[TITLEDB] Loaded stale ${filename} from cache (auto-update disabled)`);
      return data;
    } catch (error) {
      console.error(`[TITLEDB] Failed to load cached ${filename}:`, error);
    }
  }
  
  return null;
}

/**
 * Parse TitleDB titles JSON into our internal format
 */
function parseTitlesData(data: any): Map<string, TitleDBEntry> {
  const titles = new Map<string, TitleDBEntry>();
  
  if (!data || typeof data !== "object") {
    return titles;
  }
  
  // TitleDB format: { "decimalId": { id: "hexTitleId", name, publisher, category, ... }, ... }
  for (const [_decimalId, info] of Object.entries(data)) {
    if (typeof info !== "object" || !info) continue;
    
    const entry = info as any;
    // Use the hex id field from the entry, not the decimal key
    const hexTitleId = (entry.id || "").toUpperCase();
    if (!hexTitleId) continue;
    
    const titleEntry: TitleDBEntry = {
      id: hexTitleId,
      name: entry.name || "Unknown Title",
      publisher: entry.publisher,
      category: Array.isArray(entry.category) ? entry.category : entry.category ? [entry.category] : undefined,
      description: entry.description,
      iconUrl: entry.iconUrl,
      bannerUrl: entry.bannerUrl,
      screenshots: Array.isArray(entry.screenshots) ? entry.screenshots : undefined,
      releaseDate: entry.releaseDate,
      rating: entry.rating,
      ratingContent: Array.isArray(entry.ratingContent) ? entry.ratingContent : undefined,
      numberOfPlayers: entry.numberOfPlayers,
      size: entry.size,
      languages: Array.isArray(entry.languages) ? entry.languages : undefined,
      region: entry.region,
      intro: entry.intro,
    };
    
    titles.set(titleEntry.id, titleEntry);
  }
  
  console.log(`[TITLEDB] Parsed ${titles.size} titles from database`);
  return titles;
}

/**
 * Parse TitleDB versions JSON into our internal format
 * 
 * TitleDB format: { "titleId": { "version_number": "release_date", ... }, ... }
 * Example:
 * {
 *   "0100000000010000": {
 *     "65536": "2017-10-26",
 *     "131072": "2017-11-30",
 *     "196608": "2018-02-22"
 *   }
 * }
 */
function parseVersionsData(data: any): Map<string, TitleDBVersionEntry[]> {
  const versions = new Map<string, TitleDBVersionEntry[]>();
  
  if (!data || typeof data !== "object") {
    return versions;
  }
  
  // TitleDB format: { "titleId": { "versionNum": "releaseDate", ... }, ... }
  for (const [titleId, versionObj] of Object.entries(data)) {
    if (typeof versionObj !== "object" || versionObj === null) continue;
    
    const entries: TitleDBVersionEntry[] = [];
    
    for (const [versionNum, releaseDate] of Object.entries(versionObj)) {
      const versionValue = parseInt(versionNum);
      if (isNaN(versionValue)) continue;
      
      entries.push({
        id: titleId.toUpperCase(),
        version: versionNum,
        releaseDate: typeof releaseDate === "string" ? new Date(releaseDate).getTime() : undefined,
      });
    }
    
    if (entries.length > 0) {
      versions.set(titleId.toUpperCase(), entries);
    }
  }
  
  console.log(`[TITLEDB] Parsed versions for ${versions.size} titles`);
  return versions;
}

/**
 * Initialize the TitleDB cache
 */
export async function initializeTitleDB(): Promise<void> {
  if (isInitialized) return;
  
  if (initPromise) {
    return initPromise;
  }
  
  initPromise = (async () => {
    if (!TITLEDB_ENABLED) {
      console.log("[TITLEDB] TitleDB is disabled");
      isInitialized = true;
      return;
    }
    
    console.log("[TITLEDB] Initializing TitleDB service...");
    console.log(`[TITLEDB] Region: ${TITLEDB_REGION}, Language: ${TITLEDB_LANGUAGE}`);
    console.log(`[TITLEDB] Cache TTL: ${TITLEDB_CACHE_TTL / 3600} hours`);
    
    ensureCacheDir();
    
    // Load cache metadata from disk
    await loadCacheMetadata();
    
    const titlesFilename = `${TITLEDB_REGION}.${TITLEDB_LANGUAGE}.json`;
    const versionsFilename = "versions.json";
    
    // Load or download titles
    const titlesData = await loadTitleDBFile(titlesFilename, TITLEDB_AUTO_UPDATE);
    const titles = titlesData ? parseTitlesData(titlesData) : new Map();
    
    // Load or download versions
    const versionsData = await loadTitleDBFile(versionsFilename, TITLEDB_AUTO_UPDATE);
    const versions = versionsData ? parseVersionsData(versionsData) : new Map();
    
    titleDBCache = {
      titles,
      versions,
      lastUpdated: Date.now(),
    };
    
    isInitialized = true;
    console.log(`[TITLEDB] Initialization complete. ${titles.size} titles, ${versions.size} version entries`);
  })();
  
  return initPromise;
}

/**
 * Get title information by title ID
 */
export async function getTitleInfo(titleId: string): Promise<TitleDBEntry | null> {
  if (!TITLEDB_ENABLED) return null;
  
  await initializeTitleDB();
  
  if (!titleDBCache) return null;
  
  const normalizedId = titleId.toUpperCase();
  return titleDBCache.titles.get(normalizedId) || null;
}

/**
 * Get version information for a title ID
 */
export async function getTitleVersions(titleId: string): Promise<TitleDBVersionEntry[] | null> {
  if (!TITLEDB_ENABLED) return null;
  
  await initializeTitleDB();
  
  if (!titleDBCache) return null;
  
  const normalizedId = titleId.toUpperCase();
  return titleDBCache.versions.get(normalizedId) || null;
}

/**
 * Get the latest version for a title ID
 */
export async function getLatestVersion(titleId: string): Promise<string | null> {
  const versions = await getTitleVersions(titleId);
  
  if (!versions || versions.length === 0) return null;
  
  // Sort by release date (descending) and return the first
  const sorted = [...versions].sort((a, b) => {
    if (!a.releaseDate || !b.releaseDate) return 0;
    return b.releaseDate - a.releaseDate;
  });
  
  return sorted[0]?.version || null;
}

/**
 * Search for titles by name (case-insensitive partial match)
 */
export async function searchTitles(query: string, limit: number = 20): Promise<TitleDBEntry[]> {
  if (!TITLEDB_ENABLED) return [];
  
  await initializeTitleDB();
  
  if (!titleDBCache) return [];
  
  const normalizedQuery = query.toLowerCase();
  const results: TitleDBEntry[] = [];
  
  for (const entry of titleDBCache.titles.values()) {
    if (entry.name.toLowerCase().includes(normalizedQuery)) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }
  
  return results;
}

/**
 * Search for a title by exact or near-exact name match
 * Returns the best matching title ID, or null if no good match found
 */
export async function searchByName(titleName: string): Promise<string | null> {
  if (!TITLEDB_ENABLED) return null;
  
  await initializeTitleDB();
  
  if (!titleDBCache) return null;
  
  const normalizedQuery = titleName.toLowerCase().trim();
  
  // First try exact match
  for (const entry of titleDBCache.titles.values()) {
    if (entry.name.toLowerCase().trim() === normalizedQuery) {
      return entry.id;
    }
  }
  
  // Then try partial match (first result)
  for (const entry of titleDBCache.titles.values()) {
    if (entry.name.toLowerCase().includes(normalizedQuery)) {
      console.log(`[TITLEDB] Found match for "${titleName}": ${entry.name} (${entry.id})`);
      return entry.id;
    }
  }
  
  console.warn(`[TITLEDB] No match found for title name: "${titleName}"`);
  return null;
}

/**
 * Force refresh the TitleDB cache
 */
export async function refreshTitleDB(): Promise<void> {
  if (!TITLEDB_ENABLED) {
    console.log("[TITLEDB] Cannot refresh: TitleDB is disabled");
    return;
  }
  
  console.log("[TITLEDB] Forcing TitleDB refresh...");
  isInitialized = false;
  initPromise = null;
  titleDBCache = null;
  cacheMetadata = {}; // Clear metadata to force re-download
  await saveCacheMetadata();
  await initializeTitleDB();
}

/**
 * Get TitleDB statistics
 */
export async function getTitleDBStats(): Promise<{
  enabled: boolean;
  initialized: boolean;
  titleCount: number;
  versionCount: number;
  lastUpdated: number | null;
}> {
  await initializeTitleDB();
  
  return {
    enabled: TITLEDB_ENABLED,
    initialized: isInitialized,
    titleCount: titleDBCache?.titles.size || 0,
    versionCount: titleDBCache?.versions.size || 0,
    lastUpdated: titleDBCache?.lastUpdated || null,
  };
}
