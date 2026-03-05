"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authActionClient } from "./safe-action";

export const unenrollMfaAction = authActionClient
  .schema(
    z.object({
      factorId: z.string(),
    }),
  )
  .metadata({
    name: "unenroll-mfa",
  })
  .action(async ({ parsedInput: { factorId }, ctx: { teamId } }) => {
    void factorId;
    void teamId;

    revalidatePath("/account/security");

    throw new Error("MFA enrollment is managed by Zitadel");
  });
