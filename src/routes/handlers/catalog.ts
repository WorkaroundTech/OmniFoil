/**
 * Catalog page handler
 * Handles GET /catalog
 */

import { type RequestContext, type Handler, ServiceError } from "../../types";
import { methodValidator } from "../../middleware";

const CATALOG_HTML = Bun.file(new URL("../../catalog.html", import.meta.url));

const catalogPageHandlerImpl: Handler = async (_req: Request, _ctx: RequestContext) => {
  if (!(await CATALOG_HTML.exists())) {
    throw new ServiceError({
      statusCode: 500,
      message: "Catalog page missing",
    });
  }

  return new Response(CATALOG_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

export const catalogPageHandler = methodValidator(["GET", "HEAD"])(catalogPageHandlerImpl);
