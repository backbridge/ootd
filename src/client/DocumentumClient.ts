import type { HttpResponse } from '../http/typeGuards.js';
import { isAxiosResponse } from '../http/typeGuards.js';
import { HttpClient, type CsrfHooks } from '../http/httpClient.js';
import type { DocumentumClientConfig } from './types.js';
import { CSRF_HEADER_CONSTANTS } from '../types/csrf.js';
import type { CsrfState } from '../types/csrf.js';
import type { Linkable, Feed, Document, Content } from '../types/linkable.js';
import type {
  ContentRenditionEntry,
  ContentsFeed,
  ContentDownloadOptions,
} from '../types/content-retrieval.js';
import type {
  MultipartMetadata,
  UploadContentOptions,
  CheckInOptions,
} from '../types/content-upload.js';
import {
  LINK_REL_PRIMARY_CONTENT,
  LINK_REL_CONTENT_MEDIA,
  LINK_REL_CONTENTS,
  LINK_REL_CHECKOUT,
  LINK_REL_CANCEL_CHECKOUT,
  LINK_REL_CHECKIN_NEXT_MAJOR,
  LINK_REL_CHECKIN_NEXT_MINOR,
  LINK_REL_DELETE,
  LINK_REL_EDIT_MEDIA,
} from '../types/link-relations.js';
import { getDocumentumFormat, getExtensionFromFilename } from '../types/format-mapper.js';

function findLink(resource: Linkable, rel: string): string | undefined {
  return resource.links.find((l) => l.rel === rel)?.href;
}

function buildMultipartBody(
  metadata: MultipartMetadata,
  content: Blob | Buffer | Uint8Array,
  contentMediaType: string,
  filename?: string,
): FormData {
  const formData = new FormData();

  const metadataBlob = new Blob([JSON.stringify(metadata)], {
    type: 'application/vnd.emc.documentum+json',
  });
  formData.append('metadata', metadataBlob, 'metadata.json');

  const contentBlob =
    content instanceof Blob
      ? content
      : new Blob([content as BlobPart], { type: contentMediaType });

  formData.append('binary', contentBlob, filename || 'content.bin');

  return formData;
}

export class DocumentumClient {
  private readonly httpClient: HttpClient;
  private readonly baseUrl: string;
  private readonly config: DocumentumClientConfig;

  private requestQueue: Promise<void> = Promise.resolve();
  private csrfState: CsrfState = {};

  private readonly csrfHooks: CsrfHooks;

  /**
   * Creates a new DocumentumClient.
   *
   * @param config - Configuration for connecting to a Documentum REST Services instance.
   */
  constructor(config: DocumentumClientConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');

    const enableCsrf = config.enableCsrfProtection !== false;

    this.csrfHooks = {
      attachCsrfTokens: (headers: Record<string, string>) => {
        if (!enableCsrf) return;
        this.attachCsrfTokens(headers);
      },
      extractCsrfTokens: (responseHeaders: Headers | Record<string, string>) => {
        if (!enableCsrf) return;
        this.extractCsrfTokens(responseHeaders);
      },
    };

    this.httpClient = new HttpClient(config.baseUrl, {
      credentials: config.credentials,
      httpAgent: config.httpAgent,
      csrfHooks: this.csrfHooks,
    });
  }

  private attachCsrfTokens(headers: Record<string, string>): void {
    const { clientToken, csrfHeaderName, csrfToken } = this.csrfState;

    if (clientToken) {
      headers[CSRF_HEADER_CONSTANTS.CLIENT_TOKEN_HEADER] = clientToken;
    }

    if (csrfHeaderName && csrfToken) {
      headers[csrfHeaderName] = csrfToken;
    }
  }

  private extractCsrfTokens(responseHeaders: Headers | Record<string, string>): void {
    const getHeader = (name: string): string | null => {
      if (responseHeaders instanceof Headers) {
        return responseHeaders.get(name);
      }
      const lower = name.toLowerCase();
      const entry = Object.entries(responseHeaders).find(
        ([k]) => k.toLowerCase() === lower,
      );
      return entry ? entry[1] : null;
    };

    const setCookieHeader = getHeader('set-cookie');
    if (setCookieHeader) {
      const clientToken = HttpClient.parseSetCookieForClientToken(setCookieHeader);
      if (clientToken) {
        this.csrfState.clientToken = clientToken;
      }
    }

    const csrfHeaderName = getHeader(CSRF_HEADER_CONSTANTS.CSRF_HEADER_NAME_HEADER);
    if (csrfHeaderName) {
      this.csrfState.csrfHeaderName = csrfHeaderName;

      const csrfToken = getHeader(csrfHeaderName);
      if (csrfToken) {
        this.csrfState.csrfToken = csrfToken;
      }
    }
  }

