/**
 * Media route handlers for serving game artwork (icons, banners)
 */

import type { Handler } from "../../types";
import { ServiceError } from "../../types";
import { getTitleInfo } from "../../services/titledb";
import { getMediaFile } from "../../lib/media-cache";

/**
 * Create a placeholder icon SVG (300x300)
 */
function createPlaceholderIcon(): Response {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <rect width="300" height="300" fill="#1a1a1a"/>
  <text x="150" y="150" font-family="Arial, sans-serif" font-size="24" fill="#666" text-anchor="middle" dominant-baseline="middle">No Icon</text>
</svg>`;
  
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Create a placeholder banner SVG (640x360)
 */
function createPlaceholderBanner(): Response {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#1a1a1a"/>
  <text x="320" y="180" font-family="Arial, sans-serif" font-size="32" fill="#666" text-anchor="middle" dominant-baseline="middle">No Banner</text>
</svg>`;
  
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * GET /api/shop/icon/:title_id
 * Serve game icon image
 */
export const getIcon: Handler = async (req, ctx) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const titleId = pathParts[pathParts.length - 1];
  
  if (!titleId || titleId.length !== 16) {
    throw new ServiceError({
      statusCode: 400,
      message: "Invalid title ID",
    });
  }
  
  // Get title info from TitleDB
  const titleInfo = await getTitleInfo(titleId);
  if (!titleInfo || !titleInfo.iconUrl) {
    // Return placeholder SVG instead of 404
    return createPlaceholderIcon();
  }
  
  // Get media file (cached or download)
  const media = await getMediaFile(titleId, "icon", titleInfo.iconUrl);
  if (!media) {
    // Return placeholder SVG if download fails
    return createPlaceholderIcon();
  }
  
  // Serve the cached file
  const file = Bun.file(media.path);
  
  return new Response(file, {
    headers: {
      "Content-Type": media.contentType,
      "Cache-Control": "public, max-age=604800, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

/**
 * GET /api/shop/banner/:title_id
 * Serve game banner image
 */
export const getBanner: Handler = async (req, ctx) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const titleId = pathParts[pathParts.length - 1];
  
  if (!titleId || titleId.length !== 16) {
    throw new ServiceError({
      statusCode: 400,
      message: "Invalid title ID",
    });
  }
  
  // Get title info from TitleDB
  const titleInfo = await getTitleInfo(titleId);
  if (!titleInfo || !titleInfo.bannerUrl) {
    // Return placeholder SVG instead of 404
    return createPlaceholderBanner();
  }
  
  // Get media file (cached or download)
  const media = await getMediaFile(titleId, "banner", titleInfo.bannerUrl);
  if (!media) {
    // Return placeholder SVG if download fails
    return createPlaceholderBanner();
  }
  
  // Serve the cached file
  const file = Bun.file(media.path);
  
  return new Response(file, {
    headers: {
      "Content-Type": media.contentType,
      "Cache-Control": "public, max-age=604800, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
