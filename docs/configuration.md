# Configuration Guide

This document provides a comprehensive guide to configuring tinfoil-bolt, including environment variables, behavior details, and best practices.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Configuration Details](#configuration-details)
  - [Port Configuration](#port-configuration)
  - [Games Directories](#games-directories)
  - [Cache Settings](#cache-settings)
  - [Success Message](#success-message)
  - [Log Format](#log-format)
  - [Authentication](#authentication)
- [Directory Aliasing](#directory-aliasing)
- [Cache Behavior](#cache-behavior)
- [Logging Examples](#logging-examples)
- [Configuration Validation](#configuration-validation)
- [Best Practices](#best-practices)

---

## Environment Variables

All configuration is done through environment variables. No configuration files are needed.

### Quick Reference

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `PORT` | number | `3000` | No | HTTP server port |
| `GAMES_DIRECTORY` | string | - | **Yes** | Path(s) to game directories |
| `CACHE_TTL` | number | `300` | No | Cache TTL in seconds (0 to disable) |
| `SUCCESS_MESSAGE` | string | - | No | Custom message in shop response |
| `LOG_FORMAT` | string | `dev` | No | Log format: `tiny`, `short`, `dev`, `common`, `combined` |
| `AUTH_USER` | string | - | No | HTTP Basic Auth username |
| `AUTH_PASS` | string | - | No | HTTP Basic Auth password |
| `AUTH_CREDENTIALS` | string | - | No | HTTP Basic Auth as `user:pass` (alternative) |
| `REFERRER` | string | - | No | Host verification URL for shop security |
| `TITLEDB_ENABLED` | boolean | `true` | No | Enable TitleDB integration for metadata |
| `TITLEDB_REGION` | string | `US` | No | TitleDB region: US, JP, BR, etc. |
| `TITLEDB_LANGUAGE` | string | `en` | No | TitleDB language: en, ja, pt, etc. |
| `TITLEDB_CACHE_DIR` | string | `./data/titledb` | No | Directory for TitleDB cache files |
| `TITLEDB_AUTO_UPDATE` | boolean | `true` | No | Auto-download TitleDB on startup |
| `MEDIA_CACHE_DIR` | string | `./data/media` | No | Directory for cached media (icons/banners) |
| `MEDIA_CACHE_TTL` | number | `604800` | No | Media cache TTL in seconds (default 7 days) |

---

## Configuration Details

### Port Configuration

**Variable:** `PORT`

**Default:** `3000`

**Description:** The TCP port the server listens on.

**Examples:**
```bash
# Default port
PORT=3000

# Use port 8080
PORT=8080

# Use privileged port (requires root/sudo)
PORT=80
```

**Notes:**
- Ports below 1024 require elevated privileges on Linux
- Ensure the port isn't already in use
- Docker users: Map this port in `docker-compose.yml`

**Validation:**
- Must be a valid number
- Must be between 1 and 65535

---

### Games Directories

**Variable:** `GAMES_DIRECTORY`

**Required:** Yes

**Description:** One or more paths to directories containing game files (.nsp, .nsz, .xci, .xciz).

#### Single Directory

```bash
GAMES_DIRECTORY=/mnt/games
```

#### Multiple Directories

Use comma or semicolon as separator:

```bash
# Comma-separated
GAMES_DIRECTORY=/mnt/games,/media/switch,/backup/games

# Semicolon-separated (Windows paths)
GAMES_DIRECTORY=D:\Games;E:\Switch\Games
```

**Supported File Types:**
- `.nsp` - Nintendo Submission Package
- `.nsz` - Compressed NSP
- `.xci` - NX Card Image
- `.xciz` - Compressed XCI

**Directory Scanning:**
- **Recursive:** Scans all subdirectories
- **Glob pattern:** `**/*.{nsp,nsz,xci,xciz}`
- **Hidden files:** Included (no filtering)

**Example Directory Structure:**
```
/mnt/games/
├── Mario/
│   ├── Super Mario Odyssey.nsp
│   └── Mario Kart 8.nsz
├── Zelda/
│   └── BOTW.nsp
└── Updates/
    └── update-12.0.0.nsp
```

**Notes:**
- Directories must exist and be readable
- Symlinks are resolved (follow symlinks)
- Network mounts are supported (NFS, SMB/CIFS)
- Read-only permissions are sufficient

**Validation:**
- At least one directory must be specified
- All paths must exist
- All paths must be directories (not files)

---

### Cache Settings

**Variable:** `CACHE_TTL`

**Default:** `300` (5 minutes)

**Description:** Time in seconds that shop data is cached in memory.

**Examples:**
```bash
# 5 minutes (default)
CACHE_TTL=300

# 1 hour
CACHE_TTL=3600

# Disable caching
CACHE_TTL=0

# 24 hours
CACHE_TTL=86400
```

**Behavior:**
- `> 0`: Cache enabled with TTL expiration
- `= 0`: Cache disabled (scan on every request)
- Cache stores: file list, sizes, directory structure

**When to Adjust:**

| Scenario | Recommended TTL | Rationale |
|----------|----------------|-----------|
| Frequently adding games | `0` or `60` | Ensure new files appear quickly |
| Static library | `3600` or `86400` | Maximize performance |
| Large library (>1000 files) | `1800` or higher | Reduce scan overhead |
| Testing/development | `0` | Always see latest changes |
| Production (stable) | `3600` | Balance freshness and performance |

**Cache Invalidation:**
- **TTL-based:** Cache expires after TTL seconds
- **Manual:** Restart server to force refresh
- **Automatic:** Not supported (no file watching)

**Memory Usage:**
- Proportional to number of files
- Approximately 100-200 bytes per file
- 10,000 files ≈ 2MB cache size

---

### Success Message

**Variable:** `SUCCESS_MESSAGE`

**Default:** `undefined`

**Description:** Optional message displayed in Tinfoil client when shop loads successfully.

**Examples:**
```bash
SUCCESS_MESSAGE="Welcome to my game collection!"

SUCCESS_MESSAGE="Library updated $(date +%Y-%m-%d)"

SUCCESS_MESSAGE="🎮 Happy gaming!"
```

**Appears In:**
- Shop JSON response (`success` field)
- Displayed by Tinfoil client after connecting

**Character Limit:**
- No technical limit
- Tinfoil may truncate very long messages
- Recommended: Keep under 100 characters

**Special Characters:**
- Unicode/emoji supported
- Escape quotes in shell: `SUCCESS_MESSAGE="\"Quoted\" text"`

---

### Log Format

**Variable:** `LOG_FORMAT`

**Default:** `dev`

**Description:** Logging format style (Morgan-compatible formats).

**Supported Formats:**
- `tiny` - Minimal output
- `short` - Brief with response time
- `dev` - Development (colored)
- `common` - Apache Common Log Format
- `combined` - Apache Combined Log Format

**See [Logging Examples](#logging-examples)** below for output samples.

**Format Selection:**

| Format | Use Case |
|--------|----------|
| `tiny` | Production (minimal logs) |
| `short` | Quick debugging |
| `dev` | Local development (colors) |
| `common` | Standard web server logs |
| `combined` | Detailed logs with user-agent |

---

### Authentication

Authentication is optional. If configured, all endpoints require HTTP Basic Authentication.

#### Option 1: Separate Variables

**Variables:** `AUTH_USER` and `AUTH_PASS`

```bash
AUTH_USER=tinfoil
AUTH_PASS=supersecret
```

#### Option 2: Combined Variable

**Variable:** `AUTH_CREDENTIALS`

```bash
AUTH_CREDENTIALS=tinfoil:supersecret
```

**Precedence:**
- If both options are set, `AUTH_USER` + `AUTH_PASS` take precedence
- If neither option is set, authentication is **disabled**

**Security Notes:**
- Credentials are sent in Base64 (not encrypted)
- **Use HTTPS in production** (but Tinfoil doesn't support HTTPS)
- Network isolation recommended (VPN, private network)
- Strong passwords recommended even without encryption

**Example with Docker:**
```yaml
# docker-compose.yml
environment:
  - AUTH_USER=myuser
  - AUTH_PASS=${AUTH_PASSWORD}  # From .env file
```

```bash
# .env file (not committed to git)
AUTH_PASSWORD=very_secure_password_123
```

---

### TitleDB Integration

TitleDB provides rich game metadata including titles, descriptions, categories, and artwork URLs. When enabled, the server downloads and caches TitleDB data to enrich game information shown in CyberFoil clients.

#### Enable/Disable TitleDB

**Variable:** `TITLEDB_ENABLED`

**Default:** `true`

**Description:** Enable or disable TitleDB integration for metadata enrichment.

**Examples:**
```bash
# Enabled (default)
TITLEDB_ENABLED=true

# Disabled - use filename-based metadata only
TITLEDB_ENABLED=false
```

**When Disabled:**
- Game names are derived from filenames
- No category information
- No icon/banner artwork
- Updates and DLC sections may be empty

**When Enabled:**
- Real game titles from TitleDB
- Category/genre information
- Icon and banner URLs
- Better update/DLC grouping

---

#### TitleDB Region

**Variable:** `TITLEDB_REGION`

**Default:** `US`

**Description:** Nintendo eShop region for title data.

**Supported Regions:**
- `US` - United States (English)
- `JP` - Japan (Japanese)
- `BR` - Brazil (Portuguese)
- Other regions may be available depending on TitleDB dataset

**Examples:**
```bash
# US region (default)
TITLEDB_REGION=US

# Japan region
TITLEDB_REGION=JP

# Brazil region
TITLEDB_REGION=BR
```

**Notes:**
- Region affects game titles and release information
- Some titles may only exist in certain regions
- Choose the region matching your game library

---

#### TitleDB Language

**Variable:** `TITLEDB_LANGUAGE`

**Default:** `en`

**Description:** Language for game titles and descriptions.

**Supported Languages:**
- `en` - English
- `ja` - Japanese
- `pt` - Portuguese
- Other languages may be available per region

**Examples:**
```bash
# English (default)
TITLEDB_LANGUAGE=en

# Japanese
TITLEDB_LANGUAGE=ja

# Portuguese
TITLEDB_LANGUAGE=pt
```

**Notes:**
- Language must match available data for the selected region
- Common combinations: `US/en`, `JP/ja`, `BR/pt`

---

#### TitleDB Cache Directory

**Variable:** `TITLEDB_CACHE_DIR`

**Default:** `./data/titledb`

**Description:** Directory where TitleDB JSON files are cached.

**Examples:**
```bash
# Default location
TITLEDB_CACHE_DIR=./data/titledb

# Custom location
TITLEDB_CACHE_DIR=/var/cache/tinfoil-bolt/titledb

# Persistent volume (Docker)
TITLEDB_CACHE_DIR=/data/titledb
```

**Cached Files:**
- `{REGION}.{LANGUAGE}.json` - Title database for region/language
- `versions.json` - Version and release date information

**Directory Structure:**
```
data/titledb/
├── US.en.json
└── versions.json
```

**Notes:**
- Directory is created automatically if it doesn't exist
- Files are downloaded on first startup (if auto-update enabled)
- Can be shared between container restarts (Docker volume)

---

#### TitleDB Auto-Update

**Variable:** `TITLEDB_AUTO_UPDATE`

**Default:** `true`

**Description:** Automatically download/update TitleDB data on server startup.

**Examples:**
```bash
# Auto-update enabled (default)
TITLEDB_AUTO_UPDATE=true

# Disabled - use existing cached files only
TITLEDB_AUTO_UPDATE=false
```

**Behavior When Enabled:**
- Downloads TitleDB files on startup if missing
- Checks for updates (re-downloads if needed)
- Startup may be slower on first run

**Behavior When Disabled:**
- Uses existing cached files only
- Fails if cache files don't exist
- Faster startup, but may have outdated data

**Use Cases:**
- **Enabled:** Production deployments, auto-updating metadata
- **Disabled:** Air-gapped systems, pre-downloaded TitleDB files

---

### Media Cache

Media cache stores downloaded game artwork (icons and banners) locally to avoid repeated downloads from TitleDB servers.

#### Media Cache Directory

**Variable:** `MEDIA_CACHE_DIR`

**Default:** `./data/media`

**Description:** Directory where media files (icons, banners) are cached.

**Examples:**
```bash
# Default location
MEDIA_CACHE_DIR=./data/media

# Custom location
MEDIA_CACHE_DIR=/var/cache/tinfoil-bolt/media

# Persistent volume (Docker)
MEDIA_CACHE_DIR=/data/media
```

**Directory Structure:**
```
data/media/
├── icons/
│   ├── 0100000000010000.jpg
│   └── 0100000000020000.png
└── banners/
    ├── 0100000000010000.jpg
    └── 0100000000020000.png
```

**Notes:**
- Directory is created automatically if it doesn't exist
- Images are named by title ID
- Can grow large with many titles (plan disk space accordingly)

---

#### Media Cache TTL

**Variable:** `MEDIA_CACHE_TTL`

**Default:** `604800` (7 days in seconds)

**Description:** Time in seconds that cached media files remain valid before being re-downloaded.

**Examples:**
```bash
# 7 days (default)
MEDIA_CACHE_TTL=604800

# 30 days
MEDIA_CACHE_TTL=2592000

# 1 day
MEDIA_CACHE_TTL=86400

# Effectively permanent (10 years)
MEDIA_CACHE_TTL=315360000
```

**Behavior:**
- Media older than TTL is re-downloaded on next request
- Lower TTL = fresher artwork, more downloads
- Higher TTL = less bandwidth, potentially outdated artwork

**Recommendations:**

| Scenario | Recommended TTL | Rationale |
|----------|----------------|-----------|
| Stable library | 30 days or more | Artwork rarely changes |
| Active development | 1-7 days | Get updates frequently |
| Limited bandwidth | 30+ days | Minimize downloads |
| Fast connection | 7 days | Balance freshness and efficiency |

---

### Referrer Configuration

**Variable:** `REFERRER`

**Default:** `""` (empty)

**Description:** Optional host verification URL for strict shop security. When set, included in shop responses for Tinfoil/CyberFoil clients.

**Examples:**
```bash
# No referrer (default)
REFERRER=

# Set custom referrer
REFERRER=https://verified-shop.example.com
```

**Usage:**
- Appears in CyberFoil shop response (`referrer` field)
- Used for host verification in some shop configurations
- Optional feature, not required for basic operation

**Notes:**
- Only included in responses when configured
- Empty string or unset = field not included in response

---

## Directory Aliasing

When multiple directories are configured, tinfoil-bolt generates unique aliases for each directory.

### Algorithm

1. Extract the basename (last segment) from each path
2. Track occurrences of each basename
3. First occurrence: use basename as-is
4. Subsequent occurrences: append `-<count>`

### Examples

#### Example 1: Unique Names

**Input:**
```bash
GAMES_DIRECTORY=/mnt/games,/media/dlc,/backup/updates
```

**Aliases:**
```
/mnt/games    → games
/media/dlc    → dlc
/backup/updates → updates
```

**Virtual Paths:**
```
games/Mario.nsp
dlc/BOTW-DLC.nsp
updates/firmware-12.0.0.nsp
```

#### Example 2: Duplicate Names

**Input:**
```bash
GAMES_DIRECTORY=/mnt/games,/media/games,/backup/games
```

**Aliases:**
```
/mnt/games    → games
/media/games  → games-2
/backup/games → games-3
```

**Virtual Paths:**
```
games/Mario.nsp      (from /mnt/games/)
games-2/Zelda.nsp    (from /media/games/)
games-3/Splatoon.nsp (from /backup/games/)
```

#### Example 3: Mixed

**Input:**
```bash
GAMES_DIRECTORY=/home/user/switch/games,/mnt/nas/games,/mnt/usb/dlc
```

**Aliases:**
```
/home/user/switch/games → games
/mnt/nas/games          → games-2
/mnt/usb/dlc            → dlc
```

### URL Structure

**Full URL format:**
```
http://<host>:<port>/files/<alias>/<relative-path>
```

**Example:**
```
http://192.168.1.100:3000/files/games/Mario%20Kart%208.nsp
                                  ^^^^^ ^^^^^^^^^^^^^^^^^^^^^
                                  alias  URL-encoded path
```

### Special Characters

File paths are URL-encoded:
- Spaces → `%20`
- Parentheses → `%28` and `%29`
- Brackets → `%5B` and `%5D`
- Other special chars encoded as needed

**Example:**
```
Physical: /mnt/games/The Legend of Zelda (v1.0) [USA].nsp
Virtual:  games/The%20Legend%20of%20Zelda%20%28v1.0%29%20%5BUSA%5D.nsp
```

---

## Cache Behavior

### Cache Lifecycle

```
Request → Check Cache → Valid? → Return Cached Data
                  ↓
                  No (expired or empty)
                  ↓
            Scan Directories → Build Shop Data → Store in Cache → Return Data
```

### Cache Entry Structure

```typescript
interface CacheEntry<T> {
  data: T
  timestamp: number  // Unix timestamp (ms)
}
```

### TTL Validation

```typescript
isValid = (Date.now() - cache.timestamp) < (CACHE_TTL * 1000)
```

### Cache Miss Scenarios

1. **First request:** Cache is empty
2. **After TTL expiry:** `Date.now() - timestamp > TTL`
3. **After server restart:** Cache is lost (in-memory only)
4. **TTL = 0:** Cache always invalid (effectively disabled)

### Performance Implications

**With Cache (TTL > 0):**
- First request: Slow (full directory scan)
- Subsequent requests: Fast (in-memory lookup)
- Overhead: ~1-5ms per request

**Without Cache (TTL = 0):**
- Every request: Scans all directories
- Overhead: Proportional to file count
  - 100 files: ~10-20ms
  - 1,000 files: ~50-100ms
  - 10,000 files: ~500-1000ms
- Network mounts add latency

**Recommendation:** Use caching unless you need real-time directory updates.

---

## Logging Examples

### Tiny Format

**Format:** `LOG_FORMAT=tiny`

**Output:**
```
GET /shop.json 200 1234 - 12 ms
POST /files/game.nsp 405 89 - 2 ms
```

**Fields:** `method path status content-length - response-time`

### Short Format

**Format:** `LOG_FORMAT=short`

**Output:**
```
192.168.1.50 - GET /shop.json 200 1234 - 12 ms
192.168.1.50 - HEAD /files/game.nsp 200 0 - 3 ms
```

**Fields:** `remote-addr - method path status content-length - response-time`

### Dev Format (Development)

**Format:** `LOG_FORMAT=dev`

**Output (with colors in terminal):**
```
GET /shop.json 200 12 ms - 1234
POST /files/game.nsp 405 2 ms - 89
```

**Color Coding:**
- Green: 2xx status codes
- Cyan: 3xx status codes
- Yellow: 4xx status codes
- Red: 5xx status codes

**Fields:** `method path status response-time - content-length`

### Common Format

**Format:** `LOG_FORMAT=common`

**Output:**
```
192.168.1.50 - - [30/Jan/2026:14:23:45 +0000] "GET /shop.json HTTP/1.1" 200 1234
192.168.1.50 - - [30/Jan/2026:14:23:47 +0000] "HEAD /files/game.nsp HTTP/1.1" 200 0
```

**Format:** Apache Common Log Format

**Fields:** `remote-addr - - [timestamp] "method path protocol" status content-length`

### Combined Format

**Format:** `LOG_FORMAT=combined`

**Output:**
```
192.168.1.50 - - [30/Jan/2026:14:23:45 +0000] "GET /shop.json HTTP/1.1" 200 1234 "-" "Tinfoil/1.0"
192.168.1.50 - - [30/Jan/2026:14:23:47 +0000] "HEAD /files/game.nsp HTTP/1.1" 200 0 "-" "Mozilla/5.0"
```

**Format:** Apache Combined Log Format

**Fields:** Common format + `"referer" "user-agent"`

### Timestamp Format

All timestamps use ISO 8601 with timezone:

```
[30/Jan/2026:14:23:45 +0000]
 DD/MMM/YYYY:HH:MM:SS ±HHMM
```

---

## Configuration Validation

### Validation on Startup

tinfoil-bolt validates all configuration on startup and exits with an error if invalid.

#### Required Variables

**`GAMES_DIRECTORY` missing:**
```
Error: GAMES_DIRECTORY environment variable is required
```

**Exit code:** `1`

#### Directory Validation

**Directory doesn't exist:**
```
Error: Directory does not exist: /invalid/path
```

**Not a directory (is a file):**
```
Error: Path is not a directory: /path/to/file.txt
```

**No read permissions:**
```
Error: Cannot read directory: /restricted/path
```

#### Type Validation

**PORT not a number:**
```
Error: PORT must be a valid number
```

**CACHE_TTL not a number:**
```
Error: CACHE_TTL must be a valid number
```

#### Value Validation

**PORT out of range:**
```
Error: PORT must be between 1 and 65535
```

**CACHE_TTL negative:**
```
Error: CACHE_TTL must be >= 0
```

#### Log Format Validation

**Invalid LOG_FORMAT:**
```
Error: LOG_FORMAT must be one of: tiny, short, dev, common, combined
```

### Configuration Loading Order

1. Load environment variables
2. Apply defaults for optional variables
3. Validate required variables exist
4. Validate all values are correct types
5. Validate directories exist and are accessible
6. Validate value ranges
7. Build final config object

---

## Best Practices

### Development

```bash
# Fast iteration, see all changes immediately
PORT=3000
GAMES_DIRECTORY=/home/user/test-games
CACHE_TTL=0
LOG_FORMAT=dev
# No auth for local testing
```

### Production (Small Library)

```bash
# Stable configuration, moderate caching
PORT=3000
GAMES_DIRECTORY=/mnt/games
CACHE_TTL=3600         # 1 hour
SUCCESS_MESSAGE="Game Library"
LOG_FORMAT=combined    # Detailed logs
AUTH_USER=user
AUTH_PASS=secure_password
```

### Production (Large Library)

```bash
# Optimize for performance
PORT=3000
GAMES_DIRECTORY=/mnt/games,/mnt/dlc,/mnt/updates
CACHE_TTL=86400        # 24 hours (files rarely change)
SUCCESS_MESSAGE="Welcome!"
LOG_FORMAT=tiny        # Minimal logging overhead
AUTH_USER=user
AUTH_PASS=secure_password
```

### Docker Compose

```yaml
version: '3.8'
services:
  tinfoil-bolt:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - /mnt/games:/games:ro    # Read-only mount
      - /mnt/dlc:/dlc:ro
    environment:
      - PORT=3000
      - GAMES_DIRECTORY=/games,/dlc
      - CACHE_TTL=3600
      - SUCCESS_MESSAGE=Game Server
      - LOG_FORMAT=combined
      - AUTH_USER=${AUTH_USER}           # From .env file
      - AUTH_PASS=${AUTH_PASS}           # From .env file
    restart: unless-stopped
```

### Network Mount Considerations

When using NFS or SMB/CIFS mounts:

```bash
# Increase cache TTL to reduce network load
CACHE_TTL=7200  # 2 hours

# Monitor logs for slow scans
LOG_FORMAT=dev
```

**Performance Tips:**
- Mount with `noatime` option (don't update access times)
- Use wired connection over WiFi for NAS
- Consider local cache directory for frequently accessed files

### Security Hardening

```bash
# Use strong authentication
AUTH_USER=admin
AUTH_PASS=$(openssl rand -base64 32)  # Generate strong password

# Run on non-standard port
PORT=8192

# Use combined logging for audit trail
LOG_FORMAT=combined
```

### Multi-User Setup

```bash
# Create multiple Docker containers with different directories
# Container 1: User A's games
GAMES_DIRECTORY=/mnt/storage/userA
AUTH_CREDENTIALS=userA:passA
PORT=3001

# Container 2: User B's games
GAMES_DIRECTORY=/mnt/storage/userB
AUTH_CREDENTIALS=userB:passB
PORT=3002
```

### Environment Variable Files

**.env file:**
```bash
# .env
AUTH_USER=myuser
AUTH_PASS=mypassword
GAMES_DIR=/mnt/games
```
---

## Configuration Examples

### Minimal Configuration

```bash
GAMES_DIRECTORY=/mnt/games
```

All other values use defaults.

### Complete Configuration

```bash
PORT=3000
GAMES_DIRECTORY=/mnt/games,/mnt/dlc,/mnt/updates
CACHE_TTL=3600
SUCCESS_MESSAGE="Welcome to the game library!"
LOG_FORMAT=combined
AUTH_USER=nintendo
AUTH_PASS=switch_fan_2026
REFERRER=https://shop.example.com
TITLEDB_ENABLED=true
TITLEDB_REGION=US
TITLEDB_LANGUAGE=en
TITLEDB_CACHE_DIR=./data/titledb
TITLEDB_AUTO_UPDATE=true
MEDIA_CACHE_DIR=./data/media
MEDIA_CACHE_TTL=604800
```

### Testing Configuration

```bash
PORT=3000
GAMES_DIRECTORY=./test/fixtures/games
CACHE_TTL=0
LOG_FORMAT=dev
# No auth
```

### NAS Configuration (Synology)

```bash
PORT=3000
GAMES_DIRECTORY=/volume1/Switch/Games,/volume1/Switch/DLC
CACHE_TTL=7200
SUCCESS_MESSAGE="Synology NAS"
LOG_FORMAT=combined
AUTH_CREDENTIALS=admin:$(cat /config/password)
```
