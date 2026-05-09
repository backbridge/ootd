# RFC: CSRF Protection and Navigation Helpers

**RFC Number:** 002  
**Status:** Proposed  
**Date:** 2 May 2026

## 1. Summary

This RFC defines the CSRF and Client Token discovery protocol for the `ootd` TypeScript client and specifies the integration of HATEOAS navigation helpers into the `DocumentumClient` class. These designs are based on findings from the Java reference implementation and extend the architectural foundation laid out in RFC-001.

## 2. Motivation

Documentum REST Services (v7.2+) requires a specific dual-token protocol to handle CSRF protection and session tracking. Additionally, as a HATEOAS-driven API, traversing the Documentum resource graph should be handled via link relations rather than hardcoded URLs.

Formalizing these mechanisms ensures:
1. **Security Compliance**: Proper implementation of the dual-token rotation protocol used by Documentum REST Services.
2. **Developer Ergonomics**: High-level helpers for following links and paging through collections, reducing the need for manual link manipulation.
3. **Consistency**: Adherence to the "Minimal Abstraction" principle by keeping domain models as pure data interfaces while providing navigation logic in the client.

## 3. CSRF/Client Token Discovery Protocol

Based on the Java reference implementation, the client must manage two distinct tokens discovered through response headers.

### 3.1. Token Extraction Logic

The client must inspect the response headers of **every** HTTP call (including GET) to extract and update the following:

1.  **Client Token**:
    *   **Source**: `Set-Cookie` header.
    *   **Search for**: A cookie named `DOCUMENTUM-CLIENT-TOKEN`.
    *   **Storage**: Store the cookie value as `currentClientToken`.

2.  **CSRF Token Name**:
    *   **Source**: HTTP Header.
    *   **Name**: `DOCUMENTUM-CSRF-HEADER-NAME`.
    *   **Action**: The value of this header specifies which *other* header contains the CSRF token (e.g., `X-CSRF-TOKEN`).
    *   **Storage**: Store as `currentCsrfHeaderName`.

3.  **CSRF Token Value**:
    *   **Source**: HTTP Header.
    *   **Name**: The header name identified by `currentCsrfHeaderName`.
    *   **Storage**: Store as `currentCsrfToken`.

### 3.2. Token Propagation

Once discovered, these tokens must be included in all subsequent requests:

*   **Client Token**: Sent as a custom HTTP header `DOCUMENTUM-CLIENT-TOKEN` (not as a `Cookie` header).
*   **CSRF Token**: Sent using the header name stored in `currentCsrfHeaderName` with the value stored in `currentCsrfToken`.

If the server does not return new tokens in a response, the client must retain and use the last known valid tokens.

### 3.3. Initial Discovery

The initial discovery of these tokens typically occurs during the request to the **Home Document** (`/services`), which is the standard entry point for any Documentum REST session.

## 4. HATEOAS Navigation Helpers

To facilitate HATEOAS traversal while keeping domain models as pure data interfaces (per RFC-001), `DocumentumClient` will include navigation helpers.

### 4.1. Link Traversal

These methods allow navigating from any resource that implements the `Linkable` interface (i.e., has a `links` array).

*   `followLink<T>(resource: Linkable, rel: string, options?: SingleOptions): Promise<HttpResponse<T>>`
    *   Locates the link with the matching `rel`.
    *   Executes a GET request to the `href` of that link.
*   `followLinks<T>(resource: Linkable, rel: string, options?: FeedOptions): Promise<HttpResponse<Feed<T>>>`
    *   Used when the link relation is expected to point to a collection (Feed).

### 4.2. Paging Helpers

Paging is a specialized form of link traversal using standard link relations (`next`, `previous`, `first`, `last`).

*   `nextPage<T>(feed: Feed<T>): Promise<HttpResponse<Feed<T>>>`
*   `previousPage<T>(feed: Feed<T>): Promise<HttpResponse<Feed<T>>>`
*   `firstPage<T>(feed: Feed<T>): Promise<HttpResponse<Feed<T>>>`
*   `lastPage<T>(feed: Feed<T>): Promise<HttpResponse<Feed<T>>>`

## 5. Integration with Request Queue

The **Serialized Request Pattern** defined in RFC-001 is critical for the correct functioning of this protocol.

### 5.1. Atomic Token Updates

The request queue (`enqueueRequest`) must ensure that token extraction and propagation are atomic relative to other requests:

1.  **Prepare**: Attach current tokens to the outgoing request headers.
2.  **Execute**: Perform the HTTP call.
3.  **Update**: Immediately parse response headers to update `currentClientToken`, `currentCsrfHeaderName`, and `currentCsrfToken`.
4.  **Resolve**: Return the response to the caller and proceed to the next queued request.

### 5.2. Concurrency and CSRF Safety

Because any request (including GET) can rotate the CSRF token, sequential execution is mandatory. This prevents race conditions where a second request is sent with an old token before the first request has returned with the new rotated token.

## 6. Client State Design

The `DocumentumClient` will maintain the following internal state to manage the protocol:

```typescript
class DocumentumClient {
  private currentClientToken?: string;
  private currentCsrfHeaderName?: string;
  private currentCsrfToken?: string;

  private async enqueueRequest<T>(operation: () => Promise<HttpResponse<T>>): Promise<HttpResponse<T>> {
    return this.requestQueue = this.requestQueue.then(async () => {
      // 1. Add current tokens to request headers
      // 2. Execute operation
      const response = await operation();
      // 3. Update tokens from response headers
      this.updateTokens(response);
      return response;
    });
  }
  
  private updateTokens(response: HttpResponse<any>): void {
    // Logic to extract DOCUMENTUM-CLIENT-TOKEN from Set-Cookie
    // Logic to extract DOCUMENTUM-CSRF-HEADER-NAME and the corresponding CSRF token
  }
}
```

## 7. References

- RFC-001: TypeScript Client Design for Documentum Content Server
- ADR-001: Dual HTTP Client Support for RESTful Client Package
- Java Reference: `AbstractRestTemplateClient.java` (CSRF and navigation logic)
- [CSRF and Client Token Behavior](../notes/csrf-token-behavior.md)
