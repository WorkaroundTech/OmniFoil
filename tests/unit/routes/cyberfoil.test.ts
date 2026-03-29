import { describe, it, expect } from "bun:test";
import { cyberfoilSectionsHandler, getGameHandler } from "../../../src/routes/handlers/cyberfoil";
import { type RequestContext, ServiceError } from "../../../src/types";

describe("routes/cyberfoil", () => {
  const ctx: RequestContext = {
    remoteAddress: "127.0.0.1",
    userAgent: "Cyberfoil/1.0",
    startTime: Date.now(),
  };

  it("should return sections payload", async () => {
    const req = new Request("http://localhost/api/shop/sections?limit=25");
    const response = await cyberfoilSectionsHandler(req, ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const payload = await response.json() as any;
    expect(Array.isArray(payload.sections)).toBe(true);
    expect(payload.sections.length).toBeGreaterThan(0);
  });

  it("should return 404 for unknown get_game id", async () => {
    const localCtx: RequestContext = {
      remoteAddress: "127.0.0.1",
      userAgent: "Cyberfoil/1.0",
      startTime: Date.now(),
    };
    const req = new Request("http://localhost/api/get_game/99999999");

    let thrownError: ServiceError | null = null;
    try {
      await getGameHandler(req, localCtx);
    } catch (error) {
      thrownError = error as ServiceError;
    }

    expect(thrownError).not.toBe(null);
    expect(thrownError?.statusCode).toBe(404);
    expect((localCtx.data as any)?.endpoint).toBe("/api/get_game/:gameid");
    expect((localCtx.data as any)?.getGameId).toBe(99999999);
    expect((localCtx.data as any)?.getGameReason).toBe("catalog_entry_not_found");
  });
});
