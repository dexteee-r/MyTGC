# Deploying MyTCG

Target: a Proxmox LXC running Debian/Ubuntu, reached through a Cloudflare Tunnel at
`mytcg.elmzn.be`. TLS terminates at Cloudflare; Nginx listens on loopback only.

## Layout on the host

```
/srv/mytcg/app          the git checkout (this repo)
/srv/mytcg/frontend     built frontend, published by Nginx
/var/lib/mytcg          database, image cache, punk-records clone
/var/backups/mytcg      nightly database snapshots
/etc/mytcg/mytcg.env    secrets and paths (root:mytcg, 0640)
```

The data directory sits outside the checkout deliberately: it is 2.5 GB of card art
plus the database, and it has to survive every redeploy.

## Why one origin

Nginx serves the built app at `/` and proxies the API under `/api`. Same origin means
no CORS to keep in sync, and the httpOnly refresh cookie works without the SameSite
gymnastics a split origin would need. `VITE_API_BASE` stays unset — the client's
default of `/api` is already right.

## Two things that will bite if skipped

**`MYTCG_SECRET_KEY` must be set.** Without it the API generates one at boot, and
every session dies on the next restart. It logs a warning saying so.

**The API must run with `--proxy-headers`.** Behind Nginx and the tunnel, uvicorn
otherwise sees plain HTTP and issues the refresh cookie *without* its `Secure` flag.
The unit file and the Nginx `X-Forwarded-Proto` mapping are both part of that chain;
neither works alone.

## Data bootstrap

Ship the database, rebuild the images on the host:

1. `rsync` `backend/data/mytcg.db` (~6 MB) to `/var/lib/mytcg/mytcg.db`. It carries the
   catalogue, the precomputed pHashes and the accounts.
2. Run `download_images.py` on the host. It fetches 2.5 GB from the official card list
   in about ten minutes, is resumable, and skips anything already cached.

Do not rsync the image cache. It is a hundred times larger than the database and the
host can fetch it directly.

## Backups

`backup.sh` uses sqlite3's `.backup` rather than `cp`: the database runs in WAL mode,
so a plain copy taken mid-write can capture a torn state. It gzips, verifies the
archive, and prunes past 30 days. The timer runs nightly with `Persistent=true`, so a
night the box spent powered off is caught up rather than silently skipped.

The image cache is not backed up — `download_images.py` rebuilds it.

## Updating

```bash
sudo -u mytcg /srv/mytcg/app/deploy/scripts/deploy.sh
```

Backs up, pulls, rebuilds, **runs the test suite**, then restarts. The tests are in the
path on purpose: shipping broken account isolation is worse than not shipping.

## Files here

| | |
|---|---|
| `nginx/mytcg.elmzn.be.conf` | Site: static frontend, `/api` proxy, card art served from disk, CSP and related headers |
| `systemd/mytcg-api.service` | The API, hardened, with `--proxy-headers` |
| `systemd/mytcg-backup.{service,timer}` | Nightly database snapshot |
| `mytcg.env.example` | Template for `/etc/mytcg/mytcg.env` |
| `scripts/deploy.sh` | Update in place |
| `scripts/backup.sh` | Consistent snapshot of a live database |
| `HOMELAB_PROMPT.md` | Brief for whoever performs the install |
