/**
 * File override system for manual identification of badly-named files
 * 
 * Supports distributed override files (omnifoil-overrides.json) that live
 * alongside game files, allowing minimal specification with smart resolution.
 */

import { existsSync } from "fs";
import { join, dirname } from "path";
import type { FileOverride, OverrideFile, AppType } from "../types";
import { OVERRIDE_FILENAME, OVERRIDES_ENABLED } from "../config";
import { searchByName, getTitleInfo } from "../services/titledb";

/**
 * Cache of loaded override files by directory path
 */
const overrideCache = new Map<string, Map<string, FileOverride>>();

/**
 * Resolved override with numeric appType
 */
interface ResolvedOverride {
  titleId?: string;
  baseTitleId?: string;
  appType?: AppType;
  version?: string;
  titleName?: string;
  category?: string[];
  iconUrl?: string;
  bannerUrl?: string;
}

/**
 * Parse string appType to numeric AppType
 * Supports: GAME/BASE (0), DLC (1), UPDATE (2), DEMO (3)
 * Case-insensitive
 */
function parseAppType(value: string | AppType | undefined): AppType | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return value as AppType;
  
  const normalized = value.toUpperCase().trim();
  
  switch (normalized) {
    case 'GAME':
    case 'BASE':
      return 0;
    case 'DLC':
      return 1;
    case 'UPDATE':
    case 'PATCH':
      return 2;
    case 'DEMO':
      return 3;
    default:
      console.warn(`[OVERRIDES] Unknown appType value: "${value}", defaulting to GAME (0)`);
      return 0;
  }
}

/**
 * Convert a base title ID to an update or DLC title ID based on app type
 */
function convertTitleIdForAppType(baseTitleId: string, appType: AppType): string {
  if (baseTitleId.length !== 16) return baseTitleId;
  
  const first12 = baseTitleId.substring(0, 12);
  const char12 = baseTitleId.charAt(12).toUpperCase();
  
  if (appType === 0) {
    // BASE - ensure it ends in Y000 where Y is even
    return `${first12}${char12}000`;
  } else if (appType === 2) {
    // UPDATE - change Y000 to Y800
    return `${first12}${char12}800`;
  } else if (appType === 1) {
    // DLC - increment even digit at position 12 to odd, append 001 for first DLC
    const charValue = parseInt(char12, 16);
    const dlcChar = ((charValue % 2) === 0 ? charValue + 1 : charValue).toString(16).toUpperCase();
    return `${first12}${dlcChar}001`;
  } else if (appType === 3) {
    // DEMO - typically same pattern as BASE but different bitmask
    // For simplicity, treat as BASE
    return `${first12}${char12}000`;
  }
  
  return baseTitleId;
}

/**
 * Derive base title ID from update or DLC title ID
 */
function deriveBaseTitleId(titleId: string, appType: AppType): string | undefined {
  if (appType === 0) return undefined; // BASE games don't have a base
  
  if (titleId.length !== 16) return undefined;
  
  const first12 = titleId.substring(0, 12);
  const char12 = titleId.charAt(12).toUpperCase();
  
  if (appType === 2) {
    // UPDATE: Y800 -> Y000
    return `${first12}${char12}000`;
  } else if (appType === 1) {
    // DLC: Odd digit -> decrement to even, append 000
    const charValue = parseInt(char12, 16);
    if ((charValue % 2) === 1) {
      const baseChar = (charValue - 1).toString(16).toUpperCase();
      return `${first12}${baseChar}000`;
    }
  }
  
  return undefined;
}

/**
 * Load override file from a directory
 */
async function loadOverridesFromDirectory(dirPath: string): Promise<Map<string, FileOverride>> {
  const overridePath = join(dirPath, OVERRIDE_FILENAME);
  
  if (!existsSync(overridePath)) {
    return new Map();
  }
  
  try {
    const file = Bun.file(overridePath);
    const data: OverrideFile = await file.json();
    
    const overrideMap = new Map<string, FileOverride>();
    
    if (data.overrides && typeof data.overrides === "object") {
      for (const [filename, override] of Object.entries(data.overrides)) {
        overrideMap.set(filename, override);
      }
      console.log(`[OVERRIDES] Loaded ${overrideMap.size} overrides from ${overridePath}`);
    }
    
    return overrideMap;
  } catch (error) {
    console.error(`[OVERRIDES] Failed to load override file ${overridePath}:`, error);
    return new Map();
  }
}

