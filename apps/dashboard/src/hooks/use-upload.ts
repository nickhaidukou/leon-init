import { useState } from "react";

interface UploadParams {
  file: File;
  path: string[];
  bucket: string;
}

interface UploadResult {
  url: string;
  path: string[];
}

type UploadUrlResponse = {
  signedUrl: string;
  publicUrl?: string;
  method: "PUT";
};

export function useUpload() {
  const [isLoading, setLoading] = useState<boolean>(false);

  const uploadFile = async ({
    file,
    path,
    bucket,
  }: UploadParams): Promise<UploadResult> => {
    setLoading(true);

    try {
      const fullPath = decodeURIComponent(path.join("/"));

      const uploadUrlResponse = await fetch("/api/storage/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filePath: fullPath.split("/"),
          bucket,
          contentType: file.type,
          expireIn: 60 * 10,
        }),
      });

      if (!uploadUrlResponse.ok) {
        throw new Error("Failed to create upload URL");
      }

      const { signedUrl, publicUrl } =
        (await uploadUrlResponse.json()) as UploadUrlResponse;

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }

      return {
        url: publicUrl ?? fullPath,
        path,
      };
    } finally {
      setLoading(false);
    }
  };

  return {
    uploadFile,
    isLoading,
  };
}
