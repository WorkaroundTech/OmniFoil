# tinfoil-bolt
![tinfoil-bolt logo](bolt-logo-transparent-bg.png)

**tinfoil-bolt** is a lightning-fast, zero-dependency, and lightweight backend server to serve your personal game backup library to Tinfoil on Nintendo Switch.

Built with [Bun](https://bun.sh), it replaces bloated, unmaintainable alternatives with a clean, modular TypeScript codebase that does exactly what you need and nothing else.

## Why Bolt?

Many existing Tinfoil server solutions suffer from feature creep: auto-updaters that pose security risks, heavy polling mechanisms, required databases, or complex UIs.

**tinfoil-bolt is different:**

* **Zero Dependencies:** No `node_modules` black hole. Uses Bun's native HTTP and FileSystem APIs.
* **Stateless:** No database to sync. It scans your folders when Tinfoil asks.
* **Multi-Mount Support:** Seamlessly serve games scattered across multiple drives/mounts (e.g., `/mnt/nas` and `/mnt/usb`) as a single unified library.
* **Secure:** Designed to run with **Read-Only** access to your files. No risk of deletion or corruption.
* **Performance:** Uses the `sendfile` syscall (via Bun) for high-performance file streaming from your NAS to your Switch.

## 🛠️ Installation

### Option 1: Docker Compose (Recommended)

This is the easiest way to run `tinfoil-bolt` on your NAS, Home Server, or Proxmox LXC container.

1. Clone or download this entire repository.
2. Copy `.env.example` to `.env` and update with your game directories and optional auth settings.
3. Update the volume paths in `docker-compose.yml` to match your actual game storage locations.
4. Run:
```bash
docker compose up -d
```



### Option 2: Bare Metal (LXC/Linux)

If you are running a raw LXC container and don't want Docker overhead:

1. **Install Bun:**
```bash
curl -fsSL https://bun.sh/install | bash
```

2. **Configure:**
```bash
cp .env.example .env
# Edit .env with your game directories
```

3. **Run:**
```bash
bun run src/server.ts
# or with npm-style scripts:
bun start
```



## Configuration

Copy `.env.example` to `.env` and configure the following variables:

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | The port the server listens on. | `3000` |
| `GAMES_DIRS` | Comma or semicolon-separated list of **absolute paths** where your NSP/NSZ/XCI files are stored. | `/data/games` |
| `CACHE_TTL` | Cache duration (in seconds) for shop data. Reduces expensive directory scans on network mounts. Set to `0` to disable caching. | `300` |
| `SUCCESS_MESSAGE` | Optional message displayed in Tinfoil when the shop is loaded. Great for MOTD or custom greetings. | (empty) |
| `LOG_FORMAT` | Morgan-style log format: `tiny`, `short`, `dev`, `common`, or `combined`. | `dev` |

### TitleDB & Metadata Enrichment

**tinfoil-bolt** now supports TitleDB integration to provide rich game metadata for CyberFoil clients. This enables:

- **Real game titles** (instead of filename-based names)
- **Game cover artwork** (icons and banners)
- **Category tags** (genres)
- **Version information**
- **Update/DLC detection and grouping**

| Variable | Description | Default |
| --- | --- | --- |
| `TITLEDB_ENABLED` | Enable TitleDB integration for metadata enrichment | `true` |
| `TITLEDB_REGION` | Region for TitleDB data (US, EU, JP, etc.) | `US` |
| `TITLEDB_LANGUAGE` | Language code (en, es, fr, de, ja, etc.) | `en` |
| `TITLEDB_CACHE_DIR` | Directory to store downloaded TitleDB files | `./data/titledb` |
| `TITLEDB_AUTO_UPDATE` | Auto-download TitleDB data on server start | `true` |
| `MEDIA_CACHE_DIR` | Directory to store cached game artwork | `./data/media` |
| `MEDIA_CACHE_TTL` | Media cache TTL in seconds | `604800` (7 days) |

**How it works:**

1. On startup, tinfoil-bolt downloads TitleDB datasets (titles, versions) based on your region/language
2. When scanning your library, it attempts to extract title IDs from filenames
3. If a title ID is found, it enriches the game entry with TitleDB metadata
4. Game icons and banners are served via `/api/shop/icon/:title_id` and `/api/shop/banner/:title_id`
5. CyberFoil clients automatically display rich metadata with cover art

**Note:** TitleDB data is cached locally. The first startup may take a few moments to download the database. Subsequent startups use the cached data unless `TITLEDB_AUTO_UPDATE=true`.


### Authentication (Optional)

You can protect all endpoints with HTTP Basic Auth by setting either `AUTH_USER` + `AUTH_PASS` or a single `AUTH_CREDENTIALS` value (`user:pass`). If none are set, authentication is disabled.

- Variables:
  - `AUTH_USER` and `AUTH_PASS`: username/password pair
  - `AUTH_CREDENTIALS`: combined `user:pass` string
- Precedence: `AUTH_USER`/`AUTH_PASS` take priority over `AUTH_CREDENTIALS` when both are present.

Examples:

```bash
# Local (Bun)
AUTH_CREDENTIALS=admin:secret bun run src/server.ts

# Test without auth header (should be 401)
curl -i http://localhost:3000/

# Test with auth header (should be 200)
curl -i -H "Authorization: Basic $(printf 'admin:secret' | base64)" http://localhost:3000/
```

Docker Compose:

```yaml
services:
  tinfoil-bolt:
    env_file: .env
    environment:
      - PORT=3000
      - GAMES_DIRS=/games/1,/games/2
      - AUTH_CREDENTIALS=${AUTH_CREDENTIALS}
```

Note: Keep the server on a trusted LAN. If your client supports Basic Auth, set credentials accordingly. If not, leave auth disabled.

### How It Works

1. The root endpoint (`/` or `/tinfoil`) returns an index for browsers and generic clients.
2. Tinfoil/CyberFoil-style requests (with Tinfoil headers) receive direct shop JSON at `/`.
3. Legacy shop endpoints remain available at `/shop.json` and `/shop.tfl`.
4. CyberFoil-compatible endpoints are available at `/api/shop/sections` and `/api/get_game/:id`.
5. Media endpoints serve game artwork at `/api/shop/icon/:title_id` and `/api/shop/banner/:title_id`.
6. Files are still available via legacy path-based downloads at `/files/{alias}/{relative-path}`.

## Advanced Features

### HTTP Range Request Support

tinfoil-bolt supports HTTP 206 Partial Content responses, enabling resumable downloads for large files. This is especially useful for:

* **Interrupted downloads:** Resume a failed transfer without re-downloading the entire file
* **Bandwidth efficiency:** Download only the portion of a file you need
* **Large files on unreliable connections:** Split downloads across multiple requests

**Supported Range Formats:**
- `Range: bytes=0-1048575` - First 1MB
- `Range: bytes=500-` - From byte 500 to end of file
- `Range: bytes=-1048576` - Last 1MB (suffix range)

**Server Response:**
- `200 OK` - Full file requested (no Range header)
- `206 Partial Content` - Valid range request accepted
  - Includes `Content-Range` header (e.g., `bytes 0-1048575/5242880`)
  - Includes `Content-Length` for the requested range size
- `416 Range Not Satisfiable` - Invalid range (e.g., start >= file size)
  - Includes `Content-Range: bytes */{total_size}` for client reference

All file responses include the `Accept-Ranges: bytes` header to advertise support.

**Example:**
```bash
# Resume a partially downloaded 5GB file, starting from byte 2147483648
curl -H "Range: bytes=2147483648-" http://localhost:3000/files/games/large-game.nsp -o game.nsp --continue-at -

# Download first 10MB
curl -H "Range: bytes=0-10485759" http://localhost:3000/files/games/game.nsp -o game-chunk1.nsp

# Download last 512MB
curl -H "Range: bytes=-536870912" http://localhost:3000/files/games/game.nsp -o game-final-chunk.nsp
```

## Tinfoil Setup (Switch)

1. Open **Tinfoil** on your Nintendo Switch.
2. Navigate to **File Browser**.
3. Press **-** (Minus Button) to add a new location.
4. Fill in the details:
  * **Protocol:** `HTTP`
  * **Host:** Your Server IP (e.g., `192.168.1.50`)
  * **Port:** `3000` (or whatever you set)
  * **Path:** `/` (or `/tinfoil` - both work)
  * **Title:** `Bolt Server` (or whatever you like)
  * **Username:** (if auth enabled, enter your `AUTH_USER` value)
  * **Password:** (if auth enabled, enter your `AUTH_PASS` value)
5. Press **X** to Save.

Tinfoil will fetch the index, then request `/shop.tfl` to load your library. Your "New Games" tab will populate automatically.

**Note:** If you have enabled Basic Auth on the server, Tinfoil's File Browser will prompt for credentials when connecting. Leave username/password blank if auth is disabled.

## CyberFoil Setup

In CyberFoil, set your eShop URL to:

- `http://<server-ip>:3000`

CyberFoil can use:

- `GET /` (direct shop payload for Tinfoil/CyberFoil header-based requests)
- `GET /api/shop/sections`
- `GET /api/get_game/:id`

## Supported Formats

The server recursively scans for the following extensions:

* `.nsp`
* `.nsz`
* `.xci`
* `.xciz`

## Security Note

This application serves files over plain HTTP (required by Tinfoil's standard implementation). It is intended for use inside a **trusted local network** (LAN). Do not expose this port directly to the internet without a VPN or proper authentication layer.

## License

MIT License. Feel free to fork, mod, and use in your home lab.

---

*Disclaimer: This tool is for managing your legally owned backups and homebrews. The authors do not condone piracy.*