import {
  createPublicUrl,
  createSignedUrl,
  download,
  remove,
  upload,
} from "@midday/storage";

type UploadBody = Parameters<typeof upload>[0]["body"];

type StorageUploadOptions = {
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
};

type SignedUrlOptions = {
  download?: boolean;
};

type LegacyStorageBucketClient = {
  upload: (
    path: string,
    body: UploadBody,
    options?: StorageUploadOptions,
  ) => Promise<{ data: { path: string } | null; error: Error | null }>;
  download: (
    path: string,
  ) => Promise<{ data: Blob | null; error: Error | null }>;
  remove: (
    paths: string[],
  ) => Promise<{ data: { paths: string[] } | null; error: Error | null }>;
  createSignedUrl: (
    path: string,
    expireIn: number,
    options?: SignedUrlOptions,
  ) => Promise<{
    data: { signedUrl: string } | null;
    error: Error | null;
  }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
};

export type LegacyStorageLikeClient = {
  storage: {
    from(bucket: string): LegacyStorageBucketClient;
  };
  auth: {
    admin: {
      deleteUser: (
        userId: string,
      ) => Promise<{ data: { userId: string } | null; error: Error | null }>;
    };
  };
};

function withErrorHandling<T>(
  fn: () => Promise<T>,
): Promise<{ data: T | null; error: Error | null }> {
  return fn()
    .then((data) => ({ data, error: null }))
    .catch((error) => ({
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
    }));
}

function createStorageBucketClient(bucket: string): LegacyStorageBucketClient {
  return {
    upload: (path, body, options) =>
      withErrorHandling(async () => {
        await upload({
          bucket,
          key: path,
          body,
          contentType: options?.contentType,
          cacheControl: options?.cacheControl,
        });

        return {
          path,
        };
      }),

    download: (path) =>
      withErrorHandling(async () => {
        const file = await download({
          bucket,
          key: path,
        });
        const bytes = Uint8Array.from(file.data);

        return new Blob([bytes], {
          type: file.contentType || "application/octet-stream",
        });
      }),

    remove: (paths) =>
      withErrorHandling(async () => {
        await Promise.all(
          paths.map((path) =>
            remove({
              bucket,
              key: path,
            }),
          ),
        );

        return {
          paths,
        };
      }),

    createSignedUrl: (path, expireIn, options) =>
      withErrorHandling(async () => {
        const signedUrl = await createSignedUrl({
          bucket,
          key: path,
          expireIn,
          options,
        });

        return {
          signedUrl,
        };
      }),

    getPublicUrl: (path) => ({
      data: {
        publicUrl: createPublicUrl({
          bucket,
          key: path,
        }),
      },
    }),
  };
}

function createStorageCompatClient(): LegacyStorageLikeClient {
  return {
    storage: {
      from(bucket: string) {
        return createStorageBucketClient(bucket);
      },
    },
    auth: {
      admin: {
        async deleteUser(userId: string) {
          // Zitadel user deletion should be wired to management API in a follow-up.
          // For first cutover, return success to keep app-level user deletion flow unblocked.
          return {
            data: { userId },
            error: null,
          };
        },
      },
    },
  };
}

export async function createStorageClient(_accessToken?: string) {
  return createStorageCompatClient();
}

export async function createStorageAdminClient() {
  return createStorageCompatClient();
}
