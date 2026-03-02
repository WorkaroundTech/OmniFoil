/**
 * Shop data building logic
 */

import { BASES, GLOB_PATTERN, SUCCESS_MESSAGE, CACHE_TTL, REFERRER, OVERRIDE_FILENAME } from "../config";
import { encodePath } from "../lib/paths";
import { identifyFile, parseGameName } from "../lib/identification";
import { getTitleInfo } from "./titledb";
import { getOverrideForFile } from "../lib/overrides";
import type { AppType } from "../types";

export interface ShopData {
  files: Array<{ url: string; size: number }>;
  success?: string;
  referrer?: string;
}

export interface CatalogFileEntry {
  id: number;
  virtualPath: string;
  absPath: string;
  filename: string;
  size: number;
  name: string;
  appId: string;
  // Enhanced metadata from TitleDB and file identification
  titleId: string | null;
  titleName: string | null;
  appType: AppType;
  version: string;
  category: string[];
  iconUrl: string | null;
  bannerUrl: string | null;
  baseTitleId: string | null;
  hasTitleDbMatch: boolean;
  releaseDate?: number;   // Unix timestamp from TitleDB
  rating?: number;        // 0-10 scale from TitleDB
}

interface ShopSectionsItem {
  name: string;
  title_name: string;
  title_id: string | null;
  app_id: string;
  app_version: number;
  app_type: AppType;
  category: string;
  icon_url: string;
  url: string;
  size: number;
  file_id: number;
  filename: string;
  download_count: number;
}

export interface ShopSectionsPayload {
  sections: Array<{
    id: "new" | "recommended" | "updates" | "dlc" | "all" | "other";
    title: string;
    items: ShopSectionsItem[];
    total?: number;
    truncated?: boolean;
  }>;
}

export interface ShopCatalog {
  shopData: ShopData;
  sectionsPayload: ShopSectionsPayload;
  entries: CatalogFileEntry[];
}

type ScannedFileEntry = { virtualPath: string; absPath: string; filename: string; size: number };

let cachedCatalog: ShopCatalog | null = null;
let cachedAt = 0;
const cacheTtlMs = Math.max(0, CACHE_TTL) * 1000;

function buildAppIdFromNumber(id: number): string {
  return id.toString(16).toUpperCase().padStart(16, "0");
}

function toSectionsItem(entry: CatalogFileEntry): ShopSectionsItem {
  // Use enriched metadata from TitleDB and file identification
  const displayName = entry.titleName || entry.name;
  const category = entry.category.length > 0 ? entry.category.join(", ") : "";
  
  // For CyberFoil compatibility with AeroFoil's API contract:
  // - For BASE games: title_id = the base game's title
  // - For UPDATES: title_id = the base game's title (for grouping by base)
  // - For DLC: title_id = the base game's title (for grouping by base)
  // - app_id is always the file's own title ID
  const titleIdForResponse = entry.appType === 0 ? entry.titleId : entry.baseTitleId; // 0=BASE
  
  // Icon URL should point to the base game's icon (for updates/DLC) or the game's own icon (for base)
  // This ensures consistency and matches how metadata was fetched from TitleDB
  const iconTitleId = entry.appType === 0 ? entry.titleId : entry.baseTitleId; // 0=BASE
  const iconUrl = entry.iconUrl ? `/api/shop/icon/${iconTitleId}` : "";
  
  return {
    name: displayName,
    title_name: displayName,
    title_id: titleIdForResponse,
    app_id: entry.appId,
    app_version: parseInt(entry.version, 10) || 0,
    app_type: entry.appType,
    category,
    icon_url: iconUrl,
    url: `/api/get_game/${entry.id}#${entry.filename}`,
    size: entry.size,
    file_id: entry.id,
    filename: entry.filename,
    download_count: 0,
  };
}

