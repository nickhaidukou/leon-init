import { TZDate } from "@date-fns/tz";
import { getDb } from "@jobs/init";
import { updateInvoiceStatus } from "@jobs/utils/update-invocie";
import {
  invoices,
  transactionAttachments,
  transactions,
} from "@midday/db/schema";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { subDays } from "date-fns";
import { and, eq, exists, gte, ne, not } from "drizzle-orm";
import { z } from "zod";

export const checkInvoiceStatus = schemaTask({
  id: "check-invoice-status",
  schema: z.object({
    invoiceId: z.string().uuid(),
  }),
  queue: {
    concurrencyLimit: 10,
  },
  run: async ({ invoiceId }) => {
    const db = getDb();

    const [invoice] = await db
      .select({
        id: invoices.id,
        status: invoices.status,
        dueDate: invoices.dueDate,
        currency: invoices.currency,
        amount: invoices.amount,
        teamId: invoices.teamId,
        filePath: invoices.filePath,
        invoiceNumber: invoices.invoiceNumber,
        fileSize: invoices.fileSize,
        template: invoices.template,
      })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      logger.error("Invoice data is missing");
      return;
    }

    if (invoice.amount == null || !invoice.currency || !invoice.dueDate) {
      logger.error("Invoice data is missing");
      return;
    }

    const template =
      invoice.template && typeof invoice.template === "object"
        ? (invoice.template as { timezone?: string })
        : null;

    const timezone = template?.timezone || "UTC";
    const startDate = subDays(new TZDate(new Date(), timezone), 3)
      .toISOString()
      .slice(0, 10);

    const pendingTransactions = await db
      .select({
        id: transactions.id,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.teamId, invoice.teamId),
          eq(transactions.amount, invoice.amount),
          eq(transactions.currency, invoice.currency.toUpperCase()),
          gte(transactions.date, startDate),
          ne(transactions.status, "completed"),
          not(
            exists(
              db
                .select({
                  id: transactionAttachments.id,
                })
                .from(transactionAttachments)
                .where(
                  and(
                    eq(transactionAttachments.transactionId, transactions.id),
                    eq(transactionAttachments.teamId, invoice.teamId),
                  ),
                ),
            ),
          ),
        ),
      );

    // Find recent transactions matching invoice amount, currency, and team_id
    // We have a match
    if (pendingTransactions.length === 1) {
      const transactionId = pendingTransactions.at(0)?.id;
      if (!transactionId) {
        logger.error("Transaction data is missing");
        return;
      }

      const filename = `${invoice.invoiceNumber ?? invoice.id}.pdf`;

      // Attach the invoice file to the transaction and mark as paid
      await db.insert(transactionAttachments).values({
        type: "application/pdf",
        path: invoice.filePath,
        transactionId,
        teamId: invoice.teamId,
        name: filename,
        size: invoice.fileSize,
      });

      await updateInvoiceStatus({
        invoiceId,
        status: "paid",
        paid_at: new Date().toISOString(),
      });
    } else {
      // Check if the invoice is overdue
      const isOverdue =
        new TZDate(invoice.dueDate, timezone) <
        new TZDate(new Date(), timezone);

      // Update invoice status to overdue if it's past due date and currently unpaid
      if (isOverdue && invoice.status === "unpaid") {
        await updateInvoiceStatus({
          invoiceId,
          status: "overdue",
        });
      }
    }
  },
});
