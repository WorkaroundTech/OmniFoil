# Troubleshooting Guide

This guide covers common issues, error messages, and their solutions when running OmniFoil.

## Table of Contents

- [Server Issues](#server-issues)
- [File Access Issues](#file-access-issues)
- [Authentication Problems](#authentication-problems)
- [Range Request Errors](#range-request-errors)
- [Docker Issues](#docker-issues)
- [Tinfoil Client Issues](#tinfoil-client-issues)
- [Performance Issues](#performance-issues)
- [Network Issues](#network-issues)
- [Logging and Debugging](#logging-and-debugging)

---

## Server Issues

### Server Won't Start

#### Error: "GAMES_DIRECTORY environment variable is required"

**Cause:** Missing required configuration

**Solution:**
```bash
# Set GAMES_DIRECTORY
export GAMES_DIRECTORY=/path/to/games

# Or with Docker Compose
# Add to docker-compose.yml:
environment:
  - GAMES_DIRECTORY=/games
```

#### Error: "Port 3000 is already in use"

**Cause:** Another process is using the port

**Solution:**
```bash
# Find process using port
lsof -i :3000
# Or on Linux:
sudo netstat -tulpn | grep :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=8080 bun run src/main.ts
```

#### Error: "Directory does not exist: /path/to/games"

**Cause:** Configured directory doesn't exist

**Solution:**
```bash
# Check if directory exists
ls -la /path/to/games

# Create directory if needed
mkdir -p /path/to/games

# Verify path is correct
echo $GAMES_DIRECTORY

# Fix typos in path
export GAMES_DIRECTORY=/correct/path/to/games
```

#### Error: "Cannot read directory: /path/to/games"

**Cause:** Permission denied on directory

**Solution:**
```bash
# Check permissions
ls -ld /path/to/games

# Add read permission
chmod +r /path/to/games
chmod +x /path/to/games  # Execute needed to list directory

# Recursively fix permissions
chmod -R +rX /path/to/games

# Or change ownership
sudo chown -R $USER:$USER /path/to/games
```

#### Server Crashes on Startup

**Check logs for error messages:**
```bash
# Run with verbose logging
LOG_FORMAT=dev GAMES_DIRECTORY=/path bun run src/main.ts

# Check TypeScript errors
bun lint

# Verify Bun installation
bun --version
```

---

## File Access Issues

### Files Not Showing in Tinfoil

#### Issue: Shop.json is empty

**Possible Causes:**
1. No game files in configured directories
2. Wrong file extensions
3. Cache showing stale data

**Solutions:**
```bash
# 1. Verify files exist
ls -R /path/to/games

# 2. Check file extensions
# Supported: .nsp, .nsz, .xci, .xciz
find /path/to/games -type f \( -name "*.nsp" -o -name "*.nsz" -o -name "*.xci" -o -name "*.xciz" \)

# 3. Clear cache by restarting server
docker restart OmniFoil

# Or disable cache temporarily
CACHE_TTL=0 bun run src/main.ts

# 4. Check shop.json response
curl http://localhost:3000/shop.json | jq .
```

#### Issue: Some files missing from shop.json

**Possible Causes:**
1. Permission issues on specific files
2. Symlinks not resolved
3. Hidden/system files

**Solutions:**
```bash
# Check file permissions
ls -la /path/to/games/

# Make files readable
chmod +r /path/to/games/*.nsp

# Verify file extensions (case-sensitive)
# .NSP vs .nsp - OmniFoil expects lowercase

# Rename if needed
rename 's/\.NSP$/.nsp/' *.NSP
```

#### Issue: Recently added files not appearing

**Cause:** Cache is serving stale data

**Solutions:**
```bash
# Option 1: Restart server
docker restart OmniFoil

# Option 2: Reduce cache TTL
CACHE_TTL=60  # 1 minute

# Option 3: Disable cache for testing
CACHE_TTL=0

# Option 4: Wait for cache to expire
# Default TTL is 300 seconds (5 minutes)
```

### File Download Fails

#### Error: "File not found" (404)

**Possible Causes:**
1. File was moved/deleted after cache was populated
2. Incorrect virtual path
3. Path traversal blocked

**Solutions:**
```bash
# 1. Verify file still exists
ls -la /path/to/games/filename.nsp

# 2. Check file path in shop.json
curl http://localhost:3000/shop.json | jq '.files[]'

# 3. Try direct URL
curl -I "http://localhost:3000/files/games/filename.nsp"

# 4. Check for special characters
# URL must be properly encoded
curl -I "http://localhost:3000/files/games/Super%20Mario%20Odyssey.nsp"
```

#### Issue: Download starts but fails midway

**Possible Causes:**
1. Network interruption
2. Range request error
3. Disk space issue on target

**Solutions:**
```bash
# 1. Check server logs for errors
docker logs OmniFoil

# 2. Test range request support
curl -H "Range: bytes=0-1023" http://localhost:3000/files/games/test.nsp

# 3. Verify file integrity on server
md5sum /path/to/games/filename.nsp

# 4. Check disk space
df -h /path/to/games
```

#### Issue: Downloads are very slow

**See [Performance Issues](#performance-issues)** below.

---

## Authentication Problems

### Error: "Unauthorized" (401)

#### Issue: Cannot access server with credentials

**Possible Causes:**
1. Incorrect username/password
2. Wrong authentication format
3. Credentials not URL-encoded

**Solutions:**
```bash
# 1. Verify credentials are set
echo $AUTH_USER
echo $AUTH_PASS

# 2. Test with curl
curl -u "username:password" http://localhost:3000/shop.json

# 3. Check Base64 encoding
echo -n "username:password" | base64
# Use in header: Authorization: Basic <base64>

# 4. Special characters in password
# Must be URL-encoded in some clients
# Password: "p@ss:word" → encode as "p%40ss%3Aword"
```

#### Issue: Tinfoil client authentication fails

**Solutions:**
1. **Check URL format:**
   ```
   http://username:password@192.168.1.100:3000/shop.json
   ```

2. **Use AUTH_CREDENTIALS format:**
   ```bash
   AUTH_CREDENTIALS=username:password
   ```

3. **Test authentication with curl:**
   ```bash
   curl -u "user:pass" http://server:3000/shop.json
   ```

4. **Special characters:** Avoid `:` and `@` in passwords, or URL-encode them

#### Issue: Authentication works in browser but not in Tinfoil

**Cause:** Tinfoil may handle auth differently

**Solution:**
```bash
# 1. Try disabling auth for testing
# Comment out AUTH_USER and AUTH_PASS
# Restart server

# 2. Use simpler credentials (no special chars)
AUTH_USER=tinfoil
AUTH_PASS=password123

# 3. Verify Tinfoil URL format
# In Tinfoil: Protocol → Add → Enter URL with auth
# Format: http://user:pass@host:port/
```

---

## Range Request Errors

### Error: "Range not satisfiable" (416)

#### Issue: Client requests invalid byte range

**Causes:**
1. Range start exceeds file size
2. Range end before range start
3. Corrupted resume attempt

**Solutions:**
```bash
# 1. Check file size
ls -lh /path/to/games/filename.nsp

# 2. Test valid range
curl -H "Range: bytes=0-1023" http://localhost:3000/files/games/test.nsp

# 3. Client should detect file size first
curl -I http://localhost:3000/files/games/test.nsp
# Check Content-Length header

# 4. In Tinfoil, delete partial download and restart
```

#### Issue: Resume download fails

**Solutions:**
```bash
# 1. Get file size
SIZE=$(curl -sI http://localhost:3000/files/game.nsp | grep -i content-length | awk '{print $2}' | tr -d '\r')

# 2. Get partial file size
DOWNLOADED=$(stat -f%z game.nsp.part)  # macOS
# Or
DOWNLOADED=$(stat -c%s game.nsp.part)  # Linux

# 3. Resume from downloaded position
curl -H "Range: bytes=$DOWNLOADED-" -o game.nsp.part http://localhost:3000/files/game.nsp
```

### Multi-Range Requests

**Error:** Server returns 200 instead of 206 for multi-range request

**Cause:** OmniFoil doesn't support multi-range requests (this is intentional)

**Behavior:**
```bash
# Single range - supported
curl -H "Range: bytes=0-1023" → 206 Partial Content

# Multi-range - not supported
curl -H "Range: bytes=0-1023,2048-3071" → 200 OK (full file)
```

**Solution:** Clients should use single-range requests only

---

## Docker Issues

### Container Won't Start

#### Error: "No such file or directory" when mounting volumes

**Cause:** Source path doesn't exist on host

**Solution:**
```yaml
# In docker-compose.yml
volumes:
  - /correct/path/on/host:/games:ro
  #   ^^^^^^^^^^^^^^^^^^^^^ must exist on host

# Create directory first
mkdir -p /path/on/host

# Then start container
docker compose up -d
```

#### Error: "Permission denied" in container

**Cause:** Container user doesn't have read access

**Solution:**
```bash
# Option 1: Fix host permissions
chmod -R +rX /path/to/games

# Option 2: Run container as specific user
# In docker-compose.yml:
user: "1000:1000"  # Your UID:GID

# Find your UID/GID
id -u  # UID
id -g  # GID

# Option 3: Use read-only volumes (already done)
volumes:
  - /path:/games:ro
```

#### Issue: Container restarts constantly

**Check logs:**
```bash
# View container logs
docker logs OmniFoil

# Follow logs in real-time
docker logs -f OmniFoil

# Check last 50 lines
docker logs --tail 50 OmniFoil
```

**Common causes:**
- Missing environment variables
- Invalid configuration
- Port conflict

### Volume Mount Issues

#### Issue: Files not visible in container

**Solution:**
```bash
# 1. Verify mount is correct
docker inspect OmniFoil | grep -A 10 Mounts

# 2. Check files exist on host
ls /host/path/to/games

# 3. Exec into container and check
docker exec -it OmniFoil sh
ls /games  # Should show files

# 4. Verify volume syntax
volumes:
  - /host/path:/container/path:ro
  #             ^^^^^^^^^^^^^^^^^ container path must match GAMES_DIRECTORY
```

#### Issue: Updates to files not reflected

**Cause:** Volume is cached

**Solution:**
```bash
# Restart container
docker restart OmniFoil

# Or rebuild
docker compose down
docker compose up --build -d
```

---

## Tinfoil Client Issues

### Cannot Add Shop to Tinfoil

#### Issue: "Failed to connect to server"

**Solutions:**
```bash
# 1. Verify server is running
curl http://server:3000/shop.json

# 2. Check firewall
# Allow port 3000 inbound

# 3. Verify network connectivity
ping server-ip

# 4. Check URL format in Tinfoil
# Format: http://server-ip:3000/
# NOT: http://server-ip:3000/shop.json

# 5. Try IP address instead of hostname
# Use: http://192.168.1.100:3000/
# Not: http://server-name:3000/
```

#### Issue: "Invalid shop format"

**Solutions:**
```bash
# 1. Verify shop.json format
curl http://server:3000/shop.json | jq .

# Expected structure:
{
  "files": [...],
  "directories": [...]
}

# 2. Check for syntax errors
# Should be valid JSON

# 3. Try /shop.tfl endpoint instead
# In Tinfoil, use: http://server:3000/shop.tfl
```

### Games Not Installing

#### Issue: Downloads start but fail during installation

**Not a server issue** - Check:
1. Nintendo Switch storage space
2. SD card errors
3. Game file integrity (verify MD5/SHA256)
4. Tinfoil version compatibility

**Server-side verification:**
```bash
# Check file integrity
md5sum /path/to/games/filename.nsp

# Verify file size
ls -lh /path/to/games/filename.nsp

# Check server logs for errors during transfer
docker logs OmniFoil | grep ERROR
```

---

## Performance Issues

### Slow Shop Loading

#### Issue: Tinfoil takes long time to load shop

**Causes:**
1. Large library (many files)
2. Cache disabled or expired
3. Network mount latency
4. Slow disk I/O

**Solutions:**
```bash
# 1. Enable caching with longer TTL
CACHE_TTL=3600  # 1 hour

# 2. Check directory scan time
time curl http://localhost:3000/shop.json

# 3. Monitor server logs
LOG_FORMAT=dev  # Shows response time

# 4. For network mounts, cache locally
# Or increase CACHE_TTL to reduce scans

# 5. Check disk performance
hdparm -t /dev/sdX  # Linux
```

**Expected scan times:**
- 100 files: <100ms
- 1,000 files: <500ms
- 10,000 files: 1-5 seconds (first scan)

### Slow File Downloads

#### Issue: Downloads slower than expected

**Solutions:**
```bash
# 1. Test server performance
curl -o /dev/null http://server:3000/files/games/test.nsp

# 2. Check network bandwidth
iperf3 -s  # On server
iperf3 -c server-ip  # On client

# 3. Verify no rate limiting
# OmniFoil has no built-in rate limiting

# 4. Check Docker network mode
# In docker-compose.yml, use host network for best performance:
network_mode: "host"

# 5. Monitor server resources
top  # Check CPU/memory usage
iostat  # Check disk I/O
```

### High Memory Usage

**Cause:** Large cache or many concurrent connections

**Solutions:**
```bash
# 1. Reduce cache TTL
CACHE_TTL=300  # 5 minutes

# 2. Monitor memory
docker stats OmniFoil

# 3. Set memory limit (Docker)
mem_limit: 256m  # In docker-compose.yml

# 4. Restart periodically
# Add to docker-compose.yml:
restart: unless-stopped
```

---

## Network Issues

### Cannot Access Server from Switch

#### Issue: Switch can't reach server

**Solutions:**
```bash
# 1. Check server is listening
netstat -tulpn | grep :3000
# Should show: LISTEN on 0.0.0.0:3000

# 2. Verify firewall rules
# Allow port 3000
sudo ufw allow 3000/tcp  # Ubuntu
firewall-cmd --add-port=3000/tcp  # CentOS/RHEL

# 3. Check network routing
# Server and Switch must be on same network
# Or have route between networks

# 4. Test from another device on same network
curl http://server-ip:3000/shop.json

# 5. Verify Docker port mapping
docker ps  # Check PORTS column
# Should show: 0.0.0.0:3000->3000/tcp
```

#### Issue: Works on local network but not remotely

**Solutions:**
```bash
# 1. Set up port forwarding on router
# Forward external port 3000 → internal IP:3000

# 2. Use VPN for secure remote access
# OpenVPN, WireGuard, Tailscale, etc.

# 3. Check ISP firewall/CGNAT
# May need business internet or VPN

# 4. Use reverse proxy with HTTPS
# Nginx, Traefik, Caddy
```

### SSL/TLS Issues

**Note:** OmniFoil doesn't support HTTPS (Tinfoil limitation)

**For secure access:**
1. Use VPN (WireGuard, Tailscale)
2. Restrict to local network only
3. Use reverse proxy with HTTPS (for browser access)

---

## Logging and Debugging

### Enable Detailed Logging

```bash
# Use dev format for colored output
LOG_FORMAT=dev bun run src/main.ts

# Or use combined for detailed logs
LOG_FORMAT=combined GAMES_DIRECTORY=/path bun run src/main.ts
```

### Reading Logs

```bash
# Docker logs
docker logs -f OmniFoil

# Grep for errors
docker logs OmniFoil | grep -i error

# Show only last 100 lines
docker logs --tail 100 OmniFoil

# Follow logs with timestamp
docker logs -f --timestamps OmniFoil
```

### Log Analysis

**Look for:**
- **404 errors:** File not found (check paths)
- **401 errors:** Auth failures (check credentials)
- **416 errors:** Range issues (client problem usually)
- **500 errors:** Server errors (check for bugs)

**Example log patterns:**
```bash
# Find all 404s
docker logs OmniFoil | grep " 404 "

# Find all errors
docker logs OmniFoil | grep -E " (4|5)[0-9]{2} "

# Find slow requests (>1 second)
docker logs OmniFoil | grep -E "[0-9]{4,} ms"
```

### Debug Mode

For development debugging:

```bash
# Add debug output to code
console.log('Debug:', variable)
console.error('Error:', error)

# Use Bun debugger
bun --inspect src/main.ts

# Or use Chrome DevTools
# Navigate to: chrome://inspect
```

---

## Getting Help

### Before Asking for Help

1. **Check logs:** `docker logs OmniFoil`
2. **Verify configuration:** Review environment variables
3. **Test endpoints:** Use curl to test shop.json and file downloads
4. **Check documentation:** Review README and docs/
5. **Search issues:** Check GitHub issues for similar problems

### Reporting Issues

When opening an issue, include:

1. **Server information:**
   ```bash
   bun --version
   docker --version  # If using Docker
   uname -a  # OS info
   ```

2. **Configuration (sanitized):**
   ```bash
   # Remove passwords!
   PORT=3000
   GAMES_DIRECTORY=/mnt/games
   CACHE_TTL=300
   LOG_FORMAT=dev
   AUTH_USER=***
   ```

3. **Error logs:**
   ```bash
   docker logs --tail 50 OmniFoil
   ```

4. **Steps to reproduce:**
   - What you did
   - What you expected
   - What actually happened

5. **Relevant test commands:**
   ```bash
   curl -v http://server:3000/shop.json
   ```

### Useful Diagnostic Commands

```bash
# Test shop endpoint
curl -v http://localhost:3000/shop.json

# Test authentication
curl -u "user:pass" http://localhost:3000/shop.json

# Test file download
curl -I http://localhost:3000/files/games/test.nsp

# Test range request
curl -H "Range: bytes=0-1023" http://localhost:3000/files/games/test.nsp

# Check server health
curl http://localhost:3000/health

# View file list with sizes
curl -s http://localhost:3000/shop.json | jq '.files[] | {url, size}'

# Count files in shop
curl -s http://localhost:3000/shop.json | jq '.files | length'
```

---

## Quick Fixes Checklist

**Server won't start:**
- [ ] `GAMES_DIRECTORY` is set
- [ ] Directory exists and is readable
- [ ] Port is not already in use
- [ ] No TypeScript errors (`bun lint`)

**Files not showing:**
- [ ] Files have correct extensions (.nsp, .nsz, .xci, .xciz)
- [ ] Files are readable
- [ ] Cache has expired (wait or restart)
- [ ] Check shop.json response

**Authentication failing:**
- [ ] Credentials are set correctly
- [ ] No typos in username/password
- [ ] Special characters are URL-encoded
- [ ] Format is correct in Tinfoil

**Downloads failing:**
- [ ] File exists on server
- [ ] Enough disk space on Switch
- [ ] Network is stable
- [ ] No firewall blocking

**Performance issues:**
- [ ] Cache is enabled (`CACHE_TTL > 0`)
- [ ] Network mount is fast
- [ ] No other heavy processes running
- [ ] Adequate server resources

For issues not covered here, check the [GitHub Issues](https://github.com/WorkaroundTech/OmniFoil/issues) or open a new one.
