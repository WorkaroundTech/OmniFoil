import { describe, it, expect } from "bun:test";
import { getIcon, getBanner } from "../../../src/routes/handlers/media";
import { type RequestContext } from "../../../src/types";

describe("routes/media", () => {
  const ctx: RequestContext = {
    remoteAddress: "127.0.0.1",
    userAgent: "CyberFoil/1.0",
    startTime: Date.now(),
  };

  describe("GET /api/shop/icon/:title_id", () => {
    it("should return 400 for invalid title ID (too short)", async () => {
      const req = new Request("http://localhost/api/shop/icon/12345");
      
      try {
        await getIcon(req, ctx);
        expect(false).toBe(true); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain("Invalid title ID");
      }
    });

    it("should return 400 for invalid title ID (too long)", async () => {
      const req = new Request("http://localhost/api/shop/icon/01234567890123456789");
      
      try {
        await getIcon(req, ctx);
        expect(false).toBe(true); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain("Invalid title ID");
      }
    });

    it("should return placeholder SVG for unknown title ID", async () => {
      // Use a valid format but non-existent title ID
      const req = new Request("http://localhost/api/shop/icon/0000000000000000");
      const response = await getIcon(req, ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/svg+xml");
      
      const body = await response.text();
      expect(body).toContain("<svg");
      expect(body).toContain("No Icon");
    });

    it("should set proper cache headers for placeholders", async () => {
      const req = new Request("http://localhost/api/shop/icon/0000000000000000");
      const response = await getIcon(req, ctx);

      expect(response.headers.get("cache-control")).toBeTruthy();
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("should handle valid 16-character title ID format", async () => {
      // This should at least not throw a validation error
      const req = new Request("http://localhost/api/shop/icon/0100000000000000");
      const response = await getIcon(req, ctx);

      // Should either return a placeholder or actual image
      expect(response.status).toBe(200);
      expect([
        "image/svg+xml",
        "image/png",
        "image/jpeg",
        "image/jpg",
      ]).toContain(response.headers.get("content-type")!);
    });
  });

  describe("GET /api/shop/banner/:title_id", () => {
    it("should return 400 for invalid title ID (too short)", async () => {
      const req = new Request("http://localhost/api/shop/banner/12345");
      
      try {
        await getBanner(req, ctx);
        expect(false).toBe(true); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain("Invalid title ID");
      }
    });

    it("should return 400 for invalid title ID (too long)", async () => {
      const req = new Request("http://localhost/api/shop/banner/01234567890123456789");
      
      try {
        await getBanner(req, ctx);
        expect(false).toBe(true); // Should not reach here
      } catch (error: any) {
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain("Invalid title ID");
      }
    });

    it("should return placeholder SVG for unknown title ID", async () => {
      // Use a valid format but non-existent title ID
      const req = new Request("http://localhost/api/shop/banner/0000000000000000");
      const response = await getBanner(req, ctx);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/svg+xml");
      
      const body = await response.text();
      expect(body).toContain("<svg");
      expect(body).toContain("No Banner");
    });

    it("should set proper cache headers for placeholders", async () => {
      const req = new Request("http://localhost/api/shop/banner/0000000000000000");
      const response = await getBanner(req, ctx);

      expect(response.headers.get("cache-control")).toBeTruthy();
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("should handle valid 16-character title ID format", async () => {
      // This should at least not throw a validation error
      const req = new Request("http://localhost/api/shop/banner/0100000000000000");
      const response = await getBanner(req, ctx);

      // Should either return a placeholder or actual image
      expect(response.status).toBe(200);
      expect([
        "image/svg+xml",
        "image/png",
        "image/jpeg",
        "image/jpg",
      ]).toContain(response.headers.get("content-type")!);
    });

    it("should return different placeholder dimensions than icon", async () => {
      const iconReq = new Request("http://localhost/api/shop/icon/0000000000000000");
      const bannerReq = new Request("http://localhost/api/shop/banner/0000000000000000");
      
      const iconResponse = await getIcon(iconReq, ctx);
      const bannerResponse = await getBanner(bannerReq, ctx);
      
      const iconBody = await iconResponse.text();
      const bannerBody = await bannerResponse.text();
      
      // Icon should be 300x300, banner should be 640x360
      expect(iconBody).toContain('width="300"');
      expect(iconBody).toContain('height="300"');
      expect(bannerBody).toContain('width="640"');
      expect(bannerBody).toContain('height="360"');
    });
  });
});
