import type { Database } from "@midday/db/client";
import { bankAccounts } from "@midday/db/schema";
import { encrypt } from "@midday/encryption";
import { logger } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";

export type DbAccount = {
  id: string;
  accountReference: string | null;
  iban: string | null;
  type: string | null;
  currency: string | null;
  name: string | null;
};

export type ApiAccount = {
  id: string;
  resource_id: string | null;
  iban: string | null;
  type: string;
  currency: string;
  name: string;
};

export type MatchingResult = {
  matched: number;
  unmatched: number;
  errors: number;
};

/**
 * Finds the best matching DB account for an API account using a tiered strategy:
 *
 * 1. resource_id / accountReference — the identifier we already track
 * 2. IBAN — stable bank-side identifier (fallback for old accounts missing accountReference)
 * 3. Fuzzy — currency + type, preferring name match
 *
 * Each DB account can only be matched once (tracked via matchedDbIds).
 */
export function findMatchingAccount(
  apiAccount: ApiAccount,
  existingAccounts: DbAccount[],
  matchedDbIds: Set<string>,
): DbAccount | null {
  const available = existingAccounts.filter(
    (account) => !matchedDbIds.has(account.id),
  );

  if (apiAccount.resource_id) {
    const byReference = available.filter(
      (account) =>
        account.accountReference &&
        account.accountReference === apiAccount.resource_id,
    );

    if (byReference.length === 1) {
      return byReference[0]!;
    }

    if (byReference.length > 1) {
      return pickBestCandidate(byReference, apiAccount);
    }
  }

  if (apiAccount.iban) {
    const byIban = available.filter(
      (account) => account.iban && account.iban === apiAccount.iban,
    );

    if (byIban.length === 1) {
      return byIban[0]!;
    }

    if (byIban.length > 1) {
      return pickBestCandidate(byIban, apiAccount);
    }
  }

  const hasRealCurrency = (value: string | null) =>
    !!value && value.toUpperCase() !== "XXX";

  const byCurrencyAndType = available.filter((account) => {
    if (
      hasRealCurrency(account.currency) &&
      hasRealCurrency(apiAccount.currency) &&
      account.currency !== apiAccount.currency
    ) {
      return false;
    }

    if (account.type && account.type !== apiAccount.type) {
      return false;
    }

    return true;
  });

  if (byCurrencyAndType.length === 1) {
    return byCurrencyAndType[0]!;
  }

  if (byCurrencyAndType.length > 1) {
    return pickBestCandidate(byCurrencyAndType, apiAccount);
  }

  return null;
}

function pickBestCandidate(
  candidates: DbAccount[],
  apiAccount: ApiAccount,
): DbAccount {
  const byName = candidates.find(
    (candidate) =>
      candidate.name?.toLowerCase() === apiAccount.name?.toLowerCase(),
  );

  return byName ?? candidates[0]!;
}

/**
 * Matches API accounts to existing database accounts and updates their account_id.
 *
 * Uses findMatchingAccount for the pure matching logic,
 * then handles the database updates and logging.
 */
export async function matchAndUpdateAccountIds({
  db,
  existingAccounts,
  apiAccounts,
  connectionId,
  provider,
}: {
  db: Database;
  existingAccounts: DbAccount[];
  apiAccounts: ApiAccount[];
  connectionId: string;
  provider: string;
}): Promise<MatchingResult> {
  const matchedDbIds = new Set<string>();
  const results: MatchingResult = { matched: 0, unmatched: 0, errors: 0 };

  for (const apiAccount of apiAccounts) {
    const match = findMatchingAccount(
      apiAccount,
      existingAccounts,
      matchedDbIds,
    );

    if (match) {
      matchedDbIds.add(match.id);

      const updates: Partial<typeof bankAccounts.$inferInsert> = {
        accountId: apiAccount.id,
      };

      if (apiAccount.resource_id) {
        updates.accountReference = apiAccount.resource_id;
      }

      if (apiAccount.iban) {
        updates.iban = encrypt(apiAccount.iban);
      }

      try {
        await db
          .update(bankAccounts)
          .set(updates)
          .where(eq(bankAccounts.id, match.id));

        results.matched++;
      } catch (error) {
        logger.warn(`Failed to update ${provider} account`, {
          resource_id: apiAccount.resource_id,
          dbAccountId: match.id,
          error: error instanceof Error ? error.message : String(error),
        });
        results.errors++;
      }
    } else {
      logger.warn(`No matching DB account found for ${provider} account`, {
        resource_id: apiAccount.resource_id,
        iban: apiAccount.iban,
        type: apiAccount.type,
        currency: apiAccount.currency,
        name: apiAccount.name,
      });
      results.unmatched++;
    }
  }

  logger.info(`Account matching complete for ${provider}`, {
    connectionId,
    ...results,
    totalApiAccounts: apiAccounts.length,
    totalDbAccounts: existingAccounts.length,
  });

  // Warn if some existing DB accounts were not matched to any API account
  // This could indicate accounts were removed at the bank or data mismatch
  if (results.matched < existingAccounts.length) {
    logger.warn("Some existing accounts were not matched", {
      connectionId,
      provider,
      existingCount: existingAccounts.length,
      matchedCount: results.matched,
      unmatchedDbAccounts: existingAccounts.length - results.matched,
    });
  }

  return results;
}
