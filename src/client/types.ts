/** Basic authentication credentials for Documentum REST Services. */
export interface Credentials {
  /** The Documentum username. */
  username: string;
  /** The Documentum password. */
  password: string;
}

/** Configuration for creating a {@link DocumentumClient} instance. */
export interface DocumentumClientConfig {
  /** Base URL of the Documentum REST Services endpoint (e.g. `https://host/dctm-rest`). */
  baseUrl: string;
  /** Basic authentication credentials. */
  credentials: Credentials;
  /** Optional repository name. If provided, it is used as a default for repository-scoped operations. */
  repository?: string;
  /**
   * Optional HTTP agent override. Pass an axios instance to use axios,
   * or pass `fetch` (the native function) to use native fetch.
   * If omitted, the client automatically detects axios availability and falls back to fetch.
   */
  httpAgent?: typeof fetch | Record<string, unknown>;
  /**
   * Whether to enable CSRF client token protection.
   * When enabled (default), the client serializes all requests and manages
   * the Documentum dual-token CSRF protocol.
   * @default true
   */
  enableCsrfProtection?: boolean;
}

/** Options for paginated feed/collection requests. */
export interface FeedOptions {
  /** Whether to inline full resource representations in feed entries. */
  inline?: boolean;
  /** Number of items per page. */
  itemsPerPage?: number;
  /** Page number (1-based). */
  page?: number;
  /** Whether to include the total item count in the response. */
  includeTotal?: boolean;
  /** Filter expression to narrow results. */
  filter?: string;
  /** Sort expression (e.g. `"object_name asc"`). */
  sort?: string;
}

/** Options for single resource requests. */
export interface SingleOptions {
  /** View modifier for the resource representation. */
  view?: string;
  /** Whether to include link relations in the response. */
  links?: boolean;
  /** Format specifier for the resource. */
  format?: string;
  /** Modifier string for rendition selection. */
  modifier?: string;
}

/** Options for full-text search requests. */
export interface SearchOptions {
  /** The search query string. */
  query?: string;
  /** The search type (e.g. `"fulltext"`, `"dql"`). */
  searchType?: string;
  /** Maximum number of results to return. */
  maxResults?: number;
}

/** A single operation within a batch request. */
export interface BatchRequest {
  /** Unique identifier for the batch operation. */
  id: string;
  /** HTTP method for the operation. */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Relative or absolute URI for the operation. */
  uri: string;
  /** Optional request body. */
  body?: unknown;
}