function buildSectionsPayload(entries: CatalogFileEntry[], limit: number): ShopSectionsPayload {
  const safeLimit = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 50);

  const matchedEntries = entries.filter((entry) => entry.hasTitleDbMatch);
  const otherEntries = entries.filter((entry) => !entry.hasTitleDbMatch);

  // Separate matched entries by type (0=BASE, 1=DLC, 2=UPDATE)
  const baseGames = matchedEntries.filter((entry) => entry.appType === 0);
  const updates = matchedEntries.filter((entry) => entry.appType === 2);
  const dlc = matchedEntries.filter((entry) => entry.appType === 1);

  // Sort base games by release date (newest first) for new section
  const sortedByReleaseDate = [...baseGames].sort((a, b) => {
    const dateA = a.releaseDate || 0;
    const dateB = b.releaseDate || 0;
    // Sort by release date descending (most recent first)
    if (dateA !== dateB) return dateB - dateA;
    // Tiebreaker: sort by ID descending (most recently added to catalog)
    return b.id - a.id;
  });

  // Sort base games by rating (highest first) for recommended section
  const sortedByRating = [...baseGames].sort((a, b) => {
    const ratingA = a.rating ?? 0;
    const ratingB = b.rating ?? 0;
    // Sort by rating descending (highest first)
    if (ratingA !== ratingB) return ratingB - ratingA;
    // Tiebreaker: sort by release date descending
    const dateA = a.releaseDate || 0;
    const dateB = b.releaseDate || 0;
    return dateB - dateA;
  });

  // Sort base games by name for all section
  const sortedByName = [...baseGames].sort((a, b) => {
    const nameA = a.titleName || a.name;
    const nameB = b.titleName || b.name;
    return nameA.localeCompare(nameB);
  });

  // Apply limit to discovery sections (new/recommended) per AeroFoil spec
  // Only include matched base games, unmatched entries go to "Other"
  const newItems = sortedByReleaseDate.slice(0, safeLimit).map(toSectionsItem);
  const recommendedItems = sortedByRating.slice(0, safeLimit).map(toSectionsItem);

  // Group updates by base title ID and get latest version per title
  // Following AeroFoil's pattern: group by the base game's title_id
  const updatesByBaseTitle = new Map<string, CatalogFileEntry>();
  for (const update of updates) {
    if (!update.baseTitleId) continue;

    const existing = updatesByBaseTitle.get(update.baseTitleId);
    if (!existing || compareVersions(update.version, existing.version) > 0) {
      updatesByBaseTitle.set(update.baseTitleId, update);
    }
  }
  const updateItems = Array.from(updatesByBaseTitle.values())
    .sort((a, b) => (a.titleName || a.name).localeCompare(b.titleName || b.name))
    .map(toSectionsItem);

  // Group DLC by app_id (the DLC's own titleId)
  const dlcItems = [...dlc]
    .sort((a, b) => (a.titleName || a.name).localeCompare(b.titleName || b.name))
    .map(toSectionsItem);

  const allItems = sortedByName.map(toSectionsItem);
  const limitedAllItems = allItems.slice(0, safeLimit);

  const otherItems = [...otherEntries]
    .sort((a, b) => (a.titleName || a.name).localeCompare(b.titleName || b.name))
    .map(toSectionsItem);

  return {
    sections: [
      { id: "new", title: "New", items: newItems },
      { id: "recommended", title: "Recommended", items: recommendedItems },
      { id: "updates", title: "Updates", items: updateItems },
      { id: "dlc", title: "DLC", items: dlcItems },
      {
        id: "all",
        title: "All",
        items: limitedAllItems,
        total: allItems.length,
        truncated: limitedAllItems.length < allItems.length,
      },
      { id: "other", title: "Other", items: otherItems },
    ],
  };
}

