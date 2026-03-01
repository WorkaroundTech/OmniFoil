/**
 * Tests for HTTP method validation middleware
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { setupServer, printEndpoints } from "../../src/app";
import type { Server } from "bun";

describe("HTTP Method Validation", () => {
  let server: Server<any>;
  let baseUrl: string;

  beforeAll(async () => {
    server = await setupServer();
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(() => {
    server.stop();
  });

  describe("GET requests (allowed)", () => {
    it("should allow GET on /", async () => {
      const response = await fetch(`${baseUrl}/`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      expect(response.status).toBe(200);
    });

    it("should allow GET on /shop.tfl", async () => {
      const response = await fetch(`${baseUrl}/shop.tfl`, {
        method: "GET",
      });
      expect(response.status).toBe(200);
    });

    it("should allow GET on /files/* (even if file not found)", async () => {
      const response = await fetch(`${baseUrl}/files/nonexistent.nsp`, {
        method: "GET",
      });
      // Should return 404 for missing file, not 405 for method
      expect(response.status).toBe(404);
    });
  });

  describe("HEAD requests (allowed)", () => {
    it("should allow HEAD on /", async () => {
      const response = await fetch(`${baseUrl}/`, {
        method: "HEAD",
      });
      expect(response.status).toBe(200);
    });

    it("should allow HEAD on /shop.tfl", async () => {
      const response = await fetch(`${baseUrl}/shop.tfl`, {
        method: "HEAD",
      });
      expect(response.status).toBe(200);
    });
  });

  describe("OPTIONS requests", () => {
    it("should respond with 204 and Allow header on /", async () => {
      const response = await fetch(`${baseUrl}/`, {
        method: "OPTIONS",
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("Allow")).toContain("GET");
      expect(response.headers.get("Allow")).toContain("HEAD");
    });

    it("should respond with 204 and Allow header on /shop.tfl", async () => {
      const response = await fetch(`${baseUrl}/shop.tfl`, {
        method: "OPTIONS",
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("Allow")).toContain("GET");
    });

    it("should respond with 204 and Allow header on /files/*", async () => {
      const response = await fetch(`${baseUrl}/files/test.nsp`, {
        method: "OPTIONS",
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("Allow")).toContain("GET");
    });
  });

  describe("Invalid methods (not allowed)", () => {
    it("should reject POST on /", async () => {
      const response = await fetch(`${baseUrl}/`, {
        method: "POST",
        body: "{}",
      });
      expect(response.status).toBe(405);
      expect(await response.text()).toContain("Method POST not allowed");
      expect(response.headers.get("Allow")).toBeTruthy();
    });

    it("should reject PUT on /shop.tfl", async () => {
      const response = await fetch(`${baseUrl}/shop.tfl`, {
        method: "PUT",
        body: "{}",
      });
      expect(response.status).toBe(405);
      expect(await response.text()).toContain("Method PUT not allowed");
    });

    it("should reject DELETE on /files/test.nsp", async () => {
      const response = await fetch(`${baseUrl}/files/test.nsp`, {
        method: "DELETE",
      });
      expect(response.status).toBe(405);
      expect(await response.text()).toContain("Method DELETE not allowed");
    });

    it("should reject PATCH on /", async () => {
      const response = await fetch(`${baseUrl}/`, {
        method: "PATCH",
        body: "{}",
      });
      expect(response.status).toBe(405);
      expect(await response.text()).toContain("Method PATCH not allowed");
    });
  });

  describe("Case insensitivity", () => {
    it("should handle lowercase method names", async () => {
      const response = await fetch(`${baseUrl}/`, {
        method: "get" as any,
      });
      expect(response.status).toBe(200);
    });
  });
});
