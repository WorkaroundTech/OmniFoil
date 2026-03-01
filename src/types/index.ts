/**
 * Type definitions for the tinfoil-bolt server
 */

export interface RequestContext<T = any> {
  remoteAddress: string;
  userAgent: string;
  startTime: number;
  data?: T;
}

export interface ServiceErrorOptions {
  statusCode: number;
  message: string;
  details?: Record<string, any>;
  headers?: Record<string, string>;
}

export class ServiceError extends Error {
  statusCode: number;
  details?: Record<string, any>;
  headers?: Record<string, string>;

  constructor(options: ServiceErrorOptions) {
    super(options.message);
    this.name = "ServiceError";
    this.statusCode = options.statusCode;
    this.details = options.details;
    this.headers = options.headers;
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

export type Handler = (req: Request, ctx: RequestContext) => Promise<Response>;
export type Middleware = (req: Request, ctx: RequestContext, next: Handler) => Promise<Response>;

// TitleDB types
export interface TitleDBEntry {
  id: string;              // Title ID (16 hex digits)
  name: string;            // Game title
  publisher?: string;
  category?: string[];     // Categories/genres
  description?: string;
  iconUrl?: string;        // Icon URL from TitleDB
  bannerUrl?: string;      // Banner URL from TitleDB
  screenshots?: string[];  // Screenshot URLs
  releaseDate?: number;    // Unix timestamp
  rating?: number;
  ratingContent?: string[];
  numberOfPlayers?: number;
  size?: number;
  languages?: string[];
  region?: string;
  intro?: string;
}

export interface TitleDBVersionEntry {
  id: string;              // Title ID
  version: string;         // Version string
  releaseDate?: number;    // Unix timestamp
}

export interface TitleDBCache {
  titles: Map<string, TitleDBEntry>;
  versions: Map<string, TitleDBVersionEntry[]>;
  lastUpdated: number;
}

// AppType numeric values match CyberFoil API spec:
// 0 = BASE (base game), 1 = DLC, 2 = UPDATE, 3 = DEMO
export type AppType = 0 | 1 | 2 | 3;

export interface FileIdentification {
  titleId: string | null;
  appType: AppType;
  version: string;
  isDLC: boolean;
  isUpdate: boolean;
  baseTitleId?: string;    // For updates/DLC, the base game title ID
}
