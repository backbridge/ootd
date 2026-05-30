import type { AxiosResponse } from 'axios';

export type HttpResponse<T = unknown> = AxiosResponse<T> | Response;

export function isAxiosResponse<T>(resp: HttpResponse<T>): resp is AxiosResponse<T> {
  return 'data' in resp && 'config' in resp;
}

export interface RestError {
  code?: string;
  message: string;
  details?: Array<{
    code?: string;
    message: string;
  }>;
}