
import {
  buildAuthorizationUrl,
  createPkcePair,
  getPkceCookieOptions,
} from "@midday/auth";
import { addYears } from "date-fns";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Cookies } from "@/utils/constants";
import { getUrl } from "@/utils/environment";

export async function GET(req: NextRequest) {
  const origin = getUrl();
  const requestUrl = new URL(req.url);
  const cookieStore = await cookies();

  const provider = requestUrl.searchParams.get("provider") || undefined;
  const returnTo = requestUrl.searchParams.get("return_to") || undefined;
  const client = requestUrl.searchParams.get("client") || undefined;

  const { verifier, challenge } = await createPkcePair();
  const state = crypto.randomUUID();

  const callbackUrl = new URL("/api/auth/callback", origin).toString();

  const authorizationUrl = await buildAuthorizationUrl({
    redirectUri: callbackUrl,
    state,
    codeChallenge: challenge,
    provider,
  });

  const authCookieOptions = getPkceCookieOptions(60 * 10);

  cookieStore.set(Cookies.AuthState, state, authCookieOptions);
  cookieStore.set(Cookies.PkceVerifier, verifier, authCookieOptions);

  if (client) {
    cookieStore.set(Cookies.AuthClient, client, authCookieOptions);
  }

  if (returnTo) {
    cookieStore.set(Cookies.ReturnTo, returnTo, authCookieOptions);
  }

  if (provider) {
    cookieStore.set(Cookies.PreferredSignInProvider, provider, {
      expires: addYears(new Date(), 1),
      path: "/",
      sameSite: "lax",
    });
  }

  return NextResponse.redirect(authorizationUrl);
}
