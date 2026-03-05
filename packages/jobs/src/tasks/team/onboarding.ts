import { getDb } from "@jobs/init";
import { onboardTeamSchema } from "@jobs/schema";
import { shouldSendEmail } from "@jobs/utils/check-team-plan";
import { resend } from "@jobs/utils/resend";
import { getUserById } from "@midday/db/queries";
import { bankConnections } from "@midday/db/schema";
import { TrialActivationEmail } from "@midday/email/emails/trial-activation";
import { TrialDeactivatedEmail } from "@midday/email/emails/trial-deactivated";
import { TrialEndedEmail } from "@midday/email/emails/trial-ended";
import { TrialExpiringEmail } from "@midday/email/emails/trial-expiring";
import { WelcomeEmail } from "@midday/email/emails/welcome";
import { render } from "@midday/email/render";
import { logger, schemaTask, wait } from "@trigger.dev/sdk";
import { eq, sql } from "drizzle-orm";

export const onboardTeam = schemaTask({
  id: "onboard-team",
  schema: onboardTeamSchema,
  maxDuration: 300,
  run: async ({ userId }) => {
    const user = await getUserById(getDb(), userId);

    if (!user?.fullName || !user.email) {
      throw new Error("User data is missing");
    }

    const [firstName, lastName] = user.fullName.split(" ") ?? [];

    await resend.contacts.create({
      email: user.email,
      firstName,
      lastName,
      unsubscribed: false,
      audienceId: process.env.RESEND_AUDIENCE_ID!,
    });

    await resend.emails.send({
      to: user.email,
      subject: "Welcome to Midday",
      from: "Pontus from Midday <pontus@midday.ai>",
      html: await render(
        WelcomeEmail({
          fullName: user.fullName,
        }),
      ),
    });

    if (!user.teamId) {
      logger.info("User has no team, skipping onboarding");
      return;
    }

    // Day 3: Activation nudge — encourage bank connection
    await wait.for({ days: 3 });

    if (await shouldSendEmail(user.teamId)) {
      const [bankConnectionCount] = await getDb()
        .select({
          count: sql<number>`count(*)`,
        })
        .from(bankConnections)
        .where(eq(bankConnections.teamId, user.teamId));

      if (!bankConnectionCount || Number(bankConnectionCount.count) === 0) {
        await resend.emails.send({
          from: "Pontus from Midday <pontus@midday.ai>",
          to: user.email,
          subject: "Connect your bank to see the full picture",
          html: await render(TrialActivationEmail({ fullName: user.fullName })),
        });
      }
    }

    // Day 13: Trial expiring reminder
    await wait.for({ days: 10 });

    if (await shouldSendEmail(user.teamId)) {
      await resend.emails.send({
        from: "Pontus from Midday <pontus@midday.ai>",
        to: user.email,
        subject: "Your bank sync and invoicing stop tomorrow",
        html: await render(
          TrialExpiringEmail({
            fullName: user.fullName,
          }),
        ),
      });
    }

    // Day 14: Trial ended
    await wait.for({ days: 1 });

    if (await shouldSendEmail(user.teamId)) {
      await resend.emails.send({
        from: "Pontus from Midday <pontus@midday.ai>",
        to: user.email,
        subject: "Your Midday trial has ended",
        html: await render(TrialEndedEmail({ fullName: user.fullName })),
      });
    }

    // Day 17: Bank sync deactivation warning (only if they have bank connections)
    await wait.for({ days: 3 });

    if (await shouldSendEmail(user.teamId)) {
      const [bankConnectionCount] = await getDb()
        .select({
          count: sql<number>`count(*)`,
        })
        .from(bankConnections)
        .where(eq(bankConnections.teamId, user.teamId));

      if (bankConnectionCount && Number(bankConnectionCount.count) > 0) {
        await resend.emails.send({
          from: "Pontus from Midday <pontus@midday.ai>",
          to: user.email,
          subject: "Your bank sync will be paused soon",
          html: await render(
            TrialDeactivatedEmail({ fullName: user.fullName }),
          ),
        });
      }
    }
  },
});
