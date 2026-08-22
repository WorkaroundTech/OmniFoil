/**
 * Router setup
 * Routes requests to appropriate handlers based on pathname
 */

import { type Handler, type RequestContext } from "../types";
import { indexHandler } from "./handlers/index";
import { shopHandler } from "./handlers/shop";
import { filesHandler } from "./handlers/files";
import { cyberfoilSectionsHandler, getGameHandler } from "./handlers/cyberfoil";
import { getIcon, getBanner } from "./handlers/media";
import { savesListHandler } from "./handlers/saves";
import { catalogPageHandler } from "./handlers/catalog";

export const router: Handler = async (req: Request, ctx: RequestContext) => {
  const url = new URL(req.url);

  // 1. Index endpoint (lists shop.json and shop.tfl)
  if (url.pathname === "/" || url.pathname === "/tinfoil") {
    return indexHandler(req, ctx);
  }

  // 2. Browser catalog page
  if (url.pathname === "/catalog") {
    return catalogPageHandler(req, ctx);
  }

  // 3. Shop data endpoints
  if (url.pathname === "/shop.json" || url.pathname === "/shop.tfl") {
    return shopHandler(req, ctx);
  }

  // 4. File download endpoint
  if (url.pathname.startsWith("/files/")) {
    return filesHandler(req, ctx);
  }

  // 5. CyberFoil-compatible endpoints
  if (url.pathname === "/api/shop/sections") {
    return cyberfoilSectionsHandler(req, ctx);
  }

  if (/^\/api\/get_game\/\d+$/.test(url.pathname)) {
    return getGameHandler(req, ctx);
  }

  // 6. Media endpoints (icons and banners)
  if (/^\/api\/shop\/icon\/[0-9A-Fa-f]{16}$/.test(url.pathname)) {
    return getIcon(req, ctx);
  }

  if (/^\/api\/shop\/banner\/[0-9A-Fa-f]{16}$/.test(url.pathname)) {
    return getBanner(req, ctx);
  }

  // 7. Save synchronization endpoints
  if (url.pathname === "/api/saves/list") {
    return savesListHandler(req, ctx);
  }

  // 8. Health/Status endpoint
  return new Response(`* OmniFoil is active.\nIndex: / or /tinfoil\nShop: /shop.tfl`, { status: 200 });
};
