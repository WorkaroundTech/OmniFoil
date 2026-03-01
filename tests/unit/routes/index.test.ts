import { describe, it, expect } from "bun:test";
import { indexHandler } from "../../../src/routes/handlers/index";
import { type RequestContext } from "../../../src/types";

describe("routes/index", () => {
  const ctx: RequestContext = {
    remoteAddress: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    startTime: Date.now(),
  };

  it("should return HTML for browser requests", async () => {
    const req = new Request("http://localhost/", {
      headers: { accept: "text/html,application/xhtml+xml" },
    });

    const response = await indexHandler(req, ctx);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.status).toBe(200);
  });

  it("should return JSON for non-browser requests", async () => {
    const req = new Request("http://localhost/", {
      headers: { accept: "application/json" },
    });

    const response = await indexHandler(req, ctx);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.status).toBe(200);

    const data = await response.json() as any;
    expect(data.files).toBeDefined();
    expect(data.directories).toBeDefined();
    expect(Array.isArray(data.files)).toBe(true);
  });

  it("should include shop.json and shop.tfl in files", async () => {
    const req = new Request("http://localhost/tinfoil", {
      headers: { accept: "application/json" },
    });

    const response = await indexHandler(req, ctx);
    const data = await response.json() as any;

    const fileUrls = data.files.map((f: any) => f.url);
    expect(fileUrls).toContain("shop.json");
    expect(fileUrls).toContain("shop.tfl");
  });

  it("should handle /tinfoil path", async () => {
    const req = new Request("http://localhost/tinfoil", {
      headers: { accept: "application/json" },
    });

    const response = await indexHandler(req, ctx);
    expect(response.status).toBe(200);
  });

  it("should return index listing for Tinfoil/CyberFoil-style headers", async () => {
    const req = new Request("http://localhost/", {
      headers: {
        Theme: "dark",
        Uid: "1000",
        Version: "1",
        Revision: "1",
        Language: "en",
        Hauth: "x",
        Uauth: "y",
      },
    });

    const response = await indexHandler(req, ctx);
    expect(response.status).toBe(200);

    const data = await response.json() as any;
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(data.files).toBeDefined();
    expect(data.directories).toBeDefined();
    expect(Array.isArray(data.files)).toBe(true);

    const fileUrls = data.files.map((f: any) => f.url);
    expect(fileUrls).toContain("shop.json");
    expect(fileUrls).toContain("shop.tfl");
  });

  describe("success message handling", () => {
    it("Tinfoil client should omit success key when unset", async () => {
      const req = new Request("http://localhost/", {
        headers: {
          Theme: "dark",
          Uid: "1000",
          Version: "1",
          Revision: "1",
          Language: "en",
          Hauth: "x",
          Uauth: "y",
        },
      });

      const response = await indexHandler(req, ctx);
      const data = await response.json() as any;

      // Tinfoil clients should NOT have success key if unset (to avoid empty banners)
      expect(data.success).toBeUndefined();
    });

    it("CyberFoil client should include success key even when unset", async () => {
      const req = new Request("http://localhost/", {
        headers: {
          Theme: "dark",
          Uid: "1000",
          Version: "1",
          Revision: "1",
          Language: "en",
          Hauth: "x",
          Uauth: "y",
          "User-Agent": "CyberFoil/1.0",
        },
      });

      const response = await indexHandler(req, ctx);
      const data = await response.json() as any;

      // CyberFoil clients should always have success key (even if empty string)
      expect(data.success).toBeDefined();
      expect(typeof data.success).toBe("string");
    });
  });
});
