-- MyTGC schema. Follows PROJECT_CONTEXT.md section 5.
--
-- Two columns are added to `cards` beyond the contract, both flagged in the
-- import report:
--   * pack_code -- punk-records stores pack_id as an opaque numeric key ("569001").
--                  The printed set code ("ST-01") only exists in packs.json and is
--                  needed to group and label sets in the UI.
--   * img_url   -- source URL of the card art. Build step 3 needs it to download and
--                  cache images; storing it avoids re-parsing punk-records. This is a
--                  URL, not a binary: the "no image blobs in the database" rule holds.

CREATE TABLE IF NOT EXISTS cards (
    id            TEXT NOT NULL,         -- e.g. 'OP09-093', or 'OP09-093_p1' for an alt art
    language      TEXT NOT NULL,         -- 'en' | 'jp'
    name          TEXT NOT NULL,
    pack_id       TEXT NOT NULL,         -- punk-records numeric pack key
    pack_code     TEXT,                  -- printed set code, e.g. 'OP-09'
    pack_name     TEXT,
    rarity        TEXT,
    category      TEXT,
    colors        TEXT,                  -- JSON array
    cost          INTEGER,
    power         INTEGER,
    counter       INTEGER,
    attributes    TEXT,                  -- JSON array
    types         TEXT,                  -- JSON array
    effect        TEXT,
    trigger       TEXT,
    img_url       TEXT,                  -- remote source URL
    image_path    TEXT,                  -- local cache path, NOT the image blob
    r_phash       INTEGER,
    g_phash       INTEGER,
    b_phash       INTEGER,
    PRIMARY KEY (id, language)
);

CREATE INDEX IF NOT EXISTS idx_cards_name     ON cards (name);
CREATE INDEX IF NOT EXISTS idx_cards_pack     ON cards (language, pack_code);
CREATE INDEX IF NOT EXISTS idx_cards_rarity   ON cards (language, rarity);

CREATE TABLE IF NOT EXISTS collection (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id            TEXT NOT NULL,
    language           TEXT NOT NULL,
    quantity           INTEGER NOT NULL DEFAULT 1,
    condition          TEXT,             -- near_mint, lightly_played, played...
    date_added         TEXT NOT NULL,
    acquisition_price  REAL
);

CREATE INDEX IF NOT EXISTS idx_collection_card ON collection (card_id, language);

CREATE TABLE IF NOT EXISTS price_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id     TEXT NOT NULL,
    language    TEXT NOT NULL,
    source      TEXT NOT NULL,
    price       REAL NOT NULL,
    currency    TEXT NOT NULL,
    captured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_card ON price_history (card_id, language, captured_at);

CREATE TABLE IF NOT EXISTS wishlist (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id         TEXT NOT NULL,
    language        TEXT NOT NULL,
    priority        INTEGER,
    alert_threshold REAL,
    notes           TEXT
);

-- Provenance of the imported catalogue, so a stale snapshot is detectable without
-- re-reading punk-records. One row per language.
CREATE TABLE IF NOT EXISTS catalogue_meta (
    language      TEXT PRIMARY KEY,
    source        TEXT NOT NULL,         -- 'punk-records'
    source_commit TEXT,
    generated_at  TEXT,                  -- from the punk-records manifest
    card_count    INTEGER NOT NULL,
    imported_at   TEXT NOT NULL
);
