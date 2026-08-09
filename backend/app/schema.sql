-- MyTCG schema. Follows PROJECT_CONTEXT.md section 5.
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

-- Accounts. The catalogue (cards, price_history) is shared by everyone; anything a
-- person accumulates is scoped to them.
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL,
    email_lower   TEXT NOT NULL UNIQUE,  -- lookups are case-insensitive
    display_name  TEXT,
    password_hash TEXT NOT NULL,         -- Argon2id
    -- Which edition this account browses by default. The two printings of a card are
    -- indistinguishable by sight, so the choice can never be inferred -- and resetting
    -- it to 'en' on every reload is wrong for anyone whose collection is Japanese.
    default_language TEXT NOT NULL DEFAULT 'en',
    -- How many cards per row on the grids. A preference, not a viewport question:
    -- two is readable and three fits more, and which one is right is a taste.
    grid_columns     INTEGER NOT NULL DEFAULT 2,
    created_at    TEXT NOT NULL,
    last_login_at TEXT
);

-- Refresh tokens are stored hashed, never in the clear: the database is a backup
-- target and a leaked table must not hand out sessions.
--
-- `family` ties every token descended from one login together. Rotation issues a new
-- token and revokes the old one, so a token presented twice means a copy is in
-- circulation — the whole family is then revoked rather than just that token.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    family      TEXT NOT NULL,
    issued_at   TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    revoked_at  TEXT,
    user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens (user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens (family);

-- Registration is invite-only by default: the instance answers on a public address,
-- and an open sign-up form hands anyone an account and therefore access to /scan,
-- which is the one endpoint that costs real CPU.
--
-- Codes are stored hashed, like refresh tokens: a leaked table must not mint accounts.
CREATE TABLE IF NOT EXISTS invites (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code_hash   TEXT NOT NULL UNIQUE,
    note        TEXT,                   -- who it was meant for
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL,
    expires_at  TEXT,
    used_at     TEXT,
    used_by     INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invites_open ON invites (used_at, expires_at);

CREATE TABLE IF NOT EXISTS collection (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id            TEXT NOT NULL,
    language           TEXT NOT NULL,
    quantity           INTEGER NOT NULL DEFAULT 1,
    condition          TEXT,             -- near_mint, lightly_played, played...
    date_added         TEXT NOT NULL,
    acquisition_price  REAL
);

CREATE INDEX IF NOT EXISTS idx_collection_card ON collection (user_id, card_id, language);

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
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id         TEXT NOT NULL,
    language        TEXT NOT NULL,
    priority        INTEGER,
    alert_threshold REAL,
    -- What the card actually costs where the user saw it. Entered by hand: there is
    -- no price feed, and a number invented to look plausible on a wanted poster
    -- would read as real data.
    price           REAL,
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist (user_id);

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
