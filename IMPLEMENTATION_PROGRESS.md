# TitleDB & Metadata Enrichment Implementation Progress

## Purpose

This file tracks the implementation progress for adding TitleDB integration and metadata enrichment to `tinfoil-bolt`, enabling CyberFoil clients to display rich game information similar to AeroFoil.

## Feature Description

**Goal**: Transform the basic CyberFoil-compatible API into a fully-featured game library service with rich metadata.

**Current State**: The server provides CyberFoil-compatible endpoints (`/api/shop/sections`, `/api/get_game/:id`) but returns minimal metadata:
- Game names are derived from filenames (not actual titles)
- No icon or banner artwork
- No category, version, or release information
- Update/DLC sections are empty placeholders
- No screenshots or detailed descriptions

**Target State**: Match AeroFoil's metadata richness by:
- Integrating TitleDB dataset (titles, versions, artwork URLs, categories, descriptions)
- Identifying files to extract real title_id, app_id, app_type, version from NSP/NSZ/XCI/XCZ packages
- Enriching shop sections with proper game metadata
- Serving icon/banner images via `/api/shop/icon/:title_id` and `/api/shop/banner/:title_id`
- Populating update/DLC sections with proper grouping by base title

**Reference Implementation**: AeroFoil project (`app/titledb.py`, `app/titles.py`) was used as the source of truth for API contract and data model expectations.

---

## Current State

### ✅ Completed
- [x] CyberFoil-compatible API endpoints (`/api/shop/sections`, `/api/get_game/:id`)
- [x] Root endpoint Tinfoil/CyberFoil header detection
- [x] ID-based file downloads with Range support
- [x] Basic sections payload structure (new, recommended, updates, dlc, all)
- [x] File catalog with ID mapping (⚠️ IDs shift when files are added/removed)
- [x] In-memory caching for shop/sections payloads
- [x] **TitleDB integration** (Phase 1 complete)
  - [x] TitleDB service with download and caching
  - [x] Region/language configuration
  - [x] Title info lookup by title ID
  - [x] Version tracking
- [x] **File identification** (Phase 2 - Option A complete)
  - [x] Extract title IDs from filenames
  - [x] Parse versions from filenames
  - [x] Detect update/DLC markers
  - [x] Determine app type (BASE/UPDATE/DLC)
- [x] **Metadata enrichment** (Phase 3 complete)
  - [x] Enrich catalog with TitleDB lookups
  - [x] Real game titles instead of filenames
  - [x] Category information
  - [x] Version tracking
  - [x] Update/DLC grouping in sections
- [x] **Media endpoints** (Phase 4 complete)
  - [x] `/api/shop/icon/:title_id` endpoint
  - [x] `/api/shop/banner/:title_id` endpoint
  - [x] Media caching with TTL
  - [x] Automatic download and proxy

### ⚠️ Known Limitations
- File IDs shift when files are added/removed (potential future enhancement)
- Filename-based identification (Option A) - less accurate than package parsing
- No screenshot support yet
- TitleDB data depends on accurate title IDs in filenames

## Implementation Phases

## Phase 1: TitleDB Data Layer ✅ COMPLETE

### Tasks
- [x] Create TitleDB service module (`src/services/titledb.ts`)
  - [x] Download/cache region titles JSON (US.en.json or similar)
  - [x] Download/cache versions.json (version/release date mapping)
  - [x] Provide `getTitleInfo(titleId)` lookup function
  - [x] Handle missing/corrupted data gracefully

### Completed Files
- `src/services/titledb.ts` - Full TitleDB service implementation
- `src/types/index.ts` - TitleDB type definitions
- `src/config/index.ts` - TitleDB configuration

---

## Phase 2: File Identification ✅ COMPLETE (Option A)

### Implementation: Filename Heuristics (Quick Win)
- [x] Parse title ID patterns from filenames
- [x] Extract version patterns (`[v123]`, `v1.2.3`)
- [x] Detect update/DLC markers in filenames
- [x] Map to base title IDs using simple rules

**Pros:** Fast to implement, no external dependencies ✅
**Cons:** Unreliable for non-standard filenames (acceptable for MVP)

### Completed Files
- `src/lib/identification.ts` - File identification with regex patterns

### Future Enhancement: Package Metadata Parsing (Option B)
For production quality, consider implementing:
- Parse NSP/NSZ structure (PFS0)
- Read CNMT (Content Meta) from packages
- Extract real title_id, app_id, version, app_type
- Handle compressed NSZ files

---

## Phase 3: Metadata Enrichment ✅ COMPLETE

### Tasks
- [x] Enrich catalog entries with TitleDB lookups
  - [x] `name` from TitleDB instead of filename
  - [x] `title_id` from identification
  - [x] `app_id` from identification
  - [x] `app_type` (BASE/UPDATE/DLC) from identification
  - [x] `app_version` from identification
  - [x] `category` from TitleDB
  - [x] `icon_url` pointing to `/api/shop/icon/:title_id`
  - [x] `banner_url` (optional) from TitleDB

- [x] Update sections logic
  - [x] Group updates by base title_id
  - [x] Show latest update per title
  - [x] Group DLC by base title_id
  - [x] Populate `updates` and `dlc` sections

### Modified Files
- `src/services/shop.ts` - Enhanced with TitleDB lookups and enrichment
- `src/types/index.ts` - Extended `CatalogFileEntry` with metadata fields

---

## Phase 4: Media Endpoints ✅ COMPLETE

