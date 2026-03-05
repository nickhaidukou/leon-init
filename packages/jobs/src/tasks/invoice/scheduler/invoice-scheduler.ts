import { getDb } from "@jobs/init";
import { triggerBatch } from "@jobs/utils/trigger-batch";
import { invoices } from "@midday/db/schema";
import { logger, schedules } from "@trigger.dev/sdk/v3";
import { inArray } from "drizzle-orm";
import { checkInvoiceStatus } from "../operations/check-status";

export const invoiceScheduler = schedules.task({
  id: "invoice-scheduler",
  cron: "0 0,12 * * *",
  run: async () => {
    // Only run in production (Set in Trigger.dev)
    if (process.env.TRIGGER_ENVIRONMENT !== "production") return;

    const db = getDb();

    const pendingInvoices = await db
      .select({
        id: invoices.id,
      })
      .from(invoices)
      .where(inArray(invoices.status, ["unpaid", "overdue"]));

    if (!pendingInvoices.length) return;

    const formattedInvoices = pendingInvoices.map((invoice) => ({
      invoiceId: invoice.id,
    }));

    await triggerBatch(formattedInvoices, checkInvoiceStatus);

    logger.info("Invoice status check jobs started", {
      count: pendingInvoices.length,
    });
  },
});
