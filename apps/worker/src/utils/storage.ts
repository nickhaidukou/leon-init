import {
  createSignedUrl as createSignedUrlFromStorage,
  download as downloadFromStorage,
  upload as uploadToStorage,
} from "@midday/storage";

type UploadBody = Parameters<typeof uploadToStorage>[0]["body"];

type UploadVaultFileParams = {
  key: string;
  body: UploadBody;
  contentType?: string;
  cacheControl?: string;
};

type CreateVaultSignedUrlParams = {
  key: string;
  expireIn: number;
  options?: {
    download?: boolean;
    filename?: string;
  };
};

export async function downloadVaultFile(key: string): Promise<Blob> {
  const file = await downloadFromStorage({
    bucket: "vault",
    key,
  });

  return new Blob([file.data], {
    type: file.contentType || "application/octet-stream",
  });
}

export async function uploadVaultFile({
  key,
  body,
  contentType,
  cacheControl,
}: UploadVaultFileParams) {
  await uploadToStorage({
    bucket: "vault",
    key,
    body,
    contentType,
    cacheControl,
  });

  return {
    path: key,
  };
}

export async function createVaultSignedUrl({
  key,
  expireIn,
  options,
}: CreateVaultSignedUrlParams) {
  return createSignedUrlFromStorage({
    bucket: "vault",
    key,
    expireIn,
    options,
  });
}
