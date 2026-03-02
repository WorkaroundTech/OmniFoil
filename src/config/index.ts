export type BaseDir = { path: string; alias: string };

export const PORT = parseInt(process.env.PORT || "3000");
export const RAW_DIRS = process.env.GAMES_DIRS || "/data/games";
export const BASE_DIRS = RAW_DIRS.split(/[,;]/).map(d => d.trim()).filter(d => d.length > 0);
export const GLOB_PATTERN = "**/*.{nsp,nsz,xci,xciz}";

export function buildBaseAliases(dirs: string[]): BaseDir[] {
  const nameCounts = new Map<string, number>();

  return dirs.map((dir) => {
    const baseName = dir.split("/").filter(Boolean).pop() || "games";
    const count = nameCounts.get(baseName) ?? 0;
    nameCounts.set(baseName, count + 1);

    const alias = count === 0 ? baseName : `${baseName}-${count + 1}`;
    return { path: dir, alias };
  });
}

export const BASES = buildBaseAliases(BASE_DIRS);

// Basic Auth configuration: either AUTH_USER + AUTH_PASS or AUTH_CREDENTIALS="user:pass"
export const AUTH_USER = process.env.AUTH_USER;
export const AUTH_PASS = process.env.AUTH_PASS;
export const AUTH_CREDENTIALS = process.env.AUTH_CREDENTIALS;

export function getAuthPair(): { user: string; pass: string } | null {
  if (AUTH_USER && AUTH_PASS) {
    return { user: AUTH_USER, pass: AUTH_PASS };
  }
  if (AUTH_CREDENTIALS && AUTH_CREDENTIALS.includes(":")) {
    const idx = AUTH_CREDENTIALS.indexOf(":");
    const user = AUTH_CREDENTIALS.slice(0, idx);
    const pass = AUTH_CREDENTIALS.slice(idx + 1);
    if (user.length > 0 && pass.length > 0) return { user, pass };
  }
  return null;
}

// Cache configuration: TTL in seconds for shop data cache (default 5 minutes)
export const CACHE_TTL = parseInt(process.env.CACHE_TTL || "300");

// Success message configuration: Optional message to display in Tinfoil (MOTD)
export const SUCCESS_MESSAGE = process.env.SUCCESS_MESSAGE || "";

// Referrer configuration: Optional host verification for strict shop security
export const REFERRER = process.env.REFERRER || "";

// Logging configuration: Morgan-style log format (tiny, short, dev, common, combined)
export const LOG_FORMAT = (process.env.LOG_FORMAT || "dev") as "tiny" | "short" | "dev" | "common" | "combined";

// TitleDB configuration
export const TITLEDB_ENABLED = process.env.TITLEDB_ENABLED !== "false"; // Default enabled
export const TITLEDB_REGION = process.env.TITLEDB_REGION || "US";
export const TITLEDB_LANGUAGE = process.env.TITLEDB_LANGUAGE || "en";
export const TITLEDB_CACHE_DIR = process.env.TITLEDB_CACHE_DIR || "./data/titledb";
export const TITLEDB_AUTO_UPDATE = process.env.TITLEDB_AUTO_UPDATE !== "false"; // Default enabled
export const TITLEDB_CACHE_TTL = parseInt(process.env.TITLEDB_CACHE_TTL || "86400"); // 24 hours in seconds
export const TITLEDB_BASE_URL = "https://tinfoil.media/repo/db";

// Media cache configuration
export const MEDIA_CACHE_DIR = process.env.MEDIA_CACHE_DIR || "./data/media";
export const MEDIA_CACHE_TTL = parseInt(process.env.MEDIA_CACHE_TTL || "604800"); // 7 days in seconds

// Override configuration
export const OVERRIDE_FILENAME = process.env.OVERRIDE_FILENAME || "omnifoil-overrides.json";
export const OVERRIDES_ENABLED = process.env.OVERRIDES_ENABLED !== "false"; // Default enabled

