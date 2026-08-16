"""Request and response shapes for the API."""

import json
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Language = Literal["en", "jp"]
Condition = Literal["near_mint", "lightly_played", "moderately_played",
                    "heavily_played", "damaged"]


MIN_PASSWORD = 10


class RegisterRequest(BaseModel):
    email: EmailStr
    # Required unless registration is open, or this is the very first account.
    invite_code: str | None = None
    # Length is the only rule enforced. Composition rules (a digit, a symbol) push
    # people towards predictable substitutions without adding real entropy.
    password: str = Field(min_length=MIN_PASSWORD, max_length=200)
    display_name: str | None = Field(default=None, max_length=60)


class InviteCreate(BaseModel):
    note: str | None = Field(default=None, max_length=80)
    days_valid: int = Field(default=14, ge=1, le=365)


class Invite(BaseModel):
    id: int
    note: str | None = None
    created_at: str
    expires_at: str | None = None
    used_at: str | None = None
    # Present only in the response that mints it: the code is stored hashed and
    # cannot be shown again.
    code: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    # Only a native client sends this; browsers carry the token in an httpOnly cookie.
    refresh_token: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=MIN_PASSWORD, max_length=200)


class UserProfile(BaseModel):
    id: int
    email: str
    display_name: str | None = None
    created_at: str | None = None
    default_language: Language = "en"
    grid_columns: int = 2
    # The one set the binder opens on. Both null or both set -- never one without the
    # other, since a code alone cannot say which printing it means.
    goal_pack_code: str | None = None
    goal_language: Language | None = None


class ProfileUpdate(BaseModel):
    default_language: Language | None = None
    grid_columns: int | None = Field(default=None, ge=2, le=6)
    display_name: str | None = Field(default=None, max_length=60)
    # Explicit null clears the goal -- FastAPI keeps "absent from the body" and
    # "sent as null" apart via model_fields_set, which is what exclude_unset in the
    # handler reads. Sending only one of the pair is what the handler rejects.
    goal_pack_code: str | None = None
    goal_language: Language | None = None


