/**
 * File identification module for extracting title metadata from filenames
 * 
 * This is a heuristic approach (Option A) that parses filename patterns
 * to extract title IDs, versions, and determine if files are updates/DLC.
 * 
 * Common filename patterns:
 * - Game Name [0100XXXXXXXXXXXX][v0].nsp
 * - Game Name [TID].nsp
 * - Game Name v1.2.3.nsp
 * - [0100XXXXXXXXXXXX][v0] Game Name.nsp
 */

import type { FileIdentification, AppType } from "../types";

const TITLE_ID_REGEX = /\[?([0-9A-Fa-f]{16})\]?/;
// Match [vN] format ONLY - don't match vX.Y.Z game versions
// This ensures we get the file version from the explicit [v0] marker
const VERSION_REGEX = /\[v(\d+)\]/i;
const UPDATE_KEYWORDS = ["update", "upd", "patch"];
const DLC_KEYWORDS = ["dlc", "aoc", "addon"];

/**
 * Extract title ID from filename
 */
function extractTitleId(filename: string): string | null {
  const match = filename.match(TITLE_ID_REGEX);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  return null;
}

/**
 * Extract version from filename
 */
function extractVersion(filename: string): string {
  const match = filename.match(VERSION_REGEX);
  if (match && match[1]) {
    // [vN] format - this is the explicit file version
    return match[1];
  }
  return "0";
}

/**
 * Check if filename indicates an update
 */
function isUpdateFile(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return UPDATE_KEYWORDS.some(keyword => lowerFilename.includes(keyword));
}

/**
 * Check if filename indicates DLC
 */
function isDLCFile(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return DLC_KEYWORDS.some(keyword => lowerFilename.includes(keyword));
}

/**
 * Determine app type based on title ID pattern
 * 
 * Nintendo Switch Title IDs are 64-bit values (16 hex characters).
 * They follow a strict bitmask logic based on the last 4 characters:
 * 
 * Position: 0 1 2 3 4 5 6 7 8 9 A B C D E F
 * Example:  0 1 0 0 E D 1 0 0 B 1 6 0 0 0 0  (Base - Y000, Y=even)
 * Example:  0 1 0 0 E D 1 0 0 B 1 6 0 8 0 0  (Update - Y800, Y=even)
 * Example:  0 1 0 0 A E A 0 2 5 0 E B 0 0 1  (DLC - OXXX, O=odd)
 * 
 * Rules (checking character at position 12 and last 3 chars):
 * - Base Game: Ends in Y000, where Y is EVEN (0,2,4,6,8,A,C,E) → AppType = 0
 * - Update: Ends in Y800, where Y is EVEN (same as base) → AppType = 2
 * - DLC: Ends in OXXX, where O is ODD (1,3,5,7,9,B,D,F), XXX is DLC index → AppType = 1
 * 
 * Examples:
 * - Base:   0100ED100B160000 (0000 - 0 is even, ends 000)
 * - Update: 0100ED100B160800 (0800 - 0 is even, ends 800)
 * - Base:   0100AEA0250EA000 (A000 - A is even, ends 000)
 * - Update: 0100AEA0250EA800 (A800 - A is even, ends 800)
 * - DLC:    0100AEA0250EB001 (B001 - B is odd)
 */
function getAppTypeFromTitleId(titleId: string): AppType {
  if (titleId.length !== 16) return 0; // BASE
  
  // Get character at position 12 and last 3 characters
  const char12 = titleId.charAt(12).toUpperCase();
  const last3 = titleId.substring(13).toUpperCase();
  
  // Check if position 12 is even or odd
  const charValue = parseInt(char12, 16);
  const isEven = (charValue % 2) === 0;
  
  if (isEven) {
    // Even digit at position 12
    if (last3 === "000") return 0; // BASE
    if (last3 === "800") return 2; // UPDATE
  } else {
    // Odd digit at position 12 = always DLC
    return 1; // DLC
  }
  
  // Fallback for unexpected patterns
  return 0; // BASE
}

