"use client";

import { Button } from "@midday/ui/button";
import { Icons } from "@midday/ui/icons";
import Link from "next/link";

export function SetupMfa() {
  return (
    <div>
      <div className="absolute left-5 top-4 md:left-10 md:top-10">
        <Link href="https://midday.ai">
          <Icons.LogoSmall />
        </Link>
      </div>

      <div className="flex min-h-screen justify-center items-center overflow-hidden p-6 md:p-0">
        <div className="relative z-20 m-auto flex w-full max-w-[380px] flex-col space-y-4">
          <div className="text-center">
            <h1 className="text-lg lg:text-xl mb-2 font-serif">
              Set up MFA in Zitadel
            </h1>
            <p className="text-[#878787] text-sm">
              Midday MFA is managed directly in Zitadel. Open your account
              settings to enroll an authenticator device.
            </p>
          </div>

          <Link href="/account/security" className="w-full">
            <Button className="w-full">Open Security Settings</Button>
          </Link>

          <div className="flex justify-center">
            <Link href="/" className="text-medium text-sm" prefetch>
              Skip
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
