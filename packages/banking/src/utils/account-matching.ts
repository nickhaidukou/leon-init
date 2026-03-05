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

/**
 * Finds the best matching DB account for an API account using a tiered strategy:
 *
 * 1. resource_id / accountReference
 * 2. IBAN
 * 3. Fuzzy currency + type, preferring name match
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