/**
 * Resolve an override with smart completion
 * 
 * This function takes a minimal override specification and intelligently
 * fills in missing fields using TitleDB lookups and title ID conversions.
 * 
 * Resolution strategy:
 * 1. If titleId is explicitly provided, use it directly
 * 2. If only titleName + appType provided, lookup base game in TitleDB,
 *    then convert title ID based on appType
 * 3. Derive baseTitleId automatically for updates/DLC
 * 4. Preserve any manually specified metadata (category, iconUrl, etc.)
 */
export async function resolveOverride(
  override: FileOverride,
  filename: string
): Promise<ResolvedOverride> {
  const resolved: ResolvedOverride = {};
  
  // Copy manual overrides that don't require parsing
  if (override.titleId) resolved.titleId = override.titleId.toUpperCase();
  if (override.baseTitleId) resolved.baseTitleId = override.baseTitleId;
  if (override.version) resolved.version = override.version;
  if (override.titleName) resolved.titleName = override.titleName;
  if (override.category) resolved.category = override.category;
  if (override.iconUrl !== undefined) resolved.iconUrl = override.iconUrl;
  if (override.bannerUrl !== undefined) resolved.bannerUrl = override.bannerUrl;
  
  // Parse appType if it's a string
  const parsedAppType = parseAppType(override.appType);
  if (parsedAppType !== undefined) {
    resolved.appType = parsedAppType;
  }
  
  // If titleId is manually specified, use it
  if (resolved.titleId) {
    // Auto-derive baseTitleId if not provided and file is update/DLC
    if (!resolved.baseTitleId && resolved.appType !== undefined && resolved.appType !== 0) {
      resolved.baseTitleId = deriveBaseTitleId(resolved.titleId, resolved.appType);
    }
    
    console.log(`[OVERRIDES] Resolved override for ${filename}: Using explicit titleId ${resolved.titleId}`);
    return resolved;
  }
  
  // Smart resolution: lookup by title name
  if (override.titleName && parsedAppType !== undefined) {
    try {
      // Search for the base game in TitleDB
      const baseTitleId = await searchByName(override.titleName);
      
      if (baseTitleId) {
        // Convert base title ID to the appropriate type
        resolved.titleId = convertTitleIdForAppType(baseTitleId, parsedAppType);
        resolved.appType = parsedAppType;
        
        // Set baseTitleId for updates/DLC
        if (parsedAppType !== 0) {
          resolved.baseTitleId = baseTitleId;
        }
        
        // If no explicit metadata provided, fetch from TitleDB using base ID
        if (!resolved.category || !resolved.iconUrl || !resolved.bannerUrl) {
          const titleInfo = await getTitleInfo(baseTitleId);
          if (titleInfo) {
            if (!resolved.category) resolved.category = titleInfo.category || [];
            if (resolved.iconUrl === undefined) resolved.iconUrl = titleInfo.iconUrl ?? undefined;
            if (resolved.bannerUrl === undefined) resolved.bannerUrl = titleInfo.bannerUrl ?? undefined;
          }
        }
        
        console.log(
          `[OVERRIDES] Resolved override for ${filename}: ` +
          `${override.titleName} -> ${resolved.titleId} (appType: ${parsedAppType})`
        );
        
        return resolved;
      } else {
        console.warn(
          `[OVERRIDES] Could not resolve titleId for ${filename}: ` +
          `No TitleDB match for "${override.titleName}"`
        );
      }
    } catch (error) {
      console.error(`[OVERRIDES] Error resolving override for ${filename}:`, error);
    }
  }
  
  // Partial resolution failed - return what we have
  if (!resolved.titleId) {
    console.warn(
      `[OVERRIDES] Incomplete override for ${filename}: ` +
      `Missing titleId and unable to resolve from titleName`
    );
  }
  
  return resolved;
}

/**
 * Get override for a specific file
 * 
 * @param filename - The filename to look up (e.g., "game.nsp")
 * @param absPath - The absolute path to the file
 * @returns Resolved override or null if not found
 */
export async function getOverrideForFile(
  filename: string,
  absPath: string
): Promise<ResolvedOverride | null> {
  if (!OVERRIDES_ENABLED) {
    return null;
  }
  
  const dirPath = dirname(absPath);
  
  // Check cache first
  let overrideMap = overrideCache.get(dirPath);
  
  // Load if not cached
  if (!overrideMap) {
    overrideMap = await loadOverridesFromDirectory(dirPath);
    overrideCache.set(dirPath, overrideMap);
  }
  
  // Look up override by filename
  const override = overrideMap.get(filename);
  
  if (!override) {
    return null;
  }
  
  // Resolve and return
  return await resolveOverride(override, filename);
}

/**
 * Clear the override cache (useful for testing or hot-reloading)
 */
export function clearOverrideCache(): void {
  overrideCache.clear();
  console.log("[OVERRIDES] Cache cleared");
}
