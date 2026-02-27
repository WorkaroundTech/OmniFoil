# CyberFoil Compatibility

This document describes the CyberFoil-facing API supported by this server.

## Reference Source

The CyberFoil-compatible routes and payload schemas in this project were inferred using the AeroFoil project as the source of truth/reference implementation.

In practice, this means endpoint behavior and JSON field shapes were modeled to match AeroFoil's CyberFoil-facing API contract where applicable.

## Overview

`tinfoil-bolt` supports both legacy Tinfoil-style endpoints and CyberFoil-compatible endpoints.

- Legacy catalog: `GET /shop.json`, `GET /shop.tfl`
- Legacy file path downloads: `GET /files/*`
- CyberFoil sections: `GET /api/shop/sections`
- CyberFoil file downloads: `GET /api/get_game/:id`

## Client Detection at Root (`/`)

`GET /` behaves differently based on request headers:

- **Browser-like requests** (`Accept: text/html`) → HTML landing page
- **Tinfoil/CyberFoil-style requests** (headers below present) → direct shop JSON payload
- **Other requests** → JSON index payload

Tinfoil/CyberFoil-style header set:

- `Theme`
- `Uid`
- `Version`
- `Revision`
- `Language`
- `Hauth`
- `Uauth`

**Important:** When Tinfoil/CyberFoil headers are detected, the root endpoint returns:

```json
{
  "success": "Message of the day (or empty string)",
  "files": [
    { "url": "/api/get_game/1#file.nsp", "size": 123456 }
  ],
  "directories": [...]
}
```

**The `success` field must always be present** (even if empty string) for CyberFoil compatibility. CyberFoil may freeze/timeout if this field is missing.

## Endpoints

## `GET /api/shop/sections`

Returns a CyberFoil-compatible sections payload.

Query params:

- `limit` (optional, default `50`, minimum `1`): limits `all` section items.

Response shape:

```json
{
  "sections": [
    { "id": "new", "title": "New", "items": [] },
    { "id": "recommended", "title": "Recommended", "items": [] },
    { "id": "updates", "title": "Updates", "items": [] },
    { "id": "dlc", "title": "DLC", "items": [] },
    { "id": "all", "title": "All", "items": [], "total": 0, "truncated": false }
  ]
}
```

Section item shape:

```json
{
  "name": "Game Name",
  "title_name": "Game Name",
  "title_id": null,
  "app_id": "0000000000000001",
  "app_version": "0",
  "app_type": "BASE",
  "category": "",
  "icon_url": "",
  "url": "/api/get_game/1#Game Name.nsp",
  "size": 123456789,
  "file_id": 1,
  "filename": "Game Name.nsp",
  "download_count": 0
}
```

Notes:

- `updates` and `dlc` sections are currently empty placeholders.
- `icon_url` is currently empty.

## `GET /api/get_game/:id`

Serves a game file by catalog ID.

- Supports full downloads (`200 OK`)
- Supports single-range partial downloads (`206 Partial Content`)
- Returns `416 Range Not Satisfiable` for invalid/unsupported ranges

Range headers:

- `Accept-Ranges: bytes`
- `Content-Range` (for `206` and `416` responses)

## Shop Payload Endpoints

## `GET /shop.json` and `GET /shop.tfl`

Both return the same JSON body with different content types:

- `/shop.json` → `application/json`
- `/shop.tfl` → `application/octet-stream`

Current file URL format in payload:

- `"url": "/api/get_game/:id#filename"`

This aligns legacy payloads with CyberFoil download style.

## Authentication

If authentication is configured (`AUTH_USER`/`AUTH_PASS` or `AUTH_CREDENTIALS`), all endpoints require HTTP Basic Auth.

- Unauthorized response: `401`

## Caching

Catalog and section payloads are cached in-memory based on `CACHE_TTL`.

- `CACHE_TTL=0` disables cache reuse.
- Catalog refresh also refreshes ID mapping.

## Compatibility Notes

Implemented:

- Root response behavior for Tinfoil/CyberFoil-style requests
- CyberFoil sections endpoint
- CyberFoil ID-based game downloads
- HTTP Range support on ID-based downloads

Not currently implemented:

- Media endpoints such as `/api/shop/icon/:title_id` and `/api/shop/banner/:title_id`
- Rich metadata (TitleDB categories/descriptions/artwork)
