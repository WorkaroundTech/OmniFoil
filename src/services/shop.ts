/**
 * Shop data building logic
 */

import { BASES, GLOB_PATTERN, SUCCESS_MESSAGE, CACHE_TTL, REFERRER } from "../config";
import { encodePath } from "../lib/paths";
import { identifyFile, parseGameName, getDisplayName } from "../lib/identification";
import { getTitleInfo } from "./titledb";
import type { AppType } from "../types";

export interface ShopData {
  files: Array<{ url: string; size: number }>;
  success: string;
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
    id: "new" | "recommended" | "updates" | "dlc" | "all";
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
  
  // Separate entries by type (0=BASE, 1=DLC, 2=UPDATE)
  const baseGames = entries.filter(e => e.appType === 0);
  const updates = entries.filter(e => e.appType === 2);
  const dlc = entries.filter(e => e.appType === 1);
  
  // Sort base games
  const sortedByNewest = [...baseGames].sort((a, b) => b.id - a.id);
  const sortedByName = [...baseGames].sort((a, b) => {
    const nameA = a.titleName || a.name;
    const nameB = b.titleName || b.name;
    return nameA.localeCompare(nameB);
  });

  // Apply limit to discovery sections (new/recommended) per AeroFoil spec
  const newItems = sortedByNewest.slice(0, safeLimit).map(toSectionsItem);
  const recommendedItems = [...newItems];
  
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
  // Following AeroFoil's pattern: group by the DLC's own app_id
  // Multiple DLC for the same base game have different app_ids, so they won't be grouped together
  // We keep all DLC and let the client handle grouping by base_title_id if needed
  const dlcItems = [...dlc]
    .sort((a, b) => (a.titleName || a.name).localeCompare(b.titleName || b.name))
    .map(toSectionsItem);
  
  const allItems = sortedByName.map(toSectionsItem);
  const limitedAllItems = allItems.slice(0, safeLimit);

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
      
      // For CyberFoil compatibility with AeroFoil's API contract:
      // - app_id should be the file's own title_id (or a derived identifier for this file)
      // - For DLC: app_id = DLC's own title_id
      // - For updates: app_id = update's own title_id
      // - For base games: app_id = base game's title_id
      // We use the titleId directly as app_id for proper client-side linking
      const appId = identification.titleId || buildAppIdFromNumber(id);
      
      // Get display name from filename parsing
      const parsedName = parseGameName(entry.filename);
      
      // Try to enrich with TitleDB data
      // For updates/DLC, use the base game's title_id to get the metadata
      // This way updates inherit their base game's name, category, and artwork
      let titleName: string | null = null;
      let category: string[] = [];
      let iconUrl: string | null = null;
      let bannerUrl: string | null = null;
      
      // Use base title ID if available (for updates/DLC), otherwise use the file's title ID (for base games)
      const titleIdForMetadata = identification.baseTitleId || identification.titleId;
      
      if (titleIdForMetadata) {
        const titleInfo = await getTitleInfo(titleIdForMetadata);
        if (titleInfo) {
          titleName = titleInfo.name;
          category = titleInfo.category || [];
          iconUrl = titleInfo.iconUrl || null;
          bannerUrl = titleInfo.bannerUrl || null;
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
        titleId: identification.titleId,
        titleName,
        appType: identification.appType,
        version: identification.version,
        category,
        iconUrl,
        bannerUrl,
        baseTitleId: identification.baseTitleId || null,
      };
    })
  );

  const shopData: ShopData = {
    success: SUCCESS_MESSAGE || "",
    ...(REFERRER && { referrer: REFERRER }),
    files: entries.map((entry) => ({
      url: `/api/get_game/${entry.id}#${entry.filename}`,
      size: entry.size,
    })),
  };

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
 */
export async function buildShopData(): Promise<ShopData> {
  const catalog = await getShopCatalog();
  return catalog.shopData;
}
