"use client";

import { Button } from "@midday/ui/button";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function VerifyMfa() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to") ?? "";
  const href = `/api/auth/login${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""}`;

  return (
    <>
      <div className="pb-4">
        <div className="text-center">
          <h1 className="text-lg lg:text-xl mb-2 font-serif">
            Multi-factor verification required
          </h1>
          <p className="text-[#878787] text-sm mb-8">
            Continue through Zitadel to complete MFA verification for this
            session.
          </p>
        </div>
      </div>

      <Link href={href} className="w-full">
        <Button className="w-full">Continue with Zitadel</Button>
      </Link>
    </>
  );
}
