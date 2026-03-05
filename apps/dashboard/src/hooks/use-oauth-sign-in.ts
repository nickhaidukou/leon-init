"use client";

import { isDesktopApp } from "@midday/desktop-client/platform";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { getUrl } from "@/utils/environment";

export type OAuthProvider = "google" | "apple" | "github" | "azure";

type ProviderConfig = {
  name: string;
  icon: "Google" | "Apple" | "Github" | "Microsoft";
  variant: "primary" | "secondary";
  supportsReturnTo: boolean;
};

const OAUTH_PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
  google: {
    name: "Google",
    icon: "Google",
    variant: "secondary",
    supportsReturnTo: true,
  },
  apple: {
    name: "Apple",
    icon: "Apple",
    variant: "secondary",
    supportsReturnTo: false,
  },
  github: {
    name: "Github",
    icon: "Github",
    variant: "secondary",
    supportsReturnTo: true,
  },
  azure: {
    name: "Microsoft",
    icon: "Microsoft",
    variant: "secondary",
    supportsReturnTo: true,
  },
};

export function useOAuthSignIn(provider: OAuthProvider) {
  const [isLoading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to");
  const config = OAUTH_PROVIDERS[provider];

  const handleSignIn = async () => {
    setLoading(true);

    const loginUrl = new URL("/api/auth/login", getUrl());
    loginUrl.searchParams.set("provider", provider);

    const isDesktop = isDesktopApp();

    if (isDesktop) {
      loginUrl.searchParams.set("client", "desktop");
    } else if (config.supportsReturnTo && returnTo) {
      loginUrl.searchParams.set("return_to", returnTo);
    }

    window.location.assign(loginUrl.toString());
  };

  return { handleSignIn, isLoading, config };
}
