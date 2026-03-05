"use client";

import { DropdownMenuItem } from "@midday/ui/dropdown-menu";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOut() {
  const [isLoading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    setLoading(true);

    await fetch("/api/auth/logout?return_to=/login", {
      method: "GET",
      cache: "no-store",
    });

    router.push("/login");
    router.refresh();
  };

  return (
    <DropdownMenuItem className="text-xs" onClick={handleSignOut}>
      {isLoading ? "Loading..." : "Sign out"}
    </DropdownMenuItem>
  );
}
