import type { AxiosResponse } from 'axios';

/**
 * Discriminated union representing an HTTP response from either axios or native fetch.
 * - When using axios: the response is an `AxiosResponse<T>` with `.data`, `.status`, `.config`, etc.
 * - When using fetch: the response is a `Response` object with `.json()`, `.text()`, `.ok`, etc.
 *
 * Use the {@link isAxiosResponse} type guard to narrow at runtime.
 */
export type HttpResponse<T = unknown> = AxiosResponse<T> | Response;

/**
 * Type guard that checks whether an `HttpResponse<T>` is an `AxiosResponse<T>`.
 * Checks for the presence of axios-specific properties (`data` and `config`).
 *
 * @example
 * ```ts
 * const response = await client.getDocument('123');
 * if (isAxiosResponse(response)) {
 *   console.log(response.data); // AxiosResponse<T>
 * } else {
 *   const body = await response.json(); // Response
 * }
 * ```
 */
export function isAxiosResponse<T>(resp: HttpResponse<T>): resp is AxiosResponse<T> {
  return 'data' in resp && 'config' in resp;
}

/**
 * Structured error response from the Documentum REST API.
 * Parsed from the JSON body of non-2xx HTTP responses.
 */
export interface RestError {
  /** Optional error code identifying the type of error. */
  code?: string;
  /** Human-readable error message. */
  message: string;
  /** Optional array of detailed error information. */
  details?: Array<{
    code?: string;
    message: string;
  }>;
}