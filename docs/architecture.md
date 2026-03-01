# Architecture

This document explains the internal architecture of tinfoil-bolt, including the middleware composition system, request lifecycle, error handling patterns, and key components.

## Table of Contents

- [System Overview](#system-overview)
- [Request Lifecycle](#request-lifecycle)
- [Middleware Composition](#middleware-composition)
- [Error Handling](#error-handling)
- [Path Resolution](#path-resolution)
- [Type System](#type-system)
- [Component Organization](#component-organization)

---

## System Overview

tinfoil-bolt is built as a composable HTTP server using a middleware chain pattern. The architecture is designed for:

- **Simplicity:** Zero external dependencies (uses only Bun runtime)
- **Performance:** Native file serving with sendfile syscall
- **Security:** Read-only file access, path traversal protection
- **Statelessness:** No persistent state beyond in-memory cache
- **Composability:** Middleware can be added/removed independently

### Key Principles

1. **Middleware-first design:** All request processing flows through a middleware chain
2. **Fail-fast validation:** Invalid requests are rejected early
3. **Single responsibility:** Each component has one clear purpose
4. **Type safety:** Comprehensive TypeScript types throughout

---

## Request Lifecycle

Every HTTP request flows through the following stages:

```
Incoming Request
     ↓
[1] Authorization Middleware (if auth configured)
     ↓
[2] Timing Middleware (start timer)
     ↓
[3] Logging Middleware (capture request details)
     ↓
[4] Router (dispatch to handler)
     ↓
[5] Method Validator (enforce allowed HTTP methods)
     ↓
[6] Handler (generate response)
     ↓
[7] Logging Middleware (log response with timing)
     ↓
[8] Error Handler (catch any errors)
     ↓
Response to Client
```

### Stage Details

#### 1. Authorization Middleware

**Location:** [src/middleware/authorize.ts](../src/middleware/authorize.ts)

**Purpose:** Validates HTTP Basic Authentication credentials

**Behavior:**
- Checks if `AUTH_USER` and `AUTH_PASS` are configured
- If not configured, passes through to next middleware
- If configured, parses `Authorization` header
- Compares credentials against configured values
- Throws `ServiceError(401)` on mismatch or missing header

**Context:** No modifications to `RequestContext`

#### 2. Timing Middleware

**Location:** [src/middleware/timing.ts](../src/middleware/timing.ts)

**Purpose:** Measures request processing duration

**Behavior:**
- Records `startTime` using `performance.now()`
- Stores in `context.timing.start`
- After response, calculates `duration` for logging

**Context Modifications:**
```typescript
context.timing = {
  start: performance.now()
}
```

#### 3. Logging Middleware

**Location:** [src/middleware/logging.ts](../src/middleware/logging.ts)

**Purpose:** Logs HTTP requests and responses

**Behavior:**
- Extracts request details (method, path, IP, user-agent)
- Passes request to next middleware
- After response, logs with selected format (Morgan-style)
- Includes timing information from timing middleware

**Context Modifications:**
```typescript
context.remoteAddress = getRemoteAddress(req)
context.userAgent = req.headers.get('user-agent') || '-'
```

**Remote Address Detection:**
- Checks `x-forwarded-for` header first (proxy support)
- Falls back to socket remote address
- Returns IP address string

#### 4. Router

**Location:** [src/routes/index.ts](../src/routes/index.ts)

**Purpose:** Dispatches requests to appropriate handlers based on URL pattern

**Route Mapping:**
```typescript
{
  '/': handlers.index,                    // Index/shop data
  '/tinfoil': handlers.index,             // Alternate index
  '/shop.json': handlers.shopJson,        // Shop JSON format
  '/shop.tfl': handlers.shopTfl,          // Shop TFL format
  '/files/:path': handlers.files,         // File downloads (legacy)
  '/api/shop/sections': handlers.sections,     // CyberFoil sections
  '/api/get_game/:id': handlers.getGame,       // CyberFoil downloads
  '/api/shop/icon/:title_id': handlers.getIcon,    // Icon media
  '/api/shop/banner/:title_id': handlers.getBanner, // Banner media
  '/api/saves/list': handlers.savesList,       // Save sync (stub)
  'default': handlers.default             // Health check
}
```

**Pattern Matching:**
- Exact matches for static routes
- Wildcard matching for `/files/*`
- Default handler for unmatched routes

#### 5. Method Validator

**Location:** [src/middleware/method-validator.ts](../src/middleware/method-validator.ts)

**Purpose:** Enforces allowed HTTP methods per endpoint

**Implementation:** Higher-order function that wraps handlers

```typescript
export const methodValidator = (
  handler: Handler,
  allowedMethods: string[] = ['GET', 'HEAD']
): Handler => {
  return async (req: Request, context: RequestContext) => {
    const method = req.method

    // Always allow OPTIONS for CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: { Allow: allowedMethods.join(', ') }
      })
    }

    // Check if method is allowed
    if (!allowedMethods.includes(method)) {
      throw new ServiceError(
        405,
        `Method ${method} not allowed`,
        { Allow: allowedMethods.join(', ') }
      )
    }

    // Method is allowed, call original handler
    return handler(req, context)
  }
}
```

**Allowed Methods by Endpoint:**
- `/`, `/tinfoil`, `/shop.json`, `/shop.tfl`, `/files/*`: `GET`, `HEAD`
- All endpoints support `OPTIONS` (CORS preflight)

#### 6. Handler

**Location:** [src/routes/handlers/*.ts](../src/routes/handlers/)

**Purpose:** Generates response for specific endpoint

**Handler Signature:**
```typescript
type Handler = (req: Request, context: RequestContext) => Promise<Response>
```

**Handler Responsibilities:**
- Parse request parameters
- Validate input
- Call services for business logic
- Generate HTTP response
- Throw `ServiceError` for error conditions

**Example: File Handler**
```typescript
export const files: Handler = async (req, context) => {
  const url = new URL(req.url)
  const virtualPath = url.pathname.replace('/files/', '')
  
  // Resolve virtual path to physical file
  const filePath = await resolveFilePath(virtualPath)
  
  if (!filePath) {
    throw new ServiceError(404, 'File not found')
  }
  
  // Handle range requests
  const range = req.headers.get('range')
  if (range) {
    return handleRangeRequest(filePath, range)
  }
  
  // Serve full file
  return new Response(Bun.file(filePath), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  })
}
```

#### 7. Response Logging

After handler completes, logging middleware logs the response:
- Status code
- Content-Length
- Response time (ms)
- All logged using configured format

#### 8. Error Handler

**Location:** [src/middleware/error-handler.ts](../src/middleware/error-handler.ts)

**Purpose:** Catches all errors and converts to JSON responses

**Behavior:**
- Wraps entire middleware chain in try-catch
- Catches `ServiceError` instances (known errors)
- Catches unexpected errors (500 responses)
- Logs all errors with stack traces
- Returns standardized JSON error response

---

## Middleware Composition

### Compose Function

**Location:** [src/middleware/compose.ts](../src/middleware/compose.ts)

**Purpose:** Chains multiple middleware functions into a single handler

**Implementation:**
```typescript
export const compose = (...middleware: Middleware[]): Handler => {
  return (req: Request, context: RequestContext) => {
    let index = 0

    const dispatch = async (): Promise<Response> => {
      if (index >= middleware.length) {
        throw new Error('No response generated')
      }

      const fn = middleware[index++]
      return fn(req, context, dispatch)
    }

    return dispatch()
  }
}
```

**Key Concepts:**
- Each middleware can call `next()` to proceed to the next middleware
- Middleware can modify `context` before calling `next()`
- Middleware can intercept response after `next()` returns
- Execution flows down, then back up (onion model)

### Middleware Order

Order matters! Current composition:

```typescript
const app = compose(
  errorHandler,      // Outer: catch all errors
  authorize,         // Early: fail fast on auth
  timing,            // Before: start timer
  logging,           // Before & after: log request/response
  router             // Inner: dispatch to handlers
)
```

**Why This Order:**
1. Error handler outermost to catch everything
2. Auth check early to avoid unnecessary processing
3. Timing before business logic
4. Logging wraps everything except error handler
5. Router innermost to dispatch actual work

---

## Error Handling

### ServiceError Pattern

**Location:** [src/middleware/error-handler.ts](../src/middleware/error-handler.ts)

**Purpose:** Structured error type with HTTP status and custom headers

**Definition:**
```typescript
export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
    public headers: Record<string, string> = {}
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}
```

**Usage in Handlers:**
```typescript
// 404 error
throw new ServiceError(404, 'File not found')

// 401 with WWW-Authenticate header
throw new ServiceError(401, 'Unauthorized', {
  'WWW-Authenticate': 'Basic realm="tinfoil-bolt"'
})

// 416 with Content-Range header
throw new ServiceError(416, 'Range not satisfiable', {
  'Content-Range': `bytes */${fileSize}`
})

// 405 with Allow header
throw new ServiceError(405, `Method ${method} not allowed`, {
  'Allow': 'GET, HEAD, OPTIONS'
})
```

**Error Handler Response:**
```typescript
export const errorHandler: Middleware = async (req, context, next) => {
  try {
    return await next()
  } catch (error) {
    if (error instanceof ServiceError) {
      // Known error with status code
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: error.status,
          headers: {
            'Content-Type': 'application/json',
            ...error.headers
          }
        }
      )
    }
    
    // Unknown error - return 500
    logger.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
```

---

## Path Resolution

### Virtual Path System

**Location:** [src/lib/paths.ts](../src/lib/paths.ts)

**Purpose:** Maps virtual URLs to physical file system paths with security

### Base Directory Aliasing

When multiple directories are configured, duplicate base names are aliased:

**Input:**
```
GAMES_DIRECTORY=/mnt/games,/media/games,/backup/games
```

**Alias Generation:**
```typescript
// buildBaseAliases result:
{
  "/mnt/games": "games",
  "/media/games": "games-2",
  "/backup/games": "games-3"
}
```

**Algorithm:**
1. Extract basename from each path
2. Track count of each basename
3. First occurrence: use basename as-is
4. Subsequent occurrences: append `-<count>`

### URL Encoding

**Function:** `encodeVirtualPath()`

**Purpose:** Converts physical paths to URL-safe virtual paths

**Implementation:**
```typescript
export const encodeVirtualPath = (basePath: string, filePath: string): string => {
  const relativePath = path.relative(basePath, filePath)
  const segments = relativePath.split(path.sep)
  const encoded = segments.map(encodeURIComponent).join('/')
  const alias = baseAliases.get(basePath) || path.basename(basePath)
  return `${alias}/${encoded}`
}
```

**Example:**
```
Physical: /mnt/games/Super Mario Odyssey.nsp
Alias: games
Virtual: games/Super%20Mario%20Odyssey.nsp
URL: http://localhost:3000/files/games/Super%20Mario%20Odyssey.nsp
```

### Path Security

**Function:** `resolveFilePath()`

**Security Checks:**
1. **Path traversal prevention:** Reject paths containing `..`
2. **Directory validation:** Ensure resolved path is within configured directories
3. **File existence:** Verify file exists and is readable
4. **Canonical path check:** Use `realpath` to resolve symlinks

**Implementation:**
```typescript
export const resolveFilePath = async (virtualPath: string): Promise<string | null> => {
  // Decode URL-encoded path
  const decoded = decodeURIComponent(virtualPath)
  
  // Block path traversal
  if (decoded.includes('..')) {
    return null
  }
  
  // Extract alias and relative path
  const [alias, ...segments] = decoded.split('/')
  const relativePath = segments.join('/')
  
  // Find base directory for alias
  const basePath = findBasePathForAlias(alias)
  if (!basePath) {
    return null
  }
  
  // Construct full path
  const fullPath = path.join(basePath, relativePath)
  
  // Verify file exists
  const file = Bun.file(fullPath)
  if (!await file.exists()) {
    return null
  }
  
  // Verify path is within allowed directory
  const realPath = await realpath(fullPath)
  const realBase = await realpath(basePath)
  if (!realPath.startsWith(realBase)) {
    return null
  }
  
  return realPath
}
```

---

## Type System

### Core Types

**Location:** [src/types/index.ts](../src/types/index.ts)

```typescript
// Request context passed through middleware chain
export interface RequestContext {
  timing?: {
    start: number
  }
  remoteAddress?: string
  userAgent?: string
}

// Middleware function signature
export type Middleware = (
  req: Request,
  context: RequestContext,
  next: () => Promise<Response>
) => Promise<Response>

// Handler function signature (no next function)
export type Handler = (
  req: Request,
  context: RequestContext
) => Promise<Response>

// Shop data structure
export interface ShopData {
  files: ShopFile[]
  directories: string[]
  success?: string
}

export interface ShopFile {
  url: string
  size: number
}

// Configuration
export interface Config {
  port: number
  gamesDirectories: string[]
  cacheTtl: number
  successMessage?: string
  logFormat: string
  auth?: {
    user: string
    pass: string
  }
}
```

### Request Context

`RequestContext` is passed through the entire middleware chain and is mutated by middleware:

1. **Timing middleware** adds `context.timing.start`
2. **Logging middleware** adds `context.remoteAddress` and `context.userAgent`
3. Handlers can read but typically don't modify context

This provides a clean way to pass request-scoped data without global state.

---

## Component Organization

### Directory Structure

```
src/
├── app.ts                 # Main app composition
├── main.ts                # Entry point (starts server)
├── index.html             # Browser UI template
├── config/
│   └── index.ts          # Configuration loading & validation
├── lib/
│   ├── auth.ts           # Auth credential parsing
│   ├── cache.ts          # In-memory cache with TTL
│   ├── identification.ts # File title ID and version extraction
│   ├── logger.ts         # Morgan-style logging
│   ├── media-cache.ts    # Media file caching (icons/banners)
│   ├── paths.ts          # Virtual path resolution
│   └── range.ts          # HTTP Range parsing
├── middleware/
│   ├── authorize.ts      # Auth middleware
│   ├── compose.ts        # Middleware composition
│   ├── error-handler.ts  # Error catching & formatting
│   ├── logging.ts        # Request/response logging
│   ├── method-validator.ts # HTTP method validation
│   └── timing.ts         # Performance timing
├── routes/
│   ├── index.ts          # Router implementation
│   ├── utils.ts          # Route utilities
│   └── handlers/
│       ├── cyberfoil.ts  # CyberFoil API handlers
│       ├── files.ts      # File download handler
│       ├── index.ts      # Index/shop handlers
│       ├── media.ts      # Media (icon/banner) handlers
│       ├── saves.ts      # Save synchronization handlers
│       └── shop.ts       # Shop data generation
├── services/
│   ├── shop.ts           # Business logic for shop data
│   └── titledb.ts        # TitleDB integration and caching
└── types/
    └── index.ts          # TypeScript type definitions
```

### Separation of Concerns

**Layer** | **Responsibility** | **Example**
----------|-------------------|-------------
**main.ts** | Server startup | `Bun.serve({ fetch: app })`
**app.ts** | Middleware composition | `compose(errorHandler, auth, router)`
**middleware/** | Cross-cutting concerns | Auth, logging, timing, errors
**routes/** | Request routing | URL pattern matching
**handlers/** | Request/response logic | Parse request, generate response
**services/** | Business logic | Shop data, TitleDB integration
**lib/** | Utility functions | Path encoding, range parsing, caching, identification, media cache
**config/** | Configuration | Load & validate environment variables
**types/** | Type definitions | Interfaces and type aliases

### Dependency Flow

```
main.ts
  ↓
app.ts
  ↓
middleware/* ← types/*
  ↓
routes/
  ↓
handlers/* ← services/* ← lib/* ← config/*
```

**Key Principle:** Lower layers don't depend on higher layers (no circular dependencies)

---

## TitleDB Service

### Overview

The TitleDB service provides rich game metadata integration, downloading and caching title information from Nintendo's title database.

**Location:** [src/services/titledb.ts](../src/services/titledb.ts)

**Purpose:**
- Download TitleDB JSON files (titles, versions)
- Cache data locally for offline operation
- Provide lookup functions for title information
- Enrich game catalog with real titles, categories, artwork

### TitleDB Data Structure

**Title Information:**
```typescript
interface TitleInfo {
  id: string              // Title ID (16 hex chars)
  name: string            // Game title
  description?: string    // Game description
  category?: string[]     // Categories/genres
  iconUrl?: string        // Icon image URL
  bannerUrl?: string      // Banner image URL
  version?: number        // Latest version
  releaseDate?: string    // Release date
}
```

### Service Operations

#### Download and Cache

```typescript
// Downloads TitleDB files on startup (if auto-update enabled)
await downloadTitleDB(region, language, cacheDir)

// Files downloaded:
// - {REGION}.{LANGUAGE}.json (e.g., US.en.json)
// - versions.json
```

#### Title Lookup

```typescript
// Get title information by ID
const info = await getTitleInfo(titleId)

// Returns null if title not found
if (info) {
  console.log(info.name)      // "Super Mario Odyssey"
  console.log(info.category)  // ["Adventure", "Platformer"]
  console.log(info.iconUrl)   // "https://..."
}
```

### Integration with Shop Service

TitleDB is integrated into the shop service to enrich catalog entries:

```typescript
// For each file in catalog:
const titleId = extractTitleId(filename)
const titleInfo = await getTitleInfo(titleId)

// Enrich catalog entry:
entry.name = titleInfo?.name || extractNameFromFilename(filename)
entry.category = titleInfo?.category?.join(', ') || ''
entry.iconUrl = `/api/shop/icon/${titleId}`
```

### Configuration

Controlled by environment variables:

- `TITLEDB_ENABLED` - Enable/disable integration
- `TITLEDB_REGION` - Region (US, JP, BR, etc.)
- `TITLEDB_LANGUAGE` - Language (en, ja, pt, etc.)
- `TITLEDB_CACHE_DIR` - Cache directory path
- `TITLEDB_AUTO_UPDATE` - Auto-download on startup

### Offline Operation

- TitleDB files are cached locally
- Server can operate offline with cached data
- No TitleDB = fallback to filename-based metadata

---

## File Identification

### Overview

The identification library extracts title IDs and version information from game filenames using pattern matching.

**Location:** [src/lib/identification.ts](../src/lib/identification.ts)

**Purpose:**
- Extract title IDs from filenames
- Determine file type (BASE, UPDATE, DLC)
- Parse version numbers from filenames
- Group related files (updates/DLC with base games)

### Title ID Extraction

**Pattern Matching:**
```typescript
// Matches common title ID patterns in filenames:
// - [0100ABCD01234000]
// - (0100ABCD01234000)
// - 0100ABCD01234000
const titleIdRegex = /[\[\(]?([0-9a-fA-F]{16})[\]\)]?/

const titleId = extractTitleId(filename)
// "Super Mario Odyssey [0100000000010000].nsp" → "0100000000010000"
```

### File Type Detection

```typescript
// Determine app_type based on filename markers and title ID
const appType = determineAppType(filename, titleId)

// Returns:
// 0 = BASE game
// 1 = DLC
// 2 = UPDATE
```

**Detection Logic:**
- UPDATE: Filename contains `[UPD]`, `[UPDATE]`, or title ID ends in `800`
- DLC: Filename contains `[DLC]` or title ID pattern suggests DLC
- BASE: Default (no special markers)

### Version Parsing

```typescript
// Extract version from filename patterns:
// - [v123] → 123
// - v1.2.3 → 1
// - (v5) → 5
const version = extractVersion(filename)

// "Game [v1.0.5].nsp" → 1
```

### Base Title ID Calculation

```typescript
// For updates/DLC, calculate the base game title ID
const baseTitleId = getBaseTitleId(titleId, appType)

// Update: 0100000000010800 → 0100000000010000
// DLC:    0100000000011000 → 0100000000010000
```

**Rules:**
- Updates: Clear bits 11-12 (remove `800`)
- DLC: Clear bits 12-15
- BASE: Return as-is

### Limitations

Filename-based identification is heuristic:
- Not 100% accurate
- Depends on proper filename conventions
- Future enhancement: Parse NSP/XCI package metadata

---

## Media Cache

### Overview

The media cache downloads and stores game artwork (icons, banners) locally to minimize repeated downloads from TitleDB servers.

**Location:** [src/lib/media-cache.ts](../src/lib/media-cache.ts)

**Purpose:**
- Download media files from URLs
- Cache locally with TTL expiration
- Serve cached files on subsequent requests
- Reduce bandwidth and improve performance

### Cache Structure

```
data/media/
├── icons/
│   ├── 0100000000010000.jpg
│   ├── 0100000000020000.png
│   └── ...
└── banners/
    ├── 0100000000010000.jpg
    ├── 0100000000020000.png
    └── ...
```

### Media Download Flow

```
Request → Check Cache → Exists & Valid? → Serve Cached File
                ↓
                Not in cache or expired
                ↓
          Get URL from TitleDB → Download → Save to Cache → Serve File
```

### Cache Validation

```typescript
// Check if cached file exists and is not expired
const isValid = await isCacheValid(filePath, ttl)

// Validation:
// 1. File exists
// 2. (current_time - file_mtime) < ttl
```

### Usage in Media Handlers

```typescript
// GET /api/shop/icon/:title_id
const titleId = extractTitleId(request)
const titleInfo = await getTitleInfo(titleId)

if (titleInfo?.iconUrl) {
  // Get cached or download
  const file = await getMediaFile(titleInfo.iconUrl, 'icon', titleId)
  return new Response(file)
} else {
  // Return placeholder SVG
  return createPlaceholderIcon()
}
```

### Configuration

- `MEDIA_CACHE_DIR` - Cache directory (default: `./data/media`)
- `MEDIA_CACHE_TTL` - Cache TTL in seconds (default: 604800 = 7 days)

### Cache Management

- **Automatic:** Files older than TTL are re-downloaded
- **Manual:** Delete cache directory to force refresh
- **Storage:** Plan disk space for many titles (icons ~50-100KB, banners ~100-300KB each)

---

## CyberFoil Handler

### Overview

The CyberFoil handler provides API endpoints for Nintendo Switch homebrew clients (CyberFoil/Tinfoil).

**Location:** [src/routes/handlers/cyberfoil.ts](../src/routes/handlers/cyberfoil.ts)

**Endpoints:**
- `GET /api/shop/sections` - Sectioned game catalog
- `GET /api/get_game/:id` - ID-based file downloads

### Sections Endpoint

**Purpose:** Return games organized into sections (new, recommended, updates, dlc, all)

**Implementation:**
```typescript
const sectionsHandler: Handler = async (req, ctx) => {
  const limit = parseInt(req.url.searchParams.get('limit') || '50')
  
  // Build sections from enriched catalog
  const payload = await buildShopSections(limit)
  
  return Response.json(payload)
}
```

**Section Building Logic:**
1. Get enriched catalog from shop service
2. Filter by app_type (0=BASE, 1=DLC, 2=UPDATE)
3. Sort by modification time (newest first)
4. Apply limit to "new" and "recommended"
5. Group updates/DLC by base title ID

### Get Game Endpoint

**Purpose:** Serve files by catalog ID with range support

**Implementation:**
```typescript
const getGameHandler: Handler = async (req, ctx) => {
  const id = extractIdFromPath(req.url)
  const entry = await getCatalogEntryById(id)
  
  if (!entry) {
    throw new ServiceError(404, 'File not found')
  }
  
  // Handle range requests
  const range = req.headers.get('range')
  if (range) {
    return handleRangeRequest(entry.absPath, range)
  }
  
  // Full download
  return new Response(Bun.file(entry.absPath), {
    headers: {
      'Content-Disposition': `attachment; filename="${entry.filename}"`,
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes'
    }
  })
}
```

### Integration with Shop Service

CyberFoil handler relies on shop service for:
- File catalog with IDs
- Metadata enrichment (TitleDB)
- Caching

---

## Performance Considerations

### Zero-Copy File Serving

Bun's `Response(Bun.file(path))` uses the `sendfile` syscall:
- No buffer allocation in JavaScript
- Direct kernel-to-socket transfer
- Optimal performance for large files

### Caching Strategy

Shop data is cached in memory:
- TTL-based expiration (configurable)
- Invalidated on TTL expiry
- Set `CACHE_TTL=0` to disable caching

### Stateless Design

No persistent state between requests:
- Each request is independent
- No session management
- Easy to scale horizontally

---

## Extension Points

### Adding New Middleware

```typescript
// src/middleware/my-middleware.ts
export const myMiddleware: Middleware = async (req, context, next) => {
  // Before request processing
  console.log('Before:', req.url)
  
  // Call next middleware
  const response = await next()
  
  // After request processing
  console.log('After:', response.status)
  
  return response
}

// src/app.ts
const app = compose(
  errorHandler,
  myMiddleware,  // Add here
  authorize,
  timing,
  logging,
  router
)
```

### Adding New Routes

```typescript
// src/routes/handlers/my-handler.ts
export const myHandler: Handler = async (req, context) => {
  return new Response(JSON.stringify({ data: 'value' }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

// src/routes/index.ts
const routes = {
  '/my-route': methodValidator(myHandler, ['GET', 'POST']),
  // ... existing routes
}
```

### Adding New Services

```typescript
// src/services/my-service.ts
export class MyService {
  async doSomething(): Promise<Result> {
    // Business logic here
  }
}

// Use in handlers
import { myService } from '../services/my-service'

export const handler: Handler = async (req, context) => {
  const result = await myService.doSomething()
  return new Response(JSON.stringify(result))
}
```
