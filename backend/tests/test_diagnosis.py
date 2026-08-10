"""Why a scan came back empty.

Exercised on a real capture rather than on synthetic noise: the thresholds have to
hold for an actual photograph taken through a phone, and a generated gradient would
prove nothing about that. The good frame is the control — if it ever starts reporting
a fault, the thresholds have drifted into calling normal photos broken, which is the
failure that matters here. Telling someone their picture is blurry when it is fine
sends them to fix the wrong thing.
"""

import cv2
import numpy as np
import pytest

from app import diagnosis

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
    # Downscaled the way a scan frame is, so the statistics see what production sees.
    return cv2.resize(image, (600, 838))


def test_a_good_frame_is_not_accused_of_anything(photo):
    assert diagnosis.diagnose(photo) == "none"


def test_an_underexposed_frame_reads_as_light(photo):
    assert diagnosis.diagnose((photo * 0.18).astype(np.uint8)) == "light"


def test_a_soft_frame_reads_as_blur(photo):
    assert diagnosis.diagnose(cv2.GaussianBlur(photo, (31, 31), 0)) == "blur"


def test_a_blown_frame_reads_as_glare(photo):
    """A specular patch across a third of the card, which is what a lamp does."""
    blown = photo.copy()
    blown[200:560, :] = 255
    assert diagnosis.diagnose(blown) == "glare"


def test_darkness_is_judged_before_the_other_two(photo):
    """An underexposed frame is also soft by the Laplacian and free of glare by
    definition, so checking sharpness first would report the wrong cause on every
    photo taken in a dim room."""
    dark_and_soft = cv2.GaussianBlur((photo * 0.18).astype(np.uint8), (31, 31), 0)
    assert diagnosis.diagnose(dark_and_soft) == "light"


def test_glare_is_judged_before_blur(photo):
    """A blown highlight destroys local contrast, which the blur test then reports as
    softness — sending the user to refocus when the fix is to tilt the card."""
    blown = photo.copy()
    blown[200:560, :] = 255
    assert diagnosis.diagnose(cv2.GaussianBlur(blown, (9, 9), 0)) == "glare"
