/**
 * Shop data building logic
 */

import { BASES, GLOB_PATTERN, SUCCESS_MESSAGE, CACHE_TTL } from "../config";
import { encodePath } from "../lib/paths";

export interface ShopData {
  files: Array<{ url: string; size: number }>;
  directories: string[];
  success?: string;
}

export interface CatalogFileEntry {
  id: number;
  virtualPath: string;
  absPath: string;
  filename: string;
  size: number;
  name: string;
  appId: string;
}

interface ShopSectionsItem {
  name: string;
  title_name: string;
  title_id: string | null;
  app_id: string;
  app_version: string;
  app_type: "BASE";
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
  return {
    name: entry.name,
    title_name: entry.name,
    title_id: null,
    app_id: entry.appId,
    app_version: "0",
    app_type: "BASE",
    category: "",
    icon_url: "",
    url: `/api/get_game/${entry.id}#${entry.filename}`,
    size: entry.size,
    file_id: entry.id,
    filename: entry.filename,
    download_count: 0,
  };
}

function buildSectionsPayload(entries: CatalogFileEntry[], limit: number): ShopSectionsPayload {
  const safeLimit = Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 50);
  const sortedByNewest = [...entries].sort((a, b) => b.id - a.id);
  const sortedByName = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  const newItems = sortedByNewest.slice(0, 40).map(toSectionsItem);
  const recommendedItems = [...newItems];
  const allItems = sortedByName.map(toSectionsItem);
  const limitedAllItems = allItems.slice(0, safeLimit);

  return {
    sections: [
      { id: "new", title: "New", items: newItems },
      { id: "recommended", title: "Recommended", items: recommendedItems },
      { id: "updates", title: "Updates", items: [] },
      { id: "dlc", title: "DLC", items: [] },
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

  const entries: CatalogFileEntry[] = scanned.files.map((entry, index) => {
    const id = index + 1;
    const appId = buildAppIdFromNumber(id);
    const withoutExt = entry.filename.replace(/\.[^/.]+$/, "");

    return {
      id,
      virtualPath: entry.virtualPath,
      absPath: entry.absPath,
      filename: entry.filename,
      size: entry.size,
      name: withoutExt,
      appId,
    };
  });

  const shopData: ShopData = {
    files: entries.map((entry) => ({
      url: `/api/get_game/${entry.id}#${entry.filename}`,
      size: entry.size,
    })),
    directories: scanned.directories,
  };

  if (SUCCESS_MESSAGE) {
    shopData.success = SUCCESS_MESSAGE;
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
 */
export async function buildShopData(): Promise<ShopData> {
  const catalog = await getShopCatalog();
  return catalog.shopData;
}
