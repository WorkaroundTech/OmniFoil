# Development Guide

This guide covers local development setup, testing, code organization, and contribution guidelines for OmniFoil.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Adding Features](#adding-features)
- [Contributing](#contributing)

---

## Prerequisites

### Required

- **[Bun](https://bun.sh/)** v1.0 or higher
  - JavaScript runtime and toolkit
  - Alternative to Node.js with native TypeScript support
  - Install: `curl -fsSL https://bun.sh/install | bash`

### Optional

- **Docker** and **Docker Compose** (for containerized development)
- **Git** (for version control)
- **VS Code** (recommended IDE)

### Verify Installation

```bash
# Check Bun version
bun --version
# Should output: 1.0.0 or higher

# Check TypeScript support
bun run --version
```

---

## Local Setup

### 1. Clone Repository

```bash
git clone https://github.com/WorkaroundTech/OmniFoil.git
cd OmniFoil
```

### 2. Install Dependencies

```bash
# OmniFoil has zero runtime dependencies!
# This only installs dev dependencies (TypeScript, testing tools)
bun install
```

### 3. Set Up Test Data

Create a test games directory:

```bash
mkdir -p test-games
cd test-games

# Create some dummy files for testing
touch "Super Mario Odyssey.nsp"
touch "The Legend of Zelda.nsz"
touch "Mario Kart 8.xci"

cd ..
```

**Optional:** Set up TitleDB test data directory:
```bash
mkdir -p data/titledb
mkdir -p data/media/icons
mkdir -p data/media/banners
```

### 4. Configure Environment

Create a `.env.local` file (not committed to git):

```bash
# .env.local
PORT=3000
GAMES_DIRECTORY=./test-games
CACHE_TTL=0
LOG_FORMAT=dev
# Leave auth empty for local testing

# TitleDB (optional for development)
TITLEDB_ENABLED=true
TITLEDB_REGION=US
TITLEDB_LANGUAGE=en
TITLEDB_CACHE_DIR=./data/titledb
TITLEDB_AUTO_UPDATE=true

# Media cache (optional for development)
MEDIA_CACHE_DIR=./data/media
MEDIA_CACHE_TTL=604800
```

### 5. Run Development Server

```bash
# Option 1: Direct execution
GAMES_DIRECTORY=./test-games bun run src/main.ts

# Option 2: Use npm script
bun start

# Option 3: Watch mode (auto-reload on changes)
bun run --watch src/main.ts
```

### 6. Verify Server

Open browser to `http://localhost:3000` or:

```bash
curl http://localhost:3000/shop.json
```

Expected response:
```json
{
  "files": [...],
  "directories": ["test-games"]
}
```

---

## Project Structure

```
OmniFoil/
├── src/                      # Source code
│   ├── main.ts              # Entry point (starts server)
│   ├── app.ts               # App composition (middleware chain)
│   ├── index.html           # Browser UI template
│   ├── config/              # Configuration
│   │   └── index.ts         # Load & validate env variables
│   ├── lib/                 # Utility libraries
│   │   ├── auth.ts          # Authentication helpers
│   │   ├── cache.ts         # In-memory caching
│   │   ├── identification.ts # File title ID extraction
│   │   ├── logger.ts        # Logging formats
│   │   ├── media-cache.ts   # Media file caching
│   │   ├── paths.ts         # Path resolution & encoding
│   │   └── range.ts         # HTTP Range parsing
│   ├── middleware/          # Middleware functions
│   │   ├── authorize.ts     # Auth middleware
│   │   ├── compose.ts       # Middleware composition
│   │   ├── error-handler.ts # Error catching
│   │   ├── index.ts         # Middleware exports
│   │   ├── logging.ts       # Request/response logging
│   │   ├── method-validator.ts # HTTP method validation
│   │   └── timing.ts        # Performance timing
│   ├── routes/              # Routing & handlers
│   │   ├── index.ts         # Router implementation
│   │   ├── utils.ts         # Route utilities
│   │   └── handlers/        # Request handlers
│   │       ├── cyberfoil.ts # CyberFoil API handlers
│   │       ├── files.ts     # File download handler
│   │       ├── index.ts     # Index/shop handlers
│   │       ├── media.ts     # Media (icon/banner) handlers
│   │       ├── saves.ts     # Save synchronization handlers
│   │       └── shop.ts      # Shop data generation
│   ├── services/            # Business logic
│   │   ├── shop.ts          # Shop data service
│   │   └── titledb.ts       # TitleDB integration
│   └── types/               # TypeScript types
│       └── index.ts         # Type definitions
├── tests/                   # Test suite
│   ├── unit/                # Unit tests
│   │   ├── cache.test.ts
│   │   ├── config.test.ts
│   │   ├── logger.test.ts
│   │   ├── middleware.test.ts
│   │   ├── paths.test.ts
│   │   ├── range.test.ts
│   │   ├── lib/
│   │   │   ├── identification.test.ts
│   │   │   └── shop.test.ts
│   │   └── routes/
│   │       ├── cyberfoil.test.ts
│   │       ├── files.test.ts
│   │       ├── index.test.ts
│   │       ├── media.test.ts
│   │       ├── saves.test.ts
│   │       └── shop.test.ts
│   │   └── services/
│   │       └── titledb.test.ts
│   ├── integration/         # Integration tests
│   │   ├── method-validation.test.ts
│   │   ├── range-integration.test.ts
│   │   └── server.test.ts
│   └── scripts/             # Test utilities
│       └── test-ranges.sh
├── docs/                    # Documentation
│   ├── api-reference.md
│   ├── architecture.md
│   ├── configuration.md
│   ├── development.md
│   ├── http-method-validation.md
│   └── troubleshooting.md
├── docker-compose.yml       # Docker Compose config
├── Dockerfile               # Docker image definition
├── package.json             # Project metadata & scripts
├── tsconfig.json            # TypeScript configuration
├── shop_template.jsonc      # Shop JSON format reference
└── README.md                # Main documentation
```

### Key Directories

**`src/`** - All application source code
- Organized by functional area (lib, middleware, routes, services)
- Each module has a single, clear responsibility
- New modules: `identification.ts` (file metadata extraction), `media-cache.ts` (artwork caching), `titledb.ts` (metadata service)

**`tests/`** - Test suite
- **Unit tests:** Test individual functions/modules in isolation
- **Integration tests:** Test full request/response cycle
- Coverage for new CyberFoil features (sections, media, TitleDB)

**`docs/`** - Comprehensive documentation

---

## Development Workflow

### Available Scripts

Defined in `package.json`:

```bash
# Start server
bun start              # Run src/main.ts
bun start:dev          # Run with --watch (auto-reload)

# Type checking
bun lint               # Run TypeScript compiler (no emit)

# Testing
bun test               # Run all tests
bun test:watch         # Run tests in watch mode
bun test:coverage      # Run tests with coverage report

# Docker
bun docker:build       # Build Docker image
bun docker:run         # Run container
```

### Development Cycle

1. **Make changes** to source files in `src/`
2. **Watch mode auto-reloads** (if using `bun start:dev`)
3. **Test changes** with `bun test` or curl
4. **Check types** with `bun lint`
5. **Commit changes** with clear commit messages

### Hot Reload

Bun's watch mode (`--watch`) automatically restarts on file changes:

```bash
bun run --watch src/main.ts
```

**Watches:**
- All TypeScript files in `src/`
- Automatically recompiles and restarts

**Note:** Configuration changes (env variables) require manual restart.

---

## Testing

### Test Framework

- **Bun Test:** Built-in testing framework
- **Syntax:** Jest-compatible API
- **Speed:** Extremely fast (parallel execution)

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/unit/cache.test.ts

# Run tests matching pattern
bun test --grep "range"

# Watch mode (re-run on changes)
bun test --watch

# Coverage report
bun test --coverage
```

### Test Organization

#### Unit Tests (`tests/unit/`)

Test individual functions/modules in isolation.

**Example: Cache Tests**

```typescript
// tests/unit/cache.test.ts
import { describe, test, expect } from 'bun:test'
import { Cache } from '../../src/lib/cache'

describe('Cache', () => {
  test('should store and retrieve data', () => {
    const cache = new Cache<string>(1000) // 1 second TTL
    cache.set('test data')
    
    expect(cache.get()).toBe('test data')
  })
  
  test('should expire after TTL', async () => {
    const cache = new Cache<string>(100) // 100ms TTL
    cache.set('test data')
    
    await new Promise(resolve => setTimeout(resolve, 150))
    
    expect(cache.isValid()).toBe(false)
  })
})
```

**Coverage:**
- `cache.test.ts` - Cache TTL and expiration
- `config.test.ts` - Config loading and validation
- `logger.test.ts` - Log format generation
- `paths.test.ts` - Path encoding and aliasing
- `range.test.ts` - Range parsing logic
- `middleware.test.ts` - Middleware composition
- `routes/*.test.ts` - Route handlers

#### Integration Tests (`tests/integration/`)

Test full request/response cycle through the server.

**Example: Server Integration Test**

```typescript
// tests/integration/server.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { app } from '../../src/app'

describe('Server Integration', () => {
  test('GET /shop.json returns shop data', async () => {
    const req = new Request('http://localhost:3000/shop.json')
    const res = await app(req, {})
    
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    
    const data = await res.json()
    expect(data).toHaveProperty('files')
    expect(data).toHaveProperty('directories')
  })
  
  test('GET /files/invalid returns 404', async () => {
    const req = new Request('http://localhost:3000/files/nonexistent.nsp')
    const res = await app(req, {})
    
    expect(res.status).toBe(404)
  })
})
```

**Coverage:**
- `server.test.ts` - Full HTTP request/response
- `method-validation.test.ts` - HTTP method enforcement
- `range-integration.test.ts` - Range request handling

### Writing Tests

#### Test Structure

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

describe('Component Name', () => {
  // Setup
  beforeAll(() => {
    // Runs once before all tests
  })
  
  // Teardown
  afterAll(() => {
    // Runs once after all tests
  })
  
  test('should do something', () => {
    // Arrange
    const input = 'test'
    
    // Act
    const result = functionUnderTest(input)
    
    // Assert
    expect(result).toBe('expected')
  })
})
```

#### Assertions

```typescript
// Equality
expect(value).toBe(expected)         // Strict equality (===)
expect(value).toEqual(expected)      // Deep equality

// Truthiness
expect(value).toBeTruthy()
expect(value).toBeFalsy()
expect(value).toBeNull()
expect(value).toBeUndefined()

// Numbers
expect(value).toBeGreaterThan(10)
expect(value).toBeLessThanOrEqual(5)

// Strings
expect(string).toMatch(/pattern/)
expect(string).toContain('substring')

// Arrays/Objects
expect(array).toHaveLength(3)
expect(object).toHaveProperty('key')
expect(array).toContain('item')

// Errors
expect(() => fn()).toThrow()
expect(() => fn()).toThrow('error message')
```

#### Mocking

```typescript
import { mock } from 'bun:test'

const mockFn = mock(() => 'mocked return value')

// Call mock
const result = mockFn()

// Assertions
expect(mockFn).toHaveBeenCalled()
expect(mockFn).toHaveBeenCalledTimes(1)
expect(mockFn).toHaveBeenCalledWith('arg')
```

### Test Coverage

Generate coverage report:

```bash
bun test --coverage
```

Output shows:
- Line coverage
- Branch coverage
- Function coverage
- Uncovered lines

**Goal:** Maintain >80% code coverage

---

## Code Style

### TypeScript Configuration

**File:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["bun-types"]
  }
}
```

**Key Settings:**
- **Strict mode:** Enabled (catches more errors)
- **ES2022:** Modern JavaScript features
- **Bundler resolution:** Optimized for Bun

### Coding Conventions

#### File Naming

- Use kebab-case: `error-handler.ts`, `method-validator.ts`
- Test files: `*.test.ts`
- Types: `types/index.ts`

#### Export Style

```typescript
// Named exports (preferred)
export const myFunction = () => { }
export class MyClass { }

// Default exports (for main modules)
export default app
```

#### Type Annotations

```typescript
// Always type function parameters
export const processFile = (filePath: string, options: Options): Result => {
  // ...
}

// Type complex objects
interface Config {
  port: number
  directories: string[]
}

// Use type aliases for function signatures
type Handler = (req: Request, context: RequestContext) => Promise<Response>
```

#### Error Handling

```typescript
// Use ServiceError for known errors
throw new ServiceError(404, 'File not found')

// Let unexpected errors bubble up
// Error handler middleware will catch them
```

#### Async/Await

```typescript
// Prefer async/await over promises
const data = await fetchData()

// Handle errors with try-catch (when needed)
try {
  const result = await riskyOperation()
} catch (error) {
  throw new ServiceError(500, 'Operation failed')
}
```

#### Comments

```typescript
// Use comments for complex logic
// Explain WHY, not WHAT

// Good:
// Check cache first to avoid expensive directory scan
const cached = cache.get()

// Bad:
// Get data from cache
const cached = cache.get()
```

---

## Adding Features

### Adding a New Route

1. **Create handler** in `src/routes/handlers/`

```typescript
// src/routes/handlers/my-handler.ts
import type { Handler } from '../../types'

export const myHandler: Handler = async (req, context) => {
  // Your logic here
  return new Response(JSON.stringify({ data: 'value' }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
```

2. **Add to router** in `src/routes/index.ts`

```typescript
import { myHandler } from './handlers/my-handler'
import { methodValidator } from '../middleware/method-validator'

const routes: Record<string, Handler> = {
  '/my-route': methodValidator(myHandler, ['GET', 'POST']),
  // ... existing routes
}
```

3. **Write tests** in `tests/unit/routes/` or `tests/integration/`

```typescript
// tests/unit/routes/my-handler.test.ts
import { describe, test, expect } from 'bun:test'
import { myHandler } from '../../../src/routes/handlers/my-handler'

describe('myHandler', () => {
  test('should return expected data', async () => {
    const req = new Request('http://localhost:3000/my-route')
    const res = await myHandler(req, {})
    
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('data')
  })
})
```

### Adding Middleware

1. **Create middleware** in `src/middleware/`

```typescript
// src/middleware/my-middleware.ts
import type { Middleware } from '../types'

export const myMiddleware: Middleware = async (req, context, next) => {
  // Before processing
  console.log('Before:', req.url)
  
  // Call next middleware
  const response = await next()
  
  // After processing
  console.log('After:', response.status)
  
  return response
}
```

2. **Add to composition** in `src/app.ts`

```typescript
import { myMiddleware } from './middleware/my-middleware'

export const app = compose(
  errorHandler,
  myMiddleware,  // Add here
  authorize,
  // ... other middleware
)
```

3. **Write tests**

```typescript
// tests/unit/middleware.test.ts
test('myMiddleware should ...', async () => {
  const next = mock(() => new Response('OK'))
  const req = new Request('http://localhost:3000/')
  
  const res = await myMiddleware(req, {}, next)
  
  expect(next).toHaveBeenCalled()
})
```

### Adding a Service

1. **Create service** in `src/services/`

```typescript
// src/services/my-service.ts
export class MyService {
  async fetchData(): Promise<Data> {
    // Business logic here
  }
}

export const myService = new MyService()
```

2. **Use in handler**

```typescript
import { myService } from '../services/my-service'

export const handler: Handler = async (req, context) => {
  const data = await myService.fetchData()
  return new Response(JSON.stringify(data))
}
```

### Adding Configuration

1. **Add to config** in `src/config/index.ts`

```typescript
export interface Config {
  // ... existing fields
  myNewOption: string
}

export const loadConfig = (): Config => {
  const myNewOption = process.env.MY_NEW_OPTION || 'default'
  
  return {
    // ... existing config
    myNewOption
  }
}
```

2. **Document** in `docs/configuration.md`

3. **Add validation** if needed

4. **Update README.md** with new env variable

---

## Contributing

### Getting Started

1. Fork the repository
2. Clone your fork
3. Create a feature branch: `git checkout -b feature/my-feature`
4. Make changes and test
5. Commit with clear messages
6. Push to your fork
7. Open a Pull Request

### Commit Messages

Use conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Code style (formatting, no logic change)
- `refactor` - Code restructuring
- `test` - Adding/updating tests
- `chore` - Maintenance tasks

**Examples:**
```
feat(routes): add health check endpoint
fix(cache): correct TTL expiration logic
docs(api): update authentication examples
test(range): add edge case for suffix ranges
```

### Pull Request Guidelines

**Before submitting:**
- [ ] All tests pass (`bun test`)
- [ ] No TypeScript errors (`bun lint`)
- [ ] New features have tests
- [ ] Documentation updated if needed
- [ ] Commit messages follow convention

**PR Description should include:**
- What changed and why
- How to test the changes
- Any breaking changes
- Related issues (if any)

### Code Review

Maintainers will review PRs for:
- Code quality and style
- Test coverage
- Documentation completeness
- Performance implications
- Security considerations

### Questions?

- Open an issue for bugs or feature requests
- Join discussions in existing issues
- Check documentation first

---

## Troubleshooting Development Issues

### Bun Installation Issues

**Error:** `bun: command not found`

**Solution:**
```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Add to PATH (if needed)
export PATH="$HOME/.bun/bin:$PATH"
```

### Port Already in Use

**Error:** `Error: Port 3000 is already in use`

**Solution:**
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 bun start
```

### Test Failures

**Error:** Tests fail on fresh checkout

**Solution:**
```bash
# Clean install
rm -rf node_modules
bun install

# Run tests
bun test
```

### TypeScript Errors

**Error:** Type errors in VS Code

**Solution:**
```bash
# Restart TypeScript server in VS Code
# Cmd/Ctrl + Shift + P → "TypeScript: Restart TS Server"

# Or check types manually
bun lint
```

### File Permission Issues

**Error:** `EACCES: permission denied`

**Solution:**
```bash
# Make directory readable
chmod -R +r ./test-games

# For development, own the files
sudo chown -R $USER:$USER ./test-games
```

For more troubleshooting, see [troubleshooting.md](troubleshooting.md).