class Session(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    # Present for native clients to put in Keychain/Keystore. Browsers should ignore
    # it and rely on the cookie; storing it in localStorage undoes the XSS protection.
    refresh_token: str
    user: UserProfile


class Card(BaseModel):
    id: str
    language: Language
    name: str
    pack_id: str
    pack_code: str | None = None
    pack_name: str | None = None
    rarity: str | None = None
    category: str | None = None
    colors: list[str] = []
    cost: int | None = None
    power: int | None = None
    counter: int | None = None
    attributes: list[str] = []
    types: list[str] = []
    effect: str | None = None
    trigger: str | None = None
    release_date: str | None = None
    # What one copy is going for, in euros. Null on the Japanese printing and on the
    # alternate arts the importer refuses to guess at -- see scripts/import_prices.py.
    market_price: float | None = None
    image_url: str | None = None
    # Other printings of the same card number. Populated on the detail endpoint only:
    # identical artwork and printed code, so the UI must let the user choose.
    printings: list[str] = []

    @classmethod
    def from_row(cls, row) -> "Card":
        keys = row.keys()

        def parse(field: str) -> list[str]:
            raw = row[field] if field in keys else None
            return json.loads(raw) if raw else []

        return cls(
            id=row["id"], language=row["language"], name=row["name"],
            pack_id=row["pack_id"], pack_code=row["pack_code"],
            pack_name=row["pack_name"], rarity=row["rarity"],
            category=row["category"], colors=parse("colors"), cost=row["cost"],
            power=row["power"], counter=row["counter"],
            attributes=parse("attributes"), types=parse("types"),
            effect=row["effect"] if "effect" in keys else None,
            trigger=row["trigger"] if "trigger" in keys else None,
            release_date=row["release_date"] if "release_date" in keys else None,
            market_price=row["market_price"] if "market_price" in keys else None,
            image_url=f"/images/{row['language']}/{row['id']}.png"
            if row["image_path"] else None,
        )


class PricePoint(BaseModel):
    captured_at: str
    price: float


class ValuePoint(BaseModel):
    captured_at: str
    total: float


class CardPage(BaseModel):
    items: list[Card]
    total: int
    offset: int
    limit: int


class Pack(BaseModel):
    pack_id: str
    language: Language
    pack_code: str | None
    pack_name: str | None
    card_count: int
    owned_count: int


class CollectionEntry(BaseModel):
    id: int
    card_id: str
    language: Language
    quantity: int
    condition: Condition | None = None
    date_added: str
    acquisition_price: float | None = None
    card: Card | None = None


class CollectionCreate(BaseModel):
    card_id: str
    language: Language
    quantity: int = Field(default=1, ge=1)
    condition: Condition | None = None
    acquisition_price: float | None = Field(default=None, ge=0)


class CollectionUpdate(BaseModel):
    quantity: int | None = Field(default=None, ge=0)
    condition: Condition | None = None
    acquisition_price: float | None = Field(default=None, ge=0)


class ScanPrinting(BaseModel):
    card_id: str
    distance: int
    pack_code: str | None = None
    rarity: str | None = None


class ScanCandidate(BaseModel):
    card_number: str
    language: Language
    name: str
    distance: int
    printings: list[ScanPrinting] = []
    # True when several printings tie: identical artwork and identical printed code,
    # so neither pHash nor OCR can separate them and the user must choose.
    ambiguous_printing: bool = False
    card: Card | None = None


class ScanResult(BaseModel):
    # Why nothing came back, when nothing came back. The interface turns each of
    # these into an instruction; 'none' means the frame looked fine and the card was
    # simply not in it, which is the honest answer rather than an invented cause.
    reason: Literal["light", "blur", "glare", "unknown", "none"] | None = None
    detected: bool
    # Confident means: inside the calibrated distance threshold and clearly ahead of
    # the runner-up. The step-5 gate showed correct answers land at distance 14-50 and
    # wrong ones at 58-62, so anything rejected here is a genuine "ask the user".
    confident: bool
    margin: int | None = None
    candidates: list[ScanCandidate] = []
    message: str | None = None


class WishlistEntry(BaseModel):
    id: int
    card_id: str
    language: Language
    # 1 is "grab it on sight", 3 is "eventually". Kept small on purpose: a ten-point
    # scale invites agonising over the difference between a 6 and a 7.
    priority: int = 2
    alert_threshold: float | None = None
    # What the card costs where it was seen, entered by hand. There is no price feed
    # behind this, and a plausible-looking number nobody typed would read as one.
    price: float | None = None
    notes: str | None = None
    card: Card | None = None


class HistoryCreate(BaseModel):
    query: str = Field(max_length=80)


# Where a card lands when nobody said otherwise: the middle of the three. Named so the
# bulk insert and the single add cannot drift into disagreeing about it.
DEFAULT_PRIORITY = 2


class WishlistCreate(BaseModel):
    card_id: str
    language: Language
    priority: int = Field(default=DEFAULT_PRIORITY, ge=1, le=3)
    alert_threshold: float | None = Field(default=None, ge=0)
    price: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=280)


class WishlistUpdate(BaseModel):
    priority: int | None = Field(default=None, ge=1, le=3)
    alert_threshold: float | None = Field(default=None, ge=0)
    price: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=280)


class WishlistBulk(BaseModel):
    """Everything one set is still missing, in one call.

    A set runs to about 150 cards, so doing this by looping POST /wishlist would be
    150 round trips -- and worse, that endpoint treats a second add as an edit and
    would overwrite the priority, price and notes already typed against any card
    already on the list. This one only ever inserts.
    """
    pack_code: str
    language: Language


class WishlistBulkResult(BaseModel):
    missing: int
    added: int
    # Left exactly as they were, priorities and prices included.
    already_listed: int


class CollectionStats(BaseModel):
    distinct_cards: int
    total_quantity: int
    by_language: dict[str, int]
    by_rarity: dict[str, int]
    acquisition_total: float
    # What the priced part of the collection is worth, and how much of the collection
    # that is. The total alone would read as the whole answer; it never is, because
    # the Japanese printing has no price feed and the alternate arts are deliberately
    # left uncosted. The counts are what let the screen say so.
    market_total: float
    market_priced: int
    market_currency: str = "EUR"
