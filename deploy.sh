#!/usr/bin/env bash
# One-command redeploy: build the app and push dist to the gh-pages branch.
set -euo pipefail
cd "$(dirname "$0")/app"
npm run build
REMOTE=$(git -C .. remote get-url origin)
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "deploy $(date '+%Y-%m-%d %H:%M')"
git push -f "$REMOTE" gh-pages
rm -rf .git
echo "Deployed. Live in ~1 min."
