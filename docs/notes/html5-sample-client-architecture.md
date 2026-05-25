# HTML5 Client Architecture — `documentum-rest-sample-html5`

This document describes the architecture, design patterns, and key flows of the HTML5 Documentum REST reference client (`documentum-rest-sample-html5`). It focuses on how the client interacts with Documentum REST Services via hypermedia navigation, with special attention to content retrieval (download) and content upload (check-in).

---

## 1. Overview

The HTML5 client is a **static single-page application** (SPA) deployed to a Java web container (e.g., Tomcat). It communicates with Documentum REST Services via AJAX with HTTP Basic Auth. The application follows a hypermedia-driven (HATEOAS) approach: all navigation starts from the Home Document (`services.json`) and all subsequent URLs are discovered at runtime by following link relations embedded in JSON responses.

### Technology Stack

| Technology | Role |
|---|---|
| AngularJS 1.x + ngRoute | SPA framework, routing, data binding |
| jQuery 1.9.0 / 1.10.2 | DOM manipulation, AJAX calls |
| Bootstrap 3 | UI styling and layout |
| Font Awesome | Icon library |
| Bootbox.js | Modal dialogs |
| HTML5 localStorage | Client-side persistence (credentials, navigation state, breadcrumbs, view preferences) |
| Custom file-drop library | Drag-and-drop upload |
| Custom file-upload library | Multipart upload construction |

### Key Architectural Observations for ootd

1. **No build system**: All libraries are committed directly to `app/scripts/`. The app is served as static files.
2. **No abstraction layers**: AJAX calls are made directly via jQuery `$.ajax()`. There is no client abstraction — every controller calls `fetchData()` or `applyData()` directly.
3. **AngularJS + jQuery coexistence**: AngularJS handles routing, view binding, and data presentation. jQuery handles DOM manipulation, AJAX transport, and file upload.
4. **Shared data via service**: A `viewDataStore` Angular service passes data between the main controller and view-specific controllers.
5. **Global functions**: Most logic lives in global functions (no modules, no import/export). This is a consequence of the zero-build-system approach.

---

## 2. Application Architecture

### 2.1 File Layout

```
app/
  index.html                    # SPA shell: navbar, breadcrumbs, progress bar, ng-view
  css/                          # Bootstrap, custom styles, file-upload styles
  fonts/                        # Font Awesome and Glyphicons
  img/                          # Static image assets and icons
  scripts/
    controller.js               # Main AngularJS controller, async data fetching, view refresh
    view-controllers.js         # $routeProvider config + per-view controllers
    response-processor.js       # JSON response parsing, resource type detection, data transformation
    view-persistence.js         # localStorage abstraction (credentials, nav state, breadcrumbs, preferences)
    navigation.js               # Breadcrumb management, back navigation, resume-browse on reload
    popup-dialogs.js            # Bootbox dialogs (login, edit profile, delete, logout, version info)
    fileupload.js               # Multipart form builder, file-select handler, upload with XHR
    script.js                   # jQuery filedrop handler for drag-and-drop upload
    constants.js                # Link relation URIs, resource type enums, view type enums, format mapper
    jquery.filedropx1.js        # Drag-and-drop file upload plugin
    bootbox.js                  # Modal dialogs
    angular.js, angular-route.js, bootstrap.js, jquery-*.js  # Third-party libraries
  templates/
    repository.html             # Repository-level view (links to cabinets, users, groups, formats, etc.)
    collection.html             # Collection/folder view (folders + assets with list/thumbnail modes)
    contentful.html             # Contentful document detail view (preview + properties + action buttons)
    contentless.html            # Contentless object detail view (user, group, format, relation, type)
    checkin.html                # Check-in view (file selector + property update form)
    checkedout.html             # Checked-out objects view
    search.html                 # Search view (DQL query input + results)
    type.html                   # Type definition view
    batchableResources.html     # Batchable resources view
    default.html                # Default/fallback view
```

### 2.2 AngularJS Routing

Routes are defined in `view-controllers.js` via `$routeProvider`:

| Path | Template | Controller |
|---|---|---|
| `/repository` | `repository.html` | `repositoryViewController` |
| `/collection` | `collection.html` | `collectionViewController` |
| `/contentful` | `contentful.html` | `contentfulViewController` |
| `/contentless` | `contentless.html` | `contentlessViewController` |
| `/checkin` | `checkin.html` | `checkinViewController` |
| `/search` | `search.html` | `searchViewController` |
| `/type` | `type.html` | `typeViewController` |
| `/batchables` | `batchableResources.html` | `batchablesViewController` |
| `/` | `default.html` | (redirect) |

