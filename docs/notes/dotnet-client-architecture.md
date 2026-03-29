# .NET Client Architecture — `documentum-rest-client-dotnet`

Source repository: `Enterprise-Content-Management/documentum-rest-client-dotnet`  
Language / runtime: C# / .NET (Mono-compatible, targets both Mono and .NET Framework)  
Build tool: Visual Studio solution (`MonoReST/MonoReST.sln`)  
Primary dependencies: `System.Net.Http.HttpClient`, Newtonsoft.Json  
Projects: `RestClient` (library), `Tester` (Windows Forms test runner)

---

## Project / Namespace Layout

```
MonoReST/
├── RestClient/                     # class library
│   ├── Controller/
│   │   ├── Net/
│   │   │   └── ReSTController.cs   # HTTP transport layer
│   │   ├── Options/                # query-parameter builder objects
│   │   └── Utility/                # link-rel lookup, batch builder, MIME, etc.
│   └── DataModel/
│       ├── Base/                   # Linkable, ExecLinkable, Executable, Feed, Entry, Link
│       ├── Start/                  # HomeDocument + HomeDocumentExec
│       ├── Core/                   # Repository, Cabinet, Folder, Document, User, Group, …
│       ├── D2/                     # D2-specific models (D2Document, C2Views, tasks, …)
│       └── Custom/                 # AuditEntry, EmailPackage
└── Tester/                         # Windows Forms application
    ├── Tests/                      # use-case test classes
    └── DocumentTracker.cs
```

---

## Core Design: Thin Transport Layer + Rich Domain Models

### `RestController` (transport layer)

`RestController` is a single, concrete, low-level HTTP client. It wraps `System.Net.Http.HttpClient` and provides generic typed methods:

```csharp
T   Get<T>(string uri, List<KeyValuePair<string,object>> query)
R   Post<T,R>(string uri, T body, List<…> query)
R   Put<T,R>(string uri, T body, List<…> query)
void Delete(string uri, List<…> query)
Stream GetRaw(string uri)
T   PostMultiparts<T,R>(…)          // multipart/form-data for documents with content
T   PostRaw<T>(string uri, Stream body, string mimeType, …)
T   PostUrlEncoded<T>(…)
```

All methods are synchronous wrappers around `HttpClient.SendAsync(…).Result` — i.e. they block the calling thread. The result body is deserialised from a `Stream` into the requested generic type `T` via the pluggable `JsonSerializer`.

`RestController` does not know about Documentum concepts. It has no methods named after Documentum resources. It is purely an HTTP transport with JSON serialisation.

After deserialising a response, if the returned object implements `Executable`, the controller injects itself (`SetClient(this)`) so that the domain object can later fire further HTTP calls through the same controller instance.

**Authentication options** (three constructors):

| Constructor | Mechanism |
|---|---|
| `RestController(userName, password)` | Basic auth (Base64 `Authorization` header) |
| `RestController(int timeoutMinutes)` | Windows/Kerberos integrated auth (`UseDefaultCredentials = true`) |
| `RestController()` | Bring-your-own `HttpClient` (COM interop / custom auth) |

**Logging**: A `LoggerFacade` interface (concrete class accepted via constructor) is called around every request with timing, request/response sizes, and an SLOW/NORMAL threshold classification.

**Serialisation**: The `JsonSerializer` property (type `AbstractJsonSerializer`) is swappable; the default implementation uses Newtonsoft.Json. Custom serialisers can be injected.

---

### `Linkable`, `ExecLinkable`, `Executable` (base model types)

```
Linkable          — holds List<Link> links; supports JSON [DataContract] binding
  └── ExecLinkable  — adds RestController _client; implements Executable
        └── (domain models: Repository, Feed<T>, PersistentObject, …)

Executable        — interface: void SetClient(RestController)
```

`Linkable` is the minimal base: any resource that carries a `links` array. `ExecLinkable` extends it with an injected `RestController` reference and a `GetFullLinks()` helper that re-fetches the resource if only a self-link was returned. All domain classes that need to make further HTTP calls extend `ExecLinkable`.

This design creates **self-navigating domain objects**: once a `RestController` is injected, any model object can directly call further REST operations on itself without the caller holding a separate client reference.

---

### Domain Model Classes (`DataModel/Core/`)

Every Documentum resource type has a dedicated class. Each class is split across two partial-class files:

| File | Purpose |
|---|---|
| `Document.cs` | `[DataContract]` properties (id, name, properties map, etc.) |
| `DocumentExec.cs` | Navigation and mutation methods (Checkout, Checkin, GetContents, …) |

The same pattern applies to `Folder`/`FolderExec`, `Repository`/`RepositoryExec`, `PersistentObject`/`PersistentObjectExec`, `User`/`UserExec`, `Group`/`GroupExec`, `FolderLink`/`FolderLinkExec`, etc.

