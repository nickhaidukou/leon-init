"use client";

import { Button } from "@midday/ui/button";
import Link from "next/link";

type Props = {
  className?: string;
};

export function OTPSignIn({ className }: Props) {
  return (
    <div className={className}>
      <p className="text-sm text-[#878787] mb-4">
        Email OTP sign-in is disabled. Continue with Zitadel OAuth.
      </p>
      <Link href="/api/auth/login">
        <Button className="w-full">Continue with Zitadel</Button>
      </Link>
    </div>
  );
}
