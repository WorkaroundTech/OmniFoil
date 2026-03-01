import type { } from "bun";

export type AuthPair = { user: string; pass: string } | null;

function parseBasicAuthHeader(header: string | null): { user: string; pass: string } | null {
  if (!header) return null;
  const [scheme, encoded] = header.split(" ", 2);
  if (!scheme || scheme.toLowerCase() !== "basic") return null;
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx === -1) return null;
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    return { user, pass };
  } catch {
    return null;
  }
}

export function isAuthorized(req: Request, pair: AuthPair): boolean {
  if (!pair) return true; // auth disabled when not configured
  const provided = parseBasicAuthHeader(req.headers.get("authorization"));
  return !!provided && provided.user === pair.user && provided.pass === pair.pass;
}

export function respondUnauthorized(): Response {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": "Basic realm=\"OmniFoil\"",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
