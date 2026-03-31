# RFC: TypeScript Client Design for Documentum Content Server

**RFC Number:** 001  
**Status:** Proposed  
**Date:** 30 March 2026

## Summary

This RFC proposes a design for `ootd`, a TypeScript client library for OpenText Documentum Content Server via its REST Services API. The design prioritizes idiomatic TypeScript usage, leverages the dual HTTP client architecture defined in ADR-001, and deliberately excludes D2 and custom extensions.

---

## 1. Motivation

The Documentum ecosystem has two mature REST client implementations:

- **`documentum-rest-client-java`** — A feature-rich Java client supporting XML and JSON, with business logic centralized in the client interface.
- **`documentum-rest-client-dotnet`** — A .NET client with self-navigating domain objects, JSON-only, and extensive D2 support.

Both are tied to their respective language ecosystems. A modern TypeScript client is needed to serve the JavaScript/Node.js ecosystem, with the following goals:

1. **Idiomatic TypeScript** — Leverage TypeScript's type system, discriminated unions (per ADR-001), async/await, and module organization.
2. **Dual HTTP support** — Work with both `axios` and native `fetch`, as defined in ADR-001.
3. **No D2/extensions** — Focus solely on core Content Server functionality, unlike the .NET client.
4. **Minimal abstraction** — Follow ADR-001's principle of zero normalization overhead; return native response types.

---

## 2. Design Principles

### 2.1. Core Philosophy

The client shall embody three guiding principles:

| Principle | Description |
|---|---|
| **HATEOAS-driven** | All resource URLs are discovered via hypermedia links. The client never constructs URLs beyond the home document endpoint. |
| **Discriminated Union Responses** | HTTP responses are returned in their native format (`AxiosResponse` or `Response`), discriminated by runtime detection of the HTTP agent. |
| **Minimal Abstraction** | No wrapper classes or normalization layers. Users interact with native HTTP response objects. |

### 2.2. Exclusion of D2 and Custom Extensions

Unlike the .NET client, this implementation excludes:

- D2 configuration models (`D2Document`, `D2Repository`, tasks, C2 views)
- Custom extensions (email import, retention)

This keeps the package lightweight and focused on core Content Server operations.

---

## 3. Architecture

### 3.1. High-Level Structure

```
ootd/
├── index.ts                 # Public API entry point
├── client/
│   ├── DocumentumClient.ts  # Main client class
│   └── builder.ts           # Fluent builder for client construction
├── resources/
│   ├── HomeDocument.ts      # Entry point resource
│   ├── Repository.ts         # Repository resource
│   ├── Cabinet.ts           # Cabinet (top-level folder)
│   ├── Folder.ts            # Folder resource
│   ├── Document.ts          # Document resource
│   ├── Content.ts           # Content rendition handling
│   ├── User.ts              # User resource
│   ├── Group.ts             # Group resource
│   ├── ACL.ts               # Access control list
│   ├── Relation.ts          # Relations between objects
│   ├── Feed.ts              # Generic feed/collection handling
│   └── types/                # Type system and aspects
├── operations/
│   ├── checkout.ts          # Version control operations
│   ├── lifecycle.ts         # Lifecycle operations
│   ├── query.ts             # DQL and search operations
│   └── batch.ts             # Batch operation support
├── links/
│   └── LinkRelation.ts       # Link relation constants and helpers
├── options/
│   ├── FeedOptions.ts        # Collection query options
│   ├── SingleOptions.ts      # Single resource options
│   └── SearchOptions.ts      # Search-specific options
├── models/
│   ├── Link.ts               # Hypermedia link model
│   ├── PersistentObject.ts   # Base model for all objects
│   └── errors/
│       └── RestError.ts      # Structured error handling
└── http/
    └── typeGuards.ts         # Type guards for response discrimination
```

### 3.2. Client Construction

Following the Builder pattern from the Java client, but with TypeScript idioms:

