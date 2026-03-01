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
- Save synchronization: `GET /api/saves/list` (OPTIONAL)

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
  "referrer": "https://verified-host.com",
  "files": [
    { "url": "/api/get_game/1#file.nsp", "size": 123456 }
  ]
}
```

**The `success` field must always be present** (even if empty string) for CyberFoil compatibility. CyberFoil may freeze/timeout if this field is missing. The `referrer` field is optional and only included when `REFERRER` environment variable is configured for host verification.

## Endpoints

## `GET /api/shop/sections`

Returns a CyberFoil-compatible sections payload.

Query params:

- `limit` (optional, default `50`, minimum `1`): limits items in "new" and "recommended" sections per AeroFoil spec.

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
  "app_version": 0,
  "app_type": 0,
  "category": "",
  "icon_url": "/api/shop/icon/0100ABCD01234000",
  "url": "/api/get_game/1#Game Name.nsp",
  "size": 123456789,
  "file_id": 1,
  "filename": "Game Name.nsp",
  "download_count": 0
}
```

Field notes:

- `app_version`: Number (0 for base version, parsed from filename `[vN]` marker)
- `app_type`: Numeric value (0=BASE, 1=DLC, 2=UPDATE) per CyberFoil API spec
- `title_id`: Base game's title ID (for grouping updates/DLC with their base game)
- `app_id`: The file's own title ID
- `icon_url`: Points to base game's icon (populated when TitleDB data available)
- `category`: Comma-separated categories from TitleDB
- `updates` and `dlc` sections are populated from library scans
- `download_count`: Always 0 (tracking not yet implemented)

## `GET /api/get_game/:id`

Serves a game file by catalog ID.

- Supports full downloads (`200 OK`)
- Supports single-range partial downloads (`206 Partial Content`)
- Returns `416 Range Not Satisfiable` for invalid/unsupported ranges
- Includes `Content-Disposition: attachment; filename="..."` header

Range headers:

- `Accept-Ranges: bytes`
- `Content-Range` (for `206` and `416` responses)

## Media Endpoints

### `GET /api/shop/icon/:title_id`

Returns icon image for a Nintendo Switch title.

- Path parameter: `title_id` (16 hex characters)
- Returns cached image from TitleDB icon URL
- Falls back to placeholder SVG if not found
- Cache-Control: `public, max-age=604800, immutable`

### `GET /api/shop/banner/:title_id`

Returns banner image for a Nintendo Switch title.

- Path parameter: `title_id` (16 hex characters)  
- Returns cached image from TitleDB banner URL
- Falls back to placeholder SVG if not found
- Cache-Control: `public, max-age=604800, immutable`

Placeholder SVGs are returned instead of 404 errors for better client compatibility.

## Save Synchronization Endpoints

### `GET /api/saves/list`

Returns a list of available save data versions for backup management.

Response format (empty):

```json
{
  "saves": []
}
```

When save data is available, the response includes metadata for each save:

```json
{
  "saves": [
    {
      "title_id": "0x0100000000000000",
      "name": "Game Title",
      "save_id": "v1_001",
      "note": "First Save",
      "created_at": "2025-12-15T10:30:00Z",
      "created_ts": 1766397000,
      "download_url": "https://example.com/saves/save1.bin",
      "size": 52428800
    }
  ]
}
```

Field specifications:
- `title_id` (MUST): Nintendo title ID (hex string or decimal)
- `name` (OPTIONAL): Game title name
- `save_id` (OPTIONAL): Unique identifier for this save version
- `note` (OPTIONAL): Human-readable description
- `created_at` (OPTIONAL): ISO 8601 timestamp
- `created_ts` (OPTIONAL): Unix timestamp (seconds)
- `download_url` (OPTIONAL): Download URL for this save
- `size` (OPTIONAL): File size in bytes

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

### Implemented

- Root response behavior for Tinfoil/CyberFoil-style requests
- CyberFoil sections endpoint with proper limit handling
- CyberFoil ID-based game downloads with Content-Disposition header
- HTTP Range support on ID-based downloads
- Media endpoints (`/api/shop/icon/:title_id`, `/api/shop/banner/:title_id`)
- TitleDB integration for metadata (names, categories, artwork)
- Placeholder SVG images for missing media
- Updates and DLC section population
- Base/Update/DLC file type detection and grouping
- `app_type` as numeric values (0=BASE, 1=DLC, 2=UPDATE) per spec
- Save synchronization inventory endpoint (`/api/saves/list`)

### Not Implemented

- Shop payload encryption (TINFOIL format with AES + RSA)
- Download counter tracking (always returns 0)
- Frozen account endpoint (`/api/frozen/notice`)
- Media size variants (`?size=web` query parameter)
- TitleDB version-based `app_version` values (currently uses filename `[vN]` markers)
- Save upload, download, and delete operations (`/api/saves/upload`, `/api/saves/download`, `/api/saves/delete`)