Navigation flow: `mainViewController` fetches data asynchronously, determines the resource type, calls the appropriate processor function, stores data in `viewDataStore`, then changes `location.hash` to trigger the route. The view-specific controller reads data from `viewDataStore` and binds it to its scope.

### 2.3 Constants (`constants.js`)

Link relations used for content operations:

| Constant | URI / Value | Purpose |
|---|---|---|
| `linkRelationPrimaryContent` | `http://identifiers.emc.com/linkrel/primary-content` | Metadata for the primary content rendition |
| `linkRelationContentMedia` | `http://identifiers.emc.com/linkrel/content-media` | Raw binary content download link |
| `linkRelationContents` | `contents` | Feed of content renditions on an object |
| `linkRelationCheckout` | `http://identifiers.emc.com/linkrel/checkout` | Check out a document (PUT) |
| `linkRelationCancelCheckOut` | `http://identifiers.emc.com/linkrel/cancel-checkout` | Cancel check-out (DELETE) |
| `linkRelationCheckInNextMajor` | `http://identifiers.emc.com/linkrel/checkin-next-major` | Check-in as next major version (POST) |
| `linkRelationDelete` | `http://identifiers.emc.com/linkrel/delete` | Delete an object (DELETE) |
| `linkRelationObjects` | `http://identifiers.emc.com/linkrel/objects` | Objects under a folder/cabinet (POST to create, GET to list) |

Resource type enum values:

| Constant | Value | Meaning |
|---|---|---|
| `resourceType.service` | 0 | Home Document / services.json |
| `resourceType.repository` | 1 | Repository descriptor |
| `resourceType.collection` | 2 | Feed/collection of items |
| `resourceType.folder` | 12 | Cabinet or folder object |
| `resourceType.contentful` | 11 | Document with binary content |
| `resourceType.contentless` | 10 | Object without binary content (user, group, format, etc.) |

The `formatMapper` maps file extensions to Documentum format names (e.g., `"jpg"` → `"jpeg"`, `"docx"` → `"msw12"`, `"pdf"` → `"pdf"`). It is used during upload to determine the correct `format` query parameter.

---

## 3. Content Retrieval (Download/Preview) — Detailed Flow

The HTML5 client retrieves file content through a **two-step hypermedia navigation process**.

### Step 1: Identify the Contentful Object

When a user clicks on a document in a collection view, the `followOnClick` handler:

1. Saves the current location to `localStorage`
2. Calls `asyncRefreshView($scope, entry.uri, viewDataStore)`
3. `asyncRefreshView` calls `fetchData(uri)` which issues a `GET` with `Authorization: Basic ...` header
4. The response is parsed by `determineResourceType(data)` which checks for the `primary-content` link relation in the object's `links` array
5. If `primary-content` is present, the object is classified as `resourceType.contentful`
6. `processContentfulObject(data, $scope, viewDataStore)` is called, which:
   - Adds a breadcrumb entry
   - Stores the data in `viewDataStore`
   - Navigates to `/#/contentful`

### Step 2: Fetch Content Media (Two-Step)

The `contentfulViewController` controller executes:

1. **Find primary content link**: Calls `findContentUrlForRelation(data, 'primary-content')`
   - This extracts the `href` from the link with rel `http://identifiers.emc.com/linkrel/primary-content`
   - Appends `?media-url-policy=LOCAL` query parameter

2. **Fetch contents resource**: Issues a `GET` to the primary-content URI
   - This returns a resource listing available content renditions (entries for each format: `jpeg_preview`, `jpeg_lres`, `jpeg_th`, the primary binary, etc.)

3. **Find content-media link**: Calls `findUrlGivenLinkRelation(data, 'content-media')`
   - Extracts the actual binary download URI from the contents resource's links

4. **Fetch binary content**: Uses AngularJS `$http.get()` with:
   - `responseType: 'arraybuffer'` to handle binary data
   - `headers: {"Authorization": "Basic ..."}` for auth

