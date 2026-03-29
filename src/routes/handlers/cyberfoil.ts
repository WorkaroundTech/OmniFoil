/**
 * CyberFoil compatibility handlers
 * - GET /api/shop/sections
 * - GET /api/get_game/:id
 */

import { type Handler, type RequestContext, ServiceError } from "../../types";
import { methodValidator } from "../../middleware";
import { buildShopSections, getCatalogEntryById } from "../../services/shop";
import { parseRange, isSingleRange, getContentRangeHeader } from "../../lib/range";

function setContextData(ctx: RequestContext, data: Record<string, unknown>): void {
  ctx.data = {
    ...(typeof ctx.data === "object" && ctx.data !== null ? ctx.data : {}),
    ...data,
  };
}

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

  setContextData(ctx, {
    endpoint: "/api/get_game/:gameid",
    getGamePath: url.pathname,
    getGameRangeHeader: req.headers.get("range") || null,
  });

  if (!match) {
    setContextData(ctx, {
      getGameResolved: false,
      getGameReason: "invalid_path",
    });
    throw new ServiceError({
      statusCode: 404,
      message: "File not found",
    });
  }

  const idToken = match[1];
  if (!idToken) {
    setContextData(ctx, {
      getGameResolved: false,
      getGameReason: "missing_id",
    });
    throw new ServiceError({
      statusCode: 404,
      message: "File not found",
    });
  }

  const id = parseInt(idToken, 10);
  setContextData(ctx, { getGameId: id });

  const entry = await getCatalogEntryById(id);

  if (!entry) {
    setContextData(ctx, {
      getGameResolved: false,
      getGameReason: "catalog_entry_not_found",
    });
    throw new ServiceError({
      statusCode: 404,
      message: "File not found",
    });
  }

  const file = Bun.file(entry.absPath);
  const exists = await file.exists();
  if (!exists) {
    setContextData(ctx, {
      getGameResolved: false,
      getGameReason: "file_missing_on_disk",
      getGameFileName: entry.filename,
      getGameFilePath: entry.absPath,
      getGameVirtualPath: entry.virtualPath,
    });
    throw new ServiceError({
      statusCode: 404,
      message: "File not found",
    });
  }

  const fileSize = file.size;
  const rangeHeader = req.headers.get("range");

  setContextData(ctx, {
    getGameResolved: true,
    getGameFileName: entry.filename,
    getGameFilePath: entry.absPath,
    getGameVirtualPath: entry.virtualPath,
    getGameFileSize: fileSize,
    getGameCatalogId: entry.id,
    getGameAppId: entry.appId,
    getGameTitleId: entry.titleId,
  });

  if (rangeHeader) {
    if (!isSingleRange(rangeHeader)) {
      setContextData(ctx, {
        getGameResolved: false,
        getGameReason: "multiple_ranges_not_supported",
      });
      return new Response("Multiple ranges not supported", {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
        },
      });
    }

    const range = parseRange(rangeHeader, fileSize);
    if (!range) {
      setContextData(ctx, {
        getGameResolved: false,
        getGameReason: "invalid_range",
      });
      return new Response("Range request invalid", {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
        },
      });
    }

    const partialFile = file.slice(range.start, range.end + 1);
    const contentLength = range.end - range.start + 1;

    setContextData(ctx, {
      getGamePartial: true,
      getGameRangeStart: range.start,
      getGameRangeEnd: range.end,
      getGameContentLength: contentLength,
    });

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

  setContextData(ctx, {
    getGamePartial: false,
    getGameContentLength: fileSize,
  });

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
