#!/bin/bash

# Integration test script for HTTP Range Request support in OmniFoil

set -e

# Get the project root directory (two levels up from this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TEST_DIR="/tmp/OmniFoil-range-test"
TEST_FILE="$TEST_DIR/test-game.nsp"
PORT=4321

# Cleanup function
cleanup() {
    echo "Cleaning up..."
    rm -rf "$TEST_DIR"
}

trap cleanup EXIT

# Setup test environment
echo "Setting up test environment..."
mkdir -p "$TEST_DIR"

# Create a 10MB test file
echo "Creating 10MB test file..."
dd if=/dev/zero of="$TEST_FILE" bs=1M count=10 2>/dev/null

echo "Test file created: $(ls -lh $TEST_FILE | awk '{print $5}')"

# Start OmniFoil server in background
echo "Starting OmniFoil server on port $PORT..."
cd "$PROJECT_ROOT"
export PORT=$PORT
export GAMES_DIRS="$TEST_DIR"
timeout 30 bun src/server.ts &
SERVER_PID=$!

# Give server time to start
sleep 2

# Function to test range request
test_range_request() {
    local range="$1"
    local description="$2"
    
    echo ""
    echo "Testing: $description"
    echo "Range: $range"
    
    curl -s -i \
        -H "Range: $range" \
        "http://localhost:$PORT/files/tinfoil-range-test/test-game.nsp" \
        -o /tmp/response.bin 2>&1 | head -20
    
    echo "Response file size: $(ls -lh /tmp/response.bin 2>/dev/null | awk '{print $5}' || echo 'N/A')"
}

# Test 1: Full file request (no range)
echo ""
echo "=== Test 1: Full file request (no range) ==="
curl -s -i "http://localhost:$PORT/files/tinfoil-range-test/test-game.nsp" -o /dev/null 2>&1 | grep -E "HTTP|Accept-Ranges|Content-Length" | head -5

# Test 2: First 1MB
echo ""
echo "=== Test 2: First 1MB (bytes=0-1048575) ==="
test_range_request "bytes=0-1048575" "First 1MB"

# Test 3: Last 1MB
echo ""
echo "=== Test 3: Last 1MB (bytes=9437184-10485759) ==="
test_range_request "bytes=9437184-10485759" "Last 1MB"

# Test 4: Middle 1MB
echo ""
echo "=== Test 4: Middle 1MB (bytes=4718592-5767167) ==="
test_range_request "bytes=4718592-5767167" "Middle 1MB"

# Test 5: Open-ended range
echo ""
echo "=== Test 5: Open-ended range (bytes=9437184-) ==="
test_range_request "bytes=9437184-" "From 9MB to end"

# Test 6: Suffix range
echo ""
echo "=== Test 6: Suffix range (bytes=-1048576) ==="
test_range_request "bytes=-1048576" "Last 1MB via suffix"

# Test 7: Invalid range (should return 416)
echo ""
echo "=== Test 7: Invalid range - start >= file size ==="
curl -s -i -H "Range: bytes=10485760-" "http://localhost:$PORT/files/tinfoil-range-test/test-game.nsp" 2>&1 | grep -E "HTTP|Content-Range" | head -3

# Test 8: Multi-range (should return 416)
echo ""
echo "=== Test 8: Multi-range request (unsupported) ==="
curl -s -i -H "Range: bytes=0-1048575, 5242880-6291455" "http://localhost:$PORT/files/tinfoil-range-test/test-game.nsp" 2>&1 | grep -E "HTTP|Content-Range" | head -3

echo ""
echo "=== All tests completed ==="

# Kill server
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
