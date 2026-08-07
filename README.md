# MyTGC

Personal One Piece TCG collection manager. Scan a physical card with the phone camera,
identify it, and track it in a personal collection across the English and Japanese editions.

The operational contract lives in `PROJECT_CONTEXT.md`, one level above this repo.

## Layout

```
backend/
  app/
    config.py       filesystem layout and language codes
    db.py           SQLite connection helpers
    schema.sql      cards / collection / price_history / wishlist / catalogue_meta
  scripts/
    import_catalogue.py   build steps 1-2: import punk-records, audit, backfill
  data/             gitignored: punk-records clone, SQLite db, image cache
```

## Setup

```bash
python -m venv .venv && .venv/Scripts/activate
pip install -r backend/requirements.txt
```

## Build step 1-2 — catalogue import

Clone the card catalogue once (static data, no runtime dependency):

```bash
git clone --depth 1 https://github.com/buhbbl/punk-records.git backend/data/punk-records
```

Then import English + Japanese into SQLite:

```bash
py backend/scripts/import_catalogue.py
```

The script is idempotent. It upserts on `(id, language)` and never overwrites `image_path`
or the pHash columns, so re-running it after a punk-records update will not discard the work
of build step 3. Pass `--fresh` to rebuild the `cards` table from scratch.

Before importing it prints a data-quality report: missing fields, ids listed under two packs,
rarity or category values outside the documented enums, unresolved pack codes, and any
disagreement between the two locales on a shared card number.

### Notes on the source data

- punk-records is at format `2.0` (`split_per_card`), so cards live in
  `<lang>/data/<pack_id>.json` and `<lang>/cards/<pack_id>/<card_id>.json`, not in the
  single-file layout older docs describe.
- `pack_id` is an opaque numeric key. The printed set code (`OP-09`) is parsed out of
  `raw_title`; vegapull only matches ASCII `[...]` brackets and therefore returns no label at
  all for Japanese, which uses full-width `【...】`. The importer matches both.
- Roughly a third of the catalogue is alternate art, carrying a `_p1` / `_r1` suffix on the id.
  Those share their printed card code with the base card, so OCR cannot separate them —
  only the pHash step can.

## Build step 3 — images and pHashes

Two scripts, deliberately separate: downloading ~2.5 GB from Bandai's servers is the slow
part you do once, while re-hashing from the local cache takes minutes. The step-5
calibration will re-hash repeatedly and must never re-download.

```bash
py backend/scripts/download_images.py --workers 8
py backend/scripts/compute_phashes.py --region art --all
```

`download_images.py` is resumable: a file counts as cached only if it decodes, downloads
land on a `.part` name first, and an interrupted run leaves nothing that later looks valid.

### The SAMPLE watermark

Every image on the official card list carries a translucent white "SAMPLE" overlay that
physical cards do not have. Hashing a region containing it would compare a watermarked
reference against an unwatermarked photo — a systematic bias on every card.

`measure_watermark.py` locates it empirically, by taking the pixel-wise minimum across a
few hundred cards: the overlay is present on all of them, so it lifts the floor wherever it
sits. Measured core: **y 0.471-0.543, x 0.207-0.733**, with a faint halo from about y 0.43.

`ART_BOX` in `app/hashing.py` therefore crops to y 0.05-0.42 — the illustration band above
the watermark, inset to drop the border. Re-run `compute_phashes.py --all` after changing it.

### Hash storage

A 64-bit pHash is unsigned; SQLite INTEGER is signed and silently promotes anything above
`2**63-1` to a float, destroying the low bits. The columns hold the two's-complement
reinterpretation (`hashing.to_signed` / `from_signed`), which preserves the bit pattern —
the only thing Hamming distance depends on.

### Known limit: identical-artwork reprints

Cards whose id carries an `_r1` / `_p1` suffix are reprints or parallels of a base card.
Many share its artwork *and* its printed card code exactly, so neither pHash nor the OCR
disambiguation can separate them. Measured on the art crop: **112 collision groups over 240
cards in EN (5.1%), 235 groups over 477 cards in JP (10.0%)**.

