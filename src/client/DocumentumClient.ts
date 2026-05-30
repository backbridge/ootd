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

  nextPage<T extends Linkable>(
    feed: Feed<T>,
  ): Promise<HttpResponse<Feed<T>>> {
    const href = findLink(feed, 'next');
    if (!href) {
      return Promise.reject(new Error("Link relation 'next' not found on feed"));
    }
    return this.enqueueRequest(() => this.httpClient.get<Feed<T>>(href));
  }

  previousPage<T extends Linkable>(
    feed: Feed<T>,
  ): Promise<HttpResponse<Feed<T>>> {
    const href = findLink(feed, 'previous');
    if (!href) {
      return Promise.reject(new Error("Link relation 'previous' not found on feed"));
    }
    return this.enqueueRequest(() => this.httpClient.get<Feed<T>>(href));
  }

  firstPage<T extends Linkable>(
    feed: Feed<T>,
  ): Promise<HttpResponse<Feed<T>>> {
    const href = findLink(feed, 'first');
    if (!href) {
      return Promise.reject(new Error("Link relation 'first' not found on feed"));
    }
    return this.enqueueRequest(() => this.httpClient.get<Feed<T>>(href));
  }

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