5. **Process and display**:
   - If the content type starts with `image/`, the arraybuffer is converted to base64:
     ```javascript
     var bytes = new Uint8Array(fileBuffer);
     var binary = '';
     for (var i = 0; i < len; i++) {
         binary += String.fromCharCode(bytes[i]);
     }
     var src = "data:" + contentType + ";base64," + btoa(binary);
     ```
   - The base64 data URI is set as the preview image source
   - For non-image types, a static placeholder icon is shown
   - The `downloaduri` scope variable is set to the content-media URI for direct download

### Download Button

The contentful template wraps the download button in an anchor tag:
```html
<a href="{{downloaduri}}" download>
    <button type="button" id="downloadButton" ...>Download</button>
</a>
```
The `download` attribute triggers the browser's download mechanism when the user clicks.

### Rendition Selection Logic

The `findLinkToPreview(data)` function selects the best available preview by scanning the `data.entries` array:

1. `jpeg_preview` (page 0)
2. `jpeg_lres` (page 0)
3. `jpeg_th` with `modifier: large_jpeg_th`
4. `jpeg_th` with `modifier: medium_jpeg_th`
5. `jpeg_th` with `modifier: small_jpeg_th`
6. Fallback to `primarylocation` (first non-matching entry)

For storyboard previews, the `findStoryBoard(data, previewFormat)` function finds all pages of a given format (e.g., `jpeg_story`) that have a non-empty page modifier.

### HTTP Flow Summary for Content Retrieval

```
User clicks document
  → GET [document self URI]                   (fetch object metadata)
  → GET [primary-content URI?media-url-policy=LOCAL]  (fetch contents resource)
  → GET [content-media URI] (arraybuffer)     (fetch binary content)
  → Base64 encode for image display / direct download for non-images
```

---

## 4. File Upload (Check-In) — Detailed Flow

The HTML5 client supports two upload modes:
1. **File selector upload** (check-in from contentful view)
2. **Drag-and-drop upload** (from collection/folder view)

Both use the same underlying multipart construction mechanism.

### 4.1 Multipart Upload Construction (`fileupload.js`)

The `uploadContent(uri, appendProperties)` function constructs and sends a multipart/form-data POST request.

#### Boundary Generation

```javascript
var boundary = '------multipartformboundary' + (new Date).getTime();
```

#### Metadata Part

The first part of the multipart body contains JSON metadata:

```
------multipartformboundary[TIMESTAMP]
Content-Disposition: form-data; name=metadata
Content-Type: application/vnd.emc.documentum+json

{"properties": {
  "r_object_type": "dm_document",
  "object_name": "filename_without_ext",
  "a_content_type": "ext",
  [additional form properties if provided]
}}
```

Key details:
- `r_object_type` is always `dm_document`
- If `formData` is provided (check-in case), form field key-value pairs are injected into the properties object
- If no form data, `object_name` is derived from the filename (stripping the extension)
- `a_content_type` is set to the file extension

#### Binary Content Part

The second part contains the raw binary file data:

```
------multipartformboundary[TIMESTAMP]
Content-Disposition: form-data; name=metadata; filename="[filename]"
Content-Type: application/octet-stream

[binary file data]
------multipartformboundary[TIMESTAMP]--
```

#### HTTP Request Construction

```javascript
xhr.open("POST", uri + "?format=" + documentumFormat, true);
xhr.setRequestHeader('content-type', 'multipart/form-data; boundary=' + boundary);
xhr.setRequestHeader('Accept', 'application/json;q=0.9,*/*;q=0.8');
xhr.setRequestHeader("Authorization", "Basic " + getBasicAuthFormattedCredentials());
xhr.sendAsBinary(builder);
```

Key details:
- **HTTP method**: POST
- **Format query parameter**: Appended as `?format=<DocumentumFormat>` (or `&format=` if the URI already has query parameters). The Documentum format is resolved from the file extension using `formatMapper`.
- **`sendAsBinary()`**: Since the multipart body is manually constructed as a string (including binary data read via `FileReader.readAsBinaryString()`), `xhr.sendAsBinary()` is a non-standard extension (added via prototype augmentation) that sends the raw bytes.
- **Response handling**: On success, the JSON response is parsed; on failure, an error overlay is shown

#### File Reading

When the user selects a file via the check-in file selector:

```javascript
function handleFileSelectCheckin(evt) {
    var file = files[0];
    var thumbReader = new FileReader();    // Reads as DataURL for thumbnail preview
    var binaryReader = new FileReader();   // Reads as BinaryString for upload body
    
    thumbReader.readAsDataURL(file);
    binaryReader.readAsBinaryString(file);
    
    // On load:
    //   thumbReader → renders thumbnail image
    //   binaryReader → stores targetResult (raw binary string) for upload
}
```

