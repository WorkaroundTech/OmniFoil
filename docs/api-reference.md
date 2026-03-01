# API Reference

This document provides a complete reference for all HTTP endpoints exposed by tinfoil-bolt.

## Table of Contents

- [Authentication](#authentication)
- [Response Headers](#response-headers)
- [Endpoints](#endpoints)
  - [GET /](#get-)
  - [GET /tinfoil](#get-tinfoil)
  - [GET /shop.json](#get-shopjson)
  - [GET /shop.tfl](#get-shoptfl)
  - [GET /files/:path](#get-filespath)
  - [CyberFoil Endpoints](#cyberfoil-endpoints)
    - [GET /api/shop/sections](#get-apishopsections)
    - [GET /api/get_game/:id](#get-apiget_gameid)
    - [GET /api/shop/icon/:title_id](#get-apishopicontitle_id)
    - [GET /api/shop/banner/:title_id](#get-apishopbannertitle_id)
    - [GET /api/saves/list](#get-apisaveslist)
  - [Default Endpoint](#default-endpoint)
- [HTTP Status Codes](#http-status-codes)
- [Error Responses](#error-responses)

---

## Authentication

When `AUTH_USER` and `AUTH_PASS` (or `AUTH_CREDENTIALS`) are configured, all endpoints require HTTP Basic Authentication.

**Request Header:**
```
Authorization: Basic <base64(username:password)>
```

**Response on Missing/Invalid Credentials:**
- Status: `401 Unauthorized`
- Header: `WWW-Authenticate: Basic realm="tinfoil-bolt"`
- Body: `{"error": "Unauthorized"}`

---

## Response Headers

### Common Headers

All responses include standard headers:

```
Content-Type: application/json | text/html | application/octet-stream
Content-Length: <bytes>
Cache-Control: public, max-age=31536000, immutable  (for static files)
```

### Range Request Headers

When serving files that support byte ranges:

```
Accept-Ranges: bytes
Content-Range: bytes <start>-<end>/<total>  (only for 206 responses)
```

---

## Endpoints

### GET /

**Description:** Index endpoint that serves different content based on the client's `Accept` header.

#### Browser Request (text/html)

Returns an HTML page with links to shop endpoints.

**Request:**
```bash
curl -H "Accept: text/html" http://localhost:3000/
```

**Response:**
- Status: `200 OK`
- Content-Type: `text/html`
- Body: HTML page with navigation links

**HTML Structure:**
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>tinfoil-bolt</title>
  </head>
  <body>
    <h1>tinfoil-bolt</h1>
    <ul>
      <li><a href="/shop.json">shop.json</a></li>
      <li><a href="/shop.tfl">shop.tfl</a></li>
    </ul>
  </body>
</html>
```

#### API Request (application/json)

Returns shop data in JSON format.

**Request:**
```bash
curl -H "Accept: application/json" http://localhost:3000/
```

**Response:**
- Status: `200 OK`
- Content-Type: `application/json`
- Body: Shop data (see [Shop JSON Format](#shop-json-format))

#### Tinfoil/CyberFoil Request

When all required Tinfoil/CyberFoil headers are present, returns CyberFoil-compatible shop payload:

**Request Headers:**
```
Theme: Dark
Uid: <device-id>
Version: 1.4
Revision: 1
Language: en
Hauth: <hardware-auth-token>
Uauth: <user-auth-token>
```

**Response:**
- Status: `200 OK`
- Content-Type: `application/json`
- Body: CyberFoil shop payload

**CyberFoil Shop Format:**
```json
{
  "success": "Welcome to tinfoil-bolt!",
  "referrer": "https://shop.example.com",
  "files": [
    {
      "url": "/api/get_game/1#game.nsp",
      "size": 1234567890
    },
    {
      "url": "/api/get_game/2#update.nsp",
      "size": 987654321
    }
  ]
}
```

**Fields:**
- `success` (string): MOTD message from `SUCCESS_MESSAGE` env variable (always present, may be empty)
- `referrer` (string, optional): Host verification URL from `REFERRER` env variable (only if configured)
- `files` (array): List of available game files with CyberFoil-compatible download URLs
  - `url` (string): Download URL using `/api/get_game/:id` format
  - `size` (number): File size in bytes

**Notes:**
- This is the format expected by CyberFoil clients running on Nintendo Switch
- For CyberFoil CLI tools, see [CYBERFOIL.md](../CYBERFOIL.md) for detailed endpoint documentation

---

### GET /tinfoil

**Description:** Alternate index endpoint, functionally identical to `GET /`.

**Request:**
```bash
curl http://localhost:3000/tinfoil
```

**Response:** Same behavior as `GET /` (content negotiation based on `Accept` header).

---

### GET /shop.json

**Description:** Returns shop data in JSON format (legacy Tinfoil format). **Note:** CyberFoil clients should use `GET /` with Tinfoil headers instead for faster, more efficient CyberFoil-specific responses.

**Request:**
```bash
curl http://localhost:3000/shop.json
```

**Response:**
- Status: `200 OK`
- Content-Type: `application/json`
- Cache-Control: `public, max-age=31536000, immutable`

#### Shop JSON Format

```json
{
  "files": [
    {
      "url": "http://localhost:3000/files/games/Super%20Mario%20Odyssey.nsp",
      "size": 5678901234
    },
    {
      "url": "http://localhost:3000/files/games/The%20Legend%20of%20Zelda.nsz",
      "size": 8901234567
    }
  ],
  "directories": [
    "games",
    "dlc",
    "updates"
  ],
  "success": "Welcome to tinfoil-bolt!"
}
```

**Fields:**
- `files` (array): List of available game files
  - `url` (string): Full URL to download the file (URL-encoded path)
  - `size` (number): File size in bytes
- `directories` (array): List of base directory aliases
- `success` (string): Optional message from `SUCCESS_MESSAGE` env variable

**Notes:**
- Files are scanned from all configured `GAMES_DIRECTORY` paths
- Duplicate directory names are aliased (e.g., `games`, `games-2`, `games-3`)
- File paths are URL-encoded to handle special characters
- Response is cached based on `CACHE_TTL` setting

---

### GET /shop.tfl

**Description:** Returns shop data as octet-stream (alternate format for Tinfoil).

**Request:**
```bash
curl http://localhost:3000/shop.tfl
```

**Response:**
- Status: `200 OK`
- Content-Type: `application/octet-stream`
- Body: Identical JSON structure to `/shop.json`

**Use Case:** Some Tinfoil configurations prefer this content-type.

---

### GET /files/:path

**Description:** Downloads a game file from the configured directories. Supports HTTP Range requests for resumable downloads.

#### Full File Download

**Request:**
```bash
curl http://localhost:3000/files/games/Super%20Mario%20Odyssey.nsp
```

**Response:**
- Status: `200 OK`
- Content-Type: `application/octet-stream`
- Accept-Ranges: `bytes`
- Content-Length: `<file-size>`
- Cache-Control: `public, max-age=31536000, immutable`
- Body: Complete file content

#### Partial Content (Range Request)

**Request:**
```bash
curl -H "Range: bytes=0-1023" http://localhost:3000/files/games/Mario.nsp
```

**Response:**
- Status: `206 Partial Content`
- Content-Type: `application/octet-stream`
- Accept-Ranges: `bytes`
- Content-Range: `bytes 0-1023/5678901234`
- Content-Length: `1024`
- Body: Requested byte range

#### Range Request Formats

Three supported formats:

1. **Start and End:** `Range: bytes=0-1023`
   - Returns bytes 0 through 1023 (inclusive)

2. **Start Only:** `Range: bytes=1024-`
   - Returns bytes from 1024 to end of file

3. **Suffix:** `Range: bytes=-1024`
   - Returns last 1024 bytes of file

**Multi-Range Requests:** Not supported. Only single-range requests are processed.

#### Range Error Responses

**Invalid Range (416 Range Not Satisfiable):**

```bash
curl -H "Range: bytes=9999999999-" http://localhost:3000/files/games/small.nsp
```

Response:
- Status: `416 Range Not Satisfiable`
- Content-Range: `bytes */<file-size>`
- Body: `{"error": "Range not satisfiable"}`

**Path Security:**

The server validates that requested paths:
- Map to files within configured `GAMES_DIRECTORY` paths
- Don't contain path traversal attempts (`..`)
- Exist and are readable

---

## CyberFoil Endpoints

The following endpoints provide CyberFoil-compatible API for Nintendo Switch homebrew clients. These endpoints support enhanced game metadata via TitleDB integration.

### GET /api/shop/sections

**Description:** Returns a CyberFoil-compatible sections payload with game metadata organized into sections: new, recommended, updates, DLC, and all games.

**Query Parameters:**
- `limit` (optional, number, default: `50`, minimum: `1`) - Maximum items per section for "new" and "recommended" sections

**Request:**
```bash
curl http://localhost:3000/api/shop/sections

# With custom limit
curl http://localhost:3000/api/shop/sections?limit=100
```

**Response:**
- Status: `200 OK`
- Content-Type: `application/json`

**Response Format:**
```json
{
  "sections": [
    {
      "id": "new",
      "title": "New",
      "items": [...]
    },
    {
      "id": "recommended",
      "title": "Recommended",
      "items": [...]
    },
    {
      "id": "updates",
      "title": "Updates",
      "items": [...]
    },
    {
      "id": "dlc",
      "title": "DLC",
      "items": [...]
    },
    {
      "id": "all",
      "title": "All",
      "items": [...],
      "total": 150,
      "truncated": false
    }
  ]
}
```

**Section Item Format:**
```json
{
  "name": "Super Mario Odyssey",
  "title_name": "Super Mario Odyssey",
  "title_id": "0100000000010000",
  "app_id": "0100000000010000",
  "app_version": 0,
  "app_type": 0,
  "category": "Adventure, Platformer",
  "icon_url": "/api/shop/icon/0100000000010000",
  "url": "/api/get_game/1#Super Mario Odyssey.nsp",
  "size": 5678901234,
  "file_id": 1,
  "filename": "Super Mario Odyssey.nsp",
  "download_count": 0
}
```

**Field Descriptions:**
- `name` (string) - Game title from TitleDB or filename
- `title_name` (string) - Same as name
- `title_id` (string|null) - Base game's title ID (for grouping updates/DLC)
- `app_id` (string) - File's own title ID
- `app_version` (number) - Version number (0 for base, parsed from filename markers like `[v1]`)
- `app_type` (number) - File type: `0`=BASE, `1`=DLC, `2`=UPDATE
- `category` (string) - Comma-separated categories from TitleDB
- `icon_url` (string) - Path to game icon
- `url` (string) - Download URL in format `/api/get_game/:id#filename`
- `size` (number) - File size in bytes
- `file_id` (number) - Unique file identifier
- `filename` (string) - Original filename
- `download_count` (number) - Always 0 (tracking not implemented)

**Section Behavior:**
- **new**: Most recently added files (limited by `limit` param)
- **recommended**: Same as new (limited by `limit` param)
- **updates**: Only UPDATE files (app_type=2), grouped by base title
- **dlc**: Only DLC files (app_type=1), grouped by base title
- **all**: All files without limit

**Caching:** Response is cached based on `CACHE_TTL` configuration.

---

### GET /api/get_game/:id

**Description:** Downloads a game file by its catalog ID. Supports full downloads and single-range partial downloads.

**Path Parameters:**
- `id` (number, required) - File ID from catalog

**Request:**
```bash
# Full download
curl http://localhost:3000/api/get_game/1 -o game.nsp

# Range request (partial download)
curl -H "Range: bytes=0-1048575" http://localhost:3000/api/get_game/1
```

**Response (Full Download):**
- Status: `200 OK`
- Content-Type: `application/octet-stream`
- Accept-Ranges: `bytes`
- Content-Disposition: `attachment; filename="Game Name.nsp"`
- Body: Complete file content

**Response (Range Request):**
- Status: `206 Partial Content`
- Content-Type: `application/octet-stream`
- Accept-Ranges: `bytes`
- Content-Range: `bytes 0-1048575/5678901234`
- Content-Disposition: `attachment; filename="Game Name.nsp"`
- Body: Requested byte range

**Range Request Support:**
Same as [GET /files/:path](#get-filespath) - supports single-range requests only.

**Error Responses:**
- `404 Not Found` - File ID not found
- `416 Range Not Satisfiable` - Invalid range requested

**Notes:**
- File IDs are assigned sequentially based on catalog order
- IDs may change when files are added/removed (cache invalidation)
- Fragment identifier (`#filename`) in URL is ignored by server but used by clients

---

### GET /api/shop/icon/:title_id

**Description:** Serves game icon image for a Nintendo Switch title, proxied from TitleDB or cached locally.

**Path Parameters:**
- `title_id` (string, required) - 16-character hexadecimal title ID (e.g., `0100000000010000`)

**Request:**
```bash
curl http://localhost:3000/api/shop/icon/0100000000010000
```

**Response (Image Found):**
- Status: `200 OK`
- Content-Type: `image/jpeg` or `image/png`
- Cache-Control: `public, max-age=604800, immutable`
- Access-Control-Allow-Origin: `*`
- Body: Icon image (typically 300x300 pixels)

**Response (No Icon Available):**
- Status: `200 OK`
- Content-Type: `image/svg+xml`
- Cache-Control: `public, max-age=3600`
- Body: Placeholder SVG with "No Icon" text

**Caching:**
- Downloaded icons are cached locally based on `MEDIA_CACHE_TTL` (default 7 days)
- Cache directory: `MEDIA_CACHE_DIR` (default `./data/media`)
- Subsequent requests are served from cache

**Notes:**
- Returns placeholder instead of 404 for better client compatibility
- Requires TitleDB integration (`TITLEDB_ENABLED=true`)
- Icon URLs are fetched from TitleDB metadata

---

### GET /api/shop/banner/:title_id

**Description:** Serves game banner image for a Nintendo Switch title, proxied from TitleDB or cached locally.

**Path Parameters:**
- `title_id` (string, required) - 16-character hexadecimal title ID

**Request:**
```bash
curl http://localhost:3000/api/shop/banner/0100000000010000
```

**Response (Image Found):**
- Status: `200 OK`
- Content-Type: `image/jpeg` or `image/png`
- Cache-Control: `public, max-age=604800, immutable`
- Access-Control-Allow-Origin: `*`
- Body: Banner image (typically 640x360 pixels)

**Response (No Banner Available):**
- Status: `200 OK`
- Content-Type: `image/svg+xml`
- Cache-Control: `public, max-age=3600`
- Body: Placeholder SVG with "No Banner" text

**Caching:** Same as icon endpoint

**Notes:** Same as icon endpoint

---

### GET /api/saves/list

**Description:** Returns a list of available save data versions for backup management. Currently returns empty list as save management is not yet implemented.

**Request:**
```bash
curl http://localhost:3000/api/saves/list
```

**Response:**
- Status: `200 OK`
- Content-Type: `application/json`

**Response Format (Current - Empty):**
```json
{
  "saves": []
}
```

**Response Format (When Implemented):**
```json
{
  "saves": [
    {
      "title_id": "0x0100000000000000",
      "name": "Game Title",
      "save_id": "v1_001",
      "note": "First Save",
      "created_at": "2026-03-01T10:30:00Z",
      "created_ts": 1766397000,
      "download_url": "https://example.com/saves/save1.bin",
      "size": 52428800
    }
  ]
}
```

**Field Descriptions:**
- `title_id` (string, required) - Nintendo title ID (hex or decimal)
- `name` (string, optional) - Game title name
- `save_id` (string, optional) - Unique identifier for this save version
- `note` (string, optional) - Human-readable description
- `created_at` (string, optional) - ISO 8601 timestamp
- `created_ts` (number, optional) - Unix timestamp (seconds)
- `download_url` (string, optional) - Download URL for this save
- `size` (number, optional) - File size in bytes

**Notes:**
- This endpoint is part of CyberFoil save synchronization feature
- Save upload, download, and delete operations are not yet implemented
- Future implementation will support save backup and restore

---

### Default Endpoint

**Description:** Any undefined route returns a simple status message.

**Request:**
```bash
curl http://localhost:3000/any/undefined/path
```

**Response:**
- Status: `200 OK`
- Content-Type: `application/json`
- Body: `{"status": "tinfoil-bolt is running"}`

**Note:** This serves as a basic health check endpoint.

---

## HTTP Status Codes

| Code | Description | When It Occurs |
|------|-------------|----------------|
| `200 OK` | Success | Valid request, file found, or health check |
| `206 Partial Content` | Range success | Valid range request processed |
| `401 Unauthorized` | Auth required | Missing or invalid authentication credentials |
| `404 Not Found` | File not found | Requested file doesn't exist in configured directories |
| `405 Method Not Allowed` | Invalid method | Non-GET/HEAD method used on protected endpoints |
| `416 Range Not Satisfiable` | Invalid range | Range request exceeds file size or is malformed |
| `500 Internal Server Error` | Server error | Unexpected error during request processing |

---

## Error Responses

All errors return JSON with an `error` field:

```json
{
  "error": "Error message description"
}
```

### Error Examples

#### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```
**Headers:** `WWW-Authenticate: Basic realm="tinfoil-bolt"`

#### 404 Not Found
```json
{
  "error": "File not found"
}
```

#### 405 Method Not Allowed
```json
{
  "error": "Method POST not allowed"
}
```
**Headers:** `Allow: GET, HEAD, OPTIONS`

#### 416 Range Not Satisfiable
```json
{
  "error": "Range not satisfiable"
}
```
**Headers:** `Content-Range: bytes */<file-size>`

#### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

---

## Usage Examples

### Basic Usage (No Auth)

```bash
# Get shop data
curl http://localhost:3000/shop.json

# Download a file
curl -o game.nsp http://localhost:3000/files/games/game.nsp

# Resume a download (get bytes 1000000 onwards)
curl -H "Range: bytes=1000000-" http://localhost:3000/files/games/game.nsp
```

### With Authentication

```bash
# Set credentials
export AUTH="user:password"

# Get shop data
curl -u "$AUTH" http://localhost:3000/shop.json

# Download file
curl -u "$AUTH" -o game.nsp http://localhost:3000/files/games/game.nsp
```

### Advanced Range Requests

```bash
# Get first 1MB
curl -H "Range: bytes=0-1048575" http://localhost:3000/files/games/game.nsp

# Get last 1KB
curl -H "Range: bytes=-1024" http://localhost:3000/files/games/game.nsp

# Resume from byte 500000000
curl -H "Range: bytes=500000000-" -o game.nsp.part http://localhost:3000/files/games/game.nsp
```

### Health Check

```bash
# Simple health check
curl http://localhost:3000/health

# Response: {"status":"tinfoil-bolt is running"}
```

---

## Notes

- All file URLs in shop responses use the server's host and port automatically
- File paths are URL-encoded to handle spaces and special characters
- The server uses Bun's native file serving with `sendfile` syscall for optimal performance
- Range requests are compliant with RFC 7233
- Cache headers maximize browser/proxy caching for immutable game files
- OPTIONS requests return 200 with appropriate CORS headers
