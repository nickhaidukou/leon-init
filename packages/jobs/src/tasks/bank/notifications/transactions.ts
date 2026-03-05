import { getDb } from "@jobs/init";
import { transactions } from "@midday/db/schema";
import { Notifications } from "@midday/notifications";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { parseISO } from "date-fns";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const transactionNotifications = schemaTask({
  id: "transaction-notifications",
  machine: "micro",
  maxDuration: 60,
  schema: z.object({
    teamId: z.string(),
  }),
  run: async ({ teamId }) => {
    const db = getDb();
    const notifications = new Notifications(db);

    try {
      // Update all unnotified transactions for the team as notified and return those transactions
      const transactionsData = await db
        .update(transactions)
        .set({ notified: true })
        .where(
          and(
            eq(transactions.teamId, teamId),
            eq(transactions.notified, false),
          ),
        )
        .returning({
          id: transactions.id,
          date: transactions.date,
          amount: transactions.amount,
          name: transactions.name,
          currency: transactions.currency,
        });

      const sortedTransactions = transactionsData?.sort((a, b) => {
        return parseISO(b.date).getTime() - parseISO(a.date).getTime();
      });

      if (sortedTransactions && sortedTransactions.length > 0) {
        // Create notification - ProviderNotificationService will handle provider-specific
        // notifications (e.g., Slack) based on app settings
        await notifications.create(
          "transactions_created",
          teamId,
          {
            transactions: sortedTransactions.map((transaction) => ({
              id: transaction.id,
              date: transaction.date,
              amount: transaction.amount,
              name: transaction.name,
              currency: transaction.currency,
            })),
          },
          {
            sendEmail: true,
          },
        );
      }
    } catch (error) {
      await logger.error("Transactions notification", { error });
    }
  },
});
