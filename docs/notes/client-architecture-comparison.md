# Architecture Comparison — Java vs .NET Documentum REST Clients

This document compares the architectural and design decisions made in `documentum-rest-client-java` and `documentum-rest-client-dotnet`. Both clients talk to the same Documentum REST Services API using hypermedia navigation, but they approach the problem from quite different directions.

---

## 1. Entry Point and Client Construction

| Concern | Java | .NET |
|---|---|---|
| Public API surface | `DCTMRestClient` interface (~80 methods) | `RestController` class (generic HTTP methods only) |
| Construction | `DCTMRestClientBuilder` (fluent builder + factory) | `new RestController(user, pass)` directly |
| Binding selection | `DCTMRestClientBinding` enum (`XML` or `JSON`) | JSON only (Newtonsoft.Json) |
| Initial navigation | `client.getHomeDocument()` called automatically by builder | Caller calls `restController.Start(homeUri)` |

The Java client presents a **high-level, domain-specific API**: the `DCTMRestClient` interface hides every HTTP detail and exposes named business operations. The .NET client presents a **low-level, generic HTTP API**: `RestController` only knows GET/POST/PUT/DELETE, and all domain logic lives in the model objects themselves.

---

## 2. Where Business Logic Lives

This is the most significant architectural divergence between the two clients.

### Java — Logic in the Client

All business operations are methods on the `DCTMRestClient` interface, implemented in `AbstractRestTemplateClient`. A caller works through the client object:

```java
RestObject cabinet = client.getCabinet("Temp");
RestObject doc = client.createDocument(cabinet, newDoc, content, "text/plain");
RestObject checked = client.checkout(doc);
```

Domain model objects (`RestObject`, `Feed<T>`, etc.) are **data containers only** — they hold properties and links but cannot execute further requests on their own.

### .NET — Logic in the Domain Objects

`RestController` knows nothing about Documentum. Domain model objects (`Document`, `Folder`, `Repository`, `Feed<T>`, …) carry the business methods directly via partial-class `*Exec.cs` files:

```csharp
Folder folder = repository.GetCabinets<Folder>(opts).Entries[0].Content;
Document doc = folder.ImportDocumentWithContent(newDoc, stream, "application/pdf", opts);
Document checkedOut = doc.Checkout();
Feed<Document> versions = doc.GetAllVersions<Document>(opts);
```

This requires `RestController` to be injected into every model object that needs it (via the `Executable` / `SetClient` mechanism). The transport layer does this injection automatically after deserialising each response.

---

## 3. Inheritance and Type Hierarchy

### Java

The model uses a **dual parallel hierarchy** — two full sets of model classes (JAXB for XML, Jackson for JSON) plus a "plain" set for constructing request bodies. Interfaces (`RestObject`, `Linkable`, `Feed`, etc.) decouple callers from the concrete type chosen by the binding. The concrete type is selected at build time by `DCTMRestClientBinding` and is transparent to application code.

### .NET

A **single class hierarchy** maps directly to the Documentum type system: `PersistentObject → Document → D2Document`, `PersistentObject → Folder → Cabinet`, etc. All classes use `[DataContract]` / `[DataMember]` attributes for JSON binding via Newtonsoft.Json. There is no parallel hierarchy for different serialisers; JSON is the only supported format.

---

## 4. Link Relation Representation

| Aspect | Java | .NET |
|---|---|---|
| Type | `enum LinkRelation` | Static-instance class `LinkRelations` |
| Usage | `LinkRelation.CHECKOUT.rel()` | `LinkRelations.CHECKOUT.Rel` |
| Lookup | `AbstractRestTemplateClient` calls helpers | `LinkRelations.FindLinkAsString(links, rel)` called by domain objects |
| D2 rels | Absent | Present alongside core rels in the same class |

Both approaches serve the same purpose — avoiding hard-coded URL strings — but the Java enum provides compile-time exhaustiveness while the .NET static-instance approach is more extensible without changing the enum.

---

## 5. Query Parameter Construction

| Aspect | Java | .NET |
|---|---|---|
| Mechanism | `String... params` varargs (`"key", "value", "key2", "value2"`) | Typed options objects (`FeedGetOptions`, `SingleGetOptions`, `GenericOptions`, `SearchOptions`) |
| Type safety | None — stringly typed key-value pairs | Moderate — named properties per options class |

The .NET approach is more discoverable (IDE autocomplete shows available query parameters), while the Java approach is more flexible and requires no changes to accommodate new query parameters.

---

## 6. Serialisation

| Aspect | Java | .NET |
|---|---|---|
| Formats supported | XML (JAXB) and JSON (Jackson) | JSON only |
| Format selection | `DCTMRestClientBinding.XML` or `.JSON` at build time | No choice |
| Pluggability | Not pluggable — each format has its own concrete client class | `AbstractJsonSerializer` interface is swappable |
| Content type | `application/vnd.emc.documentum+json` or `application/atom+xml` | `application/vnd.emc.documentum+json` |

---

## 7. Async Support

