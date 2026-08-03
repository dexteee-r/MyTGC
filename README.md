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

## Build order

Per `PROJECT_CONTEXT.md` section 7. Step 5 is a hard go/no-go gate: no backend or UI work
before the recognition rate is measured and accepted.

1. Import catalogue — done
2. Audit JP data quality — done (runs as part of the import)
3. Precompute R/G/B pHashes — done (9,447 images cached, 9,447 hashed)
4. Prototype recognition as a standalone CLI
5. Calibrate and measure — **gate**
6. FastAPI backend
7. Frontend
8. Capacitor packaging
