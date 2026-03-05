import { getDb } from "@jobs/init";
import { reconnectConnectionSchema } from "@jobs/schema";
import { syncConnection } from "@jobs/tasks/bank/sync/connection";
import { matchAndUpdateAccountIds } from "@jobs/utils/account-matching";
import { bankAccounts, bankConnections } from "@midday/db/schema";
import { decrypt } from "@midday/encryption";
import { trpc } from "@midday/trpc";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";

function maybeDecrypt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

export const reconnectConnection = schemaTask({
  id: "reconnect-connection",
  maxDuration: 120,
  retry: {
    maxAttempts: 2,
  },
  schema: reconnectConnectionSchema,
  run: async ({ teamId, connectionId, provider }) => {
    const db = getDb();

    // Fetch existing bank accounts for this connection
    const existingAccounts = await db.query.bankAccounts.findMany({
      where: and(
        eq(bankAccounts.bankConnectionId, connectionId),
        eq(bankAccounts.teamId, teamId),
      ),
      columns: {
        id: true,
        accountReference: true,
        iban: true,
        type: true,
        currency: true,
        name: true,
      },
    });

    const normalizedExistingAccounts = existingAccounts.map((account) => ({
      id: account.id,
      accountReference: account.accountReference,
      iban: maybeDecrypt(account.iban),
      type: account.type,
      currency: account.currency,
      name: account.name,
    }));

    if (normalizedExistingAccounts.length === 0) {
      logger.warn("No existing bank accounts found for connection", {
        connectionId,
        provider,
      });
    }

    if (provider === "gocardless") {
      // We need to update the reference of the connection
      const connectionResponse = await trpc.banking.connectionByReference.query(
        {
          reference: teamId,
        },
      );

      if (!connectionResponse?.data) {
        throw new Error("Connection not found");
      }

      const referenceId = connectionResponse.data.id;

      // Update the reference_id of the new connection
      if (referenceId) {
        logger.info("Updating reference_id for GoCardless connection");
        await db
          .update(bankConnections)
          .set({ referenceId })
          .where(
            and(
              eq(bankConnections.id, connectionId),
              eq(bankConnections.teamId, teamId),
            ),
          );
      }

      // Fetch fresh accounts from GoCardless API
      const accountsResponse = await trpc.banking.getProviderAccounts.query({
        id: referenceId,
        provider: "gocardless",
      });

      if (!accountsResponse.data) {
        throw new Error("Accounts not found");
      }

      if (normalizedExistingAccounts.length > 0) {
        await matchAndUpdateAccountIds({
          db,
          existingAccounts: normalizedExistingAccounts,
          apiAccounts: accountsResponse.data,
          connectionId,
          provider: "gocardless",
        });
      }
    }

    if (provider === "teller") {
      // Get the connection to retrieve access_token and enrollment_id
      const connectionData = await db.query.bankConnections.findFirst({
        where: and(
          eq(bankConnections.id, connectionId),
          eq(bankConnections.teamId, teamId),
        ),
        columns: {
          accessToken: true,
          enrollmentId: true,
        },
      });

      if (!connectionData?.accessToken || !connectionData?.enrollmentId) {
        logger.error("Teller connection missing access_token or enrollment_id");
        throw new Error("Teller connection not found");
      }

      // Fetch fresh accounts from Teller API
      const accountsResponse = await trpc.banking.getProviderAccounts.query({
        id: connectionData.enrollmentId,
        provider: "teller",
        accessToken: connectionData.accessToken,
      });

      if (!accountsResponse.data) {
        logger.error("Failed to fetch Teller accounts");
        throw new Error("Teller accounts not found");
      }

      logger.info("Updating Teller account IDs after reconnect", {
        accountCount: accountsResponse.data.length,
      });

      if (normalizedExistingAccounts.length > 0) {
        await matchAndUpdateAccountIds({
          db,
          existingAccounts: normalizedExistingAccounts,
          apiAccounts: accountsResponse.data,
          connectionId,
          provider: "teller",
        });
      }
    }

    if (provider === "enablebanking") {
      // Get the connection to retrieve reference_id (session_id)
      const connectionData = await db.query.bankConnections.findFirst({
        where: and(
          eq(bankConnections.id, connectionId),
          eq(bankConnections.teamId, teamId),
        ),
        columns: {
          referenceId: true,
        },
      });

      if (!connectionData?.referenceId) {
        logger.error("EnableBanking connection missing reference_id");
        throw new Error("EnableBanking connection not found");
      }

      // Fetch fresh accounts from EnableBanking API
      const accountsResponse = await trpc.banking.getProviderAccounts.query({
        id: connectionData.referenceId,
        provider: "enablebanking",
      });

      if (!accountsResponse.data) {
        logger.error("Failed to fetch EnableBanking accounts");
        throw new Error("EnableBanking accounts not found");
      }

      logger.info("Updating EnableBanking account IDs after reconnect", {
        accountCount: accountsResponse.data.length,
      });

      if (normalizedExistingAccounts.length > 0) {
        await matchAndUpdateAccountIds({
          db,
          existingAccounts: normalizedExistingAccounts,
          apiAccounts: accountsResponse.data,
          connectionId,
          provider: "enablebanking",
        });
      }
    }

    if (provider === "plaid") {
      // Plaid uses "update mode" for reconnect which preserves account IDs
      // No account ID remapping is needed, but we log for consistency
      logger.info("Plaid reconnect - account IDs preserved via update mode", {
        connectionId,
      });

      // We still fetch accounts to verify the connection is working
      const connectionData = await db.query.bankConnections.findFirst({
        where: and(
          eq(bankConnections.id, connectionId),
          eq(bankConnections.teamId, teamId),
        ),
        columns: {
          accessToken: true,
          institutionId: true,
        },
      });

      if (!connectionData?.accessToken) {
        logger.error("Plaid connection missing access_token");
        throw new Error("Plaid connection not found");
      }

      const accountsResponse = await trpc.banking.getProviderAccounts.query({
        provider: "plaid",
        accessToken: connectionData.accessToken,
        institutionId: connectionData.institutionId ?? undefined,
      });

      if (!accountsResponse.data) {
        logger.error("Failed to verify Plaid accounts after reconnect");
        throw new Error("Plaid accounts verification failed");
      }

      logger.info("Plaid accounts verified after reconnect", {
        accountCount: accountsResponse.data.length,
      });
    }

    // Trigger sync to fetch latest transactions
    await syncConnection.trigger({
      connectionId,
      manualSync: true,
    });
  },
});
