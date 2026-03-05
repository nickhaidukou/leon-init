#!/usr/bin/env bash

set -euo pipefail

BASE_REF="${1:-${TURBO_SCM_BASE:-origin/main}}"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    BASE_REF="HEAD~1"
  else
    echo "Could not resolve base ref for legacy import guard; skipping."
    exit 0
  fi
fi

DIFF_OUTPUT="$(git diff --unified=0 "$BASE_REF"...HEAD)"

if [ -z "$DIFF_OUTPUT" ]; then
  echo "No diff detected; legacy import guard passed."
  exit 0
fi

NEW_LEGACY_LINES="$(
  printf '%s\n' "$DIFF_OUTPUT" | rg -n '^\+[^+].*(@supabase/|@midday/supabase)' || true
)"

if [ -n "$NEW_LEGACY_LINES" ]; then
  echo "New legacy provider references detected in diff. Migration guard failed."
  printf '%s\n' "$NEW_LEGACY_LINES"
  exit 1
fi

echo "Legacy import guard passed (no new legacy provider references added)."
