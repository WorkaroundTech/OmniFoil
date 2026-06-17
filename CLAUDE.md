# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OmniFoil is a zero-dependency Tinfoil/CyberFoil backend server for Nintendo Switch game libraries, built on **Bun's native APIs** (no runtime dependencies in `package.json` — only dev types). The server is stateless: it scans configured directories on demand, enriches entries with TitleDB metadata, and streams files via `sendfile`.

## Commands

```bash
bun start            # Run server (src/main.ts)
bun start:dev        # Run with --watch for auto-reload
bun lint             # Type-check via tsc --noEmit (there is no separate eslint)
bun test             # Run all tests (Bun's built-in Jest-compatible runner)
bun test:watch       # Watch mode
bun test tests/unit/cache.test.ts   # Run a single test file
bun test --grep "range"              # Run tests matching a pattern
```

There is no build step — Bun executes TypeScript directly. `bun lint` is the only type-safety gate.

## Architecture

### Entry point & middleware chain

`src/main.ts` → `src/app.ts#setupServer` wires everything up with `Bun.serve`. The request flow is built with `compose(middlewares, router)` and wrapped once in `errorHandler`:

```
errorHandler → authorize → timing → logging → router → handler
```

`compose` (src/middleware/compose.ts) is a simple `reduceRight` that produces a single `Handler` from a list of `Middleware`. `errorHandler` is the outermost wrapper and is the **only** place where thrown errors become responses.

### Error handling convention

Handlers and middleware throw `ServiceError` (src/types/index.ts) with `{ statusCode, message, headers? }`. `errorHandler` (src/middleware/error-handler.ts) converts these to HTTP responses and also emits the request log line for error paths (the logging middleware only logs the success path). Any non-`ServiceError` throw becomes a 500 with the stack logged to console.

When adding a new handler, **throw `ServiceError` rather than returning an error `Response`** — this keeps logging and 401 handling (which returns a WWW-Authenticate challenge via `respondUnauthorized()`) consistent.

### Request context

Every handler receives `RequestContext` (src/types/index.ts) with `remoteAddress`, `userAgent`, `startTime`, and an open `data?: T` bag. Middleware attaches fields like `authUser`/`authAttemptUser` to `ctx.data`, and the `debug` log format pretty-prints this bag as a `ctx:` JSON block under each request line. If you add context info that should appear in debug logs, put it on `ctx.data`.

### Routing

`src/routes/index.ts` is a hand-rolled pathname switch — no router library. Each branch delegates to a handler module under `src/routes/handlers/`. Handlers are wrapped at export time with `methodValidator(["GET", "HEAD"])(...)` (src/middleware/method-validator.ts), which handles OPTIONS preflight and throws 405 for disallowed methods. When adding a route, follow this pattern and add the match to `router`.

### Tinfoil vs CyberFoil dispatch

`GET /` behaves differently by client, detected in `src/routes/handlers/index.ts`:
- Tinfoil-like requests are identified by the presence of **all** of `Theme`, `Uid`, `Version`, `Revision`, `Language`, `Hauth`, `Uauth` headers.
- CyberFoil is a Tinfoil-like request whose `user-agent` contains `cyberfoil`.
- Browsers (`Accept: text/html`) get `src/index.html`.

Legacy Tinfoil clients also hit `/shop.json` and `/shop.tfl`. CyberFoil uses `/api/shop/sections`, `/api/get_game/:id`, and `/api/shop/{icon,banner}/:title_id` (the title_id regexes require 16 hex chars).

### Shop catalog pipeline (src/services/shop.ts)

This is the core business logic and the most complex module:

1. **Scan**: `scanLibraryFiles` runs `Bun.Glob("**/*.{nsp,nsz,xci,xciz}")` against each configured base in parallel. Each base gets a unique `alias` (from `buildBaseAliases` in src/config/index.ts) used as the first segment of the virtual path — this is how multi-mount support works.
2. **Identify**: `identifyFile` (src/lib/identification.ts) regex-parses titleId/version/appType from filenames. Then `getOverrideForFile` (src/lib/overrides.ts) checks for manual overrides (`omnifoil-overrides.json` in any scanned dir; the file itself is filtered from the scan).
3. **Enrich**: For updates/DLC, metadata is fetched using the **base** titleId so updates inherit the base game's name/icon. Override fields win over TitleDB fields.
4. **Build sections**: `buildSectionsPayload` builds `new` (by releaseDate), `recommended` (by rating), `updates` (grouped by baseTitleId, latest version wins via `compareVersions`), `dlc`, `all` (alpha), `other` (unmatched entries). Only entries with a resolved titleId appear in the first four; unmatched ones go to "Other".
5. **Cache**: Results are cached in-module for `CACHE_TTL` seconds. `getCatalogEntryById` falls back to a forced refresh if an ID isn't found (handles stale cache on download).

The **`all` section is server-controlled** — it ignores any client-provided limit. It caps at 500 when TitleDB data loaded, else 150. The `discoveryLimit` parameter affects `new`/`recommended` only.

AppType values are numeric per CyberFoil spec: `0=BASE, 1=DLC, 2=UPDATE, 3=DEMO`.

### TitleDB service (src/services/titledb.ts)

Initialized in the background from `setupServer` (non-blocking). Downloads region/language-specific JSON from `https://tinfoil.media/repo/db`, caches under `TITLEDB_CACHE_DIR`, and exposes `getTitleInfo(titleId)`. Media artwork is lazily fetched and cached under `MEDIA_CACHE_DIR` via `src/lib/media-cache.ts`.

### Path security

`resolveVirtualPath` (src/lib/paths.ts) rejects any path containing `.`, `..`, or empty segments before joining. Virtual paths are always `{alias}/{relative}` — the alias lookup in `BASES` is what prevents access outside configured directories. Do not bypass this when adding new file-serving routes.

### Range requests

`src/lib/range.ts` parses RFC 7233 ranges. `filesHandler` rejects multi-range requests with 416. All file responses set `Accept-Ranges: bytes`.

## Configuration

All config is env-driven and loaded once in `src/config/index.ts`. Key vars:

- `GAMES_DIRS` — comma- or semicolon-separated absolute paths (multi-mount).
- `CACHE_TTL` — shop catalog TTL in seconds; `0` disables caching.
- `AUTH_CREDENTIALS` (`user1:pass1,user2:pass2`) and/or `AUTH_USER`+`AUTH_PASS`. Both can coexist; if neither is set, auth is disabled.
- `LOG_FORMAT` — `tiny | short | dev | debug | common | combined`. `debug` adds a pretty-printed `ctx:` block from `RequestContext.data`.
- `TITLEDB_*` and `MEDIA_CACHE_*` — see `.env.example`.

Full reference: `docs/configuration.md`. Architecture deep-dive: `docs/architecture.md`. API spec: `docs/TINFOIL-API.md`, `docs/api-reference.md`.

## Testing notes

- Tests live under `tests/unit/` (mirrors `src/` layout) and `tests/integration/` (full request/response through the middleware chain).
- `tests/scripts/test-ranges.sh` is a curl-based smoke test for byte ranges.
- Bun's test runner uses Jest-style `describe/test/expect` imported from `bun:test`.

## TypeScript config

`tsconfig.json` has `strict`, `noUncheckedIndexedAccess`, and `verbatimModuleSyntax` enabled. Use `import type { ... }` for type-only imports — mixing type and value imports will fail under `verbatimModuleSyntax`.