This is the weak point PROJECT_CONTEXT.md section 9 anticipated. The resolution is not a
better hash — the images are genuinely identical — but surfacing the candidates for manual
selection, or collapsing them into one collection entry. Decide at step 5.

## Build step 4 — recognition (partial: no real photographs yet)

```bash
py backend/scripts/analyze_separability.py     # how far apart the catalogue already is
py backend/scripts/synthetic_eval.py           # how far capture noise moves a hash
py backend/scripts/identify.py photo.jpg       # the matcher itself
```

`identify.py` expects an image already framed on the card. Detection and deskew from a
wider photo is the remaining piece, deliberately left until there are real photographs to
test it against.

### Results grouped by card number, not by row

`analyze_separability.py` established that near neighbours are essentially never different
cards. Up to 32 bits of separation there is **zero** cross-card confusion in either locale;
every close pair is another printing of the same card number. The nearest genuinely
different card sits at 36 (JP) / 38 (EN) bits minimum, median 60.

So `recognition.Catalogue.identify()` returns candidates keyed by card number, each listing
the printings that matched. When several printings tie, the answer is not wrong — the
images are identical and so is the printed code, so OCR cannot break the tie either. Ask
the user, or collapse them into one collection entry.

### What actually degrades recognition

From `synthetic_eval.py` over 150 cards and 18 degradations, card-number accuracy:

| Degradation | drift median | card number correct |
|---|---|---|
| blur, JPEG, noise, contrast, white balance | 0-6 | 100% |
| rotate 1-3 deg | 10-24 | 100% |
| reframe 1-2% | 16-32 | 100% |
| combined "phone photo" | 30 | 100% |
| rotate 5 deg | 40 | 96.7% |
| reframe 5% | 76 | **2%** |

Two conclusions. **Geometry dominates**: photometric noise barely moves the hash, framing
error destroys it, so detection/deskew accuracy is the engineering priority rather than
hash tuning. And **drift alone does not predict failure**: a real degradation pushes the
query away from every card at once, so the true match keeps its rank. Confidence therefore
comes from the margin to the runner-up card number, not from an absolute distance —
`DEFAULT_MAX_DISTANCE` is loose on purpose.

### Language cannot be inferred from the artwork

The art crop excludes all text, and text is the only difference between the EN and JP
printing of a card. Language accuracy is 100% on a pristine render but falls to ~75% under
the combined phone-photo profile. **The scan UI must let the user pick the language** — as
the reference app does — rather than guessing it.

### Detection and deskew

`app/detection.py` finds the card's quadrilateral and rectifies it to the same 600x838
framing as the cached catalogue images, so the art crop lands on the same region for a
photo as it did for the reference. Candidates are *scored* rather than taken largest-first
— shape, centrality, size, rectangularity — because on a play mat the distractors are other
cards, which are card-shaped by definition. Both 180-degree orientations are hashed, since
geometry cannot tell which way up a card was photographed.

`composite_eval.py` runs the whole chain against synthetic scenes and, because it generates
the card's placement, measures **framing error against ground truth** rather than inferring
it. Over 80 cards per condition:

| Scene | detected | correct | framing error |
|---|---|---|---|
| flat, plain bg | 96.2% | 77.5% | 0.3% |
| flat, wood bg | 97.5% | 87.5% | 0.1% |
| slight angle | 96.2% | 86.2% | 0.1% |
| strong angle | 96.2% | 76.2% | 0.8% |
| **cluttered bg** | 93.8% | **41.2%** | **6.2%** |
| dim / high ISO | 100.0% | 100.0% | 0.1% |
| glare on card | 97.5% | 83.8% | 0.1% |
| upside down | 97.5% | 83.8% | 0.3% |

The cluttered row is not a detection failure — the card is found 93.8% of the time. It is a
*precision* failure: objects abutting the card bleed into its contour, the quadrilateral
comes out 6.2% too large, and `synthetic_eval.py` already established that a 5% framing
error costs everything. The two harnesses agree quantitatively, which is the main reason to
trust either.

