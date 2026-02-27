/**
 * Index route handler
 * Handles GET / and GET /tinfoil
 */

import { type RequestContext, type Handler, ServiceError } from "../../types";
import { buildIndexPayload } from "../utils";
import { buildShopData } from "../../services/shop";
import { methodValidator } from "../../middleware";

const INDEX_HTML = Bun.file(new URL("../../index.html", import.meta.url));
const TINFOIL_HEADERS = ["Theme", "Uid", "Version", "Revision", "Language", "Hauth", "Uauth"];

function isTinfoilLikeRequest(req: Request): boolean {
  return TINFOIL_HEADERS.every((header) => req.headers.has(header));
}

const indexHandlerImpl: Handler = async (req: Request, ctx: RequestContext) => {
  const url = new URL(req.url);
  const accept = req.headers.get("accept") || "";
  const isBrowser = accept.includes("text/html");

  if (isTinfoilLikeRequest(req)) {
    const shopData = await buildShopData();
    return Response.json(shopData);
  }

  if (isBrowser) {
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

  const indexPayload = buildIndexPayload();
  return Response.json(indexPayload);
};

export const indexHandler = methodValidator(["GET", "HEAD"])(indexHandlerImpl);
