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
            image_url=f"/images/{row['language']}/{row['id']}.png"
            if row["image_path"] else None,
        )


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
    detected: bool
    # Confident means: inside the calibrated distance threshold and clearly ahead of
    # the runner-up. The step-5 gate showed correct answers land at distance 14-50 and
    # wrong ones at 58-62, so anything rejected here is a genuine "ask the user".
    confident: bool
    margin: int | None = None
    candidates: list[ScanCandidate] = []
    message: str | None = None


class CollectionStats(BaseModel):
    distinct_cards: int
    total_quantity: int
    by_language: dict[str, int]
    by_rarity: dict[str, int]
    acquisition_total: float
