# NUT HTTP / USB API Reference

Complete reference for the HTTP server and USB-tunneled equivalent shipped in NUT(the "official" Tinfoil Server implementation). This document is self-contained: every request parameter, path segment, header, and response field is defined inline, with the Python source location in parentheses.

> NUT exposes this API so that Tinfoil (and any other client you choose to write) can browse, query, and install Switch content from a machine running NUT. The same router serves a small JSON API for the bundled web UI.

---

## 1. Transport and runtime

### 1.1 Addressing

| Setting | Source | Default |
| --- | --- | --- |
| Hostname / bind address | `Config.server.hostname` | `0.0.0.0` |
| TCP port | `Config.server.port` | `9000` |
| Base URL | — | `http://<host>:<port>/` |

Defaults live in `conf/nut.default.conf`; user overrides go in `conf/nut.conf`. On `nut.py` they can be set via `-m/--hostname` and `-p/--port` (which also imply `--server`).

### 1.2 Concurrency model

`Server.run()` (`Server/__init__.py:66`) binds one TCP socket, calls `listen(5)`, then spawns **16 daemon threads**, each constructing its own `http.server.HTTPServer(..., False)` that shares the listening socket. There is no request queue or slot limit beyond that — long range downloads occupy one thread for their duration. Stream writes to the client are further offloaded to a per-response writer thread (`NutResponse.worker`, `Server/__init__.py:145`), so handler threads don't block on slow clients.

### 1.3 Filesystem watcher

`Watcher.start()` (`nut/Watcher.py`) runs alongside the server. It monitors every scan path with `watchdog` and reacts to create/delete/move events on `.nsp`, `.nsz`, `.xci`, `.xcz`. The `Nsps` registry is updated live, so endpoints backed by `Nsps.files` reflect the on-disk library without a manual rescan.

### 1.4 URL dispatcher

`Server.route(request, response, verb)` (`Server/__init__.py:246`) resolves a URL to a Python callable:

1. Split the path on `/`, URL-decode each segment, drop empties → `request.bits`.
2. Require `bits[0] == 'api'` (the only registered mapping, `mappings = {'api': Server.Controller.Api}` at `Server/__init__.py:35`).
3. Build the handler name as `verb + bits[1][0].upper() + bits[1][1:]`, e.g. `GET /api/titleImage/...` → `getTitleImage`.
4. Resolve via `getattr(Api, methodName, Response404)`. Missing handlers return `404`.
5. Invoke as `method(request, response, **request.query)` — URL-decoded query-string pairs become keyword args (scalar values; if a key repeats only the first value is kept).
6. Additional path segments (`bits[2:]`) are consumed positionally by each handler.

Anything whose first segment is not `api` (or whose second segment does not name a public handler) falls through to `NutHandler.handleFile` (`Server/__init__.py:327`) which streams from `public_html/` (directory → `index.html`). Path traversal above `public_html/` returns `500`.

### 1.5 Supported verbs

| Verb | Handler | Notes |
| --- | --- | --- |
| `GET` | `do('get')` → `route(...)` | Normal dispatch. |
| `HEAD` | `do_HEAD` | Same dispatch with `response.head = True` — body is suppressed but status/headers are sent. Range headers are still computed. |
| `POST` | `do('post')` → `route(...)` | The handler name prefix becomes `post…`. **No handler in `Api.py` is currently prefixed with `post`**, so every `POST /api/...` returns `404` today. |
| `OPTIONS` | `do_OPTIONS` | Unconditional `204 No Content` with the CORS headers below. |

### 1.6 CORS

Every response — including `404`/`500` bodies — has these headers appended in `NutHandler.end_headers` (`Server/__init__.py:321`):

```
Access-Control-Allow-Origin: <request Origin, or blank>
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
```

JSON handlers additionally set `Access-Control-Allow-Origin: *`, overriding the per-origin echo.

### 1.7 Authentication

None. The handler contains commented-out HTTP Basic scaffolding against a `Users.auth(id, password, ip)` helper and `Response401()` exists (`Server/__init__.py:241`) but is never invoked. Treat the server as trusted-LAN only.

### 1.8 Content types

Static and binary endpoints derive `Content-Type` from the extension via the `mimes` table (`Server/__init__.py:37`):

