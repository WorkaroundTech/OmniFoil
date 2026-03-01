import { describe, it, expect } from "bun:test";
import { savesListHandler } from "../../../src/routes/handlers/saves";
import { type RequestContext } from "../../../src/types";

describe("routes/saves", () => {
  const ctx: RequestContext = {
    remoteAddress: "127.0.0.1",
    userAgent: "Tinfoil/7.0",
    startTime: Date.now(),
  };

  describe("GET /api/saves/list", () => {
    it("should return saves list structure", async () => {
      const req = new Request("http://localhost/api/saves/list");
      const response = await savesListHandler(req, ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
    });

    it("should return empty saves array", async () => {
      const req = new Request("http://localhost/api/saves/list");
      const response = await savesListHandler(req, ctx);
      const data = (await response.json()) as any;

      expect(data).toHaveProperty("saves");
      expect(Array.isArray(data.saves)).toBe(true);
      expect(data.saves.length).toBe(0);
    });

    it("should handle HEAD requests", async () => {
      const req = new Request("http://localhost/api/saves/list", {
        method: "HEAD",
      });
      const response = await savesListHandler(req, ctx);

      expect(response.status).toBe(200);
    });
  });
});
