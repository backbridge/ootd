import type { AxiosResponse, AxiosRequestConfig } from 'axios';
import type { HttpResponse } from './typeGuards.js';
import type { Credentials } from '../client/types.js';
import { CSRF_HEADER_CONSTANTS } from '../types/csrf.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface HttpClientOptions {
  headers?: Record<string, string>;
  queryParams?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  responseType?: 'json' | 'arraybuffer' | 'blob' | 'stream' | 'text';
  signal?: AbortSignal;
}

export interface CsrfHooks {
  attachCsrfTokens: (headers: Record<string, string>) => void;
  extractCsrfTokens: (headers: Headers | Record<string, string>) => void;
}

function encodeBasicAuth(credentials: Credentials): string {
  const encoded = btoa(`${credentials.username}:${credentials.password}`);
  return `Basic ${encoded}`;
}

function parseCookieHeader(cookieHeader: string): Map<string, string> {
  const cookies = new Map<string, string>();
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const name = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!cookies.has(name)) {
        cookies.set(name, value);
      }
    }
  }
  return cookies;
}

function buildQueryString(
  params?: Record<string, string | number | boolean | undefined>,
): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return '';
  return (
    '?' +
    entries
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      )
      .join('&')
  );
}

export class HttpClient {
  private axiosInstance: Record<string, unknown> | null = null;
  private axiosLoaded = false;
  private axiosChecked = false;
  private readonly baseUrl: string;
  private readonly credentials?: Credentials;
  private readonly csrfHooks?: CsrfHooks;

  constructor(
    baseUrl: string,
    options?: {
      credentials?: Credentials;
      httpAgent?: typeof fetch | Record<string, unknown>;
      csrfHooks?: CsrfHooks;
    },
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.credentials = options?.credentials;
    this.csrfHooks = options?.csrfHooks;

    if (options?.httpAgent) {
      this.axiosLoaded = true;
      this.axiosChecked = true;
      if (typeof options.httpAgent === 'function') {
        this.axiosInstance = null;
      } else {
        this.axiosInstance = options.httpAgent;
      }
    }
  }

  private getAxios(): Record<string, unknown> | null {
    if (!this.axiosChecked) {
      this.axiosChecked = true;
      try {
        const axios = require('axios');
        this.axiosInstance = axios.default || axios;
        this.axiosLoaded = true;
      } catch {
        this.axiosLoaded = false;
        this.axiosInstance = null;
      }
    }
    return this.axiosInstance;
  }

  get useAxios(): boolean {
    if (!this.axiosChecked) {
      this.getAxios();
    }
    return this.axiosInstance !== null;
  }

  private buildUrl(path: string, queryParams?: Record<string, string | number | boolean | undefined>): string {
    const url = path.startsWith('http://') || path.startsWith('https://')
      ? path
      : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    return url + buildQueryString(queryParams);
  }

  private buildHeaders(
    extraHeaders?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json;q=0.9,*/*;q=0.8',
    };

    if (this.credentials) {
      headers['Authorization'] = encodeBasicAuth(this.credentials);
    }

    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }

    this.csrfHooks?.attachCsrfTokens(headers);

    return headers;
  }

  private extractCsrfFromResponseHeaders(
    headerEntries: [string, string][],
  ): void {
    if (!this.csrfHooks) return;

    const headers = new Headers(headerEntries);
    this.csrfHooks.extractCsrfTokens(headers);
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    options?: HttpClientOptions,
  ): Promise<HttpResponse<T>> {
    if (this.useAxios) {
      return this.axiosRequest<T>(method, path, options);
    }
    return this.fetchRequest<T>(method, path, options);
  }

  private async axiosRequest<T>(
    method: HttpMethod,
    path: string,
    options?: HttpClientOptions,
  ): Promise<AxiosResponse<T>> {
    const axiosMod = this.getAxios();
    if (!axiosMod) {
      throw new Error('axios not available');
    }

    const url = this.buildUrl(path, options?.queryParams);
    const headers = this.buildHeaders(options?.headers);

    const config: AxiosRequestConfig & Record<string, unknown> = {
      method: method as string,
      url,
      headers,
      responseType: (options?.responseType ?? 'json') as AxiosRequestConfig['responseType'],
    };

    if (options?.body !== undefined) {
      config.data = options.body;
    }

    if (options?.signal) {
      config.signal = options.signal;
    }

    try {
      const response = await (axiosMod as unknown as { request: (cfg: AxiosRequestConfig) => Promise<AxiosResponse<T>> }).request(config);

      const rawHeaders = response.headers as Record<string, string>;
      const headerEntries: [string, string][] = Object.entries(rawHeaders).map(
        ([k, v]) => [k, String(v)],
      );
      this.extractCsrfFromResponseHeaders(headerEntries);

      return response;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response: AxiosResponse<T> };
        return axiosError.response;
      }
      throw error;
    }
  }

  private async fetchRequest<T>(
    method: HttpMethod,
    path: string,
    options?: HttpClientOptions,
  ): Promise<Response> {
    const url = this.buildUrl(path, options?.queryParams);
    const headers = this.buildHeaders(options?.headers);

    const fetchInit: RequestInit = {
      method,
      headers,
    };

    if (options?.body !== undefined) {
      if (options.body instanceof FormData) {
        fetchInit.body = options.body;
        delete (headers as Record<string, string | undefined>)['Content-Type'];
        fetchInit.headers = headers;
      } else if (
        typeof options.body === 'object' &&
        !(options.body instanceof Blob) &&
        !(options.body instanceof ArrayBuffer) &&
        !(options.body instanceof ReadableStream) &&
        !Buffer.isBuffer(options.body)
      ) {
        fetchInit.body = JSON.stringify(options.body);
        headers['Content-Type'] = 'application/json';
        fetchInit.headers = { ...headers };
      } else {
        fetchInit.body = options.body as BodyInit;
        fetchInit.headers = { ...headers };
      }
    } else {
      fetchInit.headers = { ...headers };
    }

    if (options?.signal) {
      fetchInit.signal = options.signal;
    }

    const response = await fetch(url, fetchInit);

    const headerEntries: [string, string][] = [];
    response.headers.forEach((value, key) => {
      headerEntries.push([key, value]);
    });
    this.extractCsrfFromResponseHeaders(headerEntries);

    return response;
  }

  async get<T>(path: string, options?: HttpClientOptions): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, options);
  }

  async post<T>(path: string, body?: unknown, options?: HttpClientOptions): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, { ...options, body });
  }

  async put<T>(path: string, body?: unknown, options?: HttpClientOptions): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  async delete<T>(path: string, options?: HttpClientOptions): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path, options);
  }

  static parseSetCookieForClientToken(setCookieHeader: string): string | undefined {
    const cookies = parseCookieHeader(setCookieHeader);
    return cookies.get(CSRF_HEADER_CONSTANTS.CLIENT_TOKEN_COOKIE);
  }
}