| Extension | Content-Type |
| --- | --- |
| `.css` | `text/css` |
| `.js` | `application/javascript` |
| `.html` | `text/html` |
| `.png` | `image/png` |
| `.jpg` | `image/jpeg` |
| `.nsx`, `.nsp`, `.nsz`, `.xci`, `.xcz` | `application/octet-stream` |

JSON handlers set `Content-Type: application/json` explicitly.

### 1.9 Error responses

| Helper | Status | Body | Used for |
| --- | --- | --- | --- |
| `Response400` | `400` | `"400"` (or a custom message) | Invalid Range request in `getDownload`. |
| `Response404` | `404` | `"404"` | Unknown route / missing resource. |
| `Response500` | `500` | `"500"` | Unhandled exception in a handler (`do` catches and calls this). |
| `Response401` | `401` | `"401"` + `WWW-Authenticate: Basic realm="Nut"` | **Defined but unused** (see 1.7). |

JSON endpoints that fail internally generally still return `200` with `{"success": false, "message": "..."}` instead of emitting a non-2xx status; that pattern applies to `getInfo` and `getFileSize`.

### 1.10 Response envelopes

Two distinct shapes appear in the API:

- **Direct payload** — the handler writes the JSON value itself (most common).
- **Envelope** — via the `success()` / `error()` helpers (`Server/Controller/Api.py:72-80`):

```json
{ "success": true,  "result": <any> }
{ "success": false, "result": <any> }
```

Only the `success`/`error` helpers are wired up internally; no currently shipped endpoint emits them on the happy path.

### 1.11 USB transport

`nut/Usb.py::poll_commands` (`nut/Usb.py:141`) listens on the Tinfoil libusbK endpoints (`idVendor 0x057e / 0x16c0`) and reads **32-byte framed packets** with the magic `\x12\x12\x12\x12`:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | Magic `\x12\x12\x12\x12` |
| 4 | 4 | `command` (little-endian uint32) |
| 8 | 8 | `size` of payload (uint64) |
| 16 | 4 | `threadId` |
| 20 | 2 | `packetIndex` |
| 22 | 2 | `packetCount` |
| 24 | 8 | `timestamp` |
| 32 | `size` | payload |

When `command == 1` the payload is treated as a URL string (UTF-8). That string is wrapped into a `UsbRequest` / `UsbResponse` pair (`nut/Usb.py:54-96`) and fed into the **same** `Server.route(...)` router. The response payload is sent back inside the same packet framing in place of an HTTP stream. Every endpoint documented below is therefore available over USB as well, with these differences:

- There are no HTTP headers on input or output.
- `Range`, CORS, MIME, and redirect semantics do not apply.
- `HEAD` is not meaningful.
- The USB writer fires the whole payload as a single packet (`send(10 * 60 * 1000)` timeout), so extremely large files are sent monolithically.

---

## 2. Shared object schemas

Every API response is composed of the objects defined below.

### 2.1 `TitleId`

A 16-character uppercase hex string identifying a Switch title (e.g. `0100ABCDEF012000`). Internally produced via `Title.setId` (`nut/Title.py:400`). Derived conventions:

- Bit mask `0xFFFFFFFFFFFFE000` → `baseId` (base application for the title).
- Last 3 nibbles (`idExt = id & 0x0000000000000FFF`):
  - `000` → base title.
  - `800` → update.
  - Otherwise → DLC.

### 2.2 `RightsId`

A 32-character uppercase hex string. The first 16 characters equal the titleId; the last 16 encode the key generation and related metadata.

### 2.3 `Title` object

Produced by `nut/Title.py:79`. Serialized via `t.__dict__`, so every attribute below may appear; most endpoints include fields with `null` values literally.

| Field | Type | Description |
| --- | --- | --- |
| `id` | `TitleId \| null` | Primary title id. |
| `rightsId` | `RightsId \| null` | Ticket rights id when available. |
| `name` | `string \| null` | Display name in the current locale (newlines removed). |
| `baseId` | `TitleId \| null` | Parent/base application id (self for bases). |
| `version` | `integer \| null` | Latest known version integer (multiples of 65536 per the Switch cnmt convention). |
| `key` | `string \| null` | 32-char hex title key (`'0000...00'` if unknown). |
| `isDLC` | `boolean` | Derived from the id mask. |
| `isUpdate` | `boolean` | `idExt` is `0x800`. |
| `isDemo` | `boolean \| null` | Heuristic from `nsuId` prefix (`"7003"`) or the name. |
| `idExt` | `integer \| null` | The lowest 3 nibbles of the id. |
| `updateId` | `TitleId \| null` | Base-title-only: id of the associated update title (`<base[:-3]>800`). |
| `region` | `string \| null` | ISO region code (e.g. `"US"`). |
| `regions` | `string[] \| null` | All regions the title appears in. |
| `languages` | `string[] \| null` | ISO 639-1 language codes. |
| `nsuId` | `integer \| null` | eShop id. |
| `releaseDate` | `integer \| null` | `YYYYMMDD`. |
| `category` | `string[] \| null` | Genre/category tags. |
| `rating` | `string \| integer \| null` | Age rating (ESRB short description or integer age). |
| `ratingContent` | `string[] \| null` | Content descriptors (e.g. `["Violence","Mild Blood"]`). |
| `numberOfPlayers` | `integer \| string \| null` | Max local players. |
| `developer` | `string \| null` | |
| `publisher` | `string \| null` | |
| `frontBoxArt` | `string \| null` | Absolute URL to source image. |
| `iconUrl` | `string \| null` | Absolute URL to source image. |
| `bannerUrl` | `string \| null` | Absolute URL to source image. |
| `screenshots` | `string[] \| null` | Absolute URLs, ordered. |
| `intro` | `string \| null` | Short marketing text. |
| `description` | `string \| null` | Long description. |
| `size` | `integer` | Nintendo-reported ROM size in bytes (0 if unknown). |
| `rank` | `integer \| null` | eShop popularity rank. |

### 2.4 `Nsp.dict()` object

Produced by `Fs/IndexedFile.py:248`. Returned for each file in `/api/files`.

| Field | Type | Description |
| --- | --- | --- |
| `titleId` | `TitleId \| null` | Parsed from filename or from the ticket. |
| `path` | `string` | Absolute filesystem path (server-side). |
| `version` | `integer \| string \| null` | Version parsed from filename or NCA metadata. |
| `fileSize` | `integer \| null` | Cached size in bytes. |
| `timestamp` | `number \| null` | Last-modified epoch seconds (cached). |
| `hasValidTicket` | `boolean \| null` | True for `.nsp`/`.nsz`/`.xci`/`.xcz`, false for `.nsx`. |
| `extractedNcaMeta` | `boolean` | Whether NCA metadata has been extracted. |
| `verified` | `boolean \| null` | Ticket/metadata verification flag. |
| `__<name>` | `any` | Any custom attributes set via `setValue`, emitted with a `__` prefix. |

### 2.5 `SearchEntry` object

Returned in the `/api/search` array (`Server/Controller/Api.py:95-128`).

| Field | Type | Description |
| --- | --- | --- |
| `id` | `TitleId \| null` | `nsp.titleId`. |
| `name` | `string` | `nsp.baseName()` — `os.path.basename(nsp.path)`. |
| `size` | `integer \| null` | Result of `nsp.getFileSize()` (lazy `os.path.getsize`). |
| `version` | `integer \| null` | `int(nsp.version)` or `null`. |

### 2.6 `UpdateInfo` object

Value of each entry in the `/api/titleUpdates` map (`Fs/Nsp.py:89`):

| Field | Type | Description |
| --- | --- | --- |
| `id` | `TitleId` | Title id being reported. |
| `baseId` | `TitleId` | Base id. |
| `currentVersion` | `string` | Version currently on disk. |
| `newVersion` | `string` | Latest known version per the title DB. |

### 2.7 `DirectoryEntry` objects

Returned by `/api/directoryList`:

```jsonc
{
  "dirs":  [ { "name": "<string>" } ],
  "files": [
    {
      "name":  "<string>",
      "size":  <integer|null>,
      "mtime": <number|null>   // epoch seconds
    }
  ]
}
```

### 2.8 `FileSizeResponse`

Returned by `/api/fileSize`:

```jsonc
{ "size": <integer>, "mtime": <number> }
// or on failure (HTTP 200):
{ "success": false, "message": "<string>" }
```

### 2.9 `InfoResponse`

