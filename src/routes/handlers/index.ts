/**
 * Index route handler
 * Handles GET / and GET /tinfoil
 */

import { type RequestContext, type Handler, ServiceError } from "../../types";
import { buildIndexPayload } from "../utils";
import { buildShopData } from "../../services/shop";
import { methodValidator } from "../../middleware";
import { LOG_FORMAT } from "../../config";

const INDEX_HTML = Bun.file(new URL("../../index.html", import.meta.url));
const TINFOIL_HEADERS = ["Theme", "Uid", "Version", "Revision", "Language", "Hauth", "Uauth"];

function isTinfoilLikeRequest(req: Request): boolean {
  return TINFOIL_HEADERS.every((header) => req.headers.has(header));
}

function isCyberFoilRequest(req: Request): boolean {
  const userAgent = req.headers.get("user-agent") || "";
  return userAgent.toLowerCase().includes("cyberfoil");
}

function getClientType(req: Request): string {
  const accept = req.headers.get("accept") || "";
  const isBrowser = accept.includes("text/html");
  
  if (isTinfoilLikeRequest(req)) {
    return isCyberFoilRequest(req) ? "CyberFoil" : "Tinfoil";
  }
  
  if (isBrowser) {
    return "Browser";
  }
  
  return "Generic";
}

function debugLogHeaders(req: Request, ctx: RequestContext): void {
  if (LOG_FORMAT !== "dev") return;
  
  console.log(`\n[DEBUG] Request Headers:`);
  const headerMap = new Map<string, string>();
  
  req.headers.forEach((value, key) => {
    headerMap.set(key, value);
  });
  
  const sortedKeys = Array.from(headerMap.keys()).sort();
  sortedKeys.forEach((key) => {
    const value = headerMap.get(key) || "";
    // Mask sensitive headers for security
    const displayValue = key.toLowerCase().includes("auth") ? "***" : value;
    console.log(`  ${key}: ${displayValue}`);
  });
  console.log();
}

const indexHandlerImpl: Handler = async (req: Request, ctx: RequestContext) => {
  const url = new URL(req.url);
  const accept = req.headers.get("accept") || "";
  const isBrowser = accept.includes("text/html");
  const clientType = getClientType(req);

  // Debug: Log request headers in dev mode
  debugLogHeaders(req, ctx);

  if (isTinfoilLikeRequest(req)) {
    console.log(`[${clientType}] Serving shop payload to ${ctx.remoteAddress || "unknown"}`);
    const shopData = await buildShopData();
    return Response.json(shopData);
  }

  if (isBrowser) {
    console.log(`[${clientType}] Serving HTML index to ${ctx.remoteAddress || "unknown"}`);
    if (!(await INDEX_HTML.exists())) {
      throw new ServiceError({
        statusCode: 500,
        message: "Index page missing",
      });
    }

    return new Response(INDEX_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  console.log(`[${clientType}] Serving JSON index to ${ctx.remoteAddress || "unknown"}`);
  const indexPayload = buildIndexPayload();
  return Response.json(indexPayload);
};

export const indexHandler = methodValidator(["GET", "HEAD"])(indexHandlerImpl);