### Tasks
- [x] Implement `/api/shop/icon/:title_id`
  - [x] Lookup icon URL from TitleDB
  - [x] Proxy/cache icon image locally
  - [x] Serve cached file with proper cache headers
  - [x] Handle missing icons gracefully (404)

- [x] Implement `/api/shop/banner/:title_id`
  - [x] Lookup banner URL from TitleDB
  - [x] Proxy/cache banner image locally
  - [x] Serve cached file with proper cache headers
  - [x] Handle missing banners gracefully

- [x] Add local media cache directory
  - [x] `data/cache/icons/`
  - [x] `data/cache/banners/`
  - [x] Implement cache TTL/cleanup

### Completed Files
- `src/routes/handlers/media.ts` - Media endpoint handlers
- `src/routes/index.ts` - Media route registration
- `src/lib/media-cache.ts` - Media caching and proxy logic
- `src/config/index.ts` - Media cache configuration

---

## Phase 5: Bug Fixes & CyberFoil Compatibility ✅ COMPLETE

### API Compliance Fixes
- [x] Fixed `app_type` field to use numeric values (0=BASE, 1=DLC, 2=UPDATE, 3=DEMO)
  - [x] Updated type definition in `src/types/index.ts`
  - [x] Updated identification logic in `src/lib/identification.ts`
  - [x] Updated shop service in `src/services/shop.ts`
  - [x] Updated all tests to use numeric values
  - [x] Complies with CyberFoil API specification

### Updates Section Fix
- [x] Fixed `app_id` field to use actual title ID instead of sequential number
- [x] Fixed `title_id` field to point to base game (for proper client-side linking)
- [x] Updates now properly grouped by base title_id with latest version tracking
- [x] Verified proper structure: UPDATE has `title_id=base`, `app_id=update_titleid`, `app_type=2`

### DLC Section Fix
- [x] Fixed `app_id` field to use DLC's own title ID
- [x] Fixed `title_id` field to point to base game
- [x] DLC properly populated and structured for CyberFoil consumption
- [x] Verified proper structure: DLC has `title_id=base`, `app_id=dlc_titleid`, `app_type=1`

### Testing
- [x] Added comprehensive integration tests (`tests/integration/shop-sections.test.ts`)
- [x] Tests verify Updates section structure and content
- [x] Tests verify DLC section structure and content
- [x] Tests verify updates have Y800 suffix pattern
- [x] Tests verify numeric `app_type` values (0, 1, 2)
- [x] All 8 new tests passing (100%)
- [x] No regressions in existing tests

### Known Working Examples
- Base game: `title_id=0100B2C00682E000`, `app_id=0100B2C00682E000`, `app_type=0`
- Update: `title_id=0100B2C00682E000`, `app_id=0100B2C00682E800`, `app_type=2`
- DLC: `title_id=0100AEA0250EA000`, `app_id=0100AEA0250EB001`, `app_type=1`

---

## Phase 6: Save Synchronization (MVP) ✅ COMPLETE

### Tasks
- [x] Implement `/api/saves/list` endpoint
  - [x] Returns `{ "saves": [] }` when no saves available
  - [x] Accepts CyberFoil standard headers (Theme, UID, Version, Language, HAUTH, UAUTH)
  - [x] Supports GET and HEAD methods
  - [x] Ready for future enhancement with actual save data

### Completed Files
- `src/routes/handlers/saves.ts` - Save list endpoint handler
- `src/routes/index.ts` - Save route registration

### Updated Documentation
- [x] Updated CYBERFOIL.md with `/api/saves/list` endpoint documentation

### Remaining Tasks (Phase 7 and beyond)
- [ ] Implement `/api/saves/upload` endpoint
- [ ] Implement `/api/saves/download` endpoint
- [ ] Implement `/api/saves/delete` endpoint
- [ ] Add comprehensive unit tests for TitleDB service
- [ ] Add tests for media endpoints
- [ ] Add tests for save endpoints
- [ ] Performance testing with large libraries
- [ ] Handle edge cases (corrupted files, missing TitleDB entries)
- [ ] Test with actual CyberFoil client (now should display updates/DLC properly)

---

## Configuration Requirements

### New Environment Variables
```bash
# TitleDB
TITLEDB_REGION=US              # Region for TitleDB (US, EU, JP, etc.)
TITLEDB_LANGUAGE=en            # Language code (en, es, fr, de, etc.)
TITLEDB_CACHE_DIR=./data/titledb  # TitleDB cache directory
TITLEDB_AUTO_UPDATE=true       # Auto-download TitleDB on startup

# Media Cache
MEDIA_CACHE_DIR=./data/media   # Icon/banner cache directory
MEDIA_CACHE_TTL=604800         # Media cache TTL in seconds (7 days)
```

---

## Success Criteria

CyberFoil displays enriched game library with:
- ✅ Real game titles (not filenames)
- ✅ Game cover artwork
- ✅ Category tags
- ✅ Version information
- ✅ Update/DLC detection and grouping
- ✅ Screenshots (if implemented)

---

## Notes

### Reference Implementation
- AeroFoil project used as API contract reference
- TitleDB structure matches AeroFoil's expectations
- File identification approach can be simplified for MVP

### Performance Considerations
- TitleDB datasets can be large (multi-GB for full artifacts)
- Consider lazy-loading or streaming for initial implementation
- Indexed lookups critical for large libraries

### Future Enhancements
- Multi-region TitleDB support
- User-configurable title overrides
- Custom artwork injection
- Automatic update notifications
- **Stable file ID persistence** (hash-based or database-backed to survive file additions/deletions)
