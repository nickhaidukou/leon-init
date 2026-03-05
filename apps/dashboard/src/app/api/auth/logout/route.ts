import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Cookies } from "@/utils/constants";
import { getUrl } from "@/utils/environment";

function clearCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", {
    path: "/",
    maxAge: 0,
  });
}

export async function POST(req: NextRequest) {
  const origin = getUrl();
  const nextUrl = new URL(req.url);
  const returnTo = nextUrl.searchParams.get("return_to") || "/login";

  const response = NextResponse.json({ success: true });

  clearCookie(response, Cookies.AuthSession);
  clearCookie(response, Cookies.AccessToken);
  clearCookie(response, Cookies.RefreshToken);
  clearCookie(response, Cookies.AuthState);
  clearCookie(response, Cookies.PkceVerifier);
  clearCookie(response, Cookies.AuthClient);
  clearCookie(response, Cookies.ReturnTo);
  clearCookie(response, Cookies.ForcePrimary);

  response.headers.set("x-redirect-to", `${origin}${returnTo}`);

  return response;
}

export async function GET(req: NextRequest) {
  const origin = getUrl();
  const nextUrl = new URL(req.url);
  const returnTo = nextUrl.searchParams.get("return_to") || "/login";

  const response = NextResponse.redirect(`${origin}${returnTo}`);

  clearCookie(response, Cookies.AuthSession);
  clearCookie(response, Cookies.AccessToken);
  clearCookie(response, Cookies.RefreshToken);
  clearCookie(response, Cookies.AuthState);
  clearCookie(response, Cookies.PkceVerifier);
  clearCookie(response, Cookies.AuthClient);
  clearCookie(response, Cookies.ReturnTo);
  clearCookie(response, Cookies.ForcePrimary);

  return response;
}
