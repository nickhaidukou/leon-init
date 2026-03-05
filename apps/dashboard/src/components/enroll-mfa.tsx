import { Button } from "@midday/ui/button";
import Link from "next/link";

export function EnrollMFA() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#606060]">
        MFA enrollment is handled by Zitadel.
      </p>

      <Link href="/account/security">
        <Button className="w-full">Open Security Settings</Button>
      </Link>
    </div>
  );
}
