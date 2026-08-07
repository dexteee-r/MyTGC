# Brief — deploy MyTCG on the homelab

Paste this to the homelab assistant. Everything it needs is either here or in
`deploy/` in the repository.

---

## Context

MyTCG is a personal One Piece TCG collection manager: a FastAPI backend with SQLite, a
React frontend, and image recognition that identifies a card from a phone photo. It is
multi-user with accounts, so it holds password hashes and session tokens — treat it as
something that must not be exposed carelessly.

Repository: `https://github.com/dexteee-r/MyTCG` (branch `main`)
Public hostname: `mytcg.elmzn.be`, fronted by an existing Cloudflare Tunnel.

Read `deploy/README.md` in the repo first. The config files are ready in `deploy/` and
should be used as they are rather than rewritten.

## Target

A Debian/Ubuntu LXC on Proxmox with:

```
/srv/mytcg/app          git checkout
/srv/mytcg/frontend     built frontend, served by Nginx
/var/lib/mytcg          database, image cache  (2.5 GB — size the volume accordingly)
/var/backups/mytcg      nightly snapshots
/etc/mytcg/mytcg.env    secrets, root:mytcg, 0640
```

System user `mytcg`, no login shell, owning `/srv/mytcg` and `/var/lib/mytcg`.

## Steps

**1. Packages.** Python 3.12+ with `venv`, Node 20+, `nginx`, `sqlite3`, `git`,
`rsync`. The backend needs OpenCV's headless wheel, which pulls no system GUI
libraries — do not install a desktop stack for it.

**2. Checkout and virtualenv.**
```
git clone https://github.com/dexteee-r/MyTCG /srv/mytcg/app
python3 -m venv /srv/mytcg/app/.venv
/srv/mytcg/app/.venv/bin/pip install -r /srv/mytcg/app/backend/requirements.txt
```

**3. Environment.** Copy `deploy/mytcg.env.example` to `/etc/mytcg/mytcg.env`.
**Generate the secret, do not invent one:**
```
python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
```
Then `chown root:mytcg` and `chmod 640`. If `MYTCG_SECRET_KEY` is left unset, every
session dies on each restart — the API logs a warning saying exactly that.

**4. Data.** Ask the owner to rsync `backend/data/mytcg.db` (~6 MB) from the dev machine
to `/var/lib/mytcg/mytcg.db`. It carries the card catalogue, the precomputed perceptual
hashes and the accounts. Then rebuild the image cache **on the host**:
```
cd /srv/mytcg/app
MYTCG_DATA_DIR=/var/lib/mytcg .venv/bin/python backend/scripts/download_images.py --workers 8
```
About ten minutes and 2.5 GB, resumable, skips anything already present. Do not rsync
the images — the host can fetch them directly.

**5. Frontend.**
```
cd /srv/mytcg/app && npm ci --prefix frontend && npm run build --prefix frontend
rsync -a --delete frontend/dist/ /srv/mytcg/frontend/
```
Leave `VITE_API_BASE` unset. Nginx serves the app and the API on one origin, so the
client's default of `/api` is correct.

**6. Services.**
```
cp deploy/systemd/mytcg-*.service deploy/systemd/mytcg-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mytcg-api mytcg-backup.timer
```

**7. Nginx.** Install `deploy/nginx/mytcg.elmzn.be.conf` as a site, enable it, remove
the default site, `nginx -t`, reload.

**8. Tunnel.** Point the existing Cloudflare Tunnel's `mytcg.elmzn.be` ingress at
`http://localhost:80`.

## Verify before declaring it done

Do not skip these — several are things that fail silently.

1. `curl -fsS http://127.0.0.1:8000/health` returns `scan_enabled: true` and about
   9,447 hashed cards. If `scan_enabled` is false the database did not arrive.
2. `https://mytcg.elmzn.be` loads and shows the sign-in screen.
3. Sign in with the owner's account. The collection appears.
4. **The refresh cookie carries `Secure` and `HttpOnly`.** Check the `Set-Cookie` on
   `/api/auth/login` in the browser's network tab. If `Secure` is missing, the
   `X-Forwarded-Proto` chain is broken — check that the unit still has
   `--proxy-headers --forwarded-allow-ips=127.0.0.1` and that Nginx passes the header.
5. Reload the page. You stay signed in. If you get bounced to sign-in, that is the same
   cookie problem.
6. Card images load while browsing an extension — those come from Nginx, not the API.
7. `sudo -u mytcg /srv/mytcg/app/deploy/scripts/backup.sh` produces a gzipped snapshot
   in `/var/backups/mytcg`, and `systemctl list-timers mytcg-backup` shows a next run.
8. `nginx -T | grep -i content-security` shows the CSP is actually being sent.
9. From another machine on the LAN, `curl http://<lxc-ip>/` must fail. Nginx is bound to
   loopback on purpose; only the tunnel should reach it.

## Constraints

- **Do not** open port 80 or 8000 to the LAN or the internet. The tunnel is the only
  ingress.
- **Do not** run the API as root, or with more than one worker. The recognition
  catalogue is held per process; a second worker duplicates ~9,400 hashes for no gain.
- **Do not** back up or rsync `/var/lib/mytcg/images` — it is regenerable, and it is
  third-party copyrighted card art that should not be duplicated around.
- **Do not** copy the database with `cp` while the service runs. It is in WAL mode; use
  `sqlite3 .backup`, which `backup.sh` already does.
- Ask the owner before changing anything under `deploy/` — those files encode decisions
  that are explained in `deploy/README.md`.

## Afterwards

Report back: the health output, which verification steps passed, and anything you had
to change from the supplied config and why.

Updates later are one command:
```
sudo -u mytcg /srv/mytcg/app/deploy/scripts/deploy.sh
```
It backs up, pulls, rebuilds, runs the test suite and restarts. If the tests fail it
stops before restarting, which is intended.
