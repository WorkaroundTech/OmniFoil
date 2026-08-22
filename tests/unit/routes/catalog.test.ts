import { describe, it, expect } from "bun:test";
import { catalogPageHandler } from "../../../src/routes/handlers/catalog";
import { type RequestContext } from "../../../src/types";

describe("routes/catalog", () => {
  const ctx: RequestContext = {
    remoteAddress: "127.0.0.1",
    userAgent: "Mozilla/5.0",
    startTime: Date.now(),
  };

  it("should return HTML for browser requests", async () => {
    const req = new Request("http://localhost/catalog", {
      headers: { accept: "text/html" },
    });

    const response = await catalogPageHandler(req, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const body = await response.text();
    expect(body).toContain("<h1>Catalog</h1>");
  });

  it("should accept HEAD requests", async () => {
    const req = new Request("http://localhost/catalog", {
      method: "HEAD",
      headers: { accept: "text/html" },
    });

    const response = await catalogPageHandler(req, ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});
