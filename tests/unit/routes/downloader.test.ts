import { describe, it, expect } from "bun:test";
import { createDownloaderHandlers, UPLOAD_GUARD_HEADER, type DownloaderDeps } from "../../../src/routes/handlers/downloader";
import { createRateLimiter } from "../../../src/lib/rate-limit";
import { DelugeError } from "../../../src/services/deluge";
import { type RequestContext } from "../../../src/types";
import { validSingle } from "../../helpers/torrent";

const ctx = (): RequestContext => ({ remoteAddress: "1.2.3.4", userAgent: "t", startTime: Date.now(), data: { authUser: "admin" } });
const AUTH = "Basic " + Buffer.from("admin:secret").toString("base64");

function setup(overrides: Partial<DownloaderDeps> = {}, addTorrent = async (_n: string, _b: Uint8Array) => "tid") {
  const added: string[] = [];
  const deps: DownloaderDeps = {
    enabled: true,
    authUsers: () => [{ user: "admin", pass: "secret" }],
    client: () => ({ addTorrent: async (n, b) => { added.push(n); return addTorrent(n, b); } }),
    maxTorrentBytes: 4096,
    maxBodyBytes: 4096 + 1024,
    limiter: createRateLimiter(100),
    ...overrides,
  };
  return { handlers: createDownloaderHandlers(deps), added };
}

function upload(bytes: Uint8Array | string, filename = "a.torrent", headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append("torrent", new File([bytes as any], filename));
  return new Request("http://localhost/api/downloader/torrent", {
    method: "POST",
    body: form,
    headers: { authorization: AUTH, [UPLOAD_GUARD_HEADER]: "1", ...headers },
  });
}

const status = async (p: Promise<Response>) => (await p.then((r) => r.status, (e) => e.statusCode));

describe("routes/downloader", () => {
  it("adds a valid torrent", async () => {
    const { handlers, added } = setup();
    const res = await handlers.upload(upload(validSingle()), ctx());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, name: "game.nsp", files: 1 });
    expect(added).toEqual(["a.torrent"]);
  });

  it("is off without DELUGE_URL (503) and without configured auth (403)", async () => {
    expect(await status(setup({ enabled: false }).handlers.upload(upload(validSingle()), ctx()))).toBe(503);
    expect(await status(setup({ authUsers: () => [] }).handlers.upload(upload(validSingle()), ctx()))).toBe(403);
    expect(await status(setup({ authUsers: () => [] }).handlers.page(new Request("http://localhost/downloader"), ctx()))).toBe(403);
  });

  it("requires credentials", async () => {
    const { handlers } = setup();
    expect(await status(handlers.upload(upload(validSingle(), "a.torrent", { authorization: "Basic eDp5" }), ctx()))).toBe(401);
    expect(await status(handlers.page(new Request("http://localhost/downloader"), ctx()))).toBe(401);
  });

  it("serves the page to authorized users", async () => {
    const { handlers } = setup();
    const res = await handlers.page(new Request("http://localhost/downloader", { headers: { authorization: AUTH } }), ctx());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Downloader");
  });

  it("rejects requests without the guard header or flagged cross-site", async () => {
    const { handlers } = setup();
    expect(await status(handlers.upload(upload(validSingle(), "a.torrent", { [UPLOAD_GUARD_HEADER]: "" }), ctx()))).toBe(403);
    expect(await status(handlers.upload(upload(validSingle(), "a.torrent", { "sec-fetch-site": "cross-site" }), ctx()))).toBe(403);
  });

  it("rejects wrong methods", async () => {
    const { handlers } = setup();
    expect(await status(handlers.upload(new Request("http://localhost/x", { method: "GET", headers: { authorization: AUTH } }), ctx()))).toBe(405);
  });

  it("rejects oversized uploads by Content-Length and by actual stream size", async () => {
    const { handlers, added } = setup();
    const big = new Uint8Array(10_000);
    expect(await status(handlers.upload(upload(big), ctx()))).toBe(413);

    // Chunked body with no Content-Length
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(3000)); c.enqueue(new Uint8Array(3000)); c.close(); } });
    const req = new Request("http://localhost/api/downloader/torrent", {
      method: "POST",
      body: stream,
      duplex: "half",
      headers: { authorization: AUTH, [UPLOAD_GUARD_HEADER]: "1", "content-type": "multipart/form-data; boundary=x" },
    } as RequestInit);
    expect(await status(handlers.upload(req, ctx()))).toBe(413);
    expect(added).toHaveLength(0);
  });

  it("rejects non-multipart, wrong extension, missing field", async () => {
    const { handlers } = setup();
    const json = new Request("http://localhost/x", { method: "POST", body: "{}", headers: { authorization: AUTH, [UPLOAD_GUARD_HEADER]: "1", "content-type": "application/json" } });
    expect(await status(handlers.upload(json, ctx()))).toBe(415);
    expect(await status(handlers.upload(upload(validSingle(), "a.txt"), ctx()))).toBe(400);
    const form = new FormData();
    form.append("other", "x");
    const missing = new Request("http://localhost/x", { method: "POST", body: form, headers: { authorization: AUTH, [UPLOAD_GUARD_HEADER]: "1" } });
    expect(await status(handlers.upload(missing, ctx()))).toBe(400);
  });

  it("rejects invalid torrents without calling Deluge", async () => {
    const { handlers, added } = setup();
    expect(await status(handlers.upload(upload("not a torrent"), ctx()))).toBe(422);
    expect(added).toHaveLength(0);
  });

  it("rate limits per user", async () => {
    const { handlers } = setup({ limiter: createRateLimiter(1) });
    expect(await status(handlers.upload(upload(validSingle()), ctx()))).toBe(201);
    expect(await status(handlers.upload(upload(validSingle()), ctx()))).toBe(429);
  });

  it("maps Deluge failures without leaking details", async () => {
    const dup = setup({}, async () => { throw new DelugeError("duplicate", "already"); });
    expect(await status(dup.handlers.upload(upload(validSingle()), ctx()))).toBe(409);

    const down = setup({}, async () => { throw new DelugeError("unreachable", "http://secret-host:8112 refused"); });
    const err = await down.handlers.upload(upload(validSingle()), ctx()).catch((e) => e);
    expect(err.statusCode).toBe(502);
    expect(err.message).not.toContain("secret-host");
  });
});

describe("router wiring", () => {
  // The result depends on the local .env (503 off, 403 no auth, 401 no credentials); all prove the route is guarded.
  it("routes the downloader paths to guarded handlers", async () => {
    const { router } = await import("../../../src/routes");
    const page = await router(new Request("http://localhost/downloader"), ctx()).catch((e) => e);
    expect([401, 403, 503]).toContain(page.statusCode);
    const up = await router(new Request("http://localhost/api/downloader/torrent", { method: "POST" }), ctx()).catch((e) => e);
    expect([401, 403, 503]).toContain(up.statusCode);
  });
});
