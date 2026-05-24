export interface MultipartMetadata {
  properties: {
    r_object_type?: string;
    object_name?: string;
    a_content_type?: string;
    [key: string]: unknown;
  };
}

export interface MultipartUploadBody {
  boundary: string;
  metadata: MultipartMetadata;
  content: Blob | Buffer | ReadableStream;
  contentMediaType: string;
}

export interface UploadContentOptions {
  format?: string;
  appendProperties?: boolean;
}

export type CheckInVersionType = 'next-major' | 'next-minor' | 'branch';

export interface CheckInOptions extends UploadContentOptions {
  versionType?: CheckInVersionType;
}