**Scoped out (decided 2026-08-04):** scanning a card that sits among other cards is not
supported. The scan screen must show a guide frame and expect one card isolated on a clear
surface. Do not spend effort on contour refinement for cluttered scenes; the cluttered row
above is kept as a documented limit, not a bug to fix.

Everything else stays under 1% framing error, and the low-light case is the best of all —
noise does not move a hash.

## Build step 5 — the gate: PASSED

Measured on 24 photographs of real Japanese cards, shot in a binder and on fabric, with
glare, at angles, several sideways.

```bash
py backend/scripts/gate_eval.py            # the rate
py backend/scripts/calibrate_threshold.py  # the threshold
```

| | |
|---|---|
| card detected | **24/24 (100%)** |
| card number correct | **18/24 (75%)** |
| distinct cards identified by at least one shot | **15/19 (79%)** |
| wrong answers shown to the user | **0** |

75% would be a poor result on its own. What makes it a pass is that the two populations
separate completely:

| | distance |
|---|---|
| correct identifications | 14 – 50 |
| wrong identifications | 58 – 62 |

Nothing lands in between. `DEFAULT_MAX_DISTANCE = 52` therefore keeps **every** correct
answer and rejects **every** wrong one. The 6 misses fall through to manual search, which
PROJECT_CONTEXT.md section 3 already designs as the third stage. That asymmetry is the
whole point: a miss routed to search costs seconds, while a miss presented confidently
puts the wrong card in the collection silently.

### What the 6 failures were, and were not

Two hypotheses were tested and both rejected by measurement rather than argument:

- **Aspect tolerance too loose** — sweeping it from 0.22 down to 0.06 never improved
  accuracy beyond 18/24 and cost detections. Left at 0.22.
- **Wrong orientation** — trying all four 90-degree rotations left the failures at
  distance 60-88 from their true card. Orientation was not the problem.

They are simply poor captures: a card cut off by the frame edge, a crop landing inside the
artwork, heavy glare. The evidence is that where the same card was shot more than once, a
second shot succeeded — OP15-038 failed on one of three, OP10-004 on one of two. A live
camera feed retries continuously, like a barcode scanner, so this matters less in the app
than in a fixed set of stills.

Print-versus-render colour drift, the unknown this measurement existed to expose, did not
show up as a systematic offset. Good captures land at distance 14-50, in the same range the
synthetic harness predicted.

### Language still cannot be inferred

10/18 correct, in line with the synthetic prediction. The art crop excludes all text, which
is the only difference between the EN and JP printing. Confirmed: the user picks the
edition, the scanner does not guess it.

### The synthetic harnesses, in hindsight

Synthetic degradation does not reproduce a phone sensor, glare on a sleeve, a warped card
or uneven lighting. These numbers give a provisional threshold and say which capture
conditions to target; they do not clear the gate.

## Build step 6 — API (without /scan)

```bash
.venv/Scripts/python -m uvicorn --app-dir backend app.main:app --reload
```

Interactive docs at `/docs`. Endpoints: `/cards` (search with name, set, rarity, category,
colour and owned filters), `/cards/{id}`, `/packs`, `/collection` (list, add, patch,
delete), `/collection/stats`, `/images/{lang}/{file}`, `/health`.

**`/scan` is deliberately absent.** The step-5 gate guards the recognition pipeline, and
nothing else in the API depends on it — catalogue browsing, search and collection
management work regardless. Stubbing `/scan` would let a frontend be built against a
pipeline nobody has measured, which is what the gate exists to prevent. `/health` reports
`scan_enabled: false` so the client can hide the feature rather than discover it missing.

Two things worth knowing about the implementation: connections are opened per request,
because SQLite refuses a connection created in another thread and FastAPI runs sync routes
in a worker pool; and the collection endpoints look the card up in a second query instead
of joining, because a `SELECT col.*, c.*` makes both tables contribute an `id` and
`sqlite3.Row` silently resolves it to the wrong one.

## Tests

```bash
.venv/Scripts/python -m pytest backend -c backend/pytest.ini
```

38 tests, covering the properties that would fail silently: account isolation, token
rotation and reuse detection, collection semantics, and the 64-bit hash storage.

