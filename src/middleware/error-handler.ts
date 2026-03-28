/**
 * Error handler middleware
 * Wraps the entire middleware chain and catches errors
 */

import { type Handler, type RequestContext, ServiceError } from "../types";
import { respondUnauthorized } from "../lib/auth";
import { logRequest } from "../lib/logger";
import { LOG_FORMAT } from "../config";

export const errorHandler = (handler: Handler): Handler => {
  return async (req: Request, ctx: RequestContext) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      const url = new URL(req.url);
      const elapsed = Date.now() - ctx.startTime;

      if (error instanceof ServiceError) {
        logRequest(LOG_FORMAT, req.method, url.pathname, error.statusCode, elapsed, {
          remoteAddr: ctx.remoteAddress,
          userAgent: ctx.userAgent,
          contextData: ctx.data,
        });

        if (error.statusCode === 401) {
          return respondUnauthorized();
        }

        return new Response(error.message, { 
          status: error.statusCode,
          headers: error.headers,
        });
      }

      // Unknown error - log as 500
      console.error(`✗ Unexpected error:`, error);
      logRequest(LOG_FORMAT, req.method, url.pathname, 500, elapsed, {
        remoteAddr: ctx.remoteAddress,
        userAgent: ctx.userAgent,
        contextData: ctx.data,
      });

      return new Response("Internal server error", { status: 500 });
    }
  };
};