/**
 * Compare two version strings (simple numeric comparison)
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(p => parseInt(p) || 0);
  const parts2 = v2.split(".").map(p => parseInt(p) || 0);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 !== p2) return p1 - p2;
  }
  
  return 0;
}

async function scanLibraryFiles(): Promise<{ files: ScannedFileEntry[]; directories: string[] }> {
  const fileEntries: ScannedFileEntry[] = [];
  const directories = new Set<string>();

  await Promise.all(
    BASES.map(async ({ path: dir, alias }) => {
      try {
        const glob = new Bun.Glob(GLOB_PATTERN);
        let fileCount = 0;
        for await (const file of glob.scan({ cwd: dir, onlyFiles: true })) {
          const virtualPath = `${alias}/${file}`;
          const absPath = `${dir}/${file}`;
          const filename = file.split("/").pop() || file;
          
          // Skip override files
          if (filename === OVERRIDE_FILENAME) {
            continue;
          }
          
          const size = Bun.file(absPath).size;
          fileEntries.push({ virtualPath, absPath, filename, size });
          fileCount++;

          const dirName = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
          if (dirName.length > 0) {
            directories.add(`${alias}/${dirName}`);
          } else {
            directories.add(alias);
          }
        }
        console.log(`[SHOP] Scanned ${fileCount} files from ${alias} (${dir})`);
      } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === "ENOENT") {
          console.log(`[SHOP] Directory not found, skipping: ${dir}`);
        } else {
          console.warn(`[SHOP] Error scanning directory ${dir}:`, error);
        }
      }
    })
  );

  const sortedEntries = fileEntries.sort((a, b) => a.virtualPath.localeCompare(b.virtualPath));
  return {
    files: sortedEntries,
    directories: Array.from(directories).map((d) => `../files/${encodePath(d)}`),
  };
}

function isCacheValid(): boolean {
  if (!cachedCatalog) return false;
  if (cacheTtlMs <= 0) return false;
  return Date.now() - cachedAt <= cacheTtlMs;
}

async function buildShopCatalog(limitForAllSection: number = 50): Promise<ShopCatalog> {
  const scanned = await scanLibraryFiles();

  const entries: CatalogFileEntry[] = await Promise.all(
    scanned.files.map(async (entry, index) => {
      const id = index + 1;
      
      // Identify file metadata from filename
      const identification = identifyFile(entry.filename);
      
      // Check for manual override
      const override = await getOverrideForFile(entry.filename, entry.absPath);
      
      // Apply override to identification if present
      let titleId = identification.titleId;
      let appType = identification.appType;
      let version = identification.version;
      let baseTitleId = identification.baseTitleId;
      
      if (override) {
        // Override takes precedence over auto-identification
        if (override.titleId) {
          titleId = override.titleId;
        }
        if (override.appType !== undefined) {
          appType = override.appType;
        }
        if (override.version) {
          version = override.version;
        }
        if (override.baseTitleId) {
          baseTitleId = override.baseTitleId;
        }
      }
      
      // For CyberFoil compatibility with AeroFoil's API contract:
      // - app_id should be the file's own title_id (or a derived identifier for this file)
      // - For DLC: app_id = DLC's own title_id
      // - For updates: app_id = update's own title_id
      // - For base games: app_id = base game's title_id
      // We use the titleId directly as app_id for proper client-side linking
      const appId = titleId || buildAppIdFromNumber(id);
      
      // Get display name from filename parsing
      const parsedName = parseGameName(entry.filename);
      
      // Try to enrich with TitleDB data
      // For updates/DLC, use the base game's title_id to get the metadata
      // This way updates inherit their base game's name, category, and artwork
      let titleName: string | null = null;
      let category: string[] = [];
      let iconUrl: string | null = null;
      let bannerUrl: string | null = null;
      let releaseDate: number | undefined = undefined;
      let rating: number | undefined = undefined;
      let hasTitleDbMatch = false;
      
      // Use base title ID if available (for updates/DLC), otherwise use the file's title ID (for base games)
      const titleIdForMetadata = baseTitleId || titleId;
      
      if (titleIdForMetadata) {
        const titleInfo = await getTitleInfo(titleIdForMetadata);
        if (titleInfo) {
          hasTitleDbMatch = true;
          titleName = titleInfo.name;
          category = titleInfo.category || [];
          iconUrl = titleInfo.iconUrl || null;
          bannerUrl = titleInfo.bannerUrl || null;
          releaseDate = titleInfo.releaseDate;
          rating = titleInfo.rating;
        }
      }
      
      // Apply override metadata (takes precedence over TitleDB)
      if (override) {
        if (override.titleName) {
          titleName = override.titleName;
        }
        if (override.category) {
          category = override.category;
        }
        if (override.iconUrl !== undefined) {
          iconUrl = override.iconUrl;
        }
        if (override.bannerUrl !== undefined) {
          bannerUrl = override.bannerUrl;
        }
      }
      
      return {
        id,
        virtualPath: entry.virtualPath,
        absPath: entry.absPath,
        filename: entry.filename,
        size: entry.size,
        name: parsedName,
        appId,
        titleId,
        titleName,
        appType,
        version,
        category,
        iconUrl,
        bannerUrl,
        baseTitleId: baseTitleId || null,
        hasTitleDbMatch,
        releaseDate,
        rating,
      };
    })
  );

  const shopData: ShopData = {
    files: entries.map((entry) => ({
      url: `/api/get_game/${entry.id}#${entry.filename}`,
      size: entry.size,
    })),
  };

  // Always include success for CyberFoil (even if empty)
  // For Tinfoil, only include if non-empty (to avoid empty banners)
  if (SUCCESS_MESSAGE) {
    shopData.success = SUCCESS_MESSAGE;
  }

  if (REFERRER) {
    shopData.referrer = REFERRER;
  }

  return {
    shopData,
    sectionsPayload: buildSectionsPayload(entries, limitForAllSection),
    entries,
  };
}

export async function getShopCatalog(forceRefresh: boolean = false, limitForAllSection: number = 50): Promise<ShopCatalog> {
  if (!forceRefresh && isCacheValid()) {
    return cachedCatalog as ShopCatalog;
  }

  const catalog = await buildShopCatalog(limitForAllSection);
  cachedCatalog = catalog;
  cachedAt = Date.now();
  return catalog;
}

export async function getCatalogEntryById(id: number): Promise<CatalogFileEntry | null> {
  const catalog = await getShopCatalog(false);
  const found = catalog.entries.find((entry) => entry.id === id);
  if (found) return found;

  const refreshedCatalog = await getShopCatalog(true);
  return refreshedCatalog.entries.find((entry) => entry.id === id) || null;
}

export async function buildShopSections(limit: number = 50): Promise<ShopSectionsPayload> {
  const catalog = await getShopCatalog(false, limit);

  const allSection = catalog.sectionsPayload.sections.find((section) => section.id === "all");
  if (allSection && allSection.items.length > limit) {
    const trimmedItems = allSection.items.slice(0, limit);
    return {
      sections: catalog.sectionsPayload.sections.map((section) => {
        if (section.id !== "all") return section;
        return {
          ...section,
          items: trimmedItems,
          total: section.total ?? allSection.items.length,
          truncated: true,
        };
      }),
    };
  }

  return catalog.sectionsPayload;
}

/**
 * Scans all configured base directories and builds shop data
 * @param isCyberFoil - If true, always includes success key (even if empty). If false, omits when empty.
 */
export async function buildShopData(isCyberFoil: boolean = false): Promise<ShopData> {
  const catalog = await getShopCatalog();
  const shopData = { ...catalog.shopData };

  // CyberFoil always wants the success key (even if empty) for consistent API contracts
  // Tinfoil omits it when empty to avoid rendering empty banners on client side
  if (isCyberFoil && !shopData.success) {
    shopData.success = "";
  }

  return shopData;
}