### 4.2 Check-In Flow (File Selector)

From the contentful document view:

1. User clicks "Lock" → sends `PUT` to the `checkout` link relation URI
2. User clicks "Check In" → navigates to `/#/checkin`
3. `checkinViewController` loads:
   - File selector `#fileSelectorCheckin` listens for `change` events
   - `updatableProperties` are bound to the form for editing
4. User selects a file → `handleFileSelectCheckin` runs → thumbnail + binary read
5. User clicks "Check In" → `startCheckInProcess()`:
   - Calls `uploadContent(checkinUri, true)` where `checkinUri` comes from `linkRelationCheckInNextMajor`
   - The `true` parameter means form properties are appended to the metadata
   - On success, navigates back to `/#/contentful`
   - On failure, shows error dialog

### 4.3 Drag-and-Drop Upload (`script.js`)

The drag-and-drop functionality is powered by the `jquery.filedropx1.js` plugin:

```javascript
var dropbox = $('#dropbox');
dropbox.filedrop({
    paramname: 'pic',
    maxfiles: 5,
    maxfilesize: 25,  // MB
    url: currentFolderUri,  // From localStorage: the URI of the current folder/cabinet
    // ...
});
```

Key observations:
- The `url` is set to `getCurrentFolderReference()` — the current folder/cabinet's `objects` link
- The plugin expects the server-side to handle `$_FILES['pic']`
- Only image files are accepted (checked in `beforeEach`)
- The plugin handles its own multipart construction (similar to `fileupload.js`)
- Both upload paths construct the same multipart/form-data body shape

### HTTP Flow Summary for Content Upload

**Check-in upload:**
```
User clicks Lock → PUT [checkout URI]
User selects file → FileReader reads binary
User clicks Check In → POST [checkin-next-major URI?format=<fmt>]
  Body: multipart/form-data (metadata JSON + binary content)
  Response: updated document JSON → navigate to contentful view
```

**Drag-and-drop upload:**
```
User drops file → POST [current-folder-objects URI?format=<fmt>]
  Body: multipart/form-data (metadata JSON + binary content)
  Response: created document JSON
```

---

## 5. Authentication

The HTML5 client uses **HTTP Basic Authentication**:

1. User credentials (username, password) are base64-encoded: `btoa(username + ":" + password)`
2. Stored in `localStorage` as `basicAuthFormattedCredentials`
3. On every AJAX request, the `Authorization: Basic <credentials>` header is set via `beforeSend`

There is **no CSRF token handling** in this client. This is consistent with its documentation targeting REST Services 7.1/7.2, but later versions (7.2+) require CSRF client-token protocol for mutating requests, which this client does not implement.

---

## 6. State Persistence

All client-side state is stored in HTML5 `localStorage` via the `view-persistence.js` abstraction:

| Key | Purpose |
|---|---|
| `homeURI` | Home Document URL |
| `basicAuthFormattedCredentials` | Base64-encoded username:password |
| `currentLocation` | Last navigated URI |
| `breadCrumbs` | Semicolon-delimited breadcrumb labels |
| `breadCrumbsHref` | Semicolon-delimited breadcrumb URIs |
| `currentViewType` | Current view mode (list, small icons, large icons) |
| `thumbnailSize` | Current thumbnail pixel size |
| `currentObjectRef` | Current object `self` URI |
| `currentObjectCheckOutUri` | Current object's checkout URI |
| `currentObjectCancelCheckOutUri` | Current object's cancel-checkout URI |
| `currentObjectCheckInUri` | Current object's check-in URI |
| `currentFolderResourceUri` | Current folder's objects resource URI (for drag-drop upload) |
| `currentFolderResourceName` | Current folder's display name |
| `currentObjectJsonRepresentation` | Cached JSON representation of current object |
| `versionDataUri` | Server version info URI |

---

## 7. Key Differences from Java and .NET Clients (Relevance to ootd)

### 7.1 What This Client Does That ootd Should Also Do

