import { NextResponse } from "next/server";
import { z } from "zod";
import { getTRPCClient } from "@/trpc/server";

const requestSchema = z.object({
  filePath: z.array(z.string()).min(1),
  bucket: z.string().optional(),
  contentType: z.string().optional(),
  expireIn: z.number().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid upload URL request" },
      { status: 400 },
    );
  }

  const trpcClient = await getTRPCClient();

  const result = await trpcClient.documents.createUploadUrl.mutate({
    filePath: parsed.data.filePath,
    bucket: parsed.data.bucket,
    contentType: parsed.data.contentType,
    expireIn: parsed.data.expireIn,
  });

  return NextResponse.json(result);
}