```typescript
import { DocumentumClient } from 'ootd';
import axios from 'axios';

// Using axios (if installed)
const client = new DocumentumClient.Builder()
  .baseUrl('https://documentum-server/dctm-rest')
  .credentials('user', 'password')
  .repository('REPO01')
  .build();

// Or using native fetch (if axios is not installed)
const client = new DocumentumClient.Builder()
  .baseUrl('https://documentum-server/dctm-rest')
  .credentials('user', 'password')
  .repository('REPO01')
  .build(); // Automatically uses fetch if axios unavailable
```

### 3.3. Response Types (ADR-001)

The client returns discriminated union types:

```typescript
import { AxiosResponse } from 'axios';

type HttpResponse<T> = AxiosResponse<T> | Response;

// Type guard
function isAxiosResponse<T>(resp: HttpResponse<T>): resp is AxiosResponse<T> {
  return 'data' in resp && 'config' in resp;
}
```

---

## 4. Resource Model Design

### 4.1. Base Types

```typescript
// Base for any resource containing hypermedia links
interface Linkable {
  links: Link[];
}

// Link representation
interface Link {
  rel: string;
  href: string;
  hrefTemplate?: string;
  title?: string;
  type?: string;
}

// Base for all persistent objects
interface PersistentObject extends Linkable {
  id: string;                    // r_object_id
  name?: string;                 // object_name
  type: string;                 // dm_type name
  properties: Record<string, unknown>;
}
```

### 4.2. Feed and Entry (Collections)

```typescript
interface Feed<T extends Linkable> extends Linkable {
  entries: Entry<T>[];
  total?: number;
  itemsPerPage?: number;
  page?: number;
}

interface Entry<T extends Linkable> {
  id: string;
  title?: string;
  updated?: string;
  content: T;
}
```

### 4.3. Domain Resources

Each resource extends `PersistentObject` and carries its domain-specific properties:

```typescript
interface Document extends PersistentObject {
  // Document-specific properties
  contentSize?: number;
  contentType?: string;
  lockOwner?: string;
  isCheckedOut?: boolean;
  versionLabel?: string[];
}

interface Folder extends PersistentObject {
  // Folder-specific properties
  path?: string;
}

interface Cabinet extends Folder {
  // Cabinet-specific properties
}
```

---

## 5. API Surface

### 5.1. Entry Point

```typescript
interface DocumentumClient {
  // Bootstrap
  getHomeDocument(): Promise<HttpResponse<HomeDocument>>;
  getProductInfo(): Promise<HttpResponse<ProductInfo>>;
  getRepositories(): Promise<HttpResponse<Feed<Repository>>>;
}
```

### 5.2. Navigation — Cabinets, Folders, Documents

```typescript
interface DocumentumClient {
  // Cabinets
  getCabinets(options?: FeedOptions): Promise<HttpResponse<Feed<Cabinet>>>;
  getCabinet(id: string, options?: SingleOptions): Promise<HttpResponse<Cabinet>>;
  createCabinet(cabinet: Partial<Cabinet>): Promise<HttpResponse<Cabinet>>;

  // Folders (under cabinet or parent folder)
  getFolders(parent: Linkable, options?: FeedOptions): Promise<HttpResponse<Feed<Folder>>>;
  getFolder(id: string, options?: SingleOptions): Promise<HttpResponse<Folder>>;
  createFolder(parent: Linkable, folder: Partial<Folder>): Promise<HttpResponse<Folder>>;

  // Documents
  getDocuments(parent: Linkable, options?: FeedOptions): Promise<HttpResponse<Feed<Document>>>;
  getDocument(id: string, options?: SingleOptions): Promise<HttpResponse<Document>>;
  createDocument(parent: Linkable, doc: Partial<Document>): Promise<HttpResponse<Document>>;
  createDocumentWithContent(
    parent: Linkable,
    doc: Partial<Document>,
    content: Blob | Buffer,
    contentType: string
  ): Promise<HttpResponse<Document>>;
}
```

