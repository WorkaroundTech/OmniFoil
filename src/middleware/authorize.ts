/**
 * Authorization middleware
 * Checks if the request is authorized, throws ServiceError if not
 */

import { type Middleware, ServiceError } from "../types";
import { isAuthorized, type AuthUsers } from "../lib/auth";

export const authorize = (users: AuthUsers): Middleware => {
  return async (req: Request, ctx, next) => {
    if (!isAuthorized(req, users)) {
      throw new ServiceError({
        statusCode: 401,
        message: "Unauthorized",
      });
    }
    return next(req, ctx);
  };
};
