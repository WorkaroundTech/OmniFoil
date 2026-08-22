# OmniFoil Copilot Instructions

## Commands

- `bun start` — run the server from `src/main.ts`
- `bun start:dev` — run the server with Bun watch mode
- `bun lint` — TypeScript type-check only (`tsc --noEmit`)
- `bun test` — run the full test suite
- `bun test:watch` — run tests in watch mode
- `bun test tests/unit/cache.test.ts` — run a single test file
- `bun test --grep "range"` — run tests matching a name pattern

There is no separate build step; Bun runs the TypeScript sources directly.

## Architecture

- `src/main.ts` boots the app, and `src/app.ts` wires the request pipeline with Bun.
- The request flow is `errorHandler → authorize → timing → logging → router → handler`.
- `src/routes/index.ts` is a hand-written pathname switch, not a router library.
- Handlers live under `src/routes/handlers/` and are wrapped with `methodValidator([...])`.
- `src/services/shop.ts` is the main business-logic module: it scans library files, identifies titles, applies overrides, enriches metadata, and builds the shop payload sections.
- `src/services/titledb.ts` loads TitleDB data in the background and serves metadata/artwork caching.
- `src/lib/paths.ts` enforces virtual-path safety; do not bypass it for file-serving routes.
- `src/lib/range.ts` handles RFC 7233 parsing; file routes support `Accept-Ranges: bytes` and reject multi-range requests.

## Conventions

- Throw `ServiceError` for expected HTTP failures; `errorHandler` converts them to responses.
- Put request metadata that should appear in debug logs on `ctx.data`.
- Use `import type` for type-only imports; `verbatimModuleSyntax` is enabled.
- Keep route additions consistent with the existing router pattern and add matching tests.
- Respect client dispatch rules in `src/routes/handlers/index.ts`: browser requests get HTML, Tinfoil-like requests get shop payloads, and CyberFoil-specific endpoints stay under `/api/...`.
- Update both unit and integration tests when changing request flow, routing, range handling, or shop payload behavior.
