# Documentum REST Services — Endpoints

This document catalogues the REST endpoints exposed by Documentum REST Services, as implied by the link-relation enumerations, client method signatures, and sample code in both `documentum-rest-client-java` and `documentum-rest-client-dotnet`.

All navigation starts from a single well-known **Home Document** URL (e.g. `http://host/dctm-rest`). Every subsequent resource URL is discovered at runtime by following hypermedia link relations embedded in responses — clients must not hard-code child resource paths beyond the home document.

Link relations are namespaced under `http://identifiers.emc.com/linkrel/` for Documentum-specific rels. Standard Atom/RFC 5988 relations (`self`, `edit`, `next`, `previous`, `first`, `last`, etc.) are used without a namespace prefix.

---

## 1. Entry Point

| Resource | Notes |
|---|---|
| Home Document | Single well-known URL; contains links to all top-level resources |
| Product Info (`about`) | Version and build information for the REST service |
| Repositories | Feed of available Content Server repositories |

---

## 2. Repository

Each repository resource carries links to every repository-scoped collection below.

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `repositories` | GET | Feed of repository descriptors |
| Repository (single) | GET | `id`, `name`, `description`, `servers[]` |
| `current-user` | GET | Currently authenticated user |
| `default-folder` | GET | Current user's default (home) folder |
| `checked-out-objects` | GET | Objects currently checked out in the repository |

---

## 3. Navigation — Cabinets, Folders, Documents and Objects

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `cabinets` | GET, POST | Feed of cabinets; POST creates a cabinet |
| Cabinet (single) | GET, POST (update), DELETE | Navigate via `self` / `edit` |
| `folders` (under cabinet or folder) | GET, POST | Child folders |
| Folder (single) | GET, POST, PUT, DELETE | |
| `documents` (under folder/cabinet) | GET, POST | `dm_document` and subtypes; POST creates with optional multipart binary |
| Document (single) | GET, POST, PUT, DELETE | |
| `objects` (under folder/cabinet) | GET, POST | `dm_sysobject` and all subtypes |
| Object (single) | GET, POST, PUT, DELETE | |
| `parent` | GET | Parent folder of an object |
| `cabinet` | GET | Cabinet an object belongs to |
| `ancestor-folder` | GET | Ancestor folder chain |
| `parent-links` | GET, POST | Folder-link records for an object (multi-homed) |
| `child-links` | GET, POST | Folder-link records underneath a folder |
| Folder Link (single) | GET, PUT, DELETE | Move via PUT; unlink via DELETE |

---

## 4. Content

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `contents` | GET, POST | Feed of content renditions on an object; POST adds a rendition |
| `primary-content` | GET | Metadata for the primary (default) rendition |
| `content-media` | GET | Raw binary download of a rendition |
| `edit-media` | PUT | Upload/replace binary content |
| `archived-contents` | GET | Compressed archive of all content renditions |
| `distributed-upload` | POST | Upload to ACS/BOCS distributed content server |

---

## 5. Version Management

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `version-history` | GET | Feed of all versions of an object |
| `predecessor-version` | GET | Previous version in the version tree |
| `current-version` | GET | Current (latest) version |
| `checkout` | PUT | Check out a document |
| `cancel-checkout` | DELETE | Discard a checked-out copy |
| `checkin-next-major` | POST | Check in as the next major version |
| `checkin-next-minor` | POST | Check in as the next minor version |
| `checkin-branch` | POST | Check in as a branch version |

---

## 6. Query and Search

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `dql` | GET | Execute a read-only DQL query; `?dql=` query param |
| `search` | GET | Full-text search with simple query string |
| `search` | POST | Full-text search with structured `Search` request body |
| `search-templates` | GET, POST | Saved search template definitions |
| Search Template (single) | GET, PUT, DELETE | |
| `search-execution` (on template) | POST | Execute a search template |
| `saved-searches` | GET, POST | User's saved searches |
| Saved Search (single) | GET, PUT, DELETE | |
| `search-execution` (on saved search) | POST | Execute a saved search |
| `saved-search-results` | GET, POST, DELETE | Materialised/cached results for a saved search |

---

## 7. Types and Aspects

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `types` | GET | Feed of all types defined in the repository |
| Type (single) | GET | Type definition including property metadata |
| `assist-values` | POST | Value assistance (pick-lists) for a type's properties |
| `aspect-types` | GET | Feed of defined aspect types |
| Aspect Type (single) | GET | |
| `object-aspects` | GET, POST | Aspects attached to a specific object; POST attaches |
| Aspect (single on object) | DELETE | Detaches an aspect |

---

## 8. Users and Groups

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `users` | GET, POST | Repository users; POST creates a user |
| User (single) | GET, PUT, DELETE | |
| `groups` | GET, POST | Repository groups; POST creates a group |
| Group (single) | GET, PUT, DELETE | |
| `users` (under group) | GET, POST | Group members (users); POST adds a user |
| `groups` (under group) | GET, POST | Sub-groups; POST adds a sub-group |
| `user` (rel on group member) | DELETE | Remove a user from a group |

---