| Aspect | Java | .NET |
|---|---|---|
| Mechanism | Dynamic `java.lang.reflect.Proxy` wrapping a synchronous client | None — all calls are `.Result` (blocking) on `Task<T>` |
| Annotation | `@ClientAsyncOption` on interface methods | N/A |
| Availability | Via `DCTMRestClientBuilder.buildAsyncClient(client)` | Not supported |

The Java client has explicit asynchronous support (secondary, opt-in). The .NET client uses `HttpClient.SendAsync(…).Result` throughout — it wraps async I/O but blocks the calling thread, giving the worst of both worlds (allocates async state machines but is still synchronous from the caller's perspective). This is a known anti-pattern in .NET.

---

## 8. Security / Authentication

| Aspect | Java | .NET |
|---|---|---|
| Basic auth | Yes | Yes |
| Kerberos / integrated | No | Yes (`UseDefaultCredentials`) |
| CSRF token protocol | Yes (v7.2+ aware) | No |
| ETag / optimistic concurrency | Yes (`If-Match`, `If-None-Match`) | No explicit support |
| SSL — trust-all | Yes (dev mode) | Not implemented |
| SSL — custom trust store | Yes | Not implemented |

---

## 9. Paging

| Aspect | Java | .NET |
|---|---|---|
| Paging methods | On the `DCTMRestClient` instance: `nextPage(feed)`, `previousPage(feed)`, etc. | On `Feed<T>` itself: `feed.NextPage()`, `feed.PreviousPage()`, etc. |

Consistent with the broader difference: Java paging goes through the client, .NET paging is self-contained on the Feed.

---

## 10. D2 and Custom Extensions

| Concern | Java | .NET |
|---|---|---|
| D2 support | None | Full — `D2Document`, `D2Repository`, configuration, tasks, C2 views |
| Email import | None | Yes (`/mailimport`, `EmailPackage`) |
| Retention | None | Yes (`/retention`) |

The .NET client was built for a deployment that uses Documentum D2 and includes first-class models and link relations for it. The Java sample client targets only the core REST Services API.

---

## 11. Error Handling

| Aspect | Java | .NET |
|---|---|---|
| Error model | `DCTMRestErrorException` wrapping a `RestError` object (JAXB or Jackson) | Exceptions logged and swallowed in most paths; partial propagation |
| Structured errors | Yes — error code, message, detail from server body | `message.EnsureSuccessStatusCode()` throws `HttpRequestException`; body parsing limited |

The Java client has a richer structured error handling story with typed exceptions.

---

## 12. Logging and Observability

| Aspect | Java | .NET |
|---|---|---|
| Debug logging | `debug(true)` flag; `Debug.debug(…)` throughout | `LoggerFacade` injected into `RestController` |
| Performance logging | None | Every request logs: time (ms), method, URI, request/response sizes; SLOW/NORMAL classification |
| Log destination | stdout | `LoggerFacade` abstraction (caller provides implementation) |

---

## Summary Table

| Dimension | Java | .NET |
|---|---|---|
| API surface | Domain-specific interface (one method per operation) | Generic HTTP interface; domain logic on model objects |
| Model objects | Data containers only | Self-navigating (carry the client reference) |
| Serialisation | XML (JAXB) or JSON (Jackson) — builder choice | JSON only (Newtonsoft.Json), swappable serialiser |
| Type hierarchy | Dual parallel hierarchy (JAXB + Jackson + plain) | Single hierarchy aligned with Documentum type system |
| Query parameters | Stringly-typed varargs | Typed options classes |
| Async | Optional, via dynamic proxy | None (blocks on Task.Result) |
| Auth | Basic + CSRF | Basic + Kerberos |
| D2 / extensions | None | Full D2 model, email import, retention |
| Error handling | Typed `DCTMRestErrorException` | HTTP status exception; limited body parsing |
| Paging | Client methods | Feed methods (self-navigating) |
| Construction | `DCTMRestClientBuilder` (fluent builder) | `new RestController(…)` direct construction |

---

## Implications for `ootd` (TypeScript Client)

Both reference clients reflect their language ecosystems and their particular deployment contexts. Key observations for a modern TypeScript implementation:

1. **The Java interface-per-operation style is convenient for callers but creates a large monolithic surface.** A TypeScript client could offer the same top-level operations but grouped into resource-scoped modules (e.g. `client.documents.create(…)`, `client.lifecycles.promote(…)`).

2. **The .NET self-navigating model is ergonomic** for chained navigation but requires injecting a client reference into every model object, which complicates typing and testing. A TypeScript client could return plain data objects and expose operations separately, consistent with ootd's ADR-001 preference for no abstraction overhead.

3. **JSON-only is the right choice** for a modern TypeScript client. The XML/JAXB binding adds enormous complexity for little benefit given that the JSON API surface is complete.

4. **Typed options objects** (as in .NET) are preferable to stringly-typed varargs (as in Java) in a TypeScript context, where interface types and autocompletion are first-class.

5. **The CSRF protocol** (Java, v7.2+) must be implemented if targeting current REST Services versions.

6. **Async-first** is the natural default in JavaScript/TypeScript; the Java and .NET blocking patterns should not be replicated.
