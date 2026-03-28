/**
 * Logging middleware
 * Logs request details after the response is generated
 */

import { type Middleware, type RequestContext } from "../types";
import { logRequest } from "../lib/logger";
import { LOG_FORMAT } from "../config";

export const logging = (): Middleware => {
  return async (req: Request, ctx: RequestContext, next) => {
    const response = await next(req, ctx);
    const url = new URL(req.url);
    const elapsed = Date.now() - ctx.startTime;

    // Extract content-length from response headers if available
    const contentLength = response.headers.get("content-length");
    const logData: any = {
      remoteAddr: ctx.remoteAddress,
      userAgent: ctx.userAgent,
      contextData: ctx.data,
    };

    if (contentLength) {
      logData.contentLength = parseInt(contentLength, 10);
    }

    logRequest(LOG_FORMAT, req.method, url.pathname, response.status, elapsed, logData);
    return response;
  };
};
