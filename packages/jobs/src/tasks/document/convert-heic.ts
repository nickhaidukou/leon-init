import { downloadVaultFile, uploadVaultFile } from "@jobs/utils/storage";
import { schemaTask } from "@trigger.dev/sdk";
import convert from "heic-convert";
import sharp from "sharp";
import { z } from "zod";

const MAX_SIZE = 1500;

export const convertHeic = schemaTask({
  id: "convert-heic",
  machine: {
    preset: "large-1x",
  },
  schema: z.object({
    filePath: z.array(z.string()),
  }),
  run: async ({ filePath }) => {
    console.log("Converting HEIC to JPG");

    const fileData = await downloadVaultFile(filePath.join("/"));

    const buffer = await fileData.arrayBuffer();

    const decodedImage = await convert({
      // @ts-expect-error
      buffer: new Uint8Array(buffer),
      format: "JPEG",
      quality: 1,
    });

    const image = await sharp(decodedImage)
      .rotate()
      .resize({ width: MAX_SIZE })
      .toFormat("jpeg")
      .toBuffer();

    // Upload the converted image with .jpg extension
    const uploadedData = await uploadVaultFile({
      key: filePath.join("/"),
      body: image,
      contentType: "image/jpeg",
    });

    return uploadedData;
  },
});
