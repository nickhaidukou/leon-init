import type { Database } from "@midday/db/client";
import { getAppByAppId } from "@midday/db/queries";
import { logger } from "@midday/logger";
import { z } from "zod";
import { createSlackWebClient, ensureBotInChannel } from "../client";

const transactionSchema = z.object({
  amount: z.string(),
  name: z.string(),
});

export async function sendSlackTransactionNotifications({
  teamId,
  transactions,
  db,
}: {
  teamId: string;
  transactions: z.infer<typeof transactionSchema>[];
  db: Database;
}) {
  const app = await getAppByAppId(db, {
    appId: "slack",
    teamId,
  });

  const settings = Array.isArray(app?.settings)
    ? app.settings.filter(
        (setting): setting is { id: string; value: unknown } =>
          Boolean(setting) &&
          typeof setting === "object" &&
          "id" in setting &&
          typeof (setting as { id?: unknown }).id === "string",
      )
    : [];

  const config =
    app?.config && typeof app.config === "object"
      ? (app.config as { access_token?: string; channel_id?: string })
      : null;

  const enabled = Boolean(
    settings.find((setting) => setting.id === "transactions")?.value,
  );

  if (!enabled || !config?.access_token || !config?.channel_id) {
    return;
  }

  const client = createSlackWebClient({
    token: config.access_token,
  });

  try {
    // Ensure bot is in channel before sending message (auto-joins public channels)
    await ensureBotInChannel({ client, channelId: config.channel_id });

    await client.chat.postMessage({
      channel: config.channel_id,
      text: `You got ${transactions.length} new transaction${transactions.length === 1 ? "" : "s"}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "You got some new transactions! We'll do our best to match these with receipts in your Inbox or you can simply upload them in your <slack://app?id=A07PN48FW3A|Midday Assistant>.",
          },
        },
        {
          type: "divider",
        },
        ...transactions.map((transaction) => ({
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: transaction.name,
            },
            {
              type: "mrkdwn",
              text: transaction.amount,
            },
          ],
        })),
        {
          type: "divider",
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "View transactions",
              },
              url: "https://app.midday.ai/transactions",
              action_id: "button_click",
            },
          ],
        },
      ],
    });
  } catch (error) {
    logger.error("Failed to send Slack transaction notifications", {
      error: error instanceof Error ? error.message : String(error),
      teamId,
      transactionCount: transactions.length,
    });
  }
}