| Pattern | HTML5 Approach | ootd Implication |
|---|---|---|
| HATEOAS navigation | Follow link relations starting from `services.json` | DocumentumClient should start with a `getHomeDocument()` or equivalent |
| Multipart upload with format parameter | POST to URI with `?format=<fmt>`, body: JSON metadata + binary | Must support `constructMultipartBody(metadata, binary, boundary)` and append format query param |
| Two-step content download | GET primary-content → GET content-media (arraybuffer) | Must handle the contents-feed → content-media link traversal |
| Format mapping | `formatMapper` translates extension → Documentum format name | Should provide a formatter utility or accept format param from caller |
| Check-out/check-in lifecycle | PUT checkout → POST checkin-next-major | Must support PUT/POST on checkout/checkin rels |
| Condition-based UI | Enable/disable download/lock/checkin buttons based on link presence | ootd's response types can include link presence checks |
| Auth | Basic auth on every request | Already planned via dual HTTP client |

### 7.2 What This Client Does NOT Do (Gaps)

| Gap | Java/.NET | ootd Must Decide |
|---|---|---|
| CSRF token protocol | Java implements v7.2+ CSRF handshake | Must implement (planned in RFC-002) |
| ETag support | Java supports `If-Match`/`If-None-Match` | Not yet planned |
| Streaming uploads | Loads entire file into memory for `sendAsBinary` | Should support streaming (ReadableStream) for large files |
| Content negotiation | Accepts `application/vnd.emc.documentum+json` | Must handle Documentum content type |
| Error handling | Global jQuery AJAX error handler, parses `responseData.status` / `responseData.message` | Need structured error handling |
| Paging | Not implemented in HTML5 client | Java/.NET both support `next/previous/first/last` links |
| Batch operations | Recognised but flagged `notSupported` | Should support batch submissions |

### 7.3 Unique HTML5 Patterns (Not in Java/.NET)

1. **`sendAsBinary()` patching**: The `XMLHttpRequest.prototype.sendAsBinary` is a non-standard extension added to support manually constructed multipart bodies. Modern browsers use `FormData` API instead.
2. **Base64 inline preview**: Images are downloaded as `arraybuffer`, converted to base64, and rendered inline as `data:` URIs. The Java/.NET clients delegate rendering to the caller.
3. **localStorage for everything**: Credentials, navigation state, and view preferences all in `localStorage`. This is browser-specific and not applicable to a Node.js library like ootd.
4. **No CSRF handshake**: The HTML5 client predates (or ignores) the v7.2+ CSRF requirement. This is a known gap.

---

## 8. File Upload Implementation Details for ootd

### Multipart Body Construction (reference for a TypeScript implementation)

The multipart body follows this structure (from `getBuilder()`):

```
--{boundary}\r\n
Content-Disposition: form-data; name=metadata\r\n
Content-Type: application/vnd.emc.documentum+json\r\n
\r\n
{"properties":{"r_object_type":"dm_document",...,"a_content_type":"{ext}"}}\r\n
--{boundary}\r\n
Content-Disposition: form-data; name=metadata; filename="{filename}"\r\n
Content-Type: application/octet-stream\r\n
\r\n
{binary data}\r\n
--{boundary}--\r\n
```

Key elements:
- The `metadata` part uses `Content-Type: application/vnd.emc.documentum+json`
- The property `r_object_type` determines what type of object is created (default: `dm_document`)
- The `a_content_type` property should match the file's format extension
- Custom properties can be injected into the JSON `properties` object
- The binary content part uses `Content-Type: application/octet-stream` regardless of file type
- Both parts share the same `name=metadata` in Content-Disposition (this is unusual — typically the binary part would have a different name)
- The `format` query parameter on the POST URL determines how the server interprets the binary content's format

### Upload URL Construction

The upload URI is derived from the link relation. Two patterns:

1. **Check-in**: URI from `linkRelationCheckInNextMajor` on the document object
2. **Create new document in folder**: URI from `linkRelationObjects` on the folder/cabinet (POST creates a new object)

In both cases, the `?format=<DocumentumFormat>` query parameter is appended. The format is determined by mapping the file extension through `formatMapper`.

### Modern Equivalent (for ootd)

A TypeScript implementation should consider:
- Use the `FormData` API (native to modern browsers and Node.js 18+ with `undici`/`fetch`) instead of manual `sendAsBinary`
- For Node.js, stream files instead of loading into memory
- The `format` query parameter is essential — the Documentum server uses it to determine content storage format
- The metadata JSON contentType is `application/vnd.emc.documentum+json` — this is the Documentum-specific media type

