export interface Link {
  rel: string;
  href: string;
  hrefTemplate?: string;
  title?: string;
  type?: string;
}

export interface Linkable {
  links: Link[];
}

export interface Entry<T extends Linkable> {
  id: string;
  title?: string;
  updated?: string;
  content: T;
}

export interface Feed<T extends Linkable> extends Linkable {
  entries: Entry<T>[];
  total?: number;
  itemsPerPage?: number;
  page?: number;
}

export interface PersistentObject extends Linkable {
  id: string;
  name?: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface Document extends PersistentObject {
  contentSize?: number;
  contentType?: string;
  lockOwner?: string;
  isCheckedOut?: boolean;
  versionLabel?: string[];
}

export interface Folder extends PersistentObject {
  path?: string;
}

export interface Cabinet extends Folder {
}

export interface Content extends Linkable {
  size?: number;
  contentType?: string;
  format?: string;
}
