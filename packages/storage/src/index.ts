import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type UploadParams = {
  bucket?: string;
  key: string | string[];
  body: PutObjectCommandInput["Body"];
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
};

type DownloadParams = {
  bucket?: string;
  key: string | string[];
};

type RemoveParams = {
  bucket?: string;
  key: string | string[];
};

type SignedUrlParams = {
  bucket?: string;
  key: string | string[];
  expireIn: number;
  options?: {
    download?: boolean;
    filename?: string;
  };
};

type PresignedUploadParams = {
  bucket?: string;
  key: string | string[];
  expireIn: number;
  contentType?: string;
  cacheControl?: string;
};

type PublicUrlParams = {
  bucket?: string;
  key: string | string[];
};

type DownloadResult = {
  data: Uint8Array;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
};

let s3Client: S3Client | null = null;

function getS3Client() {
  if (s3Client) {
    return s3Client;
  }

  const region = process.env.AWS_REGION || "us-east-1";

  const client = new S3Client({
    region,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN,
          }
        : undefined,
  });

  s3Client = client;

  return client;
}

function resolveBucket(bucket?: string) {
  const resolved = bucket || process.env.S3_BUCKET;

  if (!resolved) {
    throw new Error("S3 bucket is not configured. Set S3_BUCKET.");
  }

  return resolved;
}

function normalizeKey(key: string | string[]) {
  const value = Array.isArray(key) ? key.join("/") : key;

  return decodeURIComponent(value).replace(/^\/+/, "");
}

async function bodyToUint8Array(body: unknown): Promise<Uint8Array> {
  if (!body) {
    return new Uint8Array();
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }

  const bodyWithTransform = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };

  if (typeof bodyWithTransform.transformToByteArray === "function") {
    return bodyWithTransform.transformToByteArray();
  }

  const bodyWithArrayBuffer = body as {
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };

  if (typeof bodyWithArrayBuffer.arrayBuffer === "function") {
    return new Uint8Array(await bodyWithArrayBuffer.arrayBuffer());
  }

  if (
    typeof body === "object" &&
    body !== null &&
    Symbol.asyncIterator in (body as Record<PropertyKey, unknown>)
  ) {
    const chunks: Uint8Array[] = [];

    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      if (typeof chunk === "string") {
        chunks.push(new TextEncoder().encode(chunk));
      } else {
        chunks.push(chunk);
      }
    }

    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const merged = new Uint8Array(length);

    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    return merged;
  }

  throw new Error("Unsupported S3 response body type");
}

function getDownloadDisposition(
  key: string,
  options?: SignedUrlParams["options"],
) {
  if (!options?.download) {
    return undefined;
  }

  const filename = options.filename || key.split("/").at(-1) || "download";

  return `attachment; filename="${filename}"`;
}

function joinUrl(baseUrl: string, key: string) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalizedBase}/${key}`;
}

export async function upload({
  bucket,
  key,
  body,
  contentType,
  cacheControl,
  metadata,
}: UploadParams) {
  const resolvedBucket = resolveBucket(bucket);
  const resolvedKey = normalizeKey(key);

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: resolvedBucket,
      Key: resolvedKey,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
      Metadata: metadata,
    }),
  );

  return {
    bucket: resolvedBucket,
    key: resolvedKey,
  };
}

export async function remove({ bucket, key }: RemoveParams) {
  const resolvedBucket = resolveBucket(bucket);
  const resolvedKey = normalizeKey(key);

  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: resolvedBucket,
      Key: resolvedKey,
    }),
  );

  return {
    bucket: resolvedBucket,
    key: resolvedKey,
  };
}

export async function exists({ bucket, key }: DownloadParams) {
  const resolvedBucket = resolveBucket(bucket);
  const resolvedKey = normalizeKey(key);

  try {
    await getS3Client().send(
      new HeadObjectCommand({
        Bucket: resolvedBucket,
        Key: resolvedKey,
      }),
    );

    return true;
  } catch {
    return false;
  }
}

export async function download({
  bucket,
  key,
}: DownloadParams): Promise<DownloadResult> {
  const resolvedBucket = resolveBucket(bucket);
  const resolvedKey = normalizeKey(key);

  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: resolvedBucket,
      Key: resolvedKey,
    }),
  );

  const data = await bodyToUint8Array(response.Body);

  return {
    data,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    metadata: response.Metadata,
  };
}

export async function createSignedUrl({
  bucket,
  key,
  expireIn,
  options,
}: SignedUrlParams) {
  const resolvedBucket = resolveBucket(bucket);
  const resolvedKey = normalizeKey(key);

  const signedUrl = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: resolvedBucket,
      Key: resolvedKey,
      ResponseContentDisposition: getDownloadDisposition(resolvedKey, options),
    }),
    {
      expiresIn: expireIn,
    },
  );

  return signedUrl;
}

export async function createPresignedUploadUrl({
  bucket,
  key,
  expireIn,
  contentType,
  cacheControl,
}: PresignedUploadParams) {
  const resolvedBucket = resolveBucket(bucket);
  const resolvedKey = normalizeKey(key);

  const signedUrl = await getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: resolvedBucket,
      Key: resolvedKey,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
    {
      expiresIn: expireIn,
    },
  );

  return signedUrl;
}

export function createPublicUrl({ bucket, key }: PublicUrlParams) {
  const resolvedBucket = resolveBucket(bucket);
  const resolvedKey = normalizeKey(key);

  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;

  if (publicBaseUrl) {
    return joinUrl(publicBaseUrl, resolvedKey);
  }

  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint) {
    const normalized = endpoint.endsWith("/")
      ? endpoint.slice(0, -1)
      : endpoint;
    return `${normalized}/${resolvedBucket}/${resolvedKey}`;
  }

  const region = process.env.AWS_REGION || "us-east-1";
  return `https://${resolvedBucket}.s3.${region}.amazonaws.com/${resolvedKey}`;
}
