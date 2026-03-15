import { describe, it, expect } from "bun:test";
import { authorize, timing, logging, errorHandler, compose } from "../../src/middleware";
import { indexHandler } from "../../src/routes/handlers/index";
import { type RequestContext, ServiceError } from "../../src/types";

describe("server integration", () => {
  describe("full middleware chain with router", () => {
    it("should process request through entire middleware chain", async () => {
      const authMiddleware = authorize([]);
      const timingMiddleware = timing();
      const loggingMiddleware = logging();

      const router: any = async (req: Request, ctx: RequestContext) => {
        return await indexHandler(req, ctx);
      };

      const middlewareChain = compose([authMiddleware, timingMiddleware, loggingMiddleware], router);
      const errorHandledChain = errorHandler(middlewareChain);

      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      const req = new Request("http://localhost/", {
        headers: { accept: "application/json" },
      });

      const response = await errorHandledChain(req, ctx);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
    });

    it("should handle authorization errors in middleware chain", async () => {
      const authMiddleware = authorize([{ user: "admin", pass: "secret" }]);
      const timingMiddleware = timing();
      const loggingMiddleware = logging();

      const router: any = async (req: Request, ctx: RequestContext) => {
        return new Response("Should not reach here");
      };

      const middlewareChain = compose([authMiddleware, timingMiddleware, loggingMiddleware], router);
      const errorHandledChain = errorHandler(middlewareChain);

      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      const req = new Request("http://localhost/");

      const response = await errorHandledChain(req, ctx);
      expect(response.status).toBe(401);
    });

    it("should handle errors thrown by route handlers", async () => {
      const authMiddleware = authorize([]);
      const timingMiddleware = timing();
      const loggingMiddleware = logging();

      const router: any = async (req: Request, ctx: RequestContext) => {
        throw new ServiceError({
          statusCode: 404,
          message: "Not found",
        });
      };

      const middlewareChain = compose([authMiddleware, timingMiddleware, loggingMiddleware], router);
      const errorHandledChain = errorHandler(middlewareChain);

      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      const req = new Request("http://localhost/test");

      const response = await errorHandledChain(req, ctx);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    });

    it("should maintain request context across middleware", async () => {
      let contextCaptured: RequestContext | null = null;

      const authMiddleware = authorize([]);
      const timingMiddleware = timing();
      const loggingMiddleware = logging();

      const router: any = async (req: Request, ctx: RequestContext) => {
        contextCaptured = ctx;
        return new Response("OK");
      };

      const middlewareChain = compose([authMiddleware, timingMiddleware, loggingMiddleware], router);
      const errorHandledChain = errorHandler(middlewareChain);

      const ctx: RequestContext = {
        remoteAddress: "192.168.1.100",
        userAgent: "CustomAgent/1.0",
        startTime: Date.now(),
      };

      const req = new Request("http://localhost/");
      await errorHandledChain(req, ctx);

      expect(contextCaptured).not.toBe(null);
      expect((contextCaptured as any)?.remoteAddress).toBe("192.168.1.100");
      expect((contextCaptured as any)?.userAgent).toBe("CustomAgent/1.0");
    });
  });

  describe("routing logic", () => {
    it("should route to index handler for /", async () => {
      const router: any = async (req: Request, ctx: RequestContext) => {
        const url = new URL(req.url);
        if (url.pathname === "/" || url.pathname === "/tinfoil") {
          return indexHandler(req, ctx);
        }
        return new Response("Not found", { status: 404 });
      };

      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      const req = new Request("http://localhost/", {
        headers: { accept: "application/json" },
      });

      const response = await router(req, ctx);
      expect(response.status).toBe(200);
    });

    it("should route to index handler for /tinfoil", async () => {
      const router: any = async (req: Request, ctx: RequestContext) => {
        const url = new URL(req.url);
        if (url.pathname === "/" || url.pathname === "/tinfoil") {
          return indexHandler(req, ctx);
        }
        return new Response("Not found", { status: 404 });
      };

      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      const req = new Request("http://localhost/tinfoil", {
        headers: { accept: "application/json" },
      });

      const response = await router(req, ctx);
      expect(response.status).toBe(200);
    });
  });
});
