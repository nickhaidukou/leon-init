import { getDb } from "@jobs/init";
import { syncConnectionSchema } from "@jobs/schema";
import { triggerSequenceAndWait } from "@jobs/utils/trigger-sequence";
import { bankAccounts, bankConnections } from "@midday/db/schema";
import { trpc } from "@midday/trpc";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { transactionNotifications } from "../notifications/transactions";
import { syncAccount } from "./account";

// Fan-out pattern. We want to trigger a task for each bank account (Transactions, Balance)
export const syncConnection = schemaTask({
  id: "sync-connection",
  maxDuration: 120,
  retry: {
    maxAttempts: 2,
  },
  schema: syncConnectionSchema,
  run: async ({ connectionId, manualSync }, { ctx }) => {
    const db = getDb();

    try {
      const connection = await db.query.bankConnections.findFirst({
        where: eq(bankConnections.id, connectionId),
        columns: {
          id: true,
          provider: true,
          accessToken: true,
          referenceId: true,
          teamId: true,
        },
      });

      if (!connection) {
        logger.error("Connection not found");
        throw new Error("Connection not found");
      }

      const connectionResult = await trpc.banking.connectionStatus.query({
        id: connection.referenceId ?? undefined,
        provider: connection.provider as
          | "gocardless"
          | "plaid"
          | "teller"
          | "enablebanking",
        accessToken: connection.accessToken ?? undefined,
      });

      logger.info("Connection response", { connectionResult });

      const connectionData = connectionResult.data;

      if (!connectionData) {
        logger.error("Failed to get connection status");
        throw new Error("Failed to get connection status");
      }

      if (connectionData.status === "connected") {
        await db
          .update(bankConnections)
          .set({
            status: "connected",
            lastAccessed: new Date().toISOString(),
          })
          .where(eq(bankConnections.id, connectionId));

        const bankAccountsData = await db.query.bankAccounts.findMany({
          where: and(
            eq(bankAccounts.bankConnectionId, connectionId),
            eq(bankAccounts.enabled, true),
            eq(bankAccounts.manual, false),
            manualSync
              ? undefined
              : or(
                  lt(bankAccounts.errorRetries, 4),
                  isNull(bankAccounts.errorRetries),
                ),
          ),
          columns: {
            id: true,
            teamId: true,
            accountId: true,
            type: true,
            currency: true,
          },
        });

        if (!bankAccountsData.length) {
          logger.info("No bank accounts found");
          return;
        }

        const accountsToSync = bankAccountsData.map((account) => ({
          id: account.id,
          accountId: account.accountId,
          accessToken: connection.accessToken ?? undefined,
          provider: connection.provider,
          connectionId: connection.id,
          teamId: account.teamId,
          accountType: account.type ?? "depository",
          currency: account.currency ?? undefined,
          manualSync,
        }));

        // Only run the sync if there are bank accounts enabled
        // We don't want to delay the sync if it's a manual sync
        // but we do want to delay it if it's an background sync to avoid rate limiting
        if (accountsToSync.length > 0) {
          // @ts-expect-error - TODO: Fix types
          await triggerSequenceAndWait(accountsToSync, syncAccount, {
            tags: ctx.run.tags,
            delaySeconds: manualSync ? 30 : 60, // 30-second delay for manual sync, 60-second for background sync
          });
        }

        logger.info("Synced bank accounts completed");

        // Trigger a notification for new transactions if it's an background sync
        // We delay it by 10 minutes to allow for more transactions to be notified
        if (!manualSync) {
          await transactionNotifications.trigger(
            { teamId: connection.teamId },
            { delay: "5m" },
          );
        }

        // Check connection status by accounts
        // If all accounts have 3+ error retries, disconnect the connection
        // So the user will get a notification and can reconnect the bank
        try {
          const bankAccountsData = await db.query.bankAccounts.findMany({
            where: and(
              eq(bankAccounts.bankConnectionId, connectionId),
              eq(bankAccounts.manual, false),
              eq(bankAccounts.enabled, true),
            ),
            columns: {
              id: true,
              errorRetries: true,
            },
          });

          if (
            bankAccountsData.length > 0 &&
            bankAccountsData.every(
              (account) => (account.errorRetries ?? 0) >= 3,
            )
          ) {
            logger.info(
              "All bank accounts have 3+ error retries, disconnecting connection",
            );

            await db
              .update(bankConnections)
              .set({ status: "disconnected" })
              .where(eq(bankConnections.id, connectionId));
          }
        } catch (error) {
          logger.error("Failed to check connection status by accounts", {
            error,
          });
        }
      }

      if (connectionData.status === "disconnected") {
        logger.info("Connection disconnected");

        await db
          .update(bankConnections)
          .set({ status: "disconnected" })
          .where(eq(bankConnections.id, connectionId));
      }
    } catch (error) {
      const errorDetails: Record<string, unknown> = {
        connectionId,
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined,
      };

      if (error instanceof Error && "cause" in error && error.cause) {
        const cause = error.cause as Error & NodeJS.ErrnoException;
        errorDetails.cause = cause.message ?? String(cause);
        errorDetails.causeCode = (cause as NodeJS.ErrnoException).code;
      }

      logger.error("Failed to sync connection", errorDetails);

      throw error;
    }
  },
});