---

## 9. Content Retrieval Implementation Details for ootd

### Link Traversal Pattern

```
GET [object self URI]
  → Response includes link rel="http://identifiers.emc.com/linkrel/primary-content"
  → GET [primary-content href]?media-url-policy=LOCAL
    → Response includes link rel="http://identifiers.emc.com/linkrel/content-media"
    → GET [content-media href]
      → Response is the raw binary content
```

### Important Observations

1. The `media-url-policy=LOCAL` query parameter is required — without it, the content-media link might point to a remote ACS/BOCS content server rather than the REST service itself.
2. The arraybuffer response type is critical for binary content — without it, the browser/jS runtime may corrupt binary data by interpreting it as UTF-8.
3. Documentum REST Services returns the content with `Content-Type` set to the actual MIME type of the content (e.g., `image/jpeg`, `application/pdf`), not `application/octet-stream`.
4. For image preview, the client base64-encodes the binary. For download, it uses the raw content-media URI directly with an HTML5 `download` attribute anchor.

---

## 10. State Management and Navigation Patterns

### Breadcrumb Navigation

Breadcrumbs are stored as semicolon-delimited strings in `localStorage`:
- `breadCrumbs`: `"Services;repo_name;/Temp;Cabinets"` (labels)
- `breadCrumbsHref`: `"http://...;http://...;..."` (corresponding URIs)

The `navigation.js` module provides push/pop/splice operations for breadcrumb management.

### Back Navigation

`goOneStepBack()` pops the last breadcrumb and reloads the view with the previous URI. This is not a browser history.back() — it's a custom navigation stack.

### Resume on Reload

The `window.onload` handler calls `resumeBrowse()`, which reads the last breadcrumb URI from localStorage and reloads that resource. This allows the user to refresh the page without losing their place.

---

## 11. Relevant Files in the HTML5 Repository

| File | Key Functions / Classes | Purpose |
|---|---|---|
| `app/scripts/constants.js` | `constants`, `resourceType`, `viewType`, `formatMapper`, `querySelector` | Link rel URIs, resource type detection, format mapping |
| `app/scripts/controller.js` | `asyncRefreshView()`, `fetchData()`, `applyData()`, `process*()` | Main data fetching, resource type dispatch, view refresh |
| `app/scripts/response-processor.js` | `determineResourceType()`, `findContentUrlForRelation()`, `findLinkToPreview()`, `getDataFromEntries()` | JSON response parsing and link extraction |
| `app/scripts/view-controllers.js` | `contentfulViewController`, `checkinViewController`, `collectionViewController` | Per-view data binding and user interaction handlers |
| `app/scripts/fileupload.js` | `uploadContent()`, `getBuilder()`, `handleFileSelectCheckin()` | Multipart upload construction and check-in file handling |
| `app/scripts/script.js` | `$.filedrop({...})` | Drag-and-drop upload handler |
| `app/scripts/view-persistence.js` | `getBasicAuthFormattedCredentials()`, `setCurrentFolderReference()`, etc. | localStorage abstraction |
| `app/scripts/navigation.js` | `goOneStepBack()`, `resumeBrowse()`, `saveCurrentLocation()` | Navigation state management |
| `app/templates/contentful.html` | N/A | Document detail template with download, lock, checkin, delete buttons |
| `app/templates/checkin.html` | N/A | Check-in form with file selector and property editor |

---

## 12. Summary for ootd Design

From the HTML5 client, ootd should directly incorporate:

1. **Two-step content download**: Navigate `primary-content` → `content-media` link chain
2. **Multipart upload with format query parameter**: POST to objects/checkin URI with `?format=<fmt>` and multipart body containing metadata JSON + binary
3. **Link relation constants**: Use the same `http://identifiers.emc.com/linkrel/*` URIs for hypermedia navigation
4. **Format mapping**: Include a utility to map file extensions to Documentum format names
5. **Check-out/check-in lifecycle**: PUT on `checkout`, POST on `checkin-next-major`
6. **Resource type detection**: Pattern for classifying responses (service, repository, collection, folder, contentful, contentless)

The HTML5 client's gaps that ootd must fill:
- CSRF token protocol (v7.2+)
- Streaming uploads (ReadableStream instead of full-buffer)
- ETag-based concurrency
- Proper error handling with typed error objects
- Paging support (next/previous links)
- Batch operations
- Structured query parameter objects