This **partial-class split** separates data binding concerns from behaviour concerns in a clean way without introducing additional types.

The inheritance hierarchy of the domain models mirrors the Documentum type system:

```
PersistentObject
  ├── Document
  │     └── D2Document (D2 extension)
  ├── Folder
  │     └── Cabinet
  ├── User
  ├── Group
  ├── FolderLink
  ├── Relation / RelationType
  ├── Format
  ├── NetworkLocation
  ├── ContentMeta
  └── DmType
```

`PersistentObject` carries a `Dictionary<string,object> Properties` bag (for arbitrary Documentum attributes), a `ChangedProperties` dictionary tracking modified attributes, and typed accessors like `GetPropertyString(name)`, `GetPropertyValue(name)`.

---

### `Feed<T>` (generic collection)

`Feed<T>` extends `ExecLinkable` and is fully operational: it carries pagination state (`Total`, `ItemsPerPage`, `Page`) and exposes `NextPage()`, `PreviousPage()`, `FirstPage()`, `LastPage()` methods that follow the Atom paging link relations directly.

`Entry<T>` wraps a single item in the feed.

---

### `LinkRelations` (utility class with static instances)

Link relation resolution is encapsulated in `LinkRelations`, a static-instance class (not an enum) where each relation is an instance of the class itself:

```csharp
public static LinkRelations CHECKOUT = new LinkRelations("checkout", true);
public static LinkRelations CABINETS = new LinkRelations("cabinets", true);
// …
```

The `FindLinkAsString(List<Link> links, string rel)` static method walks a `links` list and returns the matching href (or strips template parameters from an hreftemplate). `FindLink(…)` returns the full `Link` object.

D2-specific relations are defined in the same class alongside core relations.

---

### Options Objects (`Controller/Options/`)

Query parameters are built via three typed options classes rather than positional string varargs:

| Class | Used for |
|---|---|
| `FeedGetOptions` | Collection requests — `inline`, `items-per-page`, `page`, `include-total`, `filter`, `sort` |
| `SingleGetOptions` | Single-object requests — `view`, `links`, `format`, `modifier` |
| `GenericOptions` | General mutation requests — any key-value pairs |
| `SearchOptions` | Full-text search parameters |

Each class exposes a `ToQueryList()` method that produces `List<KeyValuePair<string,object>>` consumed by `RestController`.

---

## D2 Extension Models (`DataModel/D2/`)

The .NET client adds first-class support for Documentum D2, an application layer built on top of Content Server:

- `D2Document` — extends `Document`, adds `D2Configuration` and C2 view links.
- `D2Repository` — extends `Repository`, adds D2 configuration navigation.
- `D2Configuration`, `ProfileConfiguration`, `SearchConfiguration` — D2 configuration objects.
- `D2Task`, `D2Tasks` — workflow task management.
- `C2View`, `C2Views` — C2 viewer integration.

The Java client has no equivalent D2 support.

---

## Custom Extensions (`DataModel/Custom/`)

- `AuditEntry` — custom audit model.
- `EmailPackage` — result of the `/mailimport` email ingestion endpoint.

---

## `Repository.ExecuteDQL` — Notable Helper

The `RepositoryExec` partial class implements `ExecuteDQL<T>` with an optional `IncludeTotal` flag that fires a separate `select count(*) from …` DQL query before the real query and stitches the count into the returned `Feed`. This compensates for the server not always returning a total count in a single request.

---

## Authentication and Security

The .NET client supports:
- **Basic auth** (username + password encoded in every request header)
- **Kerberos/NTLM integrated auth** (`UseDefaultCredentials = true` on the `HttpClientHandler`)
- **Custom `HttpClient`** (default constructor for COM or external auth)

There is no CSRF client token support in the .NET client (present in the Java client for REST Services v7.2+).

---

## Summary of Layering

```
RestController (generic HTTP transport, JSON serialisation, auth)
        ↓ injected into (via Executable.SetClient)
ExecLinkable domain objects
  ├── Repository (+ RepositoryExec)
  │     → GetCabinets, ExecuteDQL, CreateUser, …
  ├── Folder (+ FolderExec)
  │     → GetDocuments, CreateSubDocument, ImportDocumentWithContent, …
  ├── Document (+ DocumentExec)
  │     → Checkout, CheckinMajor, GetPrimaryContent, …
  ├── Feed<T>
  │     → NextPage, PreviousPage, GetEntry, …
  └── PersistentObject (+ PersistentObjectExec)
        → Save, Delete, GetFolderLinks, LinkToFolder, …
```

Callers instantiate `RestController` directly, call `Start(homeUri)` to fetch the `HomeDocument`, then navigate the object graph from there. There is no builder or factory pattern; `RestController` is constructed with `new`.
