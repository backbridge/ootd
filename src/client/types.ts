export interface Credentials {
  username: string;
  password: string;
}

export interface DocumentumClientConfig {
  baseUrl: string;
  credentials: Credentials;
  repository?: string;
  httpAgent?: typeof fetch | Record<string, unknown>;
  enableCsrfProtection?: boolean;
}

export interface FeedOptions {
  inline?: boolean;
  itemsPerPage?: number;
  page?: number;
  includeTotal?: boolean;
  filter?: string;
  sort?: string;
}

export interface SingleOptions {
  view?: string;
  links?: boolean;
  format?: string;
  modifier?: string;
}

export interface SearchOptions {
  query?: string;
  searchType?: string;
  maxResults?: number;
}

export interface BatchRequest {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  uri: string;
  body?: unknown;
}