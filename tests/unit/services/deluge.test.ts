import { describe, it, expect } from "bun:test";
import { DelugeClient, DelugeError, buildTorrentOptions } from "../../../src/services/deluge";

type Call = { method: string; params: unknown[]; cookie: string | null };

function mockDeluge(handlers: Record<string, (params: unknown[], n: number) => unknown>) {
  const calls: Call[] = [];
  const counts: Record<string, number> = {};
  const fetchImpl = async (_url: string, init?: RequestInit) => {
    const { method, params } = JSON.parse(String(init?.body));
    const cookie = (init?.headers as Record<string, string>).Cookie ?? null;
    calls.push({ method, params, cookie });
    counts[method] = (counts[method] ?? 0) + 1;
    const out = handlers[method]?.(params, counts[method]) ?? null;
    const headers = new Headers({ "Content-Type": "application/json" });
    if (method === "auth.login") headers.append("Set-Cookie", "_session_id=abc; Path=/; HttpOnly");
    const body = out instanceof Error ? { result: null, error: { message: out.message, code: 2 } }
      : out && typeof out === "object" && "authError" in out ? { result: null, error: { message: "Not authenticated", code: 1 } }
      : { result: out, error: null };
    return new Response(JSON.stringify(body), { headers });
  };
  return { fetchImpl, calls };
}

const config = { url: "http://deluge:8112", password: "pw", downloadPath: "/dl", moveCompletedPath: "/done", stopRatio: 1.5 };

describe("services/deluge", () => {
  it("builds options only from config", () => {
    expect(buildTorrentOptions(config)).toEqual({
      download_location: "/dl", move_completed: true, move_completed_path: "/done", stop_at_ratio: true, stop_ratio: 1.5,
    });
    expect(buildTorrentOptions({ url: "x", password: "y" })).toEqual({});
  });

  it("logs in, adds the torrent with options and sends the session cookie", async () => {
    const { fetchImpl, calls } = mockDeluge({
      "auth.login": () => true,
      "web.connected": () => true,
      "core.add_torrent_file": () => "deadbeef",
    });
    const id = await new DelugeClient(config, fetchImpl).addTorrent("a.torrent", new Uint8Array([1, 2, 3]));
    expect(id).toBe("deadbeef");
    expect(calls[0]!.method).toBe("auth.login");
    const add = calls.find((c) => c.method === "core.add_torrent_file")!;
    expect(add.cookie).toBe("_session_id=abc");
    expect(add.params).toEqual(["a.torrent", "AQID", buildTorrentOptions(config)]);
  });

  it("connects to the first daemon when the Web UI is not connected", async () => {
    const { fetchImpl, calls } = mockDeluge({
      "auth.login": () => true,
      "web.connected": () => false,
      "web.get_hosts": () => [["host1", "127.0.0.1", 58846, "Online"]],
      "web.connect": () => [],
      "core.add_torrent_file": () => "id",
    });
    await new DelugeClient(config, fetchImpl).addTorrent("a.torrent", new Uint8Array([1]));
    expect(calls.find((c) => c.method === "web.connect")!.params).toEqual(["host1"]);
  });

  it("re-logs in once when the session expired", async () => {
    const { fetchImpl, calls } = mockDeluge({
      "auth.login": () => true,
      "web.connected": (_p, n) => (n === 1 ? { authError: true } : true),
      "core.add_torrent_file": () => "id",
    });
    await new DelugeClient(config, fetchImpl).addTorrent("a.torrent", new Uint8Array([1]));
    expect(calls.filter((c) => c.method === "auth.login")).toHaveLength(2);
  });

  it("reports a wrong password as an auth error", async () => {
    const { fetchImpl } = mockDeluge({ "auth.login": () => false });
    const err = await new DelugeClient(config, fetchImpl).addTorrent("a", new Uint8Array([1])).catch((e) => e);
    expect(err).toBeInstanceOf(DelugeError);
    expect(err.kind).toBe("auth");
  });

  it("maps duplicates", async () => {
    const { fetchImpl } = mockDeluge({
      "auth.login": () => true,
      "web.connected": () => true,
      "core.add_torrent_file": () => new Error("Torrent already in session (abc)."),
    });
    const err = await new DelugeClient(config, fetchImpl).addTorrent("a", new Uint8Array([1])).catch((e) => e);
    expect(err.kind).toBe("duplicate");
  });

  it("maps network failures to unreachable", async () => {
    const fetchImpl = async () => { throw new Error("ECONNREFUSED"); };
    const err = await new DelugeClient(config, fetchImpl).addTorrent("a", new Uint8Array([1])).catch((e) => e);
    expect(err.kind).toBe("unreachable");
  });
});