### 5.3. Content

```typescript
interface DocumentumClient {
  getContents(doc: Document): Promise<HttpResponse<Feed<Content>>>;
  getPrimaryContent(doc: Document): Promise<HttpResponse<Blob>>;
  uploadContent(doc: Document, content: Blob | Buffer, contentType: string): Promise<HttpResponse<Content>>;
}
```

### 5.4. Version Management

```typescript
interface DocumentumClient {
  checkout(doc: Document): Promise<HttpResponse<Document>>;
  cancelCheckout(doc: Document): Promise<HttpResponse<void>>;
  checkinNextMajor(doc: Document, content?: Blob | Buffer): Promise<HttpResponse<Document>>;
  checkinNextMinor(doc: Document, content?: Blob | Buffer): Promise<HttpResponse<Document>>;
  getVersionHistory(doc: Document, options?: FeedOptions): Promise<HttpResponse<Feed<Document>>>;
}
```

### 5.5. Query and Search

```typescript
interface DocumentumClient {
  executeDQL(repository: Repository, dql: string, options?: FeedOptions & { includeTotal?: boolean }): Promise<HttpResponse<Feed<PersistentObject>>>;
  search(repository: Repository, query: string, options?: SearchOptions): Promise<HttpResponse<Feed<PersistentObject>>>;
}
```

### 5.6. Users and Groups

```typescript
interface DocumentumClient {
  getUsers(repository: Repository, options?: FeedOptions): Promise<HttpResponse<Feed<User>>>;
  getUser(id: string): Promise<HttpResponse<User>>;
  createUser(repository: Repository, user: Partial<User>): Promise<HttpResponse<User>>;

  getGroups(repository: Repository, options?: FeedOptions): Promise<HttpResponse<Feed<Group>>>;
  getGroup(id: string): Promise<HttpResponse<Group>>;
  addUserToGroup(group: Group, user: User): Promise<HttpResponse<void>>;
}
```

---

## 6. Link-Driven Navigation

Following the HATEOAS principle, resources carry their own navigation capabilities:

```typescript
// Instead of client.getCabinet(id), use:
const home = await client.getHomeDocument();
const repos = await followLinks(home, 'repositories');
const repo = await followLink(repos, 'self');
const cabinets = await followLinks(repo, 'cabinets');
const cabinet = cabinets.entries[0];
const docs = await followLinks(cabinet, 'documents');

// Helper to follow link relations
function followLinks<T extends Linkable>(resource: T, rel: string): Promise<HttpResponse<Feed<any>>>;
function followLink<T extends Linkable>(resource: T, rel: string): Promise<HttpResponse<T>>;
```

This mirrors the .NET client's self-navigating model objects, but operates at the client level to maintain the ADR-001 principle of no abstraction overhead.

---

## 7. Query Options

Type-safe options objects (inspired by the .NET client):

```typescript
interface FeedOptions {
  inline?: boolean;
  itemsPerPage?: number;
  page?: number;
  includeTotal?: boolean;
  filter?: string;
  sort?: string;
}

interface SingleOptions {
  view?: string;
  links?: boolean;
  format?: string;
  modifier?: string;
}

interface SearchOptions {
  query?: string;
  searchType?: string;
  maxResults?: number;
}
```

---

## 8. Authentication

### 8.1. Basic Authentication

Default and primary authentication mechanism:

```typescript
const client = new DocumentumClient.Builder()
  .baseUrl('https://documentum-server/dctm-rest')
  .credentials('user', 'password')
  .build();
```

The client adds the `Authorization: Basic <base64>` header to every request.

### 8.2. CSRF Token Support (REST Services v7.2+)

The Java client implements the CSRF client token protocol. This client should mirror that support:

```typescript
const client = new DocumentumClient.Builder()
  .baseUrl('https://documentum-server/dctm-rest')
  .credentials('user', 'password')
  .enableCsrfProtection(true)  // Default: true
  .build();
```

