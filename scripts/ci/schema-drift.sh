#!/usr/bin/env bash
# Fails when drizzle-kit would generate migrations that are not committed under drizzle/.
set -euo pipefail
npm run db:generate
untracked="$(git ls-files --others --exclude-standard drizzle)"
if ! git diff --quiet -- drizzle || [ -n "$untracked" ]; then
  echo "::error title=Schema drift::server schema and committed migrations differ. Run 'npm run db:generate' locally, review the SQL and commit drizzle/."
  git --no-pager diff --stat -- drizzle
  [ -z "$untracked" ] || printf 'Untracked generated files:\n%s\n' "$untracked"
  exit 1
fi
echo "No schema drift: drizzle/ matches the schema."
