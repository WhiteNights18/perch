#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
while IFS= read -r -d '' source; do
    node --check "$source"
done < <(find . -path './.git' -prune -o -name '*.js' -print0)
glib-compile-schemas --strict --dry-run schemas
node --test tests/*.test.js
gjs -m tests/store.gjs.js
git diff --check
