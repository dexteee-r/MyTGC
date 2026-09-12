# Deploying MyTCG

These files live in the repository and arrive with the checkout, at
`/opt/mytcg/app/deploy`. Nothing here has to be copied over by hand.

They used to sit outside it, on the reasoning that they describe one host while the
repository is the same for everyone. That reasoning cost more than it saved: a timer
added on the box existed only there, so a reinstall would have lost the scheduling
silently, and there was no history of a change to any of it. The line is drawn
elsewhere now — **does this change because the app changed, or because the machine
did?** The Nginx policy tracks the frontend's CSP, the units' `ExecStart` tracks the
repository's own layout, and `mytcg.env.example` tracks `config.py`. All of that is the
app changing.

What genuinely belongs to the machine still stays out: `/etc/mytcg/mytcg.env` holds the
token signing key and is never committed. This directory holds its template only.

Target: a Proxmox LXC running Debian/Ubuntu, published at `mytcg.elmzn.be`. TLS
terminates at a reverse proxy in front — an openresty instance, on another host — and
this Nginx listens on plain HTTP, port 80, on every interface.

It used to be a Cloudflare Tunnel running on the same box, which is why the bind was
loopback-only. Nothing of Cloudflare is left: the record is a plain CNAME to the home
address, and the site answers `Server: openresty` with no `cf-ray`. The tunnel was
outbound, so nothing had to accept a connection; publishing through a port forward
means the network now does. Worth knowing when reading anything below that assumes the
host is unreachable from outside.

## Layout on the host

