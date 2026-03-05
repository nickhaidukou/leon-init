import { Button } from "@midday/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@midday/ui/card";
import Link from "next/link";

export async function MfaSettingsList() {
  const issuer = process.env.ZITADEL_ISSUER?.replace(/\/+$/, "");
  const zitadelMfaUrl =
    process.env.ZITADEL_ACCOUNT_MFA_URL ||
    (issuer ? `${issuer}/ui/console/users/me` : "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Multi-factor authentication</CardTitle>
        <CardDescription>
          Manage MFA in Zitadel. Midday uses Zitadel as the source of truth for
          enrollment, recovery, and verification.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {zitadelMfaUrl ? (
          <p className="text-sm text-[#606060]">
            Open your Zitadel account settings to add or remove authenticator
            devices and enforce MFA for this user.
          </p>
        ) : (
          <p className="text-sm text-[#606060]">
            Configure `ZITADEL_ACCOUNT_MFA_URL` (or `ZITADEL_ISSUER`) to manage
            MFA from this page.
          </p>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <div />
        {zitadelMfaUrl ? (
          <Link href={zitadelMfaUrl} target="_blank" rel="noreferrer">
            <Button>Manage in Zitadel</Button>
          </Link>
        ) : (
          <Button disabled>Manage in Zitadel</Button>
        )}
      </CardFooter>
    </Card>
  );
}
