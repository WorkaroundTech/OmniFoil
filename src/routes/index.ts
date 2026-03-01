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

export const router: Handler = async (req: Request, ctx: RequestContext) => {
  const url = new URL(req.url);

  // 1. Index endpoint (lists shop.json and shop.tfl)
  if (url.pathname === "/" || url.pathname === "/tinfoil") {
    return indexHandler(req, ctx);
  }

  // 2. Shop data endpoints
  if (url.pathname === "/shop.json" || url.pathname === "/shop.tfl") {
    return shopHandler(req, ctx);
  }

  // 3. File download endpoint
  if (url.pathname.startsWith("/files/")) {
    return filesHandler(req, ctx);
  }

  // 4. CyberFoil-compatible endpoints
  if (url.pathname === "/api/shop/sections") {
    return cyberfoilSectionsHandler(req, ctx);
  }

  if (/^\/api\/get_game\/\d+$/.test(url.pathname)) {
    return getGameHandler(req, ctx);
  }

  // 5. Media endpoints (icons and banners)
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
  return new Response(`* tinfoil-bolt is active.\nIndex: / or /tinfoil\nShop: /shop.tfl`, { status: 200 });
};
