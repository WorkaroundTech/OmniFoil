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
