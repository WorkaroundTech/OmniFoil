/**
 * Application setup
 * Configures server, middleware, and routing
 */

import { PORT, BASES, getAuthUsers, CACHE_TTL, SUCCESS_MESSAGE, LOG_FORMAT } from "./config";
import { type RequestContext } from "./types";
import { authorize, timing, logging, errorHandler, compose } from "./middleware";
import { router } from "./routes";
import { initializeTitleDB } from "./services/titledb";

const asciiHeader = `
╔════════════════════════════════════════╗
║     ⚡ OmniFoil server running!    ║
╚════════════════════════════════════════╝
`;

export async function setupServer() {
  console.log(asciiHeader);
  console.log(`> Scanning directories:`, BASES.map((b) => `${b.alias} -> ${b.path}`));

  const authUsers = getAuthUsers();
  if (authUsers.length > 0) {
    console.log(`> Authentication enabled (${authUsers.length} user(s): ${authUsers.map(u => u.user).join(", ")})`);
  } else {
    console.log(`> Authentication disabled`);
  }

  console.log(`> CACHE TTL: ${CACHE_TTL}s`);

  if (SUCCESS_MESSAGE) {
    console.log(`> Success message: "${SUCCESS_MESSAGE}"`);
  }

  console.log(`> Log format: ${LOG_FORMAT}`);

  // Initialize TitleDB in the background so startup is not blocked
  console.log(`\n> Initializing TitleDB...`);
  initializeTitleDB()
    .then(() => {
      console.log(`> TitleDB initialization complete.`);
    })
    .catch((err) => {
      console.error(`> Failed to initialize TitleDB:`, err);
    });

  /**
   * Setup middleware chain with error handler
   * Order: errorHandler -> authorize -> timing -> logging -> router
   */
  const middleware = compose(
    [
      authorize(authUsers),
      timing(),
      logging(),
    ],
    router
  );

  const handler = errorHandler(middleware);

  return Bun.serve({
    port: PORT,
    hostname: "0.0.0.0", // Bind to all interfaces (required for WSL/Docker)
    async fetch(req, server) {
      const userAgent = req.headers.get("user-agent") || "";
      
      // Get remote address from x-forwarded-for header (set by proxies/load balancers)
      // Falls back to server IP if not available (e.g., direct connection)
      const remoteAddr = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || server.requestIP(req)?.address || "-";

      const ctx: RequestContext = {
        remoteAddress: remoteAddr,
        userAgent,
        startTime: Date.now(),
      };

      return handler(req, ctx);
    },
  });
}

export function printEndpoints() {
  console.log(`\n>> Server is up and listening on port: ${PORT}`);
  console.log(`>> Endpoints:`);
  console.log(`   GET /                  - Index or shop payload (Tinfoil/CyberFoil headers)`);
  console.log(`   GET /shop.tfl          - Game library (legacy Tinfoil format)`);
  console.log(`   GET /api/shop/sections - CyberFoil sections payload`);
  console.log(`   GET /api/get_game/:id  - CyberFoil-compatible file downloads`);
  console.log(`   GET /files/*           - File downloads (legacy path-based)`);
}
