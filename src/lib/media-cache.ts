/**
 * Media cache module for downloading and caching game artwork (icons, banners)
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { MEDIA_CACHE_DIR, MEDIA_CACHE_TTL } from "../config";

export type MediaType = "icon" | "banner";

/**
 * Get the cache directory path for a media type
 */
function getMediaCacheDir(mediaType: MediaType): string {
  return join(MEDIA_CACHE_DIR, `${mediaType}s`);
}

/**
 * Get the cache file path for a specific title's media
 */
function getMediaCachePath(titleId: string, mediaType: MediaType): string {
  const dir = getMediaCacheDir(mediaType);
  // Cache files with extension based on content type (will be determined on download)
  return join(dir, titleId);
}

/**
 * Ensure media cache directories exist
 */
function ensureMediaCacheDirs(): void {
  if (!existsSync(MEDIA_CACHE_DIR)) {
    mkdirSync(MEDIA_CACHE_DIR, { recursive: true });
  }
  
  for (const type of ["icon", "banner"] as MediaType[]) {
    const dir = getMediaCacheDir(type);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Get file extension from content type
 */
function getExtensionFromContentType(contentType: string): string {
  const typeMap: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  
  return typeMap[contentType.toLowerCase()] || ".jpg";
}

/**
 * Check if cached media exists and is still valid
 */
function isCacheValid(cachePath: string): boolean {
  if (!existsSync(cachePath)) {
    // Try with common extensions
    const extensions = [".jpg", ".png", ".gif", ".webp"];
    for (const ext of extensions) {
      if (existsSync(cachePath + ext)) {
        return true;
      }
    }
    return false;
  }
  
  try {
    const stats = Bun.file(cachePath).lastModified;
    const age = Date.now() - stats;
    return age < MEDIA_CACHE_TTL * 1000;
  } catch {
    return false;
  }
}

/**
 * Find the cached file with any extension
 */
function findCachedFile(basePath: string): string | null {
  if (existsSync(basePath)) return basePath;
  
  const extensions = [".jpg", ".png", ".gif", ".webp"];
  for (const ext of extensions) {
    const pathWithExt = basePath + ext;
    if (existsSync(pathWithExt)) {
      return pathWithExt;
    }
  }
  
  return null;
}

/**
 * Download and cache media from a URL
 */
async function downloadAndCacheMedia(
  url: string,
  cachePath: string
): Promise<{ path: string; contentType: string } | null> {
  try {
    console.log(`[MEDIA] Downloading from ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`[MEDIA] Failed to download: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const extension = getExtensionFromContentType(contentType);
    const finalPath = cachePath + extension;
    
    const arrayBuffer = await response.arrayBuffer();
    await Bun.write(finalPath, arrayBuffer);
    
    console.log(`[MEDIA] Cached to ${finalPath}`);
    
    return { path: finalPath, contentType };
  } catch (error) {
    console.error(`[MEDIA] Error downloading media:`, error);
    return null;
  }
}

/**
 * Get media file (from cache or download)
 */
export async function getMediaFile(
  titleId: string,
  mediaType: MediaType,
  sourceUrl: string | null
): Promise<{ path: string; contentType: string } | null> {
  if (!sourceUrl) {
    return null;
  }
  
  ensureMediaCacheDirs();
  
  const baseCachePath = getMediaCachePath(titleId, mediaType);
  
  // Check if we have a valid cached version
  const cachedFile = findCachedFile(baseCachePath);
  if (cachedFile && isCacheValid(cachedFile)) {
    // Determine content type from extension
    const ext = cachedFile.split(".").pop()?.toLowerCase();
    const contentTypeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    const contentType = contentTypeMap[ext || "jpg"] || "image/jpeg";
    
    return { path: cachedFile, contentType };
  }
  
  // Download and cache
  return await downloadAndCacheMedia(sourceUrl, baseCachePath);
}

/**
 * Clear expired cache entries
 */
export async function cleanMediaCache(): Promise<void> {
  ensureMediaCacheDirs();
  
  const now = Date.now();
  const ttlMs = MEDIA_CACHE_TTL * 1000;
  let deletedCount = 0;
  
  for (const type of ["icon", "banner"] as MediaType[]) {
    const dir = getMediaCacheDir(type);
    
    try {
      const glob = new Bun.Glob("*.*");
      for await (const file of glob.scan({ cwd: dir })) {
        const filePath = join(dir, file);
        try {
          const stats = Bun.file(filePath).lastModified;
          const age = now - stats;
          
          if (age > ttlMs) {
            // Use delete() to actually remove the file
            await Bun.file(filePath).delete();
            deletedCount++;
          }
        } catch (error) {
          console.warn(`[MEDIA] Error checking cache file ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error(`[MEDIA] Error cleaning cache directory ${dir}:`, error);
    }
  }
  
  if (deletedCount > 0) {
    console.log(`[MEDIA] Cleaned ${deletedCount} expired cache entries`);
  }
}
