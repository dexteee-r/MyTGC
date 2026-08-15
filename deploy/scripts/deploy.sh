#!/usr/bin/env bash
# Deploy or update MyTCG on the LXC.
#
# Safe to re-run: it pulls, rebuilds, migrates and restarts. It does not touch the
# database beyond running migrations, and it never deletes the image cache.
#
#   sudo -u mytcg /srv/mytcg/app/deploy/scripts/deploy.sh

set -euo pipefail

# These files sit beside the checkout, not inside it: they are infrastructure for
# one host, and the repository is the same for everyone.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${MYTCG_APP_DIR:-/srv/mytcg/app}"
WEB_DIR="${MYTCG_WEB_DIR:-/srv/mytcg/frontend}"
BRANCH="${MYTCG_BRANCH:-main}"

echo "==> Backing up the database first"
"$HERE/scripts/backup.sh" || echo "    (no database yet, continuing)"

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
npm test --prefix frontend

echo "==> Restarting the API"
sudo systemctl restart mytcg-api

echo "==> Health"
sleep 3
curl -fsS http://127.0.0.1:8000/health && echo

echo "==> Done"

# --- unit drift ----------------------------------------------------------------
# Unit files are installed by hand and never by this script. That boundary is worth
# more than the convenience: autodeploy pulls from a PUBLIC repository, and a script
# that copied into /etc/systemd/system would make a commit able to set User=root, drop
# NoNewPrivileges, or add an ExecStartPre. Today a bad commit runs as mytcg; the rules
# governing what mytcg may do stay out of a commit's reach. Widening that to save a cp
# is a poor trade.
#
# The cost is that deploy/systemd/ can drift from what is loaded without anything
# saying so — which already happened: seven hardening directives sat in the repository
# for a day while the running unit had none of them, and the deploy reported success
# throughout. So the drift is checked here, and printed last, where the tail of a
# deploy is actually read.
#
# Reported, not fatal: a unit waiting to be installed is not a reason to block an
# unrelated application fix from shipping.
drifted=()
for unit in "$APP_DIR"/deploy/systemd/*; do
    installed="/etc/systemd/system/$(basename "$unit")"
    if [ ! -e "$installed" ]; then
        drifted+=("$(basename "$unit") — not installed")
    elif ! cmp -s "$unit" "$installed"; then
        drifted+=("$(basename "$unit") — differs from the installed copy")
    fi
done

if [ ${#drifted[@]} -gt 0 ]; then
    echo
    echo "!!! systemd units out of sync !!!"
    printf '    %s\n' "${drifted[@]}"
    echo
    echo "    The repository moved, the machine did not. To apply:"
    echo "      sudo cp $APP_DIR/deploy/systemd/* /etc/systemd/system/"
    echo "      sudo systemctl daemon-reload"
    echo "    Then confirm with systemctl show, not by reading the file."
fi
