import { describe, it, expect, beforeEach } from "bun:test";
import { authorize, timing, logging, errorHandler, compose, methodValidator } from "../../src/middleware";
import { type RequestContext, ServiceError } from "../../src/types";

describe("middleware", () => {
  describe("authorize", () => {
    const mockReq = (authHeader?: string): Request => {
      return new Request("http://localhost/test", {
        headers: authHeader ? { authorization: authHeader } : {},
      });
    };

    it("should allow request when no auth is configured", async () => {
      const middleware = authorize([]);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      let handlerCalled = false;
      const handler = async () => {
        handlerCalled = true;
        return new Response("OK");
      };

      await middleware(mockReq(), ctx, handler);
      expect(handlerCalled).toBe(true);
    });

    it("should throw ServiceError when auth is required but missing", async () => {
      const middleware = authorize([{ user: "admin", pass: "secret" }]);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      const handler = async () => new Response("OK");

      let thrownError: ServiceError | null = null;
      try {
        await middleware(mockReq(), ctx, handler);
      } catch (error) {
        thrownError = error as ServiceError;
      }

      expect(thrownError).not.toBe(null);
      expect(thrownError?.statusCode).toBe(401);
    });

    it("should allow request with valid auth", async () => {
      const middleware = authorize([{ user: "admin", pass: "secret" }]);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      let handlerCalled = false;
      const handler = async () => {
        handlerCalled = true;
        return new Response("OK");
      };

      const authHeader = "Basic " + btoa("admin:secret");
      await middleware(mockReq(authHeader), ctx, handler);
      expect(handlerCalled).toBe(true);
    });

    it("should allow any valid user in a multi-user list", async () => {
      const users = [
        { user: "alice", pass: "pass1" },
        { user: "bob", pass: "pass2" },
      ];
      const middleware = authorize(users);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      for (const { user, pass } of users) {
        let handlerCalled = false;
        const handler = async () => { handlerCalled = true; return new Response("OK"); };
        const authHeader = "Basic " + btoa(`${user}:${pass}`);
        await middleware(mockReq(authHeader), ctx, handler);
        expect(handlerCalled).toBe(true);
      }
    });

    it("should reject an unknown user even when a multi-user list is configured", async () => {
      const middleware = authorize([
        { user: "alice", pass: "pass1" },
        { user: "bob", pass: "pass2" },
      ]);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };

      let thrownError: ServiceError | null = null;
      const authHeader = "Basic " + btoa("charlie:wrong");
      try {
        await middleware(mockReq(authHeader), ctx, async () => new Response("OK"));
      } catch (error) {
        thrownError = error as ServiceError;
      }
      expect(thrownError).not.toBe(null);
      expect(thrownError?.statusCode).toBe(401);
    });
  });

  describe("timing", () => {
    it("should allow request to pass through", async () => {
      const middleware = timing();
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      let handlerCalled = false;
      const handler = async () => {
        handlerCalled = true;
        return new Response("OK");
      };

      const response = await middleware(req, ctx, handler);
      expect(handlerCalled).toBe(true);
      expect(response.status).toBe(200);
    });

    it("should measure request duration", async () => {
      const middleware = timing();
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now() - 100, // Started 100ms ago
      };
      const req = new Request("http://localhost/test");

      const handler = async () => new Response("OK");

      await middleware(req, ctx, handler);
      const elapsed = Date.now() - ctx.startTime;
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });

  describe("logging", () => {
    it("should log request and allow response to pass through", async () => {
      const middleware = logging();
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      const handler = async () => new Response("OK");

      const response = await middleware(req, ctx, handler);
      expect(response.status).toBe(200);
    });
  });

  describe("errorHandler", () => {
    it("should catch ServiceError and return appropriate response", async () => {
      const handler: any = async () => {
        throw new ServiceError({
          statusCode: 404,
          message: "Not found",
        });
      };

      const wrappedHandler = errorHandler(handler);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      const response = await wrappedHandler(req, ctx);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    });

    it("should handle 401 Unauthorized specially", async () => {
      const handler: any = async () => {
        throw new ServiceError({
          statusCode: 401,
          message: "Unauthorized",
        });
      };

      const wrappedHandler = errorHandler(handler);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      const response = await wrappedHandler(req, ctx);
      expect(response.status).toBe(401);
    });

    it("should catch unexpected errors and return 500", async () => {
      const handler: any = async () => {
        throw new Error("Unexpected error");
      };

      const wrappedHandler = errorHandler(handler);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      const response = await wrappedHandler(req, ctx);
      expect(response.status).toBe(500);
    });
  });

  describe("compose", () => {
    it("should chain middlewares in correct order", async () => {
      const callOrder: string[] = [];

      const middleware1: any = async (req: any, ctx: any, next: any) => {
        callOrder.push("m1-before");
        const res = await next(req, ctx);
        callOrder.push("m1-after");
        return res;
      };

      const middleware2: any = async (req: any, ctx: any, next: any) => {
        callOrder.push("m2-before");
        const res = await next(req, ctx);
        callOrder.push("m2-after");
        return res;
      };

      const handler: any = async () => {
        callOrder.push("handler");
        return new Response("OK");
      };

      const composed = compose([middleware1, middleware2], handler);
      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      await composed(req, ctx);
      expect(callOrder).toEqual(["m1-before", "m2-before", "handler", "m2-after", "m1-after"]);
    });

    it("should work with empty middleware array", async () => {
      const handler: any = async () => new Response("OK");
      const composed = compose([], handler);

      const ctx: RequestContext = {
        remoteAddress: "127.0.0.1",
        userAgent: "test",
        startTime: Date.now(),
      };
      const req = new Request("http://localhost/test");

      const response = await composed(req, ctx);
      expect(response.status).toBe(200);
    });
  });

  describe("methodValidator", () => {
    const mockContext = (): RequestContext => ({
      remoteAddress: "127.0.0.1",
      userAgent: "test",
      startTime: Date.now(),
    });

    const mockHandler = async () => new Response("OK", { status: 200 });

    describe("allowed methods", () => {
      it("should allow GET requests when GET is in allowed methods", async () => {
        const validator = methodValidator(["GET"]);
        const wrappedHandler = validator(mockHandler);
        
        const req = new Request("http://localhost/test", { method: "GET" });
        const response = await wrappedHandler(req, mockContext());
        
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("OK");
      });

      it("should allow HEAD requests when HEAD is in allowed methods", async () => {
        const validator = methodValidator(["GET", "HEAD"]);
        const wrappedHandler = validator(mockHandler);
        
        const req = new Request("http://localhost/test", { method: "HEAD" });
        const response = await wrappedHandler(req, mockContext());
        
        expect(response.status).toBe(200);
      });

      it("should allow POST requests when POST is in allowed methods", async () => {
        const validator = methodValidator(["POST"]);
        const wrappedHandler = validator(mockHandler);
        
        const req = new Request("http://localhost/test", { method: "POST" });
        const response = await wrappedHandler(req, mockContext());
        
        expect(response.status).toBe(200);
      });

      it("should allow multiple different methods", async () => {
        const validator = methodValidator(["GET", "POST", "PUT", "DELETE"]);
        const wrappedHandler = validator(mockHandler);
        
        const methods = ["GET", "POST", "PUT", "DELETE"];
        for (const method of methods) {
          const req = new Request("http://localhost/test", { method });
          const response = await wrappedHandler(req, mockContext());
          expect(response.status).toBe(200);
        }
      });

      it("should be case insensitive for method names", async () => {
        const validator = methodValidator(["GET"]);
        const wrappedHandler = validator(mockHandler);
        
        const req = new Request("http://localhost/test", { method: "get" as any });
        const response = await wrappedHandler(req, mockContext());
        
        expect(response.status).toBe(200);
      });
    });

    describe("disallowed methods", () => {
      it("should reject POST when only GET is allowed", async () => {
        const validator = methodValidator(["GET"]);
        const wrappedHandler = validator(mockHandler);
        
        const req = new Request("http://localhost/test", { method: "POST" });
        
        let thrownError: ServiceError | null = null;
        try {
          await wrappedHandler(req, mockContext());
        } catch (error) {
          thrownError = error as ServiceError;
        }
        
        expect(thrownError).not.toBe(null);
        expect(thrownError?.statusCode).toBe(405);
        expect(thrownError?.message).toContain("Method POST not allowed");
        expect(thrownError?.headers?.["Allow"]).toBe("GET");
      });

      it("should reject DELETE when only GET and POST are allowed", async () => {
        const validator = methodValidator(["GET", "POST"]);
        const wrappedHandler = validator(mockHandler);
        
        const req = new Request("http://localhost/test", { method: "DELETE" });
        
        let thrownError: ServiceError | null = null;
        try {
          await wrappedHandler(req, mockContext());
        } catch (error) {
          thrownError = error as ServiceError;
        }
        
        expect(thrownError).not.toBe(null);
        expect(thrownError?.statusCode).toBe(405);
        expect(thrownError?.headers?.["Allow"]).toContain("GET");
        expect(thrownError?.headers?.["Allow"]).toContain("POST");
      });

      it("should reject PUT, PATCH, and DELETE on GET-only endpoint", async () => {
        const validator = methodValidator(["GET"]);
        const wrappedHandler = validator(mockHandler);
        
        const methods = ["PUT", "PATCH", "DELETE"];
        for (const method of methods) {
          const req = new Request("http://localhost/test", { method });
          
          let thrownError: ServiceError | null = null;
          try {
            await wrappedHandler(req, mockContext());
          } catch (error) {
            thrownError = error as ServiceError;
          }
          
          expect(thrownError).not.toBe(null);
          expect(thrownError?.statusCode).toBe(405);
          expect(thrownError?.message).toContain(`Method ${method} not allowed`);
        }
      });
    });

    describe("OPTIONS handling", () => {
      it("should return 204 for OPTIONS requests", async () => {
        const validator = methodValidator(["GET", "POST"]);
        const wrappedHandler = validator(mockHandler);
        
        const req = new Request("http://localhost/test", { method: "OPTIONS" });
        const response = await wrappedHandler(req, mockContext());
        
        expect(response.status).toBe(204);
        expect(await response.text()).toBe("");
      });

      it("should include Allow header in OPTIONS response", async () => {
        const validator = methodValidator(["GET", "HEAD"]);
        const wrappedHandler = validator(mockHandler);
        
        const req = new Request("http://localhost/test", { method: "OPTIONS" });
        const response = await wrappedHandler(req, mockContext());
        
        const allowHeader = response.headers.get("Allow");
        expect(allowHeader).toContain("GET");
        expect(allowHeader).toContain("HEAD");
      });

      it("should include CORS headers in OPTIONS response", async () => {
        const validator = methodValidator(["GET", "POST"]);
        const wrappedHandler = validator(mockHandler);
        
        const req = new Request("http://localhost/test", { method: "OPTIONS" });
        const response = await wrappedHandler(req, mockContext());
        
        expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
        expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
        expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
      });

      it("should handle OPTIONS without calling the wrapped handler", async () => {
        let handlerCalled = false;
        const trackingHandler = async () => {
          handlerCalled = true;
          return new Response("OK");
        };
        
        const validator = methodValidator(["GET"]);
        const wrappedHandler = validator(trackingHandler);
        
        const req = new Request("http://localhost/test", { method: "OPTIONS" });
        await wrappedHandler(req, mockContext());
        
        expect(handlerCalled).toBe(false);
      });
    });

    describe("error responses", () => {
      it("should include Allow header in 405 error", async () => {
        const validator = methodValidator(["GET", "HEAD"]);
        const wrappedHandler = validator(mockHandler);
        
        const req = new Request("http://localhost/test", { method: "POST" });
        
        let thrownError: ServiceError | null = null;
        try {
          await wrappedHandler(req, mockContext());
        } catch (error) {
          thrownError = error as ServiceError;
        }
        
        expect(thrownError?.headers?.["Allow"]).toBeTruthy();
        expect(thrownError?.headers?.["Allow"]).toContain("GET");
        expect(thrownError?.headers?.["Allow"]).toContain("HEAD");
      });

      it("should format Allow header as comma-separated list", async () => {
        const validator = methodValidator(["GET", "POST", "PUT"]);
        const wrappedHandler = validator(mockHandler);
        
        const req = new Request("http://localhost/test", { method: "DELETE" });
        
        let thrownError: ServiceError | null = null;
        try {
          await wrappedHandler(req, mockContext());
        } catch (error) {
          thrownError = error as ServiceError;
        }
        
        const allowHeader = thrownError?.headers?.["Allow"];
        expect(allowHeader).toBe("GET, POST, PUT");
      });
    });

    describe("edge cases", () => {
      it("should handle single allowed method", async () => {
        const validator = methodValidator(["POST"]);
        const wrappedHandler = validator(mockHandler);
        
        const req = new Request("http://localhost/test", { method: "POST" });
        const response = await wrappedHandler(req, mockContext());
        
        expect(response.status).toBe(200);
      });

      it("should work with all standard HTTP methods", async () => {
        const validator = methodValidator(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]);
        const wrappedHandler = validator(mockHandler);
        
        const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"];
        for (const method of methods) {
          const req = new Request("http://localhost/test", { method });
          const response = await wrappedHandler(req, mockContext());
          expect(response.status).toBe(200);
        }
      });

      it("should preserve handler response when method is allowed", async () => {
        const customHandler = async () => 
          new Response("Custom response", { 
            status: 201,
            headers: { "X-Custom": "value" }
          });
        
        const validator = methodValidator(["POST"]);
        const wrappedHandler = validator(customHandler);
        
        const req = new Request("http://localhost/test", { method: "POST" });
        const response = await wrappedHandler(req, mockContext());
        
        expect(response.status).toBe(201);
        expect(await response.text()).toBe("Custom response");
        expect(response.headers.get("X-Custom")).toBe("value");
      });
    });
  });
});