They run against a throwaway database in a temp directory — `MYTGC_DATA_DIR` and
`MYTGC_DB_PATH` are set before the app is imported, so a test run can never reach the real
collection.

The isolation tests were checked by breaking the code on purpose: removing `user_id` from
the collection `PATCH`, and from the pack `owned_count` subquery. Each mutation failed
exactly one test and nothing else. A suite that passes against broken code is theatre.

## Rate limiting

`/auth/login` is limited per address **and** per email, because either key alone is
sidestepped — rotating addresses beats a per-IP limit, and one password sprayed across many
accounts beats a per-email one. A successful sign-in clears the counter, so mistyping twice
does not cost a lockout. `/auth/register` and `/scan` have their own windows; scanning is
CPU-heavy and the live camera fires it by design.

Counters live in the process. That is the right size for a self-hosted single instance:
they reset on restart, which is not an attack vector, and a shared store would mean running
Redis for a household of one.

Behind Nginx and the tunnel every request arrives from localhost, so the address comes from
`X-Forwarded-For` — first entry only, and only because the proxy in front is ours.

## Configuration

| Variable | Purpose |
|---|---|
| `MYTGC_SECRET_KEY` | Signs access tokens. **Required in production** — without it a key is generated per boot and every session dies on restart. |
| `MYTGC_ORIGINS` | Comma-separated extra CORS origins, e.g. the tunnel host. Credentials are allowed, so a wildcard is neither legal nor wise. |
| `MYTGC_DATA_DIR` | Where the database, image cache and punk-records clone live. In production this belongs outside the checkout: it is 2.5 GB and must survive a redeploy. |
| `MYTGC_DB_PATH` | Overrides just the database path. |

## Accounts

Multi-user, replacing the original single-user premise. Run the migration once on an
existing database — it rebuilds `collection` and `wishlist` with a `user_id` and hands the
existing rows to the account it creates:

```bash
py backend/scripts/migrate_multiuser.py --email you@example.com
```

Then set a signing key, or every session dies on each restart:

```bash
export MYTGC_SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')"
```

### The scheme

Passwords are hashed with **Argon2id**, its parameters carried inside the hash so they can be
raised later without a migration. A login returns a **15-minute access token** (JWT, sent as a
Bearer header) and a **30-day refresh token** that is **rotated on every use**.

Rotation is what makes theft detectable: presenting a token that has already been exchanged
means two parties hold it, so the entire family descended from that login is revoked and both
are forced to sign in again. Refresh tokens are stored hashed — the database is a backup
target and a leaked table must not hand out sessions.

**Transport differs by client, deliberately.** Browsers get the refresh token in an httpOnly
cookie, unreachable from JavaScript and therefore out of reach of an XSS. A Capacitor build
cannot rely on that cookie — its origin is `capacitor://localhost` and iOS restricts
cross-site cookies — so the token is also returned in the body, for Keychain/Keystore. It
must never go in `localStorage`. The access token is held in a module variable in the client,
never persisted.

The cookie is scoped to `/`, not `/auth`: the client reaches the API behind a proxy prefix
(`/api/auth/refresh` in dev), and a cookie pinned to `/auth` is never sent, which killed the
session on every reload.

Renewal is shared across callers. Several requests can hit a 401 at once, and each firing its
own refresh would rotate repeatedly — which the server correctly reads as reuse and answers by
revoking everything.

### What is protected

Everything user-scoped, plus the catalogue queries and `/scan`: the instance is exposed
through a tunnel, so an unauthenticated visitor should not be able to browse it or spend its
CPU. `/health`, `/auth/*` and `/images/*` stay public — images are referenced from `<img>`
tags that cannot carry an Authorization header, and card art is Bandai's, not personal data.

Ownership checks are scoped by `user_id`, not only by row id, so no signed-in account can
reach another's holdings by guessing a number.

## Design

**The cards are the colour; the app is the wall.** 9,447 pieces of vivid artwork are the
content, so the chrome is a deep navy that lets them hang like a gallery instead of a shop
listing. Red is reserved for the primary action and gold for ownership — nothing else may
use either.