```
/opt/mytcg/app          the git checkout
/opt/mytcg/app/deploy       these files, arriving with it
/opt/mytcg/frontend     built frontend, published by Nginx
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

## Three things that will bite if skipped

**`MYTCG_SECRET_KEY` must be set.** Without it the API generates one at boot, and
every session dies on the next restart. It logs a warning saying so.

**The API must run with `--proxy-headers`.** Behind Nginx and the proxy, uvicorn
otherwise sees plain HTTP and issues the refresh cookie *without* its `Secure` flag.
The unit file and the Nginx `X-Forwarded-Proto` mapping are both part of that chain;
neither works alone.

**`index.html` needs its own `Cache-Control: no-cache`.** `deploy.sh` never touches
Nginx — same reasoning as systemd units, see "Installing and changing units" below
— so this has to be applied by hand once, by copying `deploy/nginx/mytcg.elmzn.be.conf`
over whatever this site's config is called on the host (this file doesn't say where
that is — confirm the real path there, the same way unit drift is confirmed with
`systemctl show` rather than assumed), then `sudo nginx -t && sudo systemctl reload
nginx`. Without it, a deploy can land cleanly — new commit, new hashed bundle under
`/assets/` (cached a year, immutable, by design), API restarted, `/health` showing
the new commit — and still look like nothing shipped: a browser's own cached copy
of `index.html` keeps pointing at the *previous* build's `/assets/index-*.js`
filename, and nothing forces it to ask again. Confirmed 2026-09-12 exactly that
way: fetching the deployed bundle directly showed the new code was there the whole
time. `no-cache`, not `no-store` — the browser still keeps a copy, it just always
revalidates it first.

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

The unit denies the network outright with `RestrictAddressFamilies=AF_UNIX`, which is
tighter than the API's. Leaving the directive out does not mean "no network": it means
every family is permitted and the job merely happens not to open a socket. Naming
AF_UNIX alone makes a connection out impossible rather than unlikely.

After changing anything in that unit, a start is not a test — a backup that produces a
corrupt file at 04:15 looks exactly like one that worked:

```bash
sudo systemctl start mytcg-backup.service
latest=$(ls -t /var/backups/mytcg/*.db.gz | head -1)
gzip -t "$latest" && echo "gzip ok"
gunzip -c "$latest" > /tmp/check.db
sqlite3 /tmp/check.db 'PRAGMA integrity_check;'   # must print: ok
rm /tmp/check.db
```

## Installing and changing units

Unit files are copied to `/etc/systemd/system/` **by hand**. `deploy.sh` deliberately
does not do it: autodeploy pulls from a public repository, so a script that wrote into
`/etc/systemd/system` would let a commit set `User=root` or drop `NoNewPrivileges`. A
bad commit today runs as `mytcg`; the rules about what `mytcg` may do stay out of a
commit's reach.

The price of that is drift, and it has already bitten — seven hardening directives sat
in the repository for a day while the loaded unit had none, with every deploy reporting
success. So `deploy.sh` compares the two and says so at the end of its output. It warns
rather than fails: a unit waiting to be installed should not block an application fix.

```bash
sudo cp /opt/mytcg/app/deploy/systemd/* /etc/systemd/system/
sudo systemctl daemon-reload
```

Then confirm with `systemctl show <unit> -p <Directive>` rather than by reading the
file. Reading the file tells you what should be loaded; `systemctl show` tells you what
is.

## Prices

`mytcg-prices.timer` runs `backend/scripts/import_prices.py` every three days at 21:00
UTC — an hour after the upstream mirror publishes. Install it like the others:

```bash
sudo cp deploy/systemd/mytcg-prices.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mytcg-prices.timer
sudo systemctl start mytcg-prices.service   # first run, then check the journal
```

Nothing breaks if it does not run: prices simply stay frozen at the last snapshot, and
the card sheet keeps showing that figure. The cadence is a question of staleness, not
of keeping the app alive.

**It is a unit and not a crontab line for one reason.** The job needs `MYTCG_DATA_DIR`
from `/etc/mytcg/mytcg.env`; without it the script opens a different, empty database
under the checkout. That file has carried CRLF, and while systemd strips the `\r`, a
shell sourcing the same file does not — a cron entry died on
`PermissionError: '/var/lib/mytcg\r'`. Using the unit means the environment goes
through the same parser as the API's, so the two cannot drift.

The script now refuses to run against an empty catalogue rather than reporting nought
prices and exiting cheerfully, so a misconfigured environment shows up as a failed unit
instead of prices that quietly never update.

## JP prices

`mytcg-prices-jp.timer` runs `backend/scripts/import_prices_jp.py` every three days at
21:20 UTC, twenty minutes after the English snapshot so the two do not start at the
exact same second. Same install pattern:

```bash
sudo cp deploy/systemd/mytcg-prices-jp.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mytcg-prices-jp.timer
sudo systemctl start mytcg-prices-jp.service   # first run, then check the journal
journalctl -u mytcg-prices-jp -n 30 --no-pager
```

The last line should read something like `2679 prix écrits pour le <date>` and `59/59
extensions lues` with no `!` lines above it — a `!` marks one set's page that failed to
fetch, not a fatal error, but worth a second look if it appears every run.

Scraped from yuyu-tei.jp, a real shop, not an aggregator — see `README.md`'s own "JP
prices" section for why this one was scraped when Cardmarket explicitly was not (their
`robots.txt` names `ClaudeBot` under a blanket `Disallow`; yuyu-tei's carries no such
rule). Only plain printings are priced, by design — a card number there can carry up
to 11 printings, and every `_p1`/`_r1`/... suffix is left unpriced rather than paired
by guesswork. No API restart needed: `market_price` is a live per-request subquery in
`main.py`, not something held in memory the way the `/scan` catalogue is.

Same "nothing breaks if it does not run" as the English side — JP prices simply stay
frozen at whatever the last snapshot found.

## Illustrator credits

`backend/scripts/import_artists.py` credits illustrators onto the catalogue from
`backend/scripts/artists.toon`, a checked-in snapshot (277 card numbers as of
2026-09-12) — nothing here scrapes on the host itself, and nothing runs on a timer.
Deploying the code (the `artist` column, the `/cards?artist=` filter, the
"Illustrateur" chips) does **not** load this data: `deploy.sh` only runs schema
migrations, which add the empty column but credit no card. The one-off load has to
happen here, same as "Catalogue updates" below and prices further up.

```bash
sudo -u mytcg bash -c '
export MYTCG_DATA_DIR=/var/lib/mytcg
cd /opt/mytcg/app
.venv/bin/python backend/scripts/import_artists.py --from-toon
'
```

**`MYTCG_DATA_DIR` set by hand, not `source /etc/mytcg/mytcg.env`** — same reasoning
as "Catalogue updates" below: this script only needs the one variable to find the
real `mytcg.db`, and sourcing the whole env file in a plain shell does not strip its
CRLF line endings the way systemd's own parser does. First version of this section
skipped the variable entirely, which is worse than the CRLF trap, not safer than
it: with nothing set, `app.config.DB_PATH` falls back to a fresh, empty
`backend/data/mytcg.db` *inside the checkout* — a directory that does not even
exist on this host outside of that fallback — and the script reports the exact same
success message while writing to a database nobody ever queries. Caught 2026-09-12
before it shipped a second silent no-op of the same shape as the 2026-08-15 EN
price incident.

Expect a line like `277 numéros lus depuis artists.toon` followed by `NNN lignes
mises à jour en base (0 numéros absents de ce catalogue)` — a non-zero "absents"
count on a healthy catalogue would mean `artists.toon` and the host's card list have
drifted, worth a second look rather than ignoring. **No API restart needed**: like
`market_price`, `artist` is read straight from the database on every `/cards`
request, never cached in `app.state` the way the `/scan` catalogue is.

Symptom if this step is skipped, or run without `MYTCG_DATA_DIR`, after a deploy
that ships the filter: the UI is correct (chips render, the endpoint accepts
`?artist=`) but every result is empty, or the "Illustrateur" group on Collection is
always blank — the column exists and is simply NULL on every row of the database
the API actually reads. Re-run the command above whenever `artists.toon` changes in
the repository (a name added or removed, a fresh scrape) — it is safe to re-run any
time, it only ever `UPDATE`s by card number.

## Catalogue updates

A new set (e.g. a new booster) needs three scripts re-run on the host — nothing here
runs on a timer, unlike prices, because a set drops every few weeks, not on a fixed
cadence.

```bash
sudo -u mytcg bash -c '
export MYTCG_DATA_DIR=/var/lib/mytcg
if [ -d "$MYTCG_DATA_DIR/punk-records" ]; then
  cd "$MYTCG_DATA_DIR/punk-records" && git pull
else
  git clone --depth 1 https://github.com/buhbbl/punk-records.git "$MYTCG_DATA_DIR/punk-records"
fi
cd /opt/mytcg/app
.venv/bin/python backend/scripts/import_catalogue.py
.venv/bin/python backend/scripts/download_images.py --workers 8
.venv/bin/python backend/scripts/compute_phashes.py --region art --all
'
sudo systemctl restart mytcg-api
```

**Do not `source /etc/mytcg/mytcg.env` for this.** These three scripts only need
`MYTCG_DATA_DIR`, and the file has carried CRLF before — the same trap that killed a
cron job for prices (see below). Setting the one variable by hand sidesteps it.

**The `punk-records` clone may not exist on the host at all**, and that is not a sign
anything is broken: "Data bootstrap" above ships the *finished* `mytcg.db`, built in
dev, straight to `/var/lib/mytcg` — the raw scrape it was built from was never part of
that path. First encountered 2026-08-28 shipping OP-17: the LXC had a working
catalogue, images and pHashes with no `punk-records` directory anywhere on disk. Clone
it fresh in that case, same command as "Data bootstrap" used originally.

**The restart is not optional.** `/scan` matches against `app.state.catalogue`, built
once at API startup and held in memory — updating the database alone leaves the
running process matching against the old card count until it restarts. `/health`'s
`catalogue` field is the way to confirm the new total actually loaded, not just that
the import script printed one.

## Updating

Automatic. `mytcg-autodeploy.timer` checks every five minutes whether `main` has moved
and deploys it — **but only once that commit's CI run is green**. Auto-deploying
whatever lands on main is how a red build reaches production at 3am.

Pull, not push, and not only for convenience: no deployment credentials are stored at
GitHub, and the repository is public — a self-hosted Actions runner would let anyone
open a pull request from a fork and run their code on the host. Nothing has to accept
an inbound connection for a deploy to happen either, which keeps the deployment path
independent of however the site is published.

By hand, when you want it now:

```bash
sudo -u mytcg /opt/mytcg/app/deploy/scripts/deploy.sh
```

Either path backs up, pulls, rebuilds, **runs the test suite**, then restarts. The
tests are in the path on purpose: shipping broken account isolation is worse than not
shipping.

## Files here

| | |
|---|---|
| `nginx/mytcg.elmzn.be.conf` | Site: static frontend, `/api` proxy, card art served from disk, CSP and related headers |
| `systemd/mytcg-api.service` | The API, hardened, with `--proxy-headers` |
| `systemd/mytcg-backup.{service,timer}` | Nightly database snapshot |
| `systemd/mytcg-prices.{service,timer}` | Price snapshot every three days (English, tcgcsv) |
| `systemd/mytcg-prices-jp.{service,timer}` | Price snapshot every three days (Japanese, yuyu-tei) |
| `systemd/mytcg-autodeploy.{service,timer}` | Five-minute check for a green commit on `main` |
| `scripts/autodeploy.sh` | Deploys only when CI passed |
| `mytcg.env.example` | Template for `/etc/mytcg/mytcg.env` |
| `scripts/deploy.sh` | Update in place |
| `scripts/backup.sh` | Consistent snapshot of a live database |
| `HOMELAB_PROMPT.md` | Brief for whoever performs the install |


## La boucle de l'écran de connexion

Le fond vidéo de la page de connexion est un extrait sous copyright. Il ne passe donc
pas par git — comme les illustrations de cartes, il vit sous le dossier de données, qui
est ignoré, et il doit être copié sur la machine à la main.

En production ce dossier est `MYTCG_DATA_DIR`, hors du checkout, et non
`backend/data/` : ce dernier n'est le bon chemin qu'en développement, où la variable
n'est pas définie. Un fichier déposé sous le checkout serait de toute façon effacé au
premier redéploiement.

```bash
scp hero.mp4 hero.jpg <box>:/var/lib/mytcg/media/
```

Servi par `GET /api/media/<fichier>`, sans authentification : c'est l'écran qu'on
regarde *avant* d'avoir un compte, donc un garde ici empêcherait la page de connexion
de charger son propre fond.

S'il n'est pas là, l'API répond 404, le composant `Sky` bascule sur le ciel dessiné et
personne ne voit d'erreur. C'est le comportement par défaut, pas un rattrapage.

Format : **H.264 sans piste audio**, `+faststart`. Pas de HEVC — Safari le lit, Chrome
et Firefox non, et le repli se déclencherait sur la moitié des navigateurs.
