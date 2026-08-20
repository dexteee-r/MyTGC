"""The fallback for an image with no background to search a card within.

find_card looks for a card-shaped region inside a larger frame -- exactly backwards
for an imported or pasted image, which is usually already a tight crop of just the
card. whole_frame_as_card is what search-by-image falls back to instead. Its one job
is centring: hashing.py's ART_BOX assumes the same proportions as the catalogue's own
reference images, so a source shaped differently than a card has to be cropped to that
shape first, not stretched into it.
"""

import cv2
import numpy as np
import pytest

from app import detection

PHOTO = "backend/data/photos/OP04-012_jp_6105.jpg"


@pytest.fixture(scope="module")
def photo():
    import pathlib

    path = pathlib.Path(PHOTO)
    if not path.exists():
        path = pathlib.Path(__file__).resolve().parents[1] / "data" / "photos" / \
            "OP04-012_jp_6105.jpg"
    image = cv2.imread(str(path))
    if image is None:
        pytest.skip("no reference capture on this machine")
    return image


CANONICAL = (detection.CANONICAL_HEIGHT, detection.CANONICAL_WIDTH)


def test_output_is_always_the_canonical_frame_size(photo):
    assert detection.whole_frame_as_card(photo).shape[:2] == CANONICAL


def test_a_wider_than_card_photo_still_lands_on_the_canonical_frame(photo):
    height = photo.shape[0]
    square = cv2.resize(photo, (height, height))
    assert detection.whole_frame_as_card(square).shape[:2] == CANONICAL


def test_a_taller_than_card_photo_still_lands_on_the_canonical_frame(photo):
    width = photo.shape[1]
    tall = cv2.resize(photo, (width, width * 3))
    assert detection.whole_frame_as_card(tall).shape[:2] == CANONICAL


def test_a_wider_frame_keeps_the_centred_card_and_drops_the_side_margins():
    """A synthetic frame: a card-aspect block of one value in the middle, flanked by
    margins of another -- the shape a screenshot with side padding would have. If the
    crop centred correctly, none of the margin survives into the output."""
    height = 838
    card_width = int(height * detection.CARD_ASPECT)
    margin = 200
    frame = np.zeros((height, card_width + margin * 2, 3), dtype=np.uint8)
    frame[:, margin:margin + card_width] = 255

    result = detection.whole_frame_as_card(frame)
    assert result.shape[:2] == CANONICAL
    assert result.min() > 200  # every pixel came from the bright centre block


def test_a_taller_frame_keeps_the_centred_card_and_drops_the_top_and_bottom():
    width = 600
    card_height = int(width / detection.CARD_ASPECT)
    margin = 300
    frame = np.zeros((card_height + margin * 2, width, 3), dtype=np.uint8)
    frame[margin:margin + card_height, :] = 255

    result = detection.whole_frame_as_card(frame)
    assert result.shape[:2] == CANONICAL
    assert result.min() > 200
