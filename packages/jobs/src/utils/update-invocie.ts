import { getDb } from "@jobs/init";
import { sendInvoiceNotifications } from "@jobs/tasks/invoice/notifications/send-notifications";
import { invoices } from "@midday/db/schema";
import { logger } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";

export async function updateInvoiceStatus({
  invoiceId,
  status,
  paid_at,
}: {
  invoiceId: string;
  status: "overdue" | "paid";
  paid_at?: string;
}): Promise<void> {
  const db = getDb();

  const [updatedInvoice] = await db
    .update(invoices)
    .set({
      status,
      paidAt: paid_at ?? null,
    })
    .where(eq(invoices.id, invoiceId))
    .returning({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      teamId: invoices.teamId,
      customerName: invoices.customerName,
    });

  if (
    !updatedInvoice?.invoiceNumber ||
    !updatedInvoice?.teamId ||
    !updatedInvoice?.customerName
  ) {
    logger.error("Invoice data is missing");
    return;
  }

  logger.info(`Invoice status changed to ${status}`);

  await sendInvoiceNotifications.trigger({
    invoiceId,
    invoiceNumber: updatedInvoice.invoiceNumber,
    status: updatedInvoice.status as "paid" | "overdue",
    teamId: updatedInvoice.teamId,
    customerName: updatedInvoice.customerName,
  });
}
