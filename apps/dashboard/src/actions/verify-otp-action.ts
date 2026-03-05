"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { actionClient } from "./safe-action";

export const verifyOtpAction = actionClient
  .schema(
    z.object({
      token: z.string(),
      email: z.string(),
      redirectTo: z.string(),
    }),
  )
  .action(async ({ parsedInput: { email, token, redirectTo } }) => {
    void email;
    void token;
    const encoded = encodeURIComponent(redirectTo);
    redirect(`/login?error=otp_disabled&return_to=${encoded}`);
  });