The six printed card colours are data, not decoration: One Piece is built on that axis, so
every card carries a **colour spine**, and the home screen shows the collection's balance
across the six.

The signature is the **completion ring** with cardinal ticks. A collector's live question is
never "how many cards do I have" but "how close is this set", and a ring reads at a glance in
a list where a bar does not. It turns gold only when the set is finished.

Type is one family in three voices — display, body, and a tracked uppercase label — because a
downloaded display face would cost an offline app a network dependency it must not have. The
personality comes from weight contrast and tracking instead.

### UX decisions that drove the structure

- **Adding a scanned card takes one tap, in place.** It used to take five and a navigation.
  The result screen adds to the collection and re-arms the camera, so emptying a binder is
  scan, tap, scan, tap. A session counter and an undo on every add make the loop legible.
- **Ownership is visible on every tile.** Unowned cards are dimmed, owned ones carry a gold
  count. Browsing a set is otherwise indistinguishable from browsing a catalogue.
- **Owned/missing filtering is server-side.** Doing it on the loaded page made the set header
  disagree with the Extensions list and made "Possédées" look empty whenever the owned cards
  sat past the first 60 by id.
- **Home is not filtered by the browsing edition.** A collector holding only Japanese cards
  was being told "nothing started" directly under a count of 19 cards.
- **The collection is held in memory** with optimistic writes, so a quantity moves under the
  thumb instead of after a round trip, and ownership can be known by every tile in a
  9,447-card grid without asking the server per card.
- **Touch targets are 44px** on the controls that get hammered while emptying a binder.

## Build step 7 — frontend

```bash
.venv/Scripts/python -m uvicorn --app-dir backend app.main:app   # port 8000
npm run dev --prefix frontend                                    # port 5173
```

Vite proxies `/api` to the backend in dev, so there is one origin and no CORS. A Capacitor
build has no proxy and must set `VITE_API_BASE`.

React + TypeScript + Vite + Tailwind 4, extracted from the scaffold that was sitting at the
workspace root; its `appId` was `be.elmzn.onepiecetracker` and is corrected to
`be.elmzn.mytgc`. `android/` was dropped and will be regenerated at step 8.

Four tabs: Accueil, Extensions, Recherche, Collection. **No Scanner tab** — recognition is
paused and `/health` reports `scan_enabled: false`, which the home screen surfaces as a
notice rather than a broken button. No Decks tab either: out of scope per
PROJECT_CONTEXT.md section 8, despite the reference app having one.

The catalogue grid is windowed with `@tanstack/react-virtual` (row-level). PROJECT_CONTEXT.md
named `react-virtualize`, which does not exist on npm.

Visual language is taken from the reference screenshots: warm off-white ground, white
surfaces, crimson for actions, gold for progress and value, floating pill tab bar, segmented
toggles, and a designed empty state on every list. Page titles use an old-style serif rather
than the reference's blackletter, which would mean bundling a licensed font file — swap
`--font-display` in `index.css` if one is chosen.

## Build step 8 — Capacitor / Android

```bash
cp frontend/.env.example frontend/.env.production   # point VITE_API_BASE at a reachable API
npm run build --prefix frontend && npx --prefix frontend cap sync android
```

Then open `frontend/android` in Android Studio, or build from the command line:

```bash
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" frontend/android/gradlew.bat -p frontend/android assembleDebug
```

Produces `frontend/android/app/build/outputs/apk/debug/app-debug.apk` (~7.9 MB). The system
JDK is 1.8, which Gradle 8 rejects; Android Studio's bundled JBR 21 is used instead.

`appId` is `be.elmzn.mytgc`, per PROJECT_CONTEXT.md section 1.

### Reaching the API from the device

There is no Vite proxy in a native build, so `VITE_API_BASE` must be an absolute URL the
phone can reach — `http://10.0.2.2:8000` from the emulator, the machine's LAN IP from a real
device, or the Cloudflare Tunnel host. Whatever is used must also be in the CORS allow list
in `backend/app/main.py`.

