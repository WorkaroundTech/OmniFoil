/**
 * Deluge Web UI JSON-RPC client.
 * Logs in, makes sure the Web UI is attached to a daemon, then adds torrents with
 * server-side options only (download path, move-completed path, stop ratio).
 */

import {
  DELUGE_URL,
  DELUGE_PASSWORD,
  DELUGE_HOST_ID,
  DELUGE_DOWNLOAD_PATH,
  DELUGE_MOVE_COMPLETED_PATH,
  DELUGE_STOP_RATIO,
  DELUGE_TIMEOUT_MS,
} from "../config";

export interface DelugeConfig {
  url: string;
  password: string;
  hostId?: string;
  downloadPath?: string;
  moveCompletedPath?: string;
  stopRatio?: number;
  timeoutMs?: number;
}

export type DelugeErrorKind = "unreachable" | "auth" | "duplicate" | "rejected";

export class DelugeError extends Error {
  kind: DelugeErrorKind;

  constructor(kind: DelugeErrorKind, message: string) {
    super(message);
    this.name = "DelugeError";
    this.kind = kind;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface RpcResponse {
  result?: unknown;
  error?: { message?: string; code?: number } | null;
}

/** Build the per-torrent options from config; nothing here is user-controlled. */
export function buildTorrentOptions(config: DelugeConfig): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  if (config.downloadPath) options.download_location = config.downloadPath;
  if (config.moveCompletedPath) {
    options.move_completed = true;
    options.move_completed_path = config.moveCompletedPath;
  }
  if (config.stopRatio !== undefined) {
    options.stop_at_ratio = true;
    options.stop_ratio = config.stopRatio;
  }
  return options;
}

export class DelugeClient {
  private cookie: string | null = null;
  private nextId = 1;
  private loginInFlight: Promise<void> | null = null;

  constructor(
    private readonly config: DelugeConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /** Adds a torrent file and returns the new torrent's id. */
  async addTorrent(filename: string, bytes: Uint8Array): Promise<string> {
    await this.ensureConnected();

    const result = await this.rpc("core.add_torrent_file", [
      filename,
      Buffer.from(bytes).toString("base64"),
      buildTorrentOptions(this.config),
    ]);

    // Some Deluge versions return null instead of raising for a torrent already in the session
    if (typeof result !== "string" || result.length === 0) {
      throw new DelugeError("duplicate", "Torrent already exists or was not added");
    }
    return result;
  }

  private async ensureConnected(): Promise<void> {
    if ((await this.rpc("web.connected", [])) === true) return;

    let hostId = this.config.hostId;
    if (!hostId) {
      const hosts = await this.rpc("web.get_hosts", []);
      const first = Array.isArray(hosts) ? hosts[0] : undefined;
      hostId = Array.isArray(first) && typeof first[0] === "string" ? first[0] : undefined;
    }
    if (!hostId) throw new DelugeError("rejected", "No Deluge daemon available to connect to");

    await this.rpc("web.connect", [hostId]);
  }

  private async login(): Promise<void> {
    // Share one login between concurrent requests
    this.loginInFlight ??= this.doLogin().finally(() => {
      this.loginInFlight = null;
    });
    return this.loginInFlight;
  }

  private async doLogin(): Promise<void> {
    this.cookie = null;
    const { response, body } = await this.post("auth.login", [this.config.password]);
    if (body.result !== true) throw new DelugeError("auth", "Deluge rejected the configured password");

    const session = response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .find((c) => c?.startsWith("_session_id="));
    if (!session) throw new DelugeError("auth", "Deluge did not return a session");
    this.cookie = session;
  }

  private async rpc(method: string, params: unknown[]): Promise<unknown> {
    if (!this.cookie) await this.login();

    let { body } = await this.post(method, params);
    if (body.error?.code === 1) {
      // Session expired (Deluge reports "Not authenticated" as code 1): log in again once
      await this.login();
      ({ body } = await this.post(method, params));
    }

    if (body.error) {
      const message = body.error.message || "Unknown Deluge error";
      if (body.error.code === 1) throw new DelugeError("auth", message);
      throw new DelugeError(/already (in session|exists)/i.test(message) ? "duplicate" : "rejected", message);
    }
    return body.result;
  }

  private async post(method: string, params: unknown[]): Promise<{ response: Response; body: RpcResponse }> {
    let response: Response;
    const started = Date.now();
    const logFailure = (outcome: string) => console.error(`[DELUGE] ${method} -> ${outcome} (${Date.now() - started}ms)`);
    try {
      response = await this.fetchImpl(`${this.config.url}/json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
        body: JSON.stringify({ method, params, id: this.nextId++ }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
        redirect: "error",
      });
    } catch (err) {
      logFailure(`request failed: ${err instanceof Error ? `${err.name}: ${err.message}` : err}`);
      throw new DelugeError("unreachable", `Could not reach Deluge: ${err instanceof Error ? err.message : err}`);
    }

    if (!response.ok) {
      logFailure(`HTTP ${response.status}`);
      throw new DelugeError("unreachable", `Deluge responded with HTTP ${response.status}`);
    }

    try {
      const body = (await response.json()) as RpcResponse;
      if (body.error) logFailure(`error code=${body.error.code} message="${body.error.message}"`);
      return { response, body };
    } catch {
      logFailure(`invalid JSON (content-type ${response.headers.get("content-type")})`);
      throw new DelugeError("unreachable", "Deluge returned an invalid response");
    }
  }
}

let defaultClient: DelugeClient | null = null;

/** Client built from environment configuration (lazily, so unused when the feature is off). */
export function getDelugeClient(): DelugeClient {
  defaultClient ??= new DelugeClient({
    url: DELUGE_URL,
    password: DELUGE_PASSWORD,
    hostId: DELUGE_HOST_ID || undefined,
    downloadPath: DELUGE_DOWNLOAD_PATH || undefined,
    moveCompletedPath: DELUGE_MOVE_COMPLETED_PATH || undefined,
    stopRatio: DELUGE_STOP_RATIO,
    timeoutMs: DELUGE_TIMEOUT_MS,
  });
  return defaultClient;
}
