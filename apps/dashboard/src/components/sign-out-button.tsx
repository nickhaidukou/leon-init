"use client";

import { Button } from "@midday/ui/button";

export function SignOutButton() {
  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={() => {
        window.location.assign("/api/auth/logout?return_to=/login");
      }}
    >
      Sign out
    </Button>
  );
}
