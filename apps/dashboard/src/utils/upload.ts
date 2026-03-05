import { stripSpecialCharacters } from "@midday/utils";

type ResumableUploadParmas = {
  file: File;
  path: string[];
  bucket: string;
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
};

type UploadUrlResponse = {
  signedUrl: string;
  method: "PUT";
};

function uploadWithProgress(
  signedUrl: string,
  file: File,
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) {
        return;
      }

      onProgress(event.loaded, event.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Upload failed"));
    };

    xhr.send(file);
  });
}

export async function resumableUpload(
  _client: unknown,
  { file, path, bucket, onProgress }: ResumableUploadParmas,
) {
  const filename = stripSpecialCharacters(file.name);
  const fullPath = decodeURIComponent([...path, filename].join("/"));

  const response = await fetch("/api/storage/upload-url", {
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

  if (!response.ok) {
    throw new Error("Failed to request upload URL");
  }

  const { signedUrl } = (await response.json()) as UploadUrlResponse;

  await uploadWithProgress(signedUrl, file, onProgress);

  return {
    filename,
    file,
  };
}