Returned by `/api/info/<id>`. It is the full [`Title`](#23-title-object) object (every attribute via `__dict__`) plus:

| Field | Type | Description |
| --- | --- | --- |
| `size` | `integer` | `nsp.getFileSize()` of the on-disk file. |
| `mtime` | `number` | `nsp.getFileModified()` (epoch seconds). |

On failure the handler returns `200` with `{"success": false, "message": "<string>"}`.

### 2.10 `FilesResponse`

Returned by `/api/files`:

```jsonc
{
  "<baseId>": {
    "base":   [ <NspDict>, ... ],
    "update": [ <NspDict>, ... ],
    "dlc":    [ <NspDict>, ... ]
  },
  "...": { ... }
}
```

Where `<NspDict>` is [§2.4](#24-nspdict-object).

---

## 3. Static routes

| Method | Path | Notes |
| --- | --- | --- |
| `GET`, `HEAD` | `/` | Serves `public_html/index.html`. |
| `GET`, `HEAD` | `/images/<path>` | Files under `public_html/images/`. |
| `GET`, `HEAD` | `/translate.json` | Shared i18n catalogue. |
| `GET`, `HEAD` | `/<anything-else>` | Served from `public_html/` when present; `404` otherwise. |
| `OPTIONS` | `/<anything>` | CORS preflight — `204 No Content`. |

Path traversal above the repo root raises `IOError` and produces a `500`. Directory requests are rewritten to `<path>/index.html`.

---

## 4. JSON API

All endpoints are under `/api/`. All accept `GET` and `HEAD` unless noted. None accept a request body.

### 4.1 `GET /api/search`

Flat list of every tracked file.

- **Path parameters:** none.
- **Query parameters:** none.
- **Headers in:** none required.
- **Status:** `200 OK`.
- **Headers out:** `Content-Type: application/json`.
- **Body:** `Array<`[`SearchEntry`](#25-searchentry-object)`>`.

Ordering is deterministic: every `.nsz`, then `.nsp`, `.xcz`, `.xci`, `.nsx`. Files whose `fileName()` resolver returns `None` are omitted.

**Example response:**

```json
[
  { "id": "0100ABCDEF012000", "name": "Game [0100ABCDEF012000][v0].nsz", "size": 10737418240, "version": 0 },
  { "id": "0100ABCDEF012800", "name": "Game Update [0100ABCDEF012800][v65536].nsp", "size": 524288000, "version": 65536 }
]
```

### 4.2 `GET /api/titles`

Dump of the full title database.

- **Path parameters:** none.
- **Query parameters:** none.
- **Status:** `200 OK`.
- **Body:** `Array<`[`Title`](#23-title-object)`>`.

This payload can be tens of megabytes on a full title DB. Prefer `/api/search` or `/api/files` for UI flows.

### 4.3 `GET /api/titleImage/<titleId>/<width>`

Thumbnail icon for a title, resized server-side.

- **Path parameters:**
  - `titleId` — [`TitleId`](#21-titleid).
  - `width` — integer, `32 ≤ width ≤ 1024`.
- **Preconditions:** `Titles.contains(titleId)`. `Title.iconFile(width)` or, as a fallback, `Title.frontBoxArtFile(width)` must produce an existing file on disk (both are cached under `Config.paths.titleImages + id/`).
- **Status:**
  - `200 OK` on success.
  - `404` if `titleId` unknown, `width` out of range, or no image resolvable.
  - `500` if the resolved path does not exist on disk.
- **Headers out:** `Content-Type` per extension (`image/png` or `image/jpeg`), `Cache-Control: max-age=31536000`.
- **Body:** raw image bytes.

### 4.4 `GET /api/frontArtBoxImage/<titleId>/<width>`

Alias of [`titleImage`](#43-get-apititleimagetitleidwidth) — identical implementation (`Server/Controller/Api.py:196`).

### 4.5 `GET /api/bannerImage/<titleId>`

Banner image (no resize).

- **Path parameters:**
  - `titleId` — [`TitleId`](#21-titleid).
- **Status:** `200 OK`, `404` (title unknown or no banner), `500` (file missing on disk).
- **Headers out:** `Content-Type` per extension, `Cache-Control: max-age=31536000`.
- **Body:** raw image bytes.

### 4.6 `GET /api/screenshotImage/<titleId>/<index>`

Numbered screenshot.

- **Path parameters:**
  - `titleId` — [`TitleId`](#21-titleid).
  - `index` — integer (0-based) into `Title.screenshots`.
- **Status:** `200 OK`, `404` (title unknown, non-numeric index, screenshot missing), `500` (resolved file missing on disk).
- **Headers out:** `Content-Type` per extension, `Cache-Control: max-age=31536000`.
- **Body:** raw image bytes.

### 4.7 `GET /api/info/<titleId>`

Full metadata for a title including the on-disk stats of the primary NSP.

- **Path parameters:**
  - `titleId` — [`TitleId`](#21-titleid).
- **Status:** always `200 OK`. Errors are reported inside the body.
- **Headers out:** `Content-Type: application/json`.
- **Body:** [`InfoResponse`](#29-inforesponse), or `{"success": false, "message": "<string>"}` on internal error.

### 4.8 `GET /api/download/<titleId>[/<start>/<end>]`

Binary download of the tracked `.nsp` for `titleId`. This is the endpoint Tinfoil calls after selecting an entry from `/api/search`.

- **Path parameters:**
  - `titleId` — [`TitleId`](#21-titleid).
  - `start`, `end` *(optional, both required together)* — byte offsets. `end` is **exclusive**. If `start >= fileSize`, `start < 0`, or `end <= 0`, the handler returns `400 Invalid range request <start> - <end>`.
- **Query parameters (fallback only):** `start`, `end` integers. Present in the handler signature but **superseded** by any `Range` header and by path segments.
- **Headers in (optional):**
  - `Range: bytes=<start>-<end>` — standard HTTP range. Both bounds optional:
    - `bytes=0-` → `[0, size)`.
    - `bytes=-512` → last 512 bytes.
    - `bytes=500-1024` → `[500, 1025)` (the handler adds 1 to the inclusive end).
- **Status:**
  - `200 OK` when sending the whole file.
  - `206 Partial Content` whenever a `Range` header is present.
  - `400` on invalid range.
- **Headers out (always):**
  - `Content-Type` per extension.
  - `Content-Disposition: attachment; filename=<titleId>.nsp`.
  - `Accept-Ranges: bytes`.
  - `Content-Range: bytes <start>-<end-1>/<size>`.
  - `Content-Length` — number of bytes about to be sent (`end - start`).
- **Body:** raw file bytes, streamed in 4 MiB chunks (`chunkSize = 0x400000`, `Server/Controller/Api.py:355`).

`HEAD` returns headers only. If the handler encounters an exception mid-stream it logs via `Print.error` and simply closes the connection; the client observes a truncated download.

### 4.9 `GET /api/directoryList[/<drive>[/<segment>...]]`

Virtual directory listing — the file-browser mode Tinfoil uses for non-repo installs.

- **Path parameters:**
  - `drive` *(optional)* — a label from [`listDrives`](#virtual-drive-resolution). If omitted, the endpoint returns the list of drives.
  - `segment...` *(optional)* — path components joined with `Fs.driver.join`.
- **Virtual drive resolution** (`listDrives`, `Server/Controller/Api.py:430`):
  1. Every key of `Config.paths.mapping()` is always listed.
  2. If `Config.server.enableLocalDriveAccess` is truthy:
     - Windows: every letter reported by `GetLogicalDrives`.
     - POSIX: the literal label `"root"`.
- **Path sanitization (`isBlockedPath`, `Server/Controller/Api.py:464`):** when `enableLocalDriveAccess` is 0, the resolved path must start with one of the configured mappings and must not contain `..`. Violations raise `IOError('forbidden')` → `500`.
- **File filter (`isBlocked`, `Server/Controller/Api.py:474`):** only files with one of these extensions are listed: `.nro`, `.xci`, `.nsp`, `.nsx`, `.nsz`, `.xcz`, `.conf`, `.json`, `.db`, `.tfl`, `.jpg`, `.gif`, `.png`, `.bin`, `.enc`, `.ini`, `.ips`, `.txt`, `.pdf`, `.tik`, `.nca`, `.ncz`, `.cert`.
- **Status:** `200 OK` on success; `500` on error (including path traversal).
- **Headers out:** `Content-Type: application/json`.
- **Body:** [`DirectoryEntry`](#27-directoryentry-objects) object.

**Example — no `drive` given:**

```json
{ "dirs": [ { "name": "Local" }, { "name": "gdrive" } ], "files": [] }
```

**Example — browsing a folder:**

```json
{
  "dirs":  [ { "name": "Updates" } ],
  "files": [ { "name": "Game.nsp", "size": 10737418240, "mtime": 1700000000.0 } ]
}
```

### 4.10 `GET /api/file/<drive>/<segment>...`

Stream an arbitrary whitelisted file from a virtual drive.

- **Path parameters:**
  - `drive` — label from [`listDrives`](#virtual-drive-resolution).
  - `segment...` — joined with `Fs.driver.join`.
- **Query parameters:** `start`, `end` (optional, both integers). Same semantics as in `/api/download`; superseded by `Range`.
- **Headers in (optional):** `Range: bytes=<start>-<end>`.
- **Preconditions:** path must pass [`isBlocked`](#49-get-apidirectorylistdrivesegment) (both the whitelist and the drive-mapping check).
- **Status:**
  - `200 OK` (full file) / `206 Partial Content` (range).
  - `500` if the path is blocked or unreadable (`IOError('file read access denied')`).
- **Headers out:** `Content-Type` per extension, `Content-Length`, `Accept-Ranges: bytes` + `Content-Range` on partial.
- **Body:** raw file bytes (via `serveFile`, `Server/Controller/Api.py:319`).

### 4.11 `GET /api/fileSize/<drive>/<segment>...`

Size + mtime of a file addressable via the virtual drive system. No whitelist check — the caller is expected to have discovered the file via `directoryList` first.

- **Path parameters:** same as `/api/file`.
- **Query parameters:** none.
- **Status:** always `200 OK`.
- **Headers out:** `Content-Type: application/json`.
- **Body:** [`FileSizeResponse`](#28-filesizeresponse).

### 4.12 `GET /api/queue`

Stub that exists for the web UI. Always returns an empty array.

- **Status:** `200 OK`.
- **Headers out:** `Content-Type: application/json`.
- **Body:** `[]`.

### 4.13 `GET /api/titleUpdates`

Which titles in `Nsps.files` have a newer version known to the title DB.

- **Path parameters:** none.
- **Query parameters:** none.
- **Status:** `200 OK`.
- **Headers out:** `Content-Type: application/json`.
- **Body:** object keyed by `TitleId`, values are [`UpdateInfo`](#26-updateinfo-object).

**Example response:**

```json
{
  "0100ABCDEF012000": {
    "id": "0100ABCDEF012000",
    "baseId": "0100ABCDEF012000",
    "currentVersion": "0",
    "newVersion": "131072"
  }
}
```

### 4.14 `GET /api/files`

Library grouped by base title id and classified into base / update / dlc releases.

- **Path parameters:** none.
- **Query parameters:** none.
- **Status:** `200 OK`.
- **Headers out:** `Content-Type: application/json`.
- **Body:** [`FilesResponse`](#210-filesresponse).

Files whose titleId is not present in the title DB are skipped.

---

## 5. Tinfoil usage cheat sheet

A typical Tinfoil-to-NUT session over HTTP looks like:

1. **Discovery.** `GET /api/search` → the list of installable titles with sizes and versions.
2. **Metadata / artwork (optional).** `GET /api/titleImage/<id>/256`, `GET /api/bannerImage/<id>`, `GET /api/info/<id>`.
3. **Install.** `GET /api/download/<id>` with `Range: bytes=<start>-<end>` headers requested by the client as needed. `206 Partial Content` with `Content-Range` is produced for every ranged fetch. Tinfoil will perform many range requests, including overlapping ones, during a single install.
4. **File-browser mode.** When the user opens NUT as a "Network Location" in Tinfoil, the client uses `GET /api/directoryList[...]` for navigation and `GET /api/file/<drive>/<path>` for the actual install, both with `Range` for resumption.

Over USB the sequence is identical — Tinfoil writes the same URL strings inside command-`1` packets (see [§1.11](#111-usb-transport)).

---

## 6. Extending the API

- Define a new module-level function in `Server/Controller/Api.py` named `get<Thing>` or `post<Thing>` taking `(request, response, **kwargs)`. The router will pick it up by name — no registration is required.
- Read positional parameters from `request.bits[2:]` (`bits[0]` is always `api`, `bits[1]` is your method name).
- Read query parameters from the declared `**kwargs` in your signature — they arrive as strings. Because `Server.route` passes `**request.query` unconditionally, undeclared query args will raise `TypeError`; `route()` catches it silently and the client sees an empty response. Either accept `**kwargs` or document the exact supported query keys.
- For binary responses with optional range support use `serveFile(response, path, start=None, end=None)` — it computes `Content-Length`, `Content-Range`, sets `206` when appropriate, and streams with backpressure through the writer thread.
- After you add a handler that mirrors a state change, remember that `Watcher` may race you — consult `Nsps.load` and `Titles.save` directly rather than caching values inside the handler.