When enabled, the client:
1. Fetches the CSRF token name/value from the home document on first request
2. Echoes the token on subsequent mutating requests (POST, PUT, DELETE)

---

## 9. Error Handling

Errors are returned as structured `RestError` objects, parsed from the response body:

```typescript
interface RestError {
  code?: string;
  message: string;
  details?: Array<{
    code?: string;
    message: string;
  }>;
}

// Usage
const response = await client.getDocument('invalid-id');
if (!response.ok) {
  if (isAxiosResponse(response)) {
    const error = response.data as RestError;
    console.error(error.message);
  } else {
    const error = await response.json() as RestError;
    console.error(error.message);
  }
}
```

---

## 10. Batch Operations

Support for Documentum's batch endpoint:

```typescript
interface BatchRequest {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  resource: string; // Relative URI
  body?: unknown;
}

interface DocumentumClient {
  executeBatch(requests: BatchRequest[]): Promise<HttpResponse<BatchResponse[]>>;
}
```

---

## 11. Comparison with Reference Clients

| Aspect | Java Client | .NET Client | ootd (This RFC) |
|---|---|---|---|
| API surface | Interface (~80 methods) | Generic `RestController` + domain objects | Client class with grouped methods |
| Domain logic location | Client interface | Domain objects (`DocumentExec`, etc.) | Client + link-following helpers |
| Serialization | XML (JAXB) + JSON (Jackson) | JSON only | JSON only |
| HTTP agents | Spring `RestTemplate` | `HttpClient` | `axios` or `fetch` (ADR-001) |
| Response handling | Wrapped in client | Injected into models | Discriminated union (ADR-001) |
| Query options | String varargs | Typed classes | Typed interfaces |
| Async model | Optional dynamic proxy | Blocking `.Result` | Native `async/await` |
| D2 support | None | Full | None (excluded) |
| Custom extensions | None | Email, retention | None (excluded) |
| Paging | Client methods | Feed methods | Client methods + Feed helpers |

---

## 12. Future Considerations

While out of scope for the initial release, the following could be added later:

1. **TypeScript type generation** — Generate TypeScript interfaces from the Documentum repository's type definitions.
2. **Reactive streams** — Add RxJS observables for those who prefer reactive programming.
3. **Plugin architecture** — Allow registering custom serializers or interceptors.
4. **Kerberos/NTLM auth** — Add integrated Windows authentication support (as in .NET client).

---

## 13. Implementation Roadmap

### Phase 1: Core Infrastructure

- [ ] Client builder with HTTP agent detection (ADR-001)
- [ ] Basic authentication
- [ ] Home document and repository discovery
- [ ] Link relation constants
- [ ] Error handling infrastructure

### Phase 2: Core Resources

- [ ] Cabinet, Folder, Document CRUD
- [ ] Content upload/download
- [ ] Version management (checkout, checkin)
- [ ] Feed/Entry handling with paging

### Phase 3: Extended Features

- [ ] User and Group management
- [ ] DQL execution
- [ ] Search
- [ ] ACLs and permissions

### Phase 4: Advanced Features

- [ ] Batch operations
- [ ] Lifecycle management
- [ ] Relations
- [ ] CSRF token support

---

## 14. Open Questions

1. **Should the client include a mock/test server for development?**  
   The Java client includes extensive sample code; this could be provided as a separate package.

2. **How to handle repository selection?**  
   The Java client accepts a repository name at construction. Should `ootd` require a repository, or allow operating across multiple repositories from a single client instance?

3. **Should we provide a React Query or similar integration?**  
   For frontend use, hooks for data fetching libraries would improve ergonomics.

---

## 15. References

- ADR-001: Dual HTTP Client Support for RESTful Client Package
- `documentum-rest-client-java`: Enterprise-Content-Management/documentum-rest-client-java
- `documentum-rest-client-dotnet`: Enterprise-Content-Management/documentum-rest-client-dotnet
- Documentum REST Services API Documentation
