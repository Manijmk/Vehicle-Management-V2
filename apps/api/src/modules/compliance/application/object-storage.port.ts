export interface PutObjectParams {
  objectKey: string;
  body: Buffer;
  contentType: string;
}

export interface GetSignedUrlParams {
  objectKey: string;
  expiresInSeconds: number;
}

export interface ObjectStoragePort {
  putObject(params: PutObjectParams): Promise<{ etag?: string }>;
  getSignedDownloadUrl(params: GetSignedUrlParams): Promise<string>;
  deleteObject(params: { objectKey: string }): Promise<void>;
  ensureBucketExists(): Promise<void>;
}