  private enqueueRequest<T>(
    operation: () => Promise<HttpResponse<T>>,
  ): Promise<HttpResponse<T>> {
    const enableCsrf = this.config.enableCsrfProtection !== false;

    if (!enableCsrf) {
      return operation();
    }

    const resultPromise = this.requestQueue.then(async () => {
      const result = await operation();
      return result;
    });

    this.requestQueue = resultPromise.then(() => {}, () => {});

    return resultPromise;
  }

  private async extractBodyAsBlob(
    response: HttpResponse<unknown>,
  ): Promise<Blob> {
    if (isAxiosResponse(response)) {
      const data = response.data;
      if (data instanceof Blob) return data;
      if (data instanceof ArrayBuffer) return new Blob([data]);
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
        return new Blob([data as unknown as BlobPart]);
      }
      if (typeof data === 'object') {
        return new Blob([JSON.stringify(data)], {
          type: response.headers['content-type'] || 'application/octet-stream',
        });
      }
      return new Blob([String(data)], {
        type: response.headers['content-type'] || 'application/octet-stream',
      });
    }

    return response.blob();
  }

  // ─── Navigation Helpers ──────────────────────────────────

  /**
   * Follows a single link relation from a resource.
   * Locates the link with the matching `rel` in the resource's links array
   * and executes a GET request to the resolved href.
   *
   * @typeParam T - The expected response body type.
   * @param resource - The resource containing hypermedia links.
   * @param rel - The link relation name to follow (e.g. `'self'`, `'http://identifiers.emc.com/linkrel/primary-content'`).
   * @returns A promise resolving to the HTTP response containing the target resource.
   * @throws If the link relation is not found on the resource.
   */
  followLink<T extends Linkable>(
    resource: Linkable,
    rel: string,
  ): Promise<HttpResponse<T>> {
    const href = findLink(resource, rel);
    if (!href) {
      return Promise.reject(new Error(`Link relation '${rel}' not found on resource`));
    }
    return this.enqueueRequest(() => this.httpClient.get<T>(href));
  }

  /**
   * Follows a link relation that returns a feed (collection) of resources.
   *
   * @typeParam T - The expected entry content type in the feed.
   * @param resource - The resource containing hypermedia links.
   * @param rel - The link relation name to follow.
   * @returns A promise resolving to the HTTP response containing a feed of resources.
   * @throws If the link relation is not found on the resource.
   */
  followLinks<T extends Linkable>(
    resource: Linkable,
    rel: string,
  ): Promise<HttpResponse<Feed<T>>> {
    const href = findLink(resource, rel);
    if (!href) {
      return Promise.reject(new Error(`Link relation '${rel}' not found on resource`));
    }
    return this.enqueueRequest(() => this.httpClient.get<Feed<T>>(href));
  }

  // ─── Paging Helpers ──────────────────────────────────────

  /**
   * Navigates to the next page of a paginated feed.
   * Follows the `'next'` link relation on the feed.
   *
   * @typeParam T - The entry content type in the feed.
   * @param feed - The current feed/collection resource.
   * @returns A promise resolving to the HTTP response containing the next page feed.
   * @throws If the `'next'` link relation is not found on the feed.
   */
  nextPage<T extends Linkable>(
    feed: Feed<T>,
  ): Promise<HttpResponse<Feed<T>>> {
    const href = findLink(feed, 'next');
    if (!href) {
      return Promise.reject(new Error("Link relation 'next' not found on feed"));
    }
    return this.enqueueRequest(() => this.httpClient.get<Feed<T>>(href));
  }

  /**
   * Navigates to the previous page of a paginated feed.
   * Follows the `'previous'` link relation on the feed.
   *
   * @typeParam T - The entry content type in the feed.
   * @param feed - The current feed/collection resource.
   * @returns A promise resolving to the HTTP response containing the previous page feed.
   * @throws If the `'previous'` link relation is not found on the feed.
   */
  previousPage<T extends Linkable>(
    feed: Feed<T>,
  ): Promise<HttpResponse<Feed<T>>> {
    const href = findLink(feed, 'previous');
    if (!href) {
      return Promise.reject(new Error("Link relation 'previous' not found on feed"));
    }
    return this.enqueueRequest(() => this.httpClient.get<Feed<T>>(href));
  }

  /**
   * Navigates to the first page of a paginated feed.
   * Follows the `'first'` link relation on the feed.
   *
   * @typeParam T - The entry content type in the feed.
   * @param feed - The current feed/collection resource.
   * @returns A promise resolving to the HTTP response containing the first page feed.
   * @throws If the `'first'` link relation is not found on the feed.
   */
  firstPage<T extends Linkable>(
    feed: Feed<T>,
  ): Promise<HttpResponse<Feed<T>>> {
    const href = findLink(feed, 'first');
    if (!href) {
      return Promise.reject(new Error("Link relation 'first' not found on feed"));
    }
    return this.enqueueRequest(() => this.httpClient.get<Feed<T>>(href));
  }

  /**
   * Navigates to the last page of a paginated feed.
   * Follows the `'last'` link relation on the feed.
   *
   * @typeParam T - The entry content type in the feed.
   * @param feed - The current feed/collection resource.
   * @returns A promise resolving to the HTTP response containing the last page feed.
   * @throws If the `'last'` link relation is not found on the feed.
   */
  lastPage<T extends Linkable>(
    feed: Feed<T>,
  ): Promise<HttpResponse<Feed<T>>> {
    const href = findLink(feed, 'last');
    if (!href) {
      return Promise.reject(new Error("Link relation 'last' not found on feed"));
    }
    return this.enqueueRequest(() => this.httpClient.get<Feed<T>>(href));
  }

  // ─── Content Retrieval ───────────────────────────────────

  /**
   * Retrieves the feed of content renditions for a document.
   * Follows the `'contents'` link relation on the resource.
   *
   * @param resource - The document or linkable resource.
   * @returns A promise resolving to the HTTP response containing the contents feed.
   * @throws If the `'contents'` link relation is not found on the resource.
   */
  getContents(
    resource: Linkable,
  ): Promise<HttpResponse<ContentsFeed>> {
    return this.enqueueRequest(() => {
      const href = findLink(resource, LINK_REL_CONTENTS);
      if (!href) {
        return Promise.reject(
          new Error(`Link relation '${LINK_REL_CONTENTS}' not found on resource`),
        );
      }
      return this.httpClient.get<ContentsFeed>(href);
    });
  }

  /**
   * Downloads the primary binary content of a document.
   * Uses a two-step process:
   * 1. GET the `primary-content` link (with `?media-url-policy=LOCAL`) to obtain content metadata.
   * 2. GET the `content-media` link to retrieve the actual binary content.
   *
   * @param resource - The document or linkable resource.
   * @param options - Optional download configuration (media URL policy and response type).
   * @returns A promise resolving to the HTTP response containing the binary content as a Blob.
   * @throws If required link relations are not found.
   */
  async getPrimaryContent(
    resource: Linkable,
    options?: ContentDownloadOptions,
  ): Promise<HttpResponse<Blob>> {
    return this.enqueueRequest(async () => {
      const primaryContentHref = findLink(resource, LINK_REL_PRIMARY_CONTENT);
      if (!primaryContentHref) {
        throw new Error(
          `Link relation '${LINK_REL_PRIMARY_CONTENT}' not found on resource`,
        );
      }

      const mediaUrlPolicy = options?.mediaUrlPolicy ?? 'LOCAL';
      const contentResp = await this.httpClient.get<ContentRenditionEntry>(
        primaryContentHref,
        {
          queryParams: { 'media-url-policy': mediaUrlPolicy },
        },
      );

      let contentMediaHref: string | undefined;

      if (isAxiosResponse(contentResp)) {
        const entry = contentResp.data as unknown as ContentRenditionEntry;
        if (entry.links) {
          contentMediaHref = entry.links.find(
            (l) => l.rel === LINK_REL_CONTENT_MEDIA,
          )?.href;
        }
      } else {
        const entry: ContentRenditionEntry = await contentResp.json();
        if (entry.links) {
          contentMediaHref = entry.links.find(
            (l) => l.rel === LINK_REL_CONTENT_MEDIA,
          )?.href;
        }
      }

      if (!contentMediaHref) {
        throw new Error(
          `Link relation '${LINK_REL_CONTENT_MEDIA}' not found in primary content response`,
        );
      }

      const responseType = options?.responseType ?? 'arraybuffer';
      const binaryResp = await this.httpClient.get<unknown>(
        contentMediaHref,
        {
          responseType,
          headers: { Accept: '*/*' },
        },
      );

      const blob = await this.extractBodyAsBlob(binaryResp);

      if (isAxiosResponse(binaryResp)) {
        return {
          ...binaryResp,
          data: blob,
        } as unknown as HttpResponse<Blob>;
      }

      return new Response(blob, {
        status: binaryResp.status,
        statusText: binaryResp.statusText,
        headers: binaryResp.headers,
      }) as HttpResponse<Blob>;
    });
  }

  // ─── Content Upload ──────────────────────────────────────

  /**
   * Uploads binary content as a new rendition to a document.
   * Sends a multipart/form-data POST request to the `'contents'` link
   * with a JSON metadata part and a binary content part.
   * The Documentum format is automatically derived from the content type if not specified.
   *
   * @param resource - The document or linkable resource.
   * @param content - The binary content to upload.
   * @param contentType - The MIME type of the content.
   * @param options - Optional upload configuration (format override).
   * @returns A promise resolving to the HTTP response containing the created Content resource.
   * @throws If the `'contents'` link relation is not found on the resource.
   */
  uploadContent(
    resource: Linkable,
    content: Blob | Buffer | Uint8Array,
    contentType: string,
    options?: UploadContentOptions,
  ): Promise<HttpResponse<Content>> {
    return this.enqueueRequest(async () => {
      const href = findLink(resource, LINK_REL_CONTENTS);
      if (!href) {
        throw new Error(
          `Link relation '${LINK_REL_CONTENTS}' not found on resource`,
        );
      }

      let format = options?.format;
      if (!format) {
        const ext = getExtensionFromFilename(contentType);
        if (ext) {
          format = getDocumentumFormat(ext);
        }
      }

      const metadata: MultipartMetadata = {
        properties: {
          a_content_type: contentType,
        },
      };

      const body = buildMultipartBody(metadata, content, contentType);

      const queryParams: Record<string, string | number | boolean | undefined> = {};
      if (format) {
        queryParams['format'] = format;
      }

      return this.httpClient.post<Content>(href, body, { queryParams });
    });
  }

  // ─── Version Management ──────────────────────────────────

  /**
   * Checks out a document for editing.
   * Sends a PUT request to the `'checkout'` link relation.
   *
   * @param resource - The document or linkable resource.
   * @returns A promise resolving to the HTTP response containing the checked-out document.
   * @throws If the `'checkout'` link relation is not found on the resource.
   */
  checkout(
    resource: Linkable,
  ): Promise<HttpResponse<Document>> {
    return this.enqueueRequest(() => {
      const href = findLink(resource, LINK_REL_CHECKOUT);
      if (!href) {
        return Promise.reject(
          new Error(`Link relation '${LINK_REL_CHECKOUT}' not found on resource`),
        );
      }
      return this.httpClient.put<Document>(href);
    });
  }

  /**
   * Cancels a pending checkout, discarding the working copy.
   * Sends a DELETE request to the `'cancel-checkout'` link relation.
   *
   * @param resource - The document or linkable resource.
   * @returns A promise resolving to the HTTP response (typically 204 No Content).
   * @throws If the `'cancel-checkout'` link relation is not found on the resource.
   */
  cancelCheckout(
    resource: Linkable,
  ): Promise<HttpResponse<void>> {
    return this.enqueueRequest(() => {
      const href = findLink(resource, LINK_REL_CANCEL_CHECKOUT);
      if (!href) {
        return Promise.reject(
          new Error(
            `Link relation '${LINK_REL_CANCEL_CHECKOUT}' not found on resource`,
          ),
        );
      }
      return this.httpClient.delete<void>(href);
    });
  }

  /**
   * Checks in a document as the next major version.
   * Supports both metadata-only check-ins (JSON body) and check-ins with new content (multipart).
   *
   * @param resource - The document or linkable resource.
   * @param properties - Optional property updates to apply during check-in.
   * @param content - Optional new binary content for the check-in.
   * @param contentType - The MIME type of the content (required if content is provided).
   * @param options - Optional check-in configuration (format, version type).
   * @returns A promise resolving to the HTTP response containing the updated document.
   * @throws If the check-in link relation is not found on the resource.
   */
  checkinNextMajor(
    resource: Linkable,
    properties?: Record<string, unknown>,
    content?: Blob | Buffer | Uint8Array,
    contentType?: string,
    options?: CheckInOptions,
  ): Promise<HttpResponse<Document>> {
    return this.checkin(
      resource,
      LINK_REL_CHECKIN_NEXT_MAJOR,
      properties,
      content,
      contentType,
      options,
    );
  }

  /**
   * Checks in a document as the next minor version.
   * Supports both metadata-only check-ins (JSON body) and check-ins with new content (multipart).
   *
   * @param resource - The document or linkable resource.
   * @param properties - Optional property updates to apply during check-in.
   * @param content - Optional new binary content for the check-in.
   * @param contentType - The MIME type of the content (required if content is provided).
   * @param options - Optional check-in configuration (format, version type).
   * @returns A promise resolving to the HTTP response containing the updated document.
   * @throws If the check-in link relation is not found on the resource.
   */
  checkinNextMinor(
    resource: Linkable,
    properties?: Record<string, unknown>,
    content?: Blob | Buffer | Uint8Array,
    contentType?: string,
    options?: CheckInOptions,
  ): Promise<HttpResponse<Document>> {
    return this.checkin(
      resource,
      LINK_REL_CHECKIN_NEXT_MINOR,
      properties,
      content,
      contentType,
      options,
    );
  }

  private checkin(
    resource: Linkable,
    rel: string,
    properties?: Record<string, unknown>,
    content?: Blob | Buffer | Uint8Array,
    contentType?: string,
    options?: CheckInOptions,
  ): Promise<HttpResponse<Document>> {
    return this.enqueueRequest(async () => {
      const href = findLink(resource, rel);
      if (!href) {
        throw new Error(`Link relation '${rel}' not found on resource`);
      }

      let format = options?.format;
      if (!format && contentType) {
        const ext = getExtensionFromFilename(contentType);
        if (ext) {
          format = getDocumentumFormat(ext);
        }
      }

      const queryParams: Record<string, string | number | boolean | undefined> = {};
      if (format) {
        queryParams['format'] = format;
      }

      if (content && contentType) {
        const metadata: MultipartMetadata = {
          properties: {
            a_content_type: contentType,
            ...(properties ? properties : {}),
          },
        };

        const body = buildMultipartBody(metadata, content, contentType);
        return this.httpClient.post<Document>(href, body, { queryParams });
      }

      const body = properties ? { properties } : {};
      return this.httpClient.post<Document>(href, body, {
        queryParams,
        headers: {
          'Content-Type': 'application/vnd.emc.documentum+json',
        },
      });
    });
  }

  // ─── Deletion ────────────────────────────────────────────

  /**
   * Deletes a resource from the repository.
   * Attempts to DELETE via the `'delete'` link relation, falling back to `'self'` or `'edit'` if not found.
   *
   * @param resource - The resource to delete.
   * @returns A promise resolving to the HTTP response (typically 204 No Content).
   * @throws If no `'delete'`, `'self'`, or `'edit'` link relation is found on the resource.
   */
  delete(
    resource: Linkable,
  ): Promise<HttpResponse<void>> {
    return this.enqueueRequest(() => {
      let href = findLink(resource, LINK_REL_DELETE);
      if (!href) {
        href = findLink(resource, 'self');
      }
      if (!href) {
        href = findLink(resource, 'edit');
      }
      if (!href) {
        return Promise.reject(
          new Error(
            `No 'delete', 'self', or 'edit' link relation found on resource`,
          ),
        );
      }
      return this.httpClient.delete<void>(href);
    });
  }

  // ─── Content Update (Edit Media) ─────────────────────────

  /**
   * Replaces the binary content of a document via the `'edit-media'` link.
   * Sends a multipart/form-data PUT request to update the primary content rendition.
   *
   * @param resource - The document or linkable resource.
   * @param content - The new binary content.
   * @param contentType - The MIME type of the content.
   * @param options - Optional update configuration (format override).
   * @returns A promise resolving to the HTTP response containing the updated Content resource.
   * @throws If the `'edit-media'` link relation is not found on the resource.
   */
  updateContent(
    resource: Linkable,
    content: Blob | Buffer | Uint8Array,
    contentType: string,
    options?: UploadContentOptions,
  ): Promise<HttpResponse<Content>> {
    return this.enqueueRequest(async () => {
      const href = findLink(resource, LINK_REL_EDIT_MEDIA);
      if (!href) {
        throw new Error(
          `Link relation '${LINK_REL_EDIT_MEDIA}' not found on resource`,
        );
      }

      let format = options?.format;
      if (!format) {
        const ext = getExtensionFromFilename(contentType);
        if (ext) {
          format = getDocumentumFormat(ext);
        }
      }

      const metadata: MultipartMetadata = {
        properties: {
          a_content_type: contentType,
        },
      };

      const body = buildMultipartBody(metadata, content, contentType);

      const queryParams: Record<string, string | number | boolean | undefined> = {};
      if (format) {
        queryParams['format'] = format;
      }

      return this.httpClient.put<Content>(href, body, { queryParams });
    });
  }
}