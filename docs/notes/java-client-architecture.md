# Java Client Architecture — `documentum-rest-client-java`

Source repository: `Enterprise-Content-Management/documentum-rest-client-java`  
Language / runtime: Java 8+  
Build tool: Maven (`pom.xml`)  
Primary dependency: Spring Framework (`RestTemplate`, `HttpHeaders`, `HttpStatus`, …)

---

## Package Layout

```
com.emc.documentum.rest.client.sample
├── DCTMRestClientSample.java          # main entry-point / runner
├── cases/                             # one class per feature group (samples)
├── client/
│   ├── DCTMRestClient.java            # public API interface
│   ├── DCTMRestClientBinding.java     # enum: XML | JSON
│   ├── DCTMRestClientBuilder.java     # fluent builder / factory
│   ├── DCTMRestErrorException.java    # typed exception
│   ├── annotation/                    # method-level metadata annotations
│   └── impl/
│       ├── AbstractRestTemplateClient.java   # shared HTTP logic
│       ├── ClientAsyncRestTemplateClient.java # async proxy wrapper
│       ├── jackson/                           # JSON binding implementation
│       └── jaxb/                              # XML binding implementation
└── model/
    ├── (interfaces and abstract types)
    ├── plain/     # concrete plain-object implementations
    ├── json/      # Jackson-specific model classes
    └── xml/jaxb/  # JAXB-annotated model classes
```

---

## Core Design: Interface + Abstract Base + Two Binding Implementations

### `DCTMRestClient` (interface)

The entire public API surface is declared as a single Java interface with ~80 methods, one per logical operation (e.g. `getCabinets`, `createDocument`, `checkout`, `promote`). It extends `Cloneable` and is annotated `@NotThreadSafe`.

The interface is deliberately fat — it carries every supported operation in one place — rather than splitting concerns across multiple service classes. This means callers can work with a single reference and navigate the entire API.

### `AbstractRestTemplateClient` (abstract class)

All HTTP mechanics live here. It wraps Spring's `RestTemplate` and manages:

- Basic authentication header construction
- CSRF client-token lifecycle (introduced in REST Services v7.2)
- `If-Match` / `If-None-Match` optimistic concurrency headers
- SSL / certificate handling (trust-all mode for dev)
- Streaming mode for large binary uploads
- Multipart POST construction (metadata + binary content parts)
- Distributed content upload to ACS/BOCS
- Archived content download

The abstract class implements `DCTMRestClient` but declares abstract helper methods that the two concrete subclasses override to plug in their respective serialisers.

### `DCTMJaxbClient` and `DCTMJacksonClient` (concrete)

Each class pairs a serialisation library with the abstract HTTP machinery:

| Class | Format | Library |
|---|---|---|
| `DCTMJaxbClient` | XML (Atom+XML) | JAXB (javax.xml.bind) |
| `DCTMJacksonClient` | JSON | Jackson (`ObjectMapper`) |

They configure the `RestTemplate` message converters and error handlers appropriate to their format. All request/response bodies go through the respective marshaller transparently.

### `DCTMRestClientBinding` (enum)

A two-value enum (`XML`, `JSON`) used by `DCTMRestClientBuilder` to select which concrete implementation to instantiate.

---

## Builder Pattern — `DCTMRestClientBuilder`

Construction follows the **Builder** pattern:

```java
DCTMRestClient client = new DCTMRestClientBuilder()
    .bind(DCTMRestClientBinding.JSON)
    .contextRoot("http://host/dctm-rest")
    .credentials("user", "pass")
    .repository("REPO")
    .useFormatExtension(false)
    .debug(false)
    .build();
```

`buildWithPrompt()` is a convenience factory that walks the user interactively through the same parameters, lists available repositories, and enables CSRF token support.  
`buildSilently(…)` is the non-interactive equivalent for programmatic use.  
`buildAsyncClient(client)` wraps an existing synchronous client in a `java.lang.reflect.Proxy` to produce an asynchronous variant.

---

## Async Client — Dynamic Proxy Pattern

`ClientAsyncRestTemplateClient` implements `InvocationHandler` and is used as the proxy handler returned by `buildAsyncClient`. Method calls annotated `@ClientAsyncOption(false)` are dispatched synchronously; all others are submitted to a thread pool and return a `FutureModel` wrapper. Methods annotated `@NotBatchable` are excluded from batch submission.

This is a secondary concern of the client; the primary intended use is synchronous.

---

## Model Layer

The model is structured around an inheritance tree of **interfaces** and **abstract classes**, with two parallel concrete hierarchies (JAXB/XML and Jackson/JSON plus a "plain" hierarchy used for constructing request bodies):

```
Linkable (interface) — has links[]
  └── LinkableBase (abstract) — holds List<Link>
        └── RestObject (interface) — adds properties map, object_name, id, etc.
              ├── json/JsonObject, json/JsonDocument, …   (Jackson models)
              └── xml/jaxb/JaxbObject, jaxb/JaxbDocument, … (JAXB models)

plain/PlainRestObject    — used to build request payloads (no serialiser dependency)
plain/PlainFolderLink
plain/PlainPreference
…
```

Specialised types (`Feed<T>`, `Entry<T>`, `HomeDocument`, `Repository`, `FolderLink`, `Lifecycle`, `Comment`, `Preference`, `AuditPolicy`, etc.) each have parallel JAXB and Jackson implementations. The `Feed<T>` generic carries paging metadata and a list of `Entry<T>`, mirroring the Atom feed structure used by the server.

---

## HATEOAS / Link-Driven Navigation

The client follows the server's hypermedia links rather than constructing URLs itself. After fetching an initial resource, subsequent operations are performed by:

1. Looking up the required `LinkRelation` in the `links[]` array of the response object.
2. Using the resolved URL to make the next HTTP call.

`LinkRelation` is a Java enum with ~90 entries covering every known link relation. The enum stores the fully-qualified URL form (`http://identifiers.emc.com/linkrel/<rel>`) for Documentum-specific rels.

The client caches the Home Document, the Repositories feed, and the current Repository object to avoid redundant round-trips. Paging is traversed with `nextPage(feed)` / `previousPage(feed)` / `firstPage(feed)` / `lastPage(feed)` methods that follow the corresponding link relations on the Feed.

---

## Annotations

Custom method-level annotations decorate `DCTMRestClient` methods:

| Annotation | Purpose |
|---|---|
| `@NotBatchable` | Method cannot be included in a batch request |
| `@ClientAsyncOption` | Controls async proxy dispatch behaviour |
| `@RestServiceSample` | Marks a sample case class with a display name |
| `@RestServiceVersion` | Marks the minimum REST Services version needed |

---

## Error Handling

HTTP error responses are parsed into a typed `RestError` model (with JAXB and Jackson variants). The abstract client catches HTTP error status codes and throws `DCTMRestErrorException`, which carries the structured error details.

---

## Authentication

Basic HTTP Authentication is used (Base64-encoded `username:password` in the `Authorization` header on every request). The abstract client also implements the optional CSRF client token protocol introduced in REST Services 7.2, where the server issues a token name and value that the client must echo on subsequent mutating requests.

---

## Summary of Layering

```
DCTMRestClient (interface — public API contract)
        ↑ implemented by
AbstractRestTemplateClient (HTTP mechanics, caching, auth, CSRF)
        ↑ extended by
DCTMJaxbClient          DCTMJacksonClient
(XML/JAXB models)       (JSON/Jackson models)
```

Callers always interact with the `DCTMRestClient` interface, instantiated via `DCTMRestClientBuilder`. The binding choice (XML vs JSON) is the only configuration decision that affects the concrete type used at runtime.
