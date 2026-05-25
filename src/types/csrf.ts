export interface CsrfState {
  clientToken?: string;
  csrfHeaderName?: string;
  csrfToken?: string;
}

export const CSRF_HEADER_CONSTANTS = {
  CLIENT_TOKEN_HEADER: 'DOCUMENTUM-CLIENT-TOKEN',
  CLIENT_TOKEN_COOKIE: 'DOCUMENTUM-CLIENT-TOKEN',
  CSRF_HEADER_NAME_HEADER: 'DOCUMENTUM-CSRF-HEADER-NAME',
} as const;

export interface TokenExtractionResult {
  clientToken?: string;
  csrfHeaderName?: string;
  csrfToken?: string;
}

export type TokenRotation = CsrfState;
