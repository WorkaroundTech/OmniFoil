/**
 * Media route handlers for serving game artwork (icons, banners)
 */

import type { Handler } from "../../types";
import { ServiceError } from "../../types";
import { getTitleInfo } from "../../services/titledb";
import { getMediaFile } from "../../lib/media-cache";

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
    throw new ServiceError({
      statusCode: 404,
      message: "Icon not found for this title",
    });
  }
  
  // Get media file (cached or download)
  const media = await getMediaFile(titleId, "icon", titleInfo.iconUrl);
  if (!media) {
    throw new ServiceError({
      statusCode: 404,
      message: "Failed to retrieve icon",
    });
  }
  
  // Serve the cached file
  const file = Bun.file(media.path);
  
  return new Response(file, {
    headers: {
      "Content-Type": media.contentType,
      "Cache-Control": "public, max-age=604800", // 7 days
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
    throw new ServiceError({
      statusCode: 404,
      message: "Banner not found for this title",
    });
  }
  
  // Get media file (cached or download)
  const media = await getMediaFile(titleId, "banner", titleInfo.bannerUrl);
  if (!media) {
    throw new ServiceError({
      statusCode: 404,
      message: "Failed to retrieve banner",
    });
  }
  
  // Serve the cached file
  const file = Bun.file(media.path);
  
  return new Response(file, {
    headers: {
      "Content-Type": media.contentType,
      "Cache-Control": "public, max-age=604800", // 7 days
      "Access-Control-Allow-Origin": "*",
    },
  });
};
