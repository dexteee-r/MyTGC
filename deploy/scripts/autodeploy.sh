#!/usr/bin/env bash
# Pull-based automatic deployment.
#
# The host asks GitHub whether main has moved, rather than GitHub reaching in. That
# is deliberate and not merely convenient:
#
#   * the LXC has no inbound access at all — the Cloudflare Tunnel is outbound, and
#     nothing here changes that
#   * no deployment credentials are stored at GitHub, so a compromised repository
#     account cannot execute anything on the host
#   * the repository is PUBLIC. A self-hosted Actions runner would let anyone open a
#     pull request from a fork and run their code here. GitHub warns about exactly
#     this, and it is why that route is not taken
#
# A new commit is only deployed once its CI run is green. Auto-deploying whatever
# lands on main is how a red build reaches production at 3am.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${MYTCG_APP_DIR:-/srv/mytcg/app}"
BRANCH="${MYTCG_BRANCH:-main}"
# Derived from the checkout's own remote, not hardcoded. A hardcoded name is wrong
# the moment the repository is renamed — and it was: the first version of this
# script asked GitHub about a name that did not exist yet, got a 404, and treated
# that as "cannot reach the API", so it sat there doing nothing for as long as it
# was left alone.
REPO="${MYTCG_REPO:-$(git -C "$APP_DIR" remote get-url origin     | sed -E 's#(git@github\.com:|https://github\.com/)##; s#\.git$##')}"

cd "$APP_DIR"

git fetch --quiet --prune origin "$BRANCH"
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse "origin/$BRANCH")

if [[ "$local_sha" == "$remote_sha" ]]; then
    exit 0
fi

echo "main moved: ${local_sha:0:8} -> ${remote_sha:0:8}"

# --- gate on CI -----------------------------------------------------------------
# Unauthenticated GitHub API: 60 requests an hour, and this asks for one every five
# minutes only when there is something new, so the limit is never in reach.
verdict=$(
    curl -fsSL --max-time 20 \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/$REPO/commits/$remote_sha/check-runs" \
    | python3 -c '
import json, sys
runs = json.load(sys.stdin).get("check_runs", [])
if not runs:
    print("pending")                       # CI has not reported yet
elif any(r["status"] != "completed" for r in runs):
    print("pending")
elif all(r["conclusion"] == "success" for r in runs):
    print("success")
else:
    print("failed")
' 2>/dev/null || echo "unreachable"
)

case "$verdict" in
    success)
        echo "CI is green, deploying"
        ;;
    pending)
        echo "CI has not finished yet, leaving it for the next run"
        exit 0
        ;;
    failed)
        echo "CI failed for $remote_sha — refusing to deploy" >&2
        exit 1
        ;;
    *)
        # Deliberately noisy. A deployment watchdog that cannot reach its source and
        # says nothing is worse than one that stops: it looks healthy while shipping
        # nothing. Failing here puts it in `systemctl --failed`, and the next
        # successful run clears it.
        echo "could not reach the GitHub API for $REPO — check MYTCG_REPO" >&2
        exit 1
        ;;
esac

exec "$HERE/scripts/deploy.sh"