Android 9+ blocks cleartext HTTP, so `app/src/debug/` carries a network security config that
permits it for `10.0.2.2`, `localhost` and `127.0.0.1` only. Release builds do not include
that source set and stay HTTPS-only, which is what the tunnel serves. Add your LAN IP to
that file to test from a physical phone.

### Two scan modes

**Live is the default**: the camera stays open and frames are sent as the view settles, so a
card is identified by pointing at it. Recognition stays server-side per PROJECT_CONTEXT.md
section 3 — frames are captured, downscaled and POSTed exactly like a photo. The only work
done in the browser is deciding *when* to send: a mean-absolute-difference between two 40x56
frames. Without it the stream would either flood the server ten times a second or send
motion-blurred frames that cannot match. A hit freezes the stream and waits for confirmation;
auto-adding would collect cards that were only ever pointed at.

**Photo is the fallback**, and it is not optional. `getUserMedia` only runs in a secure
context, so over `http://<lan-ip>:5173` — which is how this gets tested on a phone — the live
scanner cannot start at all. The mode toggle defaults to whichever is actually available, and
the live panel says why it is unavailable rather than showing a dead camera.

To test live scanning on a phone:

```bash
npm run dev:https --prefix frontend
```

Serves the same app over a self-signed certificate. Safari warns once; accept it and the
camera works. Plain `npm run dev` stays http, which is enough for everything except the
camera. In a Capacitor build the WebView is already a secure context, so live works natively.

### Testing on a phone without a native build

`npm run dev --prefix frontend` binds all interfaces (`vite --host`), so a phone on the same
network can open `http://<machine-lan-ip>:5173` directly. The phone only talks to Vite, which
proxies `/api` onwards, so there is no CORS to configure and `VITE_API_BASE` stays unset.

This covers scanning too: the capture control is `<input type="file" capture="environment">`,
which opens the native camera on both iOS and Android and, unlike `getUserMedia`, does not
require HTTPS. For iPhone this is the only way to test without a Mac.

### iOS

Not set up, and not buildable here: it needs macOS. Per PROJECT_CONTEXT.md section 9 the
build goes through GitHub Actions on `macos-latest`. Note that CI produces an `.ipa` but
does not install it — putting a native build on an iPhone still requires either a Mac with
Xcode or a paid Apple Developer account for TestFlight. The browser route above avoids both.

## Scan (enabled by the step-5 gate)

```
POST /scan?language=jp     multipart file=<image>
```

Runs detect → deskew → hash both orientations → match, and returns candidates grouped by
card number with the full card record attached, so the client can render a result without
a second round trip.

Three things it does deliberately:

- **`language` is a parameter, not a guess.** The gate confirmed the edition cannot be read
  from the artwork. Omitting it searches both and may return the wrong printing, so the
  Scanner screen makes the user pick before shooting.
- **Confidence is judged after filtering by edition.** Judging it on the unfiltered list
  marked a correct English answer as unsure merely because the Japanese printing of the same
  artwork ranked above it.
- **A miss is reported as a miss.** Beyond distance 52 nothing is offered and the UI routes
  to manual search, which is what keeps the wrong card out of the collection.

The catalogue is built once at startup and held in `app.state`; rebuilding it per scan would
re-read all 9,447 rows and dominate the request.

Verified end to end in the browser on real photographs: a good capture returns
`OP13-085 · JP` at distance 16, and a known-bad capture returns the "non reconnue" panel with
a link to manual search.

## Build order

Per `PROJECT_CONTEXT.md` section 7. Step 5 is a hard go/no-go gate: no backend or UI work
before the recognition rate is measured and accepted.

1. Import catalogue — done
2. Audit JP data quality — done (runs as part of the import)
3. Precompute R/G/B pHashes — done (9,447 images cached, 9,447 hashed)
4. Prototype recognition as a standalone CLI — done

5. Calibrate and measure — **gate PASSED**: 75% correct, 0 wrong answers at threshold 52
   (scan work is paused; everything below is scan-independent)
6. FastAPI backend — done, /scan included
7. Frontend — done, Scanner tab included
8. Capacitor packaging — Android done (debug APK builds); iOS deferred to CI on macOS
