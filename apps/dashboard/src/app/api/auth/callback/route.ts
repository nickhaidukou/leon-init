import {
  createAppSessionToken,
  exchangeCodeForTokens,
  getAuthCookieOptions,
  getAuthPublicCookieOptions,
  verifyAccessToken,
} from "@midday/auth";
import { LogEvents } from "@midday/events/events";
import { setupAnalytics } from "@midday/events/server";
import { sanitizeRedirectPath } from "@midday/utils/sanitize-redirect";
import { addSeconds, addYears } from "date-fns";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getTRPCClient } from "@/trpc/server";
import { Cookies } from "@/utils/constants";
import { getUrl } from "@/utils/environment";

function clearAuthFlowCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) {
  const clearOptions = {
    maxAge: 0,
    path: "/",
  };

  cookieStore.set(Cookies.AuthState, "", clearOptions);
  cookieStore.set(Cookies.PkceVerifier, "", clearOptions);
  cookieStore.set(Cookies.AuthClient, "", clearOptions);
  cookieStore.set(Cookies.ReturnTo, "", clearOptions);
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const requestUrl = new URL(req.url);
  const origin = getUrl();
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const client =
    requestUrl.searchParams.get("client") ||
    cookieStore.get(Cookies.AuthClient)?.value ||
    null;
  const returnTo =
    requestUrl.searchParams.get("return_to") ||
    cookieStore.get(Cookies.ReturnTo)?.value ||
    null;
  const provider = requestUrl.searchParams.get("provider");
  const resolvedProvider =
    provider || cookieStore.get(Cookies.PreferredSignInProvider)?.value || null;

  if (client === "desktop") {
    return NextResponse.redirect(`${origin}/verify?code=${code}`);
  }

  if (resolvedProvider) {
    cookieStore.set(Cookies.PreferredSignInProvider, resolvedProvider, {
      expires: addYears(new Date(), 1),
    });
  }

  const storedState = cookieStore.get(Cookies.AuthState)?.value;
  const storedVerifier = cookieStore.get(Cookies.PkceVerifier)?.value;

  if (storedState && state && storedState !== state) {
    clearAuthFlowCookies(cookieStore);
    return NextResponse.redirect(`${origin}/login?error=invalid_state`);
  }

  if (code && storedVerifier) {
    try {
      const redirectUri = new URL("/api/auth/callback", origin).toString();

      const tokens = await exchangeCodeForTokens({
        code,
        codeVerifier: storedVerifier,
        redirectUri,
      });

      const identity = await verifyAccessToken(tokens.access_token);

      if (!identity) {
        clearAuthFlowCookies(cookieStore);
        return NextResponse.redirect(`${origin}/login?error=invalid_token`);
      }

      const expiresIn = tokens.expires_in ?? 60 * 60;
      const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

      const sessionToken = await createAppSessionToken({
        sub: identity.sub,
        email: identity.email,
        name: identity.name,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      });

      cookieStore.set(
        Cookies.AuthSession,
        sessionToken,
        getAuthCookieOptions(expiresIn),
      );

      cookieStore.set(
        Cookies.AccessToken,
        tokens.access_token,
        getAuthPublicCookieOptions(expiresIn),
      );

      if (tokens.refresh_token) {
        cookieStore.set(
          Cookies.RefreshToken,
          tokens.refresh_token,
          getAuthCookieOptions(60 * 60 * 24 * 30),
        );
      }

      // Ensure reads hit primary right after auth bootstrap writes.
      cookieStore.set(Cookies.ForcePrimary, "true", {
        expires: addSeconds(new Date(), 30),
        httpOnly: false,
        sameSite: "lax",
      });

      clearAuthFlowCookies(cookieStore);

      // If user is redirected from an invite, redirect to teams page.
      if (returnTo?.startsWith("teams/invite/")) {
        const analytics = await setupAnalytics();
        analytics.track({
          event: LogEvents.SignIn.name,
          channel: LogEvents.SignIn.channel,
          provider: resolvedProvider ?? "unknown",
          destination: "teams",
        });

        return NextResponse.redirect(`${origin}/teams`);
      }

      // Force primary reads in auth callback for read-after-write consistency.
      const trpcClient = await getTRPCClient({ forcePrimary: true });
      const user = await trpcClient.user.me.query().catch(() => null);

      const isOnboarding = !user?.fullName || !user?.teamId;
      const analytics = await setupAnalytics();

      analytics.track({
        event: LogEvents.SignIn.name,
        channel: LogEvents.SignIn.channel,
        provider: resolvedProvider ?? "unknown",
        destination: isOnboarding ? "onboarding" : "dashboard",
      });

      if (isOnboarding) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }
    } catch {
      clearAuthFlowCookies(cookieStore);
      return NextResponse.redirect(
        `${origin}/login?error=oauth_callback_failed`,
      );
    }
  }

  if (returnTo) {
    const normalized = returnTo.startsWith("/") ? returnTo : `/${returnTo}`;
    const safePath = sanitizeRedirectPath(normalized);
    return NextResponse.redirect(`${origin}${safePath}`);
  }

  return NextResponse.redirect(origin);
}
