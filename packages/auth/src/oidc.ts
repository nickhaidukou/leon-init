import { createHash, randomBytes } from "node:crypto";
import type { OidcTokenResponse, OpenIdConfiguration } from "./types";

type BuildAuthorizationUrlParams = {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  provider?: string;
  extraScopes?: string[];
};

type ExchangeCodeParams = {
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

type RefreshTokenParams = {
  refreshToken: string;
};

const DEFAULT_SCOPE = "openid profile email offline_access";

let openIdConfigPromise: Promise<OpenIdConfiguration> | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

function getIssuerBaseUrl() {
  return getRequiredEnv("ZITADEL_ISSUER").replace(/\/+$/, "");
}

function buildScopes(extraScopes?: string[]) {
  const scopes = new Set(DEFAULT_SCOPE.split(" "));

  for (const scope of extraScopes ?? []) {
    if (scope) {
      scopes.add(scope);
    }
  }

  return [...scopes].join(" ");
}

function resolveProviderHint(provider?: string) {
  if (!provider) {
    return process.env.ZITADEL_DEFAULT_IDP_HINT;
  }

  const providerEnvKey = `ZITADEL_IDP_HINT_${provider.toUpperCase()}`;

  return process.env[providerEnvKey] ?? process.env.ZITADEL_DEFAULT_IDP_HINT;
}

export async function getOpenIdConfiguration(): Promise<OpenIdConfiguration> {
  if (!openIdConfigPromise) {
    openIdConfigPromise = (async () => {
      const response = await fetch(
        `${getIssuerBaseUrl()}/.well-known/openid-configuration`,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch OpenID configuration: ${response.status} ${response.statusText}`,
        );
      }

      const config = (await response.json()) as OpenIdConfiguration;

      if (!config.authorization_endpoint || !config.token_endpoint) {
        throw new Error("Invalid OpenID configuration from Zitadel issuer");
      }

      return config;
    })();
  }

  return openIdConfigPromise;
}

export async function buildAuthorizationUrl({
  redirectUri,
  state,
  codeChallenge,
  provider,
  extraScopes,
}: BuildAuthorizationUrlParams): Promise<string> {
  const config = await getOpenIdConfiguration();
  const url = new URL(config.authorization_endpoint);

  url.searchParams.set("client_id", getRequiredEnv("ZITADEL_CLIENT_ID"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", buildScopes(extraScopes));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  const audience = process.env.ZITADEL_AUDIENCE;
  if (audience) {
    url.searchParams.set("audience", audience);
  }

  const providerHint = resolveProviderHint(provider);
  if (providerHint) {
    // Zitadel supports a custom IdP hint parameter for external providers.
    url.searchParams.set("idp", providerHint);
  }

  return url.toString();
}

async function postTokenRequest(
  tokenEndpoint: string,
  params: URLSearchParams,
): Promise<OidcTokenResponse> {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Token exchange failed: ${response.status} ${response.statusText} ${body}`,
    );
  }

  return (await response.json()) as OidcTokenResponse;
}

export async function exchangeCodeForTokens({
  code,
  codeVerifier,
  redirectUri,
}: ExchangeCodeParams): Promise<OidcTokenResponse> {
  const config = await getOpenIdConfiguration();

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: getRequiredEnv("ZITADEL_CLIENT_ID"),
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const clientSecret = process.env.ZITADEL_CLIENT_SECRET;
  if (clientSecret) {
    params.set("client_secret", clientSecret);
  }

  return postTokenRequest(config.token_endpoint, params);
}

export async function refreshTokens({
  refreshToken,
}: RefreshTokenParams): Promise<OidcTokenResponse> {
  const config = await getOpenIdConfiguration();

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: getRequiredEnv("ZITADEL_CLIENT_ID"),
  });

  const clientSecret = process.env.ZITADEL_CLIENT_SECRET;
  if (clientSecret) {
    params.set("client_secret", clientSecret);
  }

  return postTokenRequest(config.token_endpoint, params);
}

export function createPkcePair() {
  const verifier = randomBytes(64)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return {
    verifier,
    challenge,
  };
}
