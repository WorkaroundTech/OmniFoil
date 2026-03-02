# File Override System - Quick Reference

## Overview
The override system allows you to manually specify metadata for files with non-standard names that cannot be automatically identified by the system.

## Key Features
- **Distributed**: Override files live alongside your game files
- **Smart Resolution**: Specify minimal data (title name + type), system looks up the rest
- **Portable**: Move directories without updating central config
- **Flexible**: Support for both minimal and full manual specification

## Quick Start

### 1. Create Override File
Place `omnifoil-overrides.json` in the same directory as your game files:

```json
{
  "overrides": {
    "your-badly-named-file.nsp": {
      "titleName": "The Legend of Zelda: Tears of the Kingdom",
      "appType": "UPDATE",
      "version": "393216"
    }
  }
}
```

### 2. Restart Server
Override changes require a server restart or cache refresh (wait for CACHE_TTL).

### 3. Verify
Check the logs for messages like:
```
[OVERRIDES] Loaded 1 overrides from /path/to/omnifoil-overrides.json
[OVERRIDES] Resolved override for your-badly-named-file.nsp: The Legend of Zelda: Tears of the Kingdom -> 0100F2C0115B6800 (appType: 2)
```

## AppType Values
- `"GAME"` or `"BASE"` or `0` = Base game
- `"DLC"` or `1` = Downloadable content
- `"UPDATE"` or `"PATCH"` or `2` = Game update/patch
- `"DEMO"` or `3` = Demo version

All string values are case-insensitive (e.g., "update", "Update", "UPDATE" all work).

## Resolution Modes

### Mode 1: Minimal (Smart Resolution) ✅ Recommended
Specify only what you know, system finds the rest:
```json
{
  "titleName": "Game Title",
  "appType": "UPDATE",
  "version": "393216"
}
```
System automatically:
- Searches TitleDB for the game
- Converts title ID based on appType
- Derives baseTitleId for updates/DLC
- Fetches artwork and metadata

### Mode 2: Full Manual
Specify everything explicitly:
```json
{
  "titleId": "0100F2C0115B6800",
  "appType": "UPDATE",
  "titleName": "Custom Name",
  "baseTitleId": "0100F2C0115B6000",
  "version": "393216",
  "category": ["Action", "RPG"],
  "iconUrl": "https://example.com/icon.jpg",
  "bannerUrl": "https://example.com/banner.jpg"
}
```

## Real World Example

**Problem:** File named `sxs-the_legend_of_zelda_tears_of_the_kingdom_v393216.nsp`
- Cannot be automatically identified (no title ID in brackets)
- Storage system won't allow renaming
- Shows as generic game with random app_id

**Solution:** Create `omnifoil-overrides.json`:
```json
{
  "overrides": {
    "sxs-the_legend_of_zelda_tears_of_the_kingdom_v393216.nsp": {
      "titleName": "The Legend of Zelda: Tears of the Kingdom",
      "appType": "UPDATE",
      "version": "393216"
    }
  }
}
```

**Result:**
- Correctly identified as Zelda: TotK update
- Proper title ID and metadata
- Artwork displays correctly
- Grouped with base game in shop

## Configuration

### Environment Variables
```bash
# Override filename (default: omnifoil-overrides.json)
OVERRIDE_FILENAME=omnifoil-overrides.json

# Enable/disable overrides (default: true)
OVERRIDES_ENABLED=true
```

## Troubleshooting

### Override not applied
- Check filename matches exactly (case-sensitive)
- Verify JSON syntax is valid
- Restart server or wait for cache to expire
- Check logs for error messages

### Smart resolution failed
- Ensure TitleDB is enabled (`TITLEDB_ENABLED=true`)
- Verify title name matches TitleDB entry
- Try more specific or exact title name
- Fall back to manual specification with explicit titleId

### Multiple titles with same name
- System uses first match from TitleDB
- Use explicit `titleId` for exact control
- Check logs for which title was matched

## Examples

See [docs/omnifoil-overrides-example.json](omnifoil-overrides-example.json) for comprehensive examples.

## Architecture

**Override Resolution Pipeline:**
1. File scanned during catalog build
2. Check for override file in same directory
3. Load and cache overrides per directory
4. If override found, resolve with smart lookup
5. Merge with TitleDB data (override takes precedence)
6. Apply to catalog entry

**Smart Resolution Flow:**
```
titleName + appType
    ↓
Search TitleDB
    ↓
Find base game title ID
    ↓
Convert to correct type (BASE/UPDATE/DLC)
    ↓
Derive baseTitleId if needed
    ↓
Fetch metadata from TitleDB
```
