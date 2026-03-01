import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { shopHandler } from "../../../src/routes/handlers/shop";
import { type RequestContext, ServiceError } from "../../../src/types";

describe("routes/shop", () => {
  const ctx: RequestContext = {
    remoteAddress: "127.0.0.1",
    userAgent: "Tinfoil/7.0",
    startTime: Date.now(),
  };

  describe("shop.json endpoint", () => {
    it("should return JSON with correct content-type", async () => {
      const req = new Request("http://localhost/shop.json");
      const response = await shopHandler(req, ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
    });

    it("should return shop data with files", async () => {
      const req = new Request("http://localhost/shop.json");
      const response = await shopHandler(req, ctx);
      const data = await response.json() as any;

      expect(data).toHaveProperty("files");
      expect(Array.isArray(data.files)).toBe(true);
    });

    it("should omit success field for non-CyberFoil requests when unset", async () => {
      const req = new Request("http://localhost/shop.json");
      const response = await shopHandler(req, ctx);
      const data = await response.json() as any;

      // When not a CyberFoil request and SUCCESS_MESSAGE is unset, success should not be present
      expect(data.success).toBeUndefined();
    });

    it("should have file objects with url and size", async () => {
      const req = new Request("http://localhost/shop.json");
      const response = await shopHandler(req, ctx);
      const data = await response.json() as any;

      if (data.files.length > 0) {
        const file = data.files[0];
        expect(file).toHaveProperty("url");
        expect(file).toHaveProperty("size");
        expect(typeof file.size).toBe("number");
      }
    });
  });

  describe("shop.tfl endpoint", () => {
    it("should return binary with application/octet-stream content-type", async () => {
      const req = new Request("http://localhost/shop.tfl");
      const response = await shopHandler(req, ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/octet-stream");
    });

    it("should return same data as shop.json but different content-type", async () => {
      const req1 = new Request("http://localhost/shop.json");
      const req2 = new Request("http://localhost/shop.tfl");

      const response1 = await shopHandler(req1, ctx);
      const response2 = await shopHandler(req2, ctx);

      const data1 = await response1.json();
      const data2 = await response2.json();

      expect(data1).toEqual(data2);
    });
  });

  describe("caching", () => {
    it("should cache shop data on subsequent requests", async () => {
      const req = new Request("http://localhost/shop.json");

      // First request
      const response1 = await shopHandler(req, ctx);
      const data1 = await response1.json();

      // Second request should use cache
      const response2 = await shopHandler(req, ctx);
      const data2 = await response2.json();

      expect(data1).toEqual(data2);
    });
  });
});
