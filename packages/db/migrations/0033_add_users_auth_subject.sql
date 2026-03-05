-- Add external identity mapping for Zitadel subject -> internal user
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_subject TEXT;

-- Enforce one identity subject per user, while allowing null during transition
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_subject_unique_idx
  ON users(auth_subject)
  WHERE auth_subject IS NOT NULL;
