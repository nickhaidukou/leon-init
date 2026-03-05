import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import { teams, users, usersOnTeam } from "../schema";

export const getUserById = async (db: Database, id: string) => {
  const [result] = await db
    .select({
      id: users.id,
      authSubject: users.authSubject,
      fullName: users.fullName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      locale: users.locale,
      timeFormat: users.timeFormat,
      dateFormat: users.dateFormat,
      weekStartsOnMonday: users.weekStartsOnMonday,
      timezone: users.timezone,
      timezoneAutoSync: users.timezoneAutoSync,
      teamId: users.teamId,
      team: {
        id: teams.id,
        name: teams.name,
        logoUrl: teams.logoUrl,
        email: teams.email,
        plan: teams.plan,
        inboxId: teams.inboxId,
        createdAt: teams.createdAt,
        countryCode: teams.countryCode,
        canceledAt: teams.canceledAt,
        baseCurrency: teams.baseCurrency,
      },
    })
    .from(users)
    .leftJoin(teams, eq(users.teamId, teams.id))
    .where(eq(users.id, id));

  return result;
};

export const getUserByAuthSubject = async (
  db: Database,
  authSubject: string,
) => {
  const [result] = await db
    .select({
      id: users.id,
      authSubject: users.authSubject,
      fullName: users.fullName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      locale: users.locale,
      timeFormat: users.timeFormat,
      dateFormat: users.dateFormat,
      weekStartsOnMonday: users.weekStartsOnMonday,
      timezone: users.timezone,
      timezoneAutoSync: users.timezoneAutoSync,
      teamId: users.teamId,
      team: {
        id: teams.id,
        name: teams.name,
        logoUrl: teams.logoUrl,
        email: teams.email,
        plan: teams.plan,
        inboxId: teams.inboxId,
        createdAt: teams.createdAt,
        countryCode: teams.countryCode,
        canceledAt: teams.canceledAt,
        baseCurrency: teams.baseCurrency,
      },
    })
    .from(users)
    .leftJoin(teams, eq(users.teamId, teams.id))
    .where(eq(users.authSubject, authSubject));

  return result;
};

export type UpsertUserByAuthSubjectParams = {
  authSubject: string;
  email?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
};

export const upsertUserByAuthSubject = async (
  db: Database,
  params: UpsertUserByAuthSubjectParams,
) => {
  const existingBySubject = await getUserByAuthSubject(db, params.authSubject);

  if (existingBySubject) {
    const [updated] = await db
      .update(users)
      .set({
        email: params.email ?? existingBySubject.email,
        fullName: params.fullName ?? existingBySubject.fullName,
        avatarUrl: params.avatarUrl ?? existingBySubject.avatarUrl,
      })
      .where(eq(users.id, existingBySubject.id))
      .returning({
        id: users.id,
      });

    return updated ?? { id: existingBySubject.id };
  }

  const normalizedEmail = params.email?.toLowerCase() ?? null;
  const existingByEmail = normalizedEmail
    ? await db.query.users.findFirst({
        columns: { id: true },
        where: sql`LOWER(${users.email}) = ${normalizedEmail}`,
      })
    : null;

  if (existingByEmail) {
    const [updated] = await db
      .update(users)
      .set({
        authSubject: params.authSubject,
        email: params.email ?? undefined,
        fullName: params.fullName ?? undefined,
        avatarUrl: params.avatarUrl ?? undefined,
      })
      .where(eq(users.id, existingByEmail.id))
      .returning({
        id: users.id,
      });

    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      authSubject: params.authSubject,
      email: params.email ?? null,
      fullName: params.fullName ?? null,
      avatarUrl: params.avatarUrl ?? null,
    })
    .returning({
      id: users.id,
    });

  return created;
};

export type UpdateUserParams = {
  id: string;
  fullName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
  timeFormat?: number | null;
  dateFormat?: string | null;
  weekStartsOnMonday?: boolean | null;
  timezone?: string | null;
  timezoneAutoSync?: boolean | null;
};

export const updateUser = async (db: Database, data: UpdateUserParams) => {
  const { id, ...updateData } = data;

  const [result] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      authSubject: users.authSubject,
      fullName: users.fullName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      locale: users.locale,
      timeFormat: users.timeFormat,
      dateFormat: users.dateFormat,
      weekStartsOnMonday: users.weekStartsOnMonday,
      timezone: users.timezone,
      timezoneAutoSync: users.timezoneAutoSync,
      teamId: users.teamId,
    });

  return result;
};

/**
 * Switch a user's active team. Validates membership in usersOnTeam
 * to prevent unauthorized team access.
 */
export const switchUserTeam = async (
  db: Database,
  params: { userId: string; teamId: string },
) => {
  const { userId, teamId } = params;

  // Get the user's current teamId so we can invalidate its cache entry
  const currentUser = await db.query.users.findFirst({
    columns: { teamId: true },
    where: eq(users.id, userId),
  });

  // Verify the user is a member of the target team
  const [membership] = await db
    .select({ id: usersOnTeam.id })
    .from(usersOnTeam)
    .where(and(eq(usersOnTeam.userId, userId), eq(usersOnTeam.teamId, teamId)))
    .limit(1);

  if (!membership) {
    throw new Error("User is not a member of the target team");
  }

  const [result] = await db
    .update(users)
    .set({ teamId })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      teamId: users.teamId,
    });

  return { ...result, previousTeamId: currentUser?.teamId ?? null };
};

export const getUserTeamId = async (db: Database, userId: string) => {
  const result = await db.query.users.findFirst({
    columns: { teamId: true },
    where: eq(users.id, userId),
  });

  return result?.teamId || null;
};

export const deleteUser = async (db: Database, id: string) => {
  // Find teams where this user is a member
  const teamsWithUser = await db
    .select({
      teamId: usersOnTeam.teamId,
      memberCount: sql<number>`count(${usersOnTeam.userId})`.as("member_count"),
    })
    .from(usersOnTeam)
    .where(eq(usersOnTeam.userId, id))
    .groupBy(usersOnTeam.teamId);

  // Extract team IDs with only one member (this user)
  const teamIdsToDelete = teamsWithUser
    .filter((team) => team.memberCount === 1)
    .map((team) => team.teamId);

  // Delete the user and teams with only this user as a member
  // Foreign key constraints with cascade delete will handle related records
  await Promise.all([
    db.delete(users).where(eq(users.id, id)),
    teamIdsToDelete.length > 0
      ? db.delete(teams).where(inArray(teams.id, teamIdsToDelete))
      : Promise.resolve(),
  ]);

  return { id };
};
