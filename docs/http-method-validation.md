# HTTP Method Validation

## Overview

The HTTP method validation middleware validates that incoming requests use allowed HTTP methods (GET, POST, PUT, etc.) and returns appropriate error responses for unsupported methods.

## Implementation

The validation is implemented as a higher-order function `methodValidator` that wraps route handlers.

### Location

- **Middleware**: [src/middleware/method-validator.ts](src/middleware/method-validator.ts)
- **Tests**: [tests/integration/method-validation.test.ts](tests/integration/method-validation.test.ts)

### Usage

```typescript
import { methodValidator } from "../middleware";

const myHandler: Handler = async (req, ctx) => {
  // Your handler logic
  return new Response("OK");
};

// Wrap handler with method validation
export const validatedHandler = methodValidator(["GET", "HEAD"])(myHandler);
```

### Configured Endpoints

All route handlers are configured to accept only the following methods:

- **GET** - Retrieve resources
- **HEAD** - Same as GET but without response body

| Endpoint | Allowed Methods |
|----------|----------------|
| `/` | GET, HEAD |
| `/tinfoil` | GET, HEAD |
| `/shop.json` | GET, HEAD |
| `/shop.tfl` | GET, HEAD |
| `/files/*` | GET, HEAD |
| `/api/shop/sections` | GET, HEAD |
| `/api/get_game/:id` | GET, HEAD |
| `/api/shop/icon/:title_id` | GET, HEAD |
| `/api/shop/banner/:title_id` | GET, HEAD |
| `/api/saves/list` | GET, HEAD |

### Response Behavior

#### Allowed Methods (GET, HEAD)
- Returns 200 OK with the requested resource
- HEAD requests return headers only (no body)

#### OPTIONS Method
- Returns 204 No Content
- Includes `Allow` header listing valid methods
- Includes CORS headers for preflight requests
- Does not require authentication

#### Disallowed Methods (POST, PUT, DELETE, PATCH, etc.)
- Returns 405 Method Not Allowed
- Includes `Allow` header listing valid methods
- Includes descriptive error message: "Method {METHOD} not allowed"

### Features

1. **Case Insensitive**: Method names are normalized to uppercase
2. **OPTIONS Support**: Automatic CORS preflight handling
3. **Error Headers**: 405 responses include `Allow` header per RFC 7231
4. **Custom Error Messages**: Clear error messages indicate which method was rejected
5. **Performance**: Uses Set for O(1) method lookup

### Example Responses

**Valid Request:**
```bash
curl -X GET http://localhost:3000/shop.tfl
# Status: 200 OK
```

**Invalid Request:**
```bash
curl -X POST http://localhost:3000/shop.tfl
# Status: 405 Method Not Allowed
# Allow: GET, HEAD
# Body: Method POST not allowed
```

**OPTIONS Request:**
```bash
curl -X OPTIONS http://localhost:3000/
# Status: 204 No Content
# Allow: GET, HEAD
# Access-Control-Allow-Methods: GET, HEAD
```

## Testing

Run the method validation tests:

```bash
bun test tests/integration/method-validation.test.ts
```

The test suite covers:
- ✓ Allowed methods (GET, HEAD)
- ✓ OPTIONS preflight requests
- ✓ Rejected methods (POST, PUT, DELETE, PATCH)
- ✓ Case insensitivity
- ✓ Proper error responses and headers
