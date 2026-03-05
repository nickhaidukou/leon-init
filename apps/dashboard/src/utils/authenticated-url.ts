import { getAccessToken } from "@/utils/session";

/**
 * Creates an authenticated URL by appending the access token as a query parameter.
 * Useful for resources that can't send Authorization headers (like img tags).
 */
export async function getAuthenticatedUrl(baseUrl: string): Promise<string> {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    throw new Error("No session found");
  }

  const url = new URL(baseUrl);
  url.searchParams.set("token", accessToken);
  return url.toString();
}
