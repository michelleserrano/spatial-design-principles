#!/usr/bin/env bash
# Deploy the Vite build output to the `gh-pages` branch on origin.
#
# How it works:
#   1. Builds with VITE_BASE_PATH derived from the origin repo name so URLs
#      resolve under https://<host>/<org>/<repo>/.
#   2. Creates a fresh git repo in a temp dir with just the contents of
#      dist/, and force-pushes it to origin's gh-pages branch. Each deploy
#      replaces the branch contents (no history buildup).
#
# Prereqs:
#   - You can already `git push` to origin (auth configured).
#   - In repo Settings → Pages, Source is "Deploy from a branch", branch
#     `gh-pages`, folder `/ (root)`.

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

BRANCH="gh-pages"
DIST_DIR="dist"

ORIGIN_URL=$(git remote get-url origin)
REPO_NAME=$(basename "$ORIGIN_URL" .git)
BASE_PATH="/${REPO_NAME}/"

if ! git diff-index --quiet HEAD -- ; then
  echo "ERROR: working tree has uncommitted changes. Commit or stash first." >&2
  git status --short >&2
  exit 1
fi

echo "→ Building with VITE_BASE_PATH=$BASE_PATH"
VITE_BASE_PATH="$BASE_PATH" npm run build

touch "$DIST_DIR/.nojekyll"

echo "→ Publishing $DIST_DIR to $BRANCH on $ORIGIN_URL"

GIT_NAME=$(git config user.name || echo "deploy")
GIT_EMAIL=$(git config user.email || echo "deploy@localhost")

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cp -R "$DIST_DIR"/. "$TMP/"
cp -R "$DIST_DIR"/.nojekyll "$TMP/" 2>/dev/null || true

(
  cd "$TMP"
  git init -q -b "$BRANCH"
  git remote add origin "$ORIGIN_URL"
  git add -A
  git -c user.name="$GIT_NAME" -c user.email="$GIT_EMAIL" \
      commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git push -f origin "$BRANCH"
)

HOST=$(echo "$ORIGIN_URL" | sed -E 's|https?://([^/]+)/.*|\1|')
OWNER=$(echo "$ORIGIN_URL" | sed -E 's|https?://[^/]+/([^/]+)/.*|\1|')
echo ""
echo "✓ Pushed gh-pages to origin."
echo "  Pages settings: https://${HOST}/${OWNER}/${REPO_NAME}/settings/pages"
echo "  After Pages finishes publishing, the site will be live at the URL"
echo "  shown in that settings page (expect something like"
echo "  https://pages.${HOST}/${OWNER}/${REPO_NAME}/ or a variant)."
