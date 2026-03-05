import { Cookies } from "@/utils/constants";

function readCookie(name: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);

  if (parts.length === 2) {
    return parts.pop()?.split(";").shift() || null;
  }

  return null;
}

export function initSessionCache() {
  // Kept for backwards compatibility with existing callers.
}

export async function getAccessToken(): Promise<string | null> {
  return readCookie(Cookies.AccessToken);
}
