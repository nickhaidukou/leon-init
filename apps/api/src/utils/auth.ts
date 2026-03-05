import {
  type AuthIdentity,
  verifyAccessToken as verifyJwtAccessToken,
} from "@midday/auth";
import type { Database } from "@midday/db/client";
import {
  getUserByAuthSubject,
  getUserById,
  upsertUserByAuthSubject,
} from "@midday/db/queries";

export type Session = {
  authSubject: string;
  user: {
    id: string;
    email?: string;
    full_name?: string;
  };
  teamId?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function verifyAccessToken(
  accessToken?: string,
): Promise<AuthIdentity | null> {
  return verifyJwtAccessToken(accessToken);
}

export async function resolveSessionFromAccessToken(
  db: Database,
  accessToken?: string,
): Promise<Session | null> {
  const identity = await verifyAccessToken(accessToken);

  if (!identity) {
    return null;
  }

  const bySubject = await getUserByAuthSubject(db, identity.sub);
  let user =
    bySubject ||
    (isUuid(identity.sub) ? await getUserById(db, identity.sub) : null);

  if (!user) {
    const created = await upsertUserByAuthSubject(db, {
      authSubject: identity.sub,
      email: identity.email ?? null,
      fullName: identity.name ?? null,
    });

    user = created?.id ? await getUserById(db, created.id) : null;
  }

  if (!user) {
    return null;
  }

  return {
    authSubject: identity.sub,
    teamId: user.teamId ?? undefined,
    user: {
      id: user.id,
      email: user.email ?? identity.email,
      full_name: user.fullName ?? identity.name,
    },
  };
}
