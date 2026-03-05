/**
 * Storage utilities for insight audio files.
 */

/**
 * Storage bucket for audio files.
 */
const BUCKET = "vault";

/**
 * Default presigned URL expiry (7 days in seconds).
 */
const DEFAULT_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

type StorageError = {
  message: string;
};

type StorageClientLike = {
  storage: {
    from(bucket: string): {
      upload: (
        path: string,
        body: Buffer,
        options?: {
          contentType?: string;
          upsert?: boolean;
        },
      ) => Promise<{
        data?: { path?: string } | null;
        error?: StorageError | null;
      }>;
      createSignedUrl: (
        path: string,
        expiresInSeconds: number,
        options?: {
          download?: boolean;
        },
      ) => Promise<{
        data?: { signedUrl?: string } | null;
        error?: StorageError | null;
      }>;
      remove: (paths: string[]) => Promise<{ error?: StorageError | null }>;
    };
  };
};

/**
 * Generate the storage path for an insight's audio file.
 */
export function getAudioPath(teamId: string, insightId: string): string {
  return `${teamId}/insights/${insightId}.mp3`;
}

/**
 * Upload insight audio to storage.
 */
export async function uploadInsightAudio(
  storageClient: StorageClientLike,
  teamId: string,
  insightId: string,
  audioBuffer: Buffer,
): Promise<string> {
  const path = getAudioPath(teamId, insightId);

  const { data, error } = await storageClient.storage
    .from(BUCKET)
    .upload(path, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload insight audio: ${error.message}`);
  }

  if (!data?.path) {
    throw new Error("Failed to upload insight audio: missing storage path");
  }

  return data.path;
}

/**
 * Generate a presigned URL for accessing insight audio.
 */
export async function getAudioPresignedUrl(
  storageClient: StorageClientLike,
  audioPath: string,
  expiresInSeconds: number = DEFAULT_EXPIRY_SECONDS,
): Promise<string> {
  const { data, error } = await storageClient.storage
    .from(BUCKET)
    .createSignedUrl(audioPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to create signed URL for audio: ${error?.message || "Unknown error"}`,
    );
  }

  return data.signedUrl;
}

/**
 * Delete audio for an insight (for cleanup/regeneration).
 */
export async function deleteInsightAudio(
  storageClient: StorageClientLike,
  teamId: string,
  insightId: string,
): Promise<void> {
  const path = getAudioPath(teamId, insightId);

  const { error } = await storageClient.storage.from(BUCKET).remove([path]);

  if (error) {
    throw new Error(`Failed to delete insight audio: ${error.message}`);
  }
}
