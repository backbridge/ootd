# Documentum REST CSRF and Client Token Behavior

This document details the discovery, extraction, and propagation of CSRF and Client Tokens as observed in the Documentum REST Java client reference implementation.

## Overview

Documentum REST Services (starting from version 7.2) implements a dual-token security protocol to protect against Cross-Site Request Forgery (CSRF) and to provide an alternative session tracking mechanism through a Client Token.

- **Client Token**: Used for session tracking and can bypass the need for sending Basic Authentication credentials after the initial handshake.
- **CSRF Token**: Used to validate that requests originating from a client are intentional and not forged by a third-party site.

## Activation

The use of these tokens is controlled by a boolean flag `enableCSRFClientToken` in the client configuration. In the `DCTMRestClientBuilder`, this is automatically enabled if the Documentum REST version is detected to be **7.2 or higher**.

## Discovery and Extraction

The extraction logic occurs after every response received from the server. The Java client implements this in `AbstractRestTemplateClient.setupCSRFClientToken(HttpHeaders headers)`.

### 1. Client Token (`DOCUMENTUM-CLIENT-TOKEN`)

The client looks for the token in the `Set-Cookie` response header.

- **Source**: `Set-Cookie` header.
- **Cookie Name**: `DOCUMENTUM-CLIENT-TOKEN`.
- **Extraction Logic**: The value is extracted from the cookie. 
    > **Note**: The reference implementation specifically looks for the value between the `=` sign and the first comma `,`. This suggests it expects either multiple cookies in a single header or a specific trailing format.

### 2. CSRF Token

The CSRF token discovery is a two-step process because the header name itself is dynamic.

1.  **Find Header Name**: The client first reads the value of the `DOCUMENTUM-CSRF-HEADER-NAME` header from the response.
2.  **Extract Token**: The value of that header specifies the *actual* name of the header that contains the CSRF token (e.g., `X-CSRF-Token`). The client then extracts the value from this identified header.

## Propagation

Propagation occurs before every outgoing request. The Java client implements this in `AbstractRestTemplateClient.setupRequestHeader(HttpHeaders headers)`.

If the tokens have been successfully extracted from a previous response, they are applied to the next request:

- **Client Token**: Sent as a custom HTTP header named `DOCUMENTUM-CLIENT-TOKEN` (Note: it is received as a cookie but sent as a header).
- **CSRF Token**: Sent using the header name discovered during the extraction phase (e.g., `X-CSRF-Token: <token_value>`).

### Precedence

When the `DOCUMENTUM-CLIENT-TOKEN` is present and propagated in the request headers, it takes precedence over Basic Authentication credentials. The server uses this token to identify the session.

## Lifetime and Rotation

- **Continuous Rotation**: Tokens are updated after **every** request, including `GET` requests. Each response potentially contains a new CSRF token and a new Client Token.
- **State Management**: The client must maintain internal state for `clientToken`, `csrfHeaderName`, and `csrfToken`.
- **Concurrency**: The reference Java client is marked as `@NotThreadSafe`. This implies that requests should be processed sequentially to ensure that the tokens from the most recent response are correctly applied to the next request. If requests are made in parallel, token mismatch errors may occur due to rotation.

## Implementation Notes & Observations

- **Fragile Parsing**: The Java client's parsing of the `Set-Cookie` header for the `DOCUMENTUM-CLIENT-TOKEN` is somewhat fragile, as it relies on specific delimiters (`,`). A more robust implementation should follow RFC 6265 for cookie parsing.
- **Header vs. Cookie**: It is a critical detail that the `DOCUMENTUM-CLIENT-TOKEN` is received via `Set-Cookie` but must be propagated as a standard HTTP header in subsequent requests.
- **Bootstrap**: The first request (typically a `GET` to the Service Discovery resource) will not have these tokens. The response to this first request will provide the initial tokens for subsequent calls.
