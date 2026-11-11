import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

export const digestFile = async (path) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};
export class ObjectStore {
  constructor({
    endpoint,
    region = 'auto',
    accessKeyId,
    secretAccessKey,
    bucket,
  }) {
    this.bucket = bucket;
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 3,
    });
  }
  async send(command, timeout = 300_000) {
    return this.client.send(command, {
      abortSignal: AbortSignal.timeout(timeout),
    });
  }
  async list(prefix) {
    const items = [];
    let continuation;
    do {
      const result = await this.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuation,
        }),
      );
      items.push(...(result.Contents || []));
      continuation = result.NextContinuationToken;
    } while (continuation);
    return items;
  }
  async readJson(key) {
    try {
      const result = await this.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        15000,
      );
      return JSON.parse(await result.Body.transformToString());
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)
        return null;
      throw error;
    }
  }
  async writeJson(key, value) {
    await this.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(value),
        ContentType: 'application/json',
      }),
      15000,
    );
  }
  async download(key, path, etag) {
    const result = await this.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(etag ? { IfMatch: etag } : {}),
      }),
    );
    await pipeline(result.Body, createWriteStream(path, { mode: 0o600 }));
  }
  async upload(key, path) {
    const size = (await stat(path)).size;
    if (size > 5_000_000_000)
      throw Error('Object exceeds supported single-upload size');
    const sha256 = await digestFile(path);
    await this.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(path),
        ContentLength: size,
        Metadata: { sha256 },
      }),
    );
    return { key, size, sha256 };
  }
  async verify(item, path) {
    await this.download(item.key, path);
    if (
      (await stat(path)).size !== item.size ||
      (await digestFile(path)) !== item.sha256
    )
      throw Error('Backup checksum mismatch');
  }
  async remove(keys) {
    for (let offset = 0; offset < keys.length; offset += 1000) {
      const result = await this.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: keys.slice(offset, offset + 1000).map((Key) => ({ Key })),
          },
        }),
      );
      if (result.Errors?.length)
        throw Error('Backup retention deletion failed');
    }
  }
}
