import type { } from "bun";

export type AuthUser = { user: string; pass: string };
export type AuthUsers = AuthUser[];

function parseBasicAuthHeader(header: string | null): AuthUser | null {
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

export function getBasicAuthUsername(req: Request): string | null {
  return parseBasicAuthHeader(req.headers.get("authorization"))?.user || null;
}

export function isAuthorized(req: Request, users: AuthUsers): boolean {
  if (users.length === 0) return true; // auth disabled when no users configured
  const provided = parseBasicAuthHeader(req.headers.get("authorization"));
  if (!provided) return false;
  return users.some(u => u.user === provided.user && u.pass === provided.pass);
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
