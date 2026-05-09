# ADR-002: Client Design and Navigation

**Status**: Accepted  
**Date**: 2026-04-18  
**Decision Type**: Architecture  

## Context

We are building a TypeScript client library (`ootd`) for Documentum Content Server's REST API. The client must align with the principles laid out in ADR-001 (the RFC for the TypeScript client) and address the following key concerns:

1. **Idiomatic TypeScript**: Leverage TypeScript's type system, discriminated unions, and async/await patterns.
2. **Dual HTTP Client Support**: Work with both `axios` and native `fetch` as described in ADR-001.
3. **HATEOAS-Driven Navigation**: All resource discovery should be driven by hypermedia links to avoid hardcoded URL construction.
4. **Minimal Abstraction**: Return native response types (`AxiosResponse` or `Response`) and avoid wrapper classes.
5. **Exclusion of D2/Custom Extensions**: Focus solely on core Content Server functionality.

The initial design explorations suggested standalone navigation helpers to keep the client interface minimal. However, comparison with the `documentum-rest-client-java` implementation and consideration of state management (authentication, CSRF, and request ordering) indicate that binding navigation to the client instance is a superior approach for the TypeScript ecosystem.

## Decision

### 1. Core Architecture
- Organize the codebase as shown in the RFC-001 high-level structure, with directories for **resources**, **operations**, **models**, **links**, **options**, and **http**.
- Use a **serialized request queue** to enforce strict ordering of all HTTP requests, but **only when CSRF protection is enabled** (`enableCsrfProtection: true`). When CSRF protection is disabled, requests can execute concurrently.
- Implement a **generic `HttpResponse<T>` type** that is a discriminated union of `AxiosResponse<T>` and `Response`. Provide a type guard `isAxiosResponse<T>` to differentiate at runtime.

### 2. Configuration and Instantiation
- The `DocumentumClient` constructor accepts an optional `httpAgent` parameter to explicitly select `axios` or `fetch`. If omitted, the client defaults to `fetch`.
- The client requires a `baseUrl`, `credentials` (username/password), and `repository` configuration.
- All client methods must route through the request queue via `enqueueRequest` to maintain ordering when CSRF is enabled.

### 3. Response Handling
- Return raw HTTP responses (`AxiosResponse<T>` or `Response`) to the caller.
- Parse error responses into a structured `RestError` interface that includes `code`, `message`, and optional `details`.
- Utilize discriminated unions for responses to preserve type information without adding custom wrapper objects.

### 4. Resource Model
- Define a base `Linkable` interface that includes a `links` array describing hypermedia relationships.
- Extend `Linkable` with `PersistentObject` for all resources that have an `id`, `name`, `type`, and `properties`.
- Create specific models for **Document**, **Folder**, **Cabinet**, **User**, **Group**, etc., each extending `PersistentObject` with their domain-specific fields.

### 5. Centralized Navigation Helpers
Navigation helpers `followLink` and `followLinks` will be methods of the `DocumentumClient` class.

```typescript
interface DocumentumClient {
  /**
   * Follows a single link relation from a resource.
   * @param resource The resource containing the links.
   * @param rel The link relation name to follow.
   * @returns A promise resolving to the HTTP response containing the target resource.
   */
  followLink<T extends Linkable>(resource: Linkable, rel: string): Promise<HttpResponse<T>>;

  /**
   * Follows a link relation that returns a feed of resources.
   * @param resource The resource containing the links.
   * @param rel The link relation name to follow.
   * @returns A promise resolving to the HTTP response containing the feed of resources.
   */
  followLinks<T extends Linkable>(resource: Linkable, rel: string): Promise<HttpResponse<Feed<T>>>;
}
```

Moving these to the client ensures:
- **Automatic State Management**: Navigation requests automatically include current authentication and CSRF headers.
- **Request Serialization**: Navigation is subject to the client's internal request queue, preventing race conditions during token rotation.
- **Consistent API**: Users interact with a single object for both direct operations and hypermedia traversal.

### 6. Options Objects
- Implement typed options interfaces (`FeedOptions`, `SingleOptions`, `SearchOptions`) to ensure type‑safe configuration for queries, pagination, and filters.

### 7. CSRF Token Management and Discovery
The client will implement a dynamic CSRF discovery protocol based on the reference Java client (`AbstractRestTemplateClient`). See [CSRF and Client Token Behavior](../notes/csrf-token-behavior.md) for a detailed breakdown of this protocol.

#### Discovery Mechanisms
The client must monitor specific response headers to discover and track CSRF tokens:
1.  **`DOCUMENTUM-CSRF-HEADER-NAME`**: This header specifies the *name* of the header that must carry the CSRF token in subsequent requests (e.g., `X-CSRF-Token`).
2.  **`DOCUMENTUM-CLIENT-TOKEN`**: This token is typically sent via a `Set-Cookie` header. The client must extract this value and echo it back as a custom request header named `DOCUMENTUM-CLIENT-TOKEN` in subsequent requests.

#### Protocol Rules
- **CSRF protection is enabled by default** (`enableCsrfProtection: true`).
- **Continuous Update**: The client must inspect the headers of *every* response. If these headers are present, the client must update its internal token store immediately.
- **Mandatory Echo**: Once discovered, the CSRF token and the client token must be sent in the headers of all subsequent mutating requests (POST, PUT, DELETE).
- **Serialization**: When CSRF protection is enabled, the client **must** enforce a serialized request queue for all operations (including GET). This ensures that each request uses the most recent token received from the server, as tokens may rotate on any response. When CSRF protection is disabled, the client does not enforce serialization, allowing concurrent requests.

### 8. Batch Operations
- Implement an `executeBatch(requests: BatchRequest[])` method that sends multiple operations in a single HTTP batch request.

### 9. Error Handling
- Any non‑ok response should be parsed into a `RestError` using the response body.
- Propagate errors as rejected promises, allowing callers to handle them with `try/catch` or `.catch`.

### 10. Testing Strategy
- Use mock servers to validate HATEOAS navigation flows.
- Write unit tests for the request queue to verify ordering and CSRF token propagation.
- Integration tests should validate real endpoint interactions with both `axios` and `fetch`.

## Consequences

- **Pros**: 
  - Provides a strongly typed, idiomatic TypeScript API.
  - Guarantees correct CSRF handling in async environments.
  - Aligns with HATEOAS principles, making the client resilient to API changes.
  - Supports both `axios` and `fetch` without forcing a dependency.
  - Centralized navigation improves ergonomics and ensures state consistency.

- **Cons**:
  - The serialized request queue may introduce slight latency for highly concurrent scenarios, but this is necessary for correctness when CSRF is enabled.
  - Returning raw HTTP responses requires callers to handle different response structures manually; however, this avoids adding unnecessary abstraction layers.
  - The modular directory structure may be unfamiliar to developers coming from monolithic SDKs, requiring onboarding effort.
