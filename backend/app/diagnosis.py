"""Why a scan came back empty.

A scanner that answers "erreur" sends the user back to an identical viewfinder having
taught them nothing, and the interface already knows how to say more than that:
ScanMiss carries five causes. Until now it only ever received two of them, because
the server reported one bit -- detected or not.

None of this is recognition. These are three cheap statistics over the frame that was
already decoded, and they are only ever consulted on the path where nothing was
found, so a successful scan pays nothing for them.

The order matters and is not arbitrary. Darkness is checked first because it causes
the other two to read wrong: an underexposed frame is also blurry by the Laplacian
and free of glare by definition. Glare comes before blur because a blown highlight
destroys local contrast, which the blur test then reports as softness -- telling
someone their photo is out of focus when the real problem is a reflection sends them
to do the wrong thing.
"""

from typing import Literal

import cv2
import numpy as np

Reason = Literal["light", "blur", "glare", "unknown", "none"]

# Mean luminance out of 255. Below this the sensor is guessing: a card lit this
# poorly loses the colour separation the per-channel hash depends on.
DARK_MEAN = 55

# Variance of the Laplacian -- the standard sharpness proxy. A printed card is full
# of hard edges, so a focused frame scores in the hundreds; this threshold sits well
# under that so only a genuinely soft frame is called blurry.
BLUR_VARIANCE = 60

# Share of pixels within a hair of pure white. A card under a lamp throws a specular
# patch; a card in normal light has almost none.
GLARE_LEVEL = 250
GLARE_SHARE = 0.06


def diagnose(image: np.ndarray) -> Reason:
    """Name the most likely reason a frame yielded nothing.

    Returns 'none' when the frame looks fine, which is the honest answer: the card
    was simply not in shot, and inventing a cause would send the user to fix
    something that is not wrong.
    """
    grey = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    if float(grey.mean()) < DARK_MEAN:
        return "light"

    blown = float((grey >= GLARE_LEVEL).mean())
    if blown > GLARE_SHARE:
        return "glare"

    if float(cv2.Laplacian(grey, cv2.CV_64F).var()) < BLUR_VARIANCE:
        return "blur"

    return "none"
