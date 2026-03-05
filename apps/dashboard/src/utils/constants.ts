export const Cookies = {
  AuthSession: "midday-auth-session",
  AccessToken: "midday-access-token",
  RefreshToken: "midday-refresh-token",
  AuthState: "midday-auth-state",
  PkceVerifier: "midday-auth-pkce-verifier",
  AuthClient: "midday-auth-client",
  ReturnTo: "midday-auth-return-to",
  PreferredSignInProvider: "preferred-signin-provider",
  // Unified table settings cookie (used by transactions, customers, invoices)
  TableSettings: "table-settings",
  InboxFilter: "inbox-filter-v2",
  InboxOrder: "inbox-order",

  LastProject: "last-project",
  WeeklyCalendar: "weekly-calendar",
  ForcePrimary: "midday-force-primary",
};

export const LocalStorageKeys = {
  MatchLearningToastSeen: "match-learning-toast-seen",
  MetricsFilter: "metrics-filter-preferences",
};

export const SUPPORT_EMAIL = "support@midday.ai";
