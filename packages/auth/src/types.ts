export type AuthIdentity = {
  sub: string;
  email?: string;
  name?: string;
  raw: Record<string, unknown>;
};

export type OidcTokenResponse = {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export type AppSessionPayload = {
  sub: string;
  accessToken: string;
  refreshToken?: string;
  email?: string;
  name?: string;
  expiresAt?: number;
};

export type OpenIdConfiguration = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};
