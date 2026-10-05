import fs from "node:fs";
import path from "node:path";

//
// Storage abstraction for user-uploaded files (receipt images). Rows in the
// DB store an opaque storage KEY like "receipts/{userId}/{uuid}.jpg" — never
// a filesystem path. The driver decides where bytes live:
//   - local (default): ./data/<key> on disk — dev, tests, self-hosting
//   - s3 (STORAGE_DRIVER=s3): any S3-compatible bucket (AWS S3, R2, GCS)

export interface StorageDriver {
  put(key: string, data: Uint8Array): Promise<void>;
  /** Returns null when the object does not exist. */
  get(key: string): Promise<Buffer | null>;
  /** Best-effort — missing objects are not an error. */
  delete(key: string): Promise<void>;
}

// Keys are generated server-side, but values read back from the DB are
// re-validated so a tampered image_path can never escape the storage root.
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/**
 * Validates a storage key: allowed charset, no ".." segments, no absolute
 * paths. Also accepts legacy pre-migration keys ("data/receipts/…") by
 * stripping the "data/" prefix. Returns null for anything unsafe.
 */
export function normalizeStorageKey(key: string): string | null {
  const normalized = key.startsWith("data/") ? key.slice("data/".length) : key;
  if (!KEY_PATTERN.test(normalized)) return null;
  if (normalized.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) {
    return null;
  }
  return normalized;
}

/** Canonical key for a receipt image. */
export function receiptImageKey(userId: string, ext: string): string {
  return `receipts/${userId}/${crypto.randomUUID()}.${ext}`;
}

// --- Local filesystem driver ---

const LOCAL_ROOT = path.join(process.cwd(), "data");

class LocalStorageDriver implements StorageDriver {
  private resolve(key: string): string | null {
    const safeKey = normalizeStorageKey(key);
    if (!safeKey) return null;
    const fullPath = path.resolve(LOCAL_ROOT, safeKey);
    if (!fullPath.startsWith(LOCAL_ROOT + path.sep)) return null;
    return fullPath;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const fullPath = this.resolve(key);
    if (!fullPath) throw new Error(`[storage] invalid key: ${key}`);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, data);
  }

  async get(key: string): Promise<Buffer | null> {
    const fullPath = this.resolve(key);
    if (!fullPath) return null;
    try {
      return await fs.promises.readFile(fullPath);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolve(key);
    if (!fullPath) return;
    try {
      await fs.promises.unlink(fullPath);
    } catch {
      // Best-effort: don't fail if deletion doesn't work
    }
  }
}

// --- S3-compatible driver (AWS S3, Cloudflare R2, GCS interop, MinIO) ---

class S3StorageDriver implements StorageDriver {
  private bucket: string;
  // oxlint-disable-next-line no-explicit-any
  private clientPromise: Promise<any> | null = null;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new Error("[storage] STORAGE_DRIVER=s3 requires S3_BUCKET");
    }
    this.bucket = bucket;
  }

  // The AWS SDK is loaded lazily so local/dev deployments never pay for it.
  private client() {
    this.clientPromise ??= import("@aws-sdk/client-s3").then(
      (mod) =>
        new mod.S3Client({
          region: process.env.S3_REGION ?? "auto",
          endpoint: process.env.S3_ENDPOINT || undefined,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
          credentials: process.env.S3_ACCESS_KEY_ID
            ? {
                accessKeyId: process.env.S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
              }
            : undefined,
        }),
    );
    return this.clientPromise;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const safeKey = normalizeStorageKey(key);
    if (!safeKey) throw new Error(`[storage] invalid key: ${key}`);
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: safeKey, Body: data }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    const safeKey = normalizeStorageKey(key);
    if (!safeKey) return null;
    const { GetObjectCommand, NoSuchKey } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    try {
      const result = await client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: safeKey }),
      );
      if (!result.Body) return null;
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      if ((err as { name?: string }).name === "NotFound") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const safeKey = normalizeStorageKey(key);
    if (!safeKey) return;
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey }),
      );
    } catch {
      // Best-effort: don't fail if deletion doesn't work
    }
  }
}

export const storage: StorageDriver =
  process.env.STORAGE_DRIVER === "s3"
    ? new S3StorageDriver()
    : new LocalStorageDriver();
