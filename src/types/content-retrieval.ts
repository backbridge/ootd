import type { Linkable } from './linkable.js';

export type MediaUrlPolicy = 'LOCAL' | 'ACS' | 'BOCS';

export interface ContentRenditionEntry {
  id: string;
  title?: string;
  updated?: string;
  content?: {
    src: string;
    type?: string;
  };
  links?: Array<{ rel: string; href: string; [key: string]: unknown }>;
}

export interface ContentsFeed extends Linkable {
  entries: ContentRenditionEntry[];
  total?: number;
  itemsPerPage?: number;
  page?: number;
}

export interface ContentDownloadOptions {
  mediaUrlPolicy?: MediaUrlPolicy;
  responseType?: 'arraybuffer' | 'blob' | 'stream';
}

export type RenditionFormat =
  | 'jpeg_preview'
  | 'jpeg_lres'
  | 'jpeg_th'
  | 'jpeg_story'
  | 'primary';

export type RenditionSelectionPriority = [
  'jpeg_preview',
  'jpeg_lres',
  'jpeg_th:large_jpeg_th',
  'jpeg_th:medium_jpeg_th',
  'jpeg_th:small_jpeg_th',
];
