/**
 * Shop route handler
 * Handles GET /shop.json and GET /shop.tfl
 */

import { type RequestContext, type Handler, ServiceError } from "../../types";
import { buildShopData } from "../../services/shop";
import { methodValidator } from "../../middleware";

const shopHandlerImpl: Handler = async (req: Request, ctx: RequestContext) => {
  const url = new URL(req.url);
  
  try {
    const shopData = await buildShopData();

    const contentType = url.pathname.endsWith(".tfl")
      ? "application/octet-stream"
      : "application/json";

    const responseBody = JSON.stringify(shopData);
    
    return new Response(responseBody, {
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    console.error(`✗ Error building shop data:`, err);
    throw new ServiceError({
      statusCode: 500,
      message: "Error scanning libraries",
    });
  }
};

export const shopHandler = methodValidator(["GET", "HEAD"])(shopHandlerImpl);