## 9. Access Control

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `acls` | GET, POST | Repository ACLs; POST creates an ACL |
| ACL (single) | GET, PUT, DELETE | |
| `associations` (under ACL) | GET | Objects associated with an ACL |
| `permissions` | GET | Permission of an accessor on an object |
| `permission-set` | GET | Full permission set of a user |

---

## 10. Relations

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `relations` | GET, POST | Object-to-object relations; POST creates one |
| Relation (single) | GET, DELETE | |
| `relation-types` | GET | Relation type definitions |
| Relation Type (single) | GET | |

---

## 11. Formats and Network Locations

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `formats` | GET | Feed of file-format records |
| Format (single) | GET | |
| `network-locations` | GET | ACS/BOCS network location definitions |
| Network Location (single) | GET | |

---

## 12. Lifecycles

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `lifecycles` | GET | Feed of policy lifecycle definitions |
| Lifecycle (single) | GET | Includes state machine detail |
| `object-lifecycle` | GET, POST | Lifecycle state attached to an object; POST attaches |
| `promotion` | PUT | Promote object to next lifecycle state |
| `demotion` | PUT | Demote to previous state |
| `suspension` | PUT | Suspend lifecycle progression |
| `resumption` | PUT | Resume lifecycle |
| `cancel-promotion` / `cancel-demotion` / `cancel-suspension` / `cancel-resumption` | PUT | Cancel scheduled lifecycle operations |

---

## 13. Lightweight Objects

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `materialize` | POST | Materialise a lightweight (shared) object |
| `dematerialize` | DELETE | Dematerialise |
| `lightweight-objects` | GET | Feed of lightweight objects under a shared parent |
| `shared-parent` | GET | The shared parent of a lightweight object |

---

## 14. Virtual Documents

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `virtual-document-nodes` | GET | Hierarchical nodes of a virtual document |

---

## 15. Comments

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `comments` | GET, POST | Comments on an object |
| Comment (single) | GET, PUT, DELETE | |
| `replies` | GET, POST | Replies to a comment |

---

## 16. User Preferences

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `current-user-preferences` | GET, POST | User preference key-value pairs |
| Preference (single) | GET, PUT, DELETE | |

---

## 17. Subscriptions

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `subscriptions` | GET | Objects the current user is subscribed to |
| `subscribe` | POST | Subscribe the current user to an object |
| `unsubscribe` | DELETE | Unsubscribe |

---

## 18. Audit

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `audit-policies` | GET, POST | Audit policy definitions |
| Audit Policy (single) | GET, PUT, DELETE | |
| `available-audit-events` | GET | All possible auditable event types |
| `registered-audit-events` | GET, POST | Events registered for audit on an object |
| Registered Audit Event (single) | GET, DELETE | |
| `unregister-all-audit-events` | DELETE | Remove all audit registrations |
| `audit-trails` | GET | Audit trail entries for an object |
| `recent-trails` | GET | Recent audit trail entries for the current user |
| Audit Trail (single) | GET | Includes changed attribute detail |
| `audited-object` | GET | Object referenced by an audit trail entry |

---

## 19. Batch Operations

| Resource / Link Rel | HTTP Methods | Notes |
|---|---|---|
| `batch-capabilities` | GET | What the server supports for batch (transaction modes, etc.) |
| `batches` | POST | Submit a batch of multiple REST operations in a single HTTP request |

---

## 20. D2 Extensions (dotnet client only)

The .NET client includes additional models and link relations for Documentum D2 (an application layer on top of Content Server). These are not present in the Java sample client.

| Resource / Link Rel | Notes |
|---|---|
| `d2-configurations` | D2 configuration profiles |
| `search-configuration` | D2 search configuration |
| `profile-configuration` | D2 profile configuration |
| `creation-profile` | D2 creation profile |
| `type-configurations` | D2 type configuration |
| `object-creation` | D2 object creation workflow |
| `document-templates` | D2 document templates |
| `tasklist-d2` | D2 task list |
| `views/c2-view` | C2 viewer integration |
| `views/c2-print` | C2 print integration |

---

## 21. Custom Extensions (dotnet client only)

| Resource | Notes |
|---|---|
| `/mailimport` | Import email messages as Documentum content |
| `/retention` | Retention event date management |

---

## Notes on API Conventions

- **Content negotiation**: The server accepts and returns `application/vnd.emc.documentum+json` for Documentum objects, `application/json` generically, and `application/atom+xml` / `application/xml` for XML representations.
- **Paging**: Collections use `items-per-page`, `page`, `include-total` query parameters. Feeds carry `next`, `previous`, `first`, `last` link relations for cursor navigation.
- **Inline mode**: `?inline=true` embeds full object properties inside feed entries rather than requiring a second GET per entry.
- **CSRF protection**: The server (v7.2+) issues a client token header (`DOCUMENTUM-CSRF-HEADER-NAME` / `DOCUMENTUM-CLIENT-TOKEN`) that clients must echo back on mutating requests.
- **ETags**: The server emits `ETag` on GET responses; clients can use `If-Match` / `If-None-Match` on subsequent updates for optimistic concurrency.
- **Format extensions**: Optionally append `.json` or `.xml` to resource URLs to force a specific representation without `Accept` header negotiation.
