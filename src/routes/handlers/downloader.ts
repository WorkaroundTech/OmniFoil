/**
 * Auto-downloader handlers
 * GET  /downloader               - upload page
 * POST /api/downloader/torrent   - validate a .torrent and add it to Deluge
 *
 * Fails closed: without a Deluge URL the feature is off, and without configured
 * credentials it refuses to run (the global auth middleware is a no-op in that case).
 */

import { type RequestContext, type Handler, ServiceError } from "../../types";
import { methodValidator } from "../../middleware";
import { isAuthorized, type AuthUsers } from "../../lib/auth";
import { validateTorrent, TorrentValidationError } from "../../lib/torrent";
import { createRateLimiter, type RateLimiter } from "../../lib/rate-limit";
import { DelugeError, getDelugeClient, type DelugeClient } from "../../services/deluge";
import {
  DOWNLOADER_ENABLED,
  DOWNLOADER_MAX_TORRENT_BYTES,
  DOWNLOADER_MAX_BODY_BYTES,
  DOWNLOADER_RATE_LIMIT,
  getAuthUsers,
} from "../../config";

const DOWNLOADER_HTML = Bun.file(new URL("../../downloader.html", import.meta.url));

/** Custom header a browser cannot send cross-site without a CORS preflight we never approve. */
export const UPLOAD_GUARD_HEADER = "x-omnifoil-upload";

export interface DownloaderDeps {
  enabled: boolean;
  authUsers: () => AuthUsers;
  client: () => Pick<DelugeClient, "addTorrent">;
  maxTorrentBytes: number;
  maxBodyBytes: number;
  limiter: RateLimiter;
}

function assertAccess(req: Request, deps: DownloaderDeps) {
  if (!deps.enabled) {
    throw new ServiceError({ statusCode: 503, message: "Downloader is not configured" });
  }
  const users = deps.authUsers();
  if (users.length === 0) {
    throw new ServiceError({ statusCode: 403, message: "Downloader requires authentication to be configured" });
  }
  // The middleware chain already enforces this; checking again keeps the guard local to the handler.
  if (!isAuthorized(req, users)) {
    throw new ServiceError({ statusCode: 401, message: "Unauthorized" });
  }
}

/** Reads the body, aborting as soon as it exceeds `maxBytes` (Content-Length can lie or be absent). */
async function readBodyCapped(req: Request, maxBytes: number): Promise<Uint8Array> {
  const tooLarge = () => new ServiceError({ statusCode: 413, message: "Upload too large" });

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!req.body) return new Uint8Array();

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Keep only a harmless basename for Deluge's logs/temp name. */
function safeFilename(name: string, fallback: string): string {
  const cleaned = name.replace(/[^\w.\- ()\[\]]+/g, "_").replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : fallback;
}

export function createDownloaderHandlers(deps: DownloaderDeps) {
  const pageImpl: Handler = async (req) => {
    assertAccess(req, deps);
    if (!(await DOWNLOADER_HTML.exists())) {
      throw new ServiceError({ statusCode: 500, message: "Downloader page missing" });
    }
    return new Response(DOWNLOADER_HTML, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Frame-Options": "DENY",
      },
    });
  };

  const uploadImpl: Handler = async (req, ctx: RequestContext) => {
    assertAccess(req, deps);

    if (!req.headers.get(UPLOAD_GUARD_HEADER) || req.headers.get("sec-fetch-site") === "cross-site") {
      throw new ServiceError({ statusCode: 403, message: "Cross-site uploads are not allowed" });
    }

    const key = (ctx.data as { authUser?: string } | undefined)?.authUser ?? ctx.remoteAddress;
    const retryAfter = deps.limiter.hit(key);
    if (retryAfter > 0) {
      throw new ServiceError({
        statusCode: 429,
        message: "Too many uploads, try again later",
        headers: { "Retry-After": String(retryAfter) },
      });
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      throw new ServiceError({ statusCode: 415, message: "Expected multipart/form-data" });
    }

    const body = await readBodyCapped(req, deps.maxBodyBytes);

    let file: unknown;
    try {
      const form = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
      file = form.get("torrent");
    } catch (err) {
      console.error(`[DOWNLOADER] multipart parse failed:`, err);
      throw new ServiceError({ statusCode: 400, message: "Malformed upload" });
    }

    if (!(file instanceof File)) {
      throw new ServiceError({ statusCode: 400, message: "Missing 'torrent' file field" });
    }
    if (!file.name.toLowerCase().endsWith(".torrent")) {
      throw new ServiceError({ statusCode: 400, message: "Only .torrent files are accepted" });
    }
    if (file.size === 0 || file.size > deps.maxTorrentBytes) {
      throw new ServiceError({
        statusCode: file.size === 0 ? 400 : 413,
        message: file.size === 0 ? "Empty file" : `Torrent exceeds ${deps.maxTorrentBytes} bytes`,
      });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    let summary;
    try {
      summary = validateTorrent(bytes);
    } catch (err) {
      if (err instanceof TorrentValidationError) {
        console.warn(`[DOWNLOADER] ${key} uploaded an invalid torrent "${file.name}": ${err.message}`);
        throw new ServiceError({ statusCode: 422, message: `Invalid torrent: ${err.message}` });
      }
      throw err;
    }

    try {
      const id = await deps.client().addTorrent(safeFilename(file.name, "upload.torrent"), bytes);
      console.log(`[DOWNLOADER] ${key} added "${file.name}" (${summary.name}, ${summary.fileCount} file(s), ${bytes.byteLength} bytes, id ${id})`);
    } catch (err) {
      if (!(err instanceof DelugeError)) throw err;
      // Details stay in the server log; the client only learns the category.
      console.error(`[DOWNLOADER] Deluge ${err.kind}: ${err.message}`);
      if (err.kind === "duplicate") {
        throw new ServiceError({ statusCode: 409, message: "Torrent is already in Deluge" });
      }
      throw new ServiceError({ statusCode: 502, message: "Could not add the torrent to Deluge" });
    }

    return Response.json({ ok: true, name: summary.name, files: summary.fileCount }, { status: 201 });
  };

  return {
    page: methodValidator(["GET", "HEAD"])(pageImpl),
    upload: methodValidator(["POST"])(uploadImpl),
  };
}

const handlers = createDownloaderHandlers({
  enabled: DOWNLOADER_ENABLED,
  authUsers: getAuthUsers,
  client: getDelugeClient,
  maxTorrentBytes: DOWNLOADER_MAX_TORRENT_BYTES,
  maxBodyBytes: DOWNLOADER_MAX_BODY_BYTES,
  limiter: createRateLimiter(DOWNLOADER_RATE_LIMIT),
});

export const downloaderPageHandler = handlers.page;
export const downloaderUploadHandler = handlers.upload;
