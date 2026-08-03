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

## Build order

Per `PROJECT_CONTEXT.md` section 7. Step 5 is a hard go/no-go gate: no backend or UI work
before the recognition rate is measured and accepted.

1. Import catalogue — done
2. Audit JP data quality — done (runs as part of the import)
3. Precompute R/G/B pHashes
4. Prototype recognition as a standalone CLI
5. Calibrate and measure — **gate**
6. FastAPI backend
7. Frontend
8. Capacitor packaging
