import { getDb } from "@jobs/init";
import { transformTransaction } from "@jobs/utils/transform";
import {
  transactionMethodsEnum,
  transactions as transactionsTable,
} from "@midday/db/schema";
import { logger, schemaTask, tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { enrichTransactions } from "../../transactions/enrich-transaction";

const transactionSchema = z.object({
  id: z.string(),
  description: z.string().nullable(),
  method: z.string().nullable(),
  date: z.string(),
  name: z.string(),
  status: z.enum(["pending", "posted"]),
  counterparty_name: z.string().nullable(),
  merchant_name: z.string().nullable(),
  balance: z.number().nullable(),
  currency: z.string(),
  amount: z.number(),
  category: z.string().nullable(),
});

type TransactionMethod = (typeof transactionMethodsEnum.enumValues)[number];
const transactionMethods = new Set(transactionMethodsEnum.enumValues);

function toTransactionMethod(method: string | null): TransactionMethod {
  if (method && transactionMethods.has(method as TransactionMethod)) {
    return method as TransactionMethod;
  }

  return "unknown";
}

export const upsertTransactions = schemaTask({
  id: "upsert-transactions",
  maxDuration: 120,
  queue: {
    concurrencyLimit: 10,
  },
  schema: z.object({
    teamId: z.string().uuid(),
    bankAccountId: z.string().uuid(),
    manualSync: z.boolean().optional(),
    transactions: z.array(transactionSchema),
  }),
  run: async ({ transactions, teamId, bankAccountId, manualSync }) => {
    const db = getDb();

    try {
      // Transform transactions to match our DB schema
      const formattedTransactions = transactions.map((transaction) => {
        return transformTransaction({
          // @ts-expect-error - TODO: Fix types with drizzle
          transaction,
          teamId,
          bankAccountId,
          notified: manualSync,
        });
      });

      const values = formattedTransactions.map((transaction) => ({
        date: transaction.date,
        name: transaction.name,
        method: toTransactionMethod(transaction.method),
        amount: transaction.amount,
        currency: transaction.currency,
        teamId: transaction.team_id,
        bankAccountId: transaction.bank_account_id,
        internalId: transaction.internal_id,
        status: transaction.status,
        balance: transaction.balance,
        description: transaction.description,
        categorySlug: transaction.category_slug,
        counterpartyName: transaction.counterparty_name,
        merchantName: transaction.merchant_name,
        ...(transaction.notified !== undefined
          ? { notified: transaction.notified }
          : {}),
      }));

      const insertedTransactions = await db
        .insert(transactionsTable)
        .values(values)
        .onConflictDoNothing({
          target: transactionsTable.internalId,
        })
        .returning({ id: transactionsTable.id });

      const transactionIds = insertedTransactions.map(
        (transaction) => transaction.id,
      );

      if (transactionIds.length > 0) {
        await enrichTransactions.trigger({
          transactionIds,
          teamId,
        });

        await tasks.trigger("match-transactions-bidirectional", {
          teamId,
          newTransactionIds: transactionIds,
        });

        logger.info("Triggered enrichment and matching", {
          transactionCount: transactionIds.length,
          teamId,
        });
      }
    } catch (error) {
      logger.error("Failed to upsert transactions", { error });

      throw error;
    }
  },
});
