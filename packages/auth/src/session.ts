import { jwtVerify, SignJWT } from "jose";
import type { AppSessionPayload } from "./types";

export const AuthCookies = {
  Session: "midday-auth-session",
  AccessToken: "midday-access-token",
  RefreshToken: "midday-refresh-token",
  AuthState: "midday-auth-state",
  PkceVerifier: "midday-auth-pkce-verifier",
  ReturnTo: "midday-auth-return-to",
} as const;

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 8;

function getSessionSecret() {
  const configured =
    process.env.APP_SESSION_SECRET || process.env.AUTH_SESSION_SECRET;

  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SESSION_SECRET or AUTH_SESSION_SECRET is required");
  }

  return "midday-dev-session-secret-change-me";
}

function getSessionTtlSeconds() {
  const parsed = Number.parseInt(
    process.env.AUTH_SESSION_TTL_SECONDS ?? "",
    10,
  );

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return DEFAULT_SESSION_TTL_SECONDS;
}

export async function createAppSessionToken(
  payload: AppSessionPayload,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = getSessionTtlSeconds();
  const expiresAt = payload.expiresAt ?? now + ttl;

  return new SignJWT({
    sub: payload.sub,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    email: payload.email,
    name: payload.name,
    expiresAt,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(getSessionSecret()));
}

export async function verifyAppSessionToken(
  token?: string,
): Promise<AppSessionPayload | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(getSessionSecret()),
    );

    if (
      typeof payload.sub !== "string" ||
      typeof payload.accessToken !== "string"
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      accessToken: payload.accessToken,
      refreshToken:
        typeof payload.refreshToken === "string"
          ? payload.refreshToken
          : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      expiresAt:
        typeof payload.expiresAt === "number" ? payload.expiresAt : undefined,
    };
  } catch {
    return null;
  }
}

export function getAuthCookieOptions(maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function getAuthPublicCookieOptions(maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production";

  return {
    httpOnly: false,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function getPkceCookieOptions(maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
