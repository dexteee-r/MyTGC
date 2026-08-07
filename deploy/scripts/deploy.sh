#!/usr/bin/env bash
# Deploy or update MyTCG on the LXC.
#
# Safe to re-run: it pulls, rebuilds, migrates and restarts. It does not touch the
# database beyond running migrations, and it never deletes the image cache.
#
#   sudo -u mytcg /srv/mytcg/app/deploy/scripts/deploy.sh

set -euo pipefail

APP_DIR="${MYTCG_APP_DIR:-/srv/mytcg/app}"
WEB_DIR="${MYTCG_WEB_DIR:-/srv/mytcg/frontend}"
BRANCH="${MYTCG_BRANCH:-main}"

echo "==> Backing up the database first"
"$APP_DIR/deploy/scripts/backup.sh" || echo "    (no database yet, continuing)"

echo "==> Fetching $BRANCH"
cd "$APP_DIR"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Python dependencies"
"$APP_DIR/.venv/bin/pip" install --quiet --upgrade -r backend/requirements.txt

echo "==> Frontend build"
# VITE_API_BASE stays unset on purpose: Nginx serves the app and the API on one
# origin, so the client's default of /api is correct and there is no CORS.
npm ci --prefix frontend
npm run build --prefix frontend

echo "==> Publishing the frontend"
# --delete is safe here: WEB_DIR holds nothing but build output.
rsync -a --delete "$APP_DIR/frontend/dist/" "$WEB_DIR/"

echo "==> Tests"
# A deploy that ships broken account isolation is worse than a deploy that stops.
"$APP_DIR/.venv/bin/python" -m pytest backend -c backend/pytest.ini -q

echo "==> Restarting the API"
sudo systemctl restart mytcg-api

echo "==> Health"
sleep 3
curl -fsS http://127.0.0.1:8000/health && echo

echo "==> Done"
