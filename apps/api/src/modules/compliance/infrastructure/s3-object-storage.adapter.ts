import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ApiConfig } from '@vms/config';
import { API_CONFIG } from '../../../common/tokens.js';
import type {
  GetSignedUrlParams,
  ObjectStoragePort,
  PutObjectParams,
} from '../application/object-storage.port.js';
import { DocumentStorageFailedError } from '../domain/compliance-errors.js';

@Injectable()
export class S3ObjectStorageAdapter implements ObjectStoragePort, OnModuleInit {
  private readonly logger = new Logger(S3ObjectStorageAdapter.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY,
        secretAccessKey: config.S3_SECRET_KEY,
      },
      forcePathStyle: config.S3_FORCE_PATH_STYLE ?? true,
    });
  }

  public async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucketExists();
    } catch (err) {
      this.logger.warn(
        `Could not auto-verify S3 bucket '${this.bucket}' on startup: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  public async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err: unknown) {
      const isNotFound =
        (err &&
          typeof err === 'object' &&
          '$metadata' in err &&
          (err as { $metadata: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) ||
        (err instanceof Error && err.name === 'NotFound');

      if (isNotFound) {
        this.logger.log(`Bucket '${this.bucket}' does not exist. Creating...`);
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket '${this.bucket}' created successfully.`);
      } else {
        throw err;
      }
    }
  }

  public async putObject(params: PutObjectParams): Promise<{ etag?: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.objectKey,
        Body: params.body,
        ContentType: params.contentType,
      });

      const response = await this.client.send(command);
      return response.ETag ? { etag: response.ETag } : {};
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to put object '${params.objectKey}': ${msg}`);
      throw new DocumentStorageFailedError(msg);
    }
  }

  public async getSignedDownloadUrl(params: GetSignedUrlParams): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: params.objectKey,
      });

      return await getSignedUrl(this.client, command, {
        expiresIn: params.expiresInSeconds,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to generate signed download URL for '${params.objectKey}': ${msg}`);
      throw new DocumentStorageFailedError(msg);
    }
  }

  public async deleteObject(params: { objectKey: string }): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: params.objectKey,
      });
      await this.client.send(command);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to delete object '${params.objectKey}': ${msg}`);
      // Best-effort cleanup: do not throw to avoid masking database failures
    }
  }
}
