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

### This is not the step-5 gate

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

## Build order

Per `PROJECT_CONTEXT.md` section 7. Step 5 is a hard go/no-go gate: no backend or UI work
before the recognition rate is measured and accepted.

1. Import catalogue — done
2. Audit JP data quality — done (runs as part of the import)
3. Precompute R/G/B pHashes — done (9,447 images cached, 9,447 hashed)
4. Prototype recognition as a standalone CLI — matcher done; detection/deskew pending
   real photographs
5. Calibrate and measure — **gate**, blocked: the user owns no physical cards
   (scan work is paused; everything below is scan-independent)
6. FastAPI backend — done, minus /scan
7. Frontend
8. Capacitor packaging
