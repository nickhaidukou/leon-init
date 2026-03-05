import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { getOpenIdConfiguration } from "./oidc";
import type { AuthIdentity } from "./types";

let jwksResolverPromise: Promise<ReturnType<typeof createRemoteJWKSet>> | null =
  null;

function getLegacyJwtSecret() {
  return process.env.AUTH_JWT_SECRET || process.env.LEGACY_JWT_SECRET;
}

function toAuthIdentity(payload: Record<string, unknown>): AuthIdentity | null {
  const sub = payload.sub;

  if (typeof sub !== "string" || sub.length === 0) {
    return null;
  }

  const userMetadata =
    payload.user_metadata && typeof payload.user_metadata === "object"
      ? (payload.user_metadata as Record<string, unknown>)
      : undefined;

  const email =
    typeof payload.email === "string"
      ? payload.email
      : typeof userMetadata?.email === "string"
        ? userMetadata.email
        : undefined;

  const name =
    typeof payload.name === "string"
      ? payload.name
      : typeof userMetadata?.full_name === "string"
        ? userMetadata.full_name
        : undefined;

  return {
    sub,
    email,
    name,
    raw: payload,
  };
}

async function verifyWithZitadel(
  accessToken: string,
): Promise<AuthIdentity | null> {
  if (!process.env.ZITADEL_ISSUER) {
    return null;
  }

  const config = await getOpenIdConfiguration();

  if (!jwksResolverPromise) {
    jwksResolverPromise = Promise.resolve(
      createRemoteJWKSet(new URL(config.jwks_uri)),
    );
  }

  const audience = process.env.ZITADEL_AUDIENCE;

  const { payload } = await jwtVerify(accessToken, await jwksResolverPromise, {
    issuer: config.issuer,
    audience: audience || undefined,
  });

  return toAuthIdentity(payload as Record<string, unknown>);
}

async function verifyWithLegacySecret(
  accessToken: string,
): Promise<AuthIdentity | null> {
  const secret = getLegacyJwtSecret();

  if (!secret) {
    return null;
  }

  const { payload } = await jwtVerify(
    accessToken,
    new TextEncoder().encode(secret),
  );

  return toAuthIdentity(payload as Record<string, unknown>);
}

export async function verifyAccessToken(
  accessToken?: string,
): Promise<AuthIdentity | null> {
  if (!accessToken) {
    return null;
  }

  try {
    const identity = await verifyWithZitadel(accessToken);

    if (identity) {
      return identity;
    }
  } catch {
    // Fallback to legacy verification for non-Zitadel test/dev tokens.
  }

  try {
    return await verifyWithLegacySecret(accessToken);
  } catch {
    return null;
  }
}

export function decodeJwtPayloadUnsafe(
  accessToken?: string,
): Record<string, unknown> | null {
  if (!accessToken) {
    return null;
  }

  try {
    return decodeJwt(accessToken) as Record<string, unknown>;
  } catch {
    return null;
  }
}