/**
 * Get base title ID from an update or DLC title ID
 * 
 * Uses the bitmask formula to convert update/DLC title IDs to base:
 * - For updates: Change Y800 to Y000 (keep char at position 12, change last 3)
 * - For DLC: Change odd digit at position 12 to even (decrement by 1), set last 3 to 000
 *   - Formula: DLC has odd char at pos 12, base has (odd-1) = even char
 *   - Examples: B→A, D→C, F→E, 1→0, 3→2, etc.
 */
function getBaseTitleId(titleId: string, appType: AppType): string | undefined {
  if (appType === 0) return undefined; // BASE
  
  if (titleId.length !== 16) return undefined;
  
  const first12 = titleId.substring(0, 12);
  const char12 = titleId.charAt(12).toUpperCase();
  
  // For updates: Y800 -> Y000 (Y stays the same, just change last 3)
  if (appType === 2) { // UPDATE
    return `${first12}${char12}000`;
  }
  
  // For DLC: Odd digit at position 12 -> decrement to even, append 000
  // DLC formula: Base + 0x1000 + DLC_Index
  // Reverse: DLC - 0x1000 = Base (approximately, we decrement the odd digit)
  const charValue = parseInt(char12, 16);
  
  if ((charValue % 2) === 1) {
    // Odd digit - decrement by 1 to get even base digit
    const baseChar = (charValue - 1).toString(16).toUpperCase();
    return `${first12}${baseChar}000`;
  }
  
  // Fallback for unexpected patterns
  return `${first12}0000`;
}

/**
 * Identify file metadata from filename
 */
export function identifyFile(filename: string): FileIdentification {
  const titleId = extractTitleId(filename);
  const version = extractVersion(filename);
  const isUpdate = isUpdateFile(filename);
  const isDLC = isDLCFile(filename);
  
  // Determine app type (0=BASE, 1=DLC, 2=UPDATE)
  let appType: AppType = 0; // BASE
  
  if (titleId) {
    // Use title ID to determine type
    appType = getAppTypeFromTitleId(titleId);
  } else {
    // Fall back to filename keywords
    if (isUpdate) appType = 2; // UPDATE
    else if (isDLC) appType = 1; // DLC
  }
  
  // Get base title ID if this is an update or DLC
  const baseTitleId = titleId ? getBaseTitleId(titleId, appType) : undefined;
  
  return {
    titleId,
    appType,
    version,
    isDLC: appType === 1, // DLC
    isUpdate: appType === 2, // UPDATE
    baseTitleId,
  };
}

/**
 * Parse a clean game name from filename
 * Removes title IDs, versions, file extensions, and common bracketed metadata
 */
export function parseGameName(filename: string): string {
  let name = filename;
  
  // Remove file extension
  name = name.replace(/\.(nsp|nsz|xci|xciz)$/i, "");
  
  // Remove title IDs in brackets
  name = name.replace(/\[?[0-9A-Fa-f]{16}\]?/g, "");
  
  // Remove explicit file version tags ([vN] format)
  name = name.replace(/\[v\d+\]/gi, "");
  
  // Remove other common bracketed content ([APP], [DLC], etc.)
  name = name.replace(/\[.*?\]/g, "");
  
  // Remove parenthetical content (often region codes like (USA), (EUR), etc)
  name = name.replace(/\(.*?\)/g, "");
  
  // Remove game version numbers at the start (v1.0.0, v2.3.4, etc)
  // This handles filenames like "Game Name v1.0.0[TITLEID][v0]"
  name = name.replace(/^\s*v\d+\.\d+(\.\d+)?\s*/gi, "");
  
  // Remove any remaining version-like patterns at the end
  // Only remove if it looks like vX.Y.Z pattern
  name = name.replace(/\s+v\d+(\.\d+)*\s*$/gi, "");
  
  // Clean up multiple spaces and trim
  name = name.replace(/\s+/g, " ").trim();
  
  // If nothing left, use original filename
  if (name.length === 0) {
    name = filename.replace(/\.(nsp|nsz|xci|xciz)$/i, "");
  }
  
  return name;
}

/**
 * Get a display name with version info
 */
export function getDisplayName(filename: string, titleName?: string): string {
  const parsed = parseGameName(filename);
  const version = extractVersion(filename);
  const name = titleName || parsed;
  
  if (version !== "0") {
    return `${name} (v${version})`;
  }
  
  return name;
}
