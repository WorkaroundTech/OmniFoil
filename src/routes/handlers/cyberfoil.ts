/**
 * CyberFoil compatibility handlers
 * - GET /api/shop/sections
 * - GET /api/get_game/:id
 */

import { type Handler, type RequestContext, ServiceError } from "../../types";
import { methodValidator } from "../../middleware";
import { buildShopSections, getCatalogEntryById } from "../../services/shop";
import { parseRange, isSingleRange, getContentRangeHeader } from "../../lib/range";

/**
 * Sanitize filename for Content-Disposition header
 * Removes or encodes characters that could break the header
 */
function sanitizeFilename(filename: string): string {
  // Remove any control characters and limit to ASCII printable chars
  let sanitized = filename
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "") // Remove control characters
    .replace(/[\"\/;]/g, "") // Remove quotes and semicolons that break headers
    .trim();
  
  // If the filename is empty after sanitization, provide a default
  if (!sanitized) {
    sanitized = "file.nsp";
  }
  
  return sanitized;
}

const sectionsHandlerImpl: Handler = async (req: Request, ctx: RequestContext) => {
  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, rawLimit) : 50;

  const payload = await buildShopSections(limit);
  return Response.json(payload);
};

const getGameHandlerImpl: Handler = async (req: Request, ctx: RequestContext) => {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/api\/get_game\/(\d+)$/);

  if (!match) {
    throw new ServiceError({
      statusCode: 404,
      message: "File not found",
    });
  }

  const idToken = match[1];
  if (!idToken) {
    throw new ServiceError({
      statusCode: 404,
      message: "File not found",
    });
  }

  const id = parseInt(idToken, 10);
  const entry = await getCatalogEntryById(id);

  if (!entry) {
    throw new ServiceError({
      statusCode: 404,
      message: "File not found",
    });
  }

  const file = Bun.file(entry.absPath);
  const exists = await file.exists();
  if (!exists) {
    throw new ServiceError({
      statusCode: 404,
      message: "File not found",
    });
  }

  const fileSize = file.size;
  const rangeHeader = req.headers.get("range");

  if (rangeHeader) {
    if (!isSingleRange(rangeHeader)) {
      return new Response("Multiple ranges not supported", {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
        },
      });
    }

    const range = parseRange(rangeHeader, fileSize);
    if (!range) {
      return new Response("Range request invalid", {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
        },
      });
    }

    const partialFile = file.slice(range.start, range.end + 1);
    const contentLength = range.end - range.start + 1;

    return new Response(partialFile, {
      status: 206,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": contentLength.toString(),
        "Content-Range": getContentRangeHeader(range.start, range.end, fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  }

  return new Response(file, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(entry.filename)}"`,
      "Content-Length": fileSize.toString(),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000",
    },
  });
};

export const cyberfoilSectionsHandler = methodValidator(["GET", "HEAD"])(sectionsHandlerImpl);
export const getGameHandler = methodValidator(["GET", "HEAD"])(getGameHandlerImpl);
