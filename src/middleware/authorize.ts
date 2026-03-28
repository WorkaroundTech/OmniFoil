/**
 * Authorization middleware
 * Checks if the request is authorized, throws ServiceError if not
 */

import { type Middleware, ServiceError } from "../types";
import { getBasicAuthUsername, isAuthorized, type AuthUsers } from "../lib/auth";

export const authorize = (users: AuthUsers): Middleware => {
  return async (req: Request, ctx, next) => {
    const authHeaderUser = getBasicAuthUsername(req);

    if (users.length === 0) {
      ctx.data = {
        ...(typeof ctx.data === "object" && ctx.data !== null ? ctx.data : {}),
        authUser: authHeaderUser || "anonymous",
      };
      return next(req, ctx);
    }

    if (!isAuthorized(req, users)) {
      ctx.data = {
        ...(typeof ctx.data === "object" && ctx.data !== null ? ctx.data : {}),
        ...(authHeaderUser ? { authAttemptUser: authHeaderUser } : {}),
      };
      throw new ServiceError({
        statusCode: 401,
        message: "Unauthorized",
      });
    }

    ctx.data = {
      ...(typeof ctx.data === "object" && ctx.data !== null ? ctx.data : {}),
      authUser: authHeaderUser || "unknown",
    };

    return next(req, ctx);
  };
};
