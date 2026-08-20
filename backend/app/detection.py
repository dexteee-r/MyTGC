"""Locate a card in a photo and rectify it to the catalogue's framing.

PROJECT_CONTEXT.md section 2 puts OpenCV here: detection and deskew. This stage
matters more than the hash itself — synthetic_eval.py measured that a 5% framing
error drops card-number accuracy from 100% to 2%, while heavy blur, JPEG artefacts
and colour casts barely move the result. Precision here is the whole game.

The output is deliberately the same 600x838 framing as the cached catalogue images,
so the art crop in hashing.py lands on the same region for a photo as it did for the
reference.
"""

import cv2
import numpy as np

# One Piece cards are standard TCG stock, 63 x 88 mm.
CARD_ASPECT = 63.0 / 88.0
CANONICAL_WIDTH, CANONICAL_HEIGHT = 600, 838

# A detected quadrilateral is rejected if its aspect ratio is this far from a card.
# Loose enough to survive perspective, tight enough to reject a table edge or a mat.
ASPECT_TOLERANCE = 0.22

# Reject anything smaller than this share of the frame: at that size it is a
# background object, not the card being photographed.
MIN_AREA_FRACTION = 0.04

WORKING_MAX_DIM = 1000       # detection resolution; the warp uses the full-size image


def order_corners(points: np.ndarray) -> np.ndarray:
    """Return the four corners as top-left, top-right, bottom-right, bottom-left.

    The corner with the smallest x+y is top-left and the largest is bottom-right;
    the smallest y-x is top-right. This holds for any rotation under 45 degrees,
    which is well past what a hand-held photo produces.
    """
    points = points.reshape(4, 2).astype(np.float32)
    ordered = np.zeros((4, 2), dtype=np.float32)
    total = points.sum(axis=1)
    diff = np.diff(points, axis=1).ravel()
    ordered[0] = points[np.argmin(total)]
    ordered[2] = points[np.argmax(total)]
    ordered[1] = points[np.argmin(diff)]
    ordered[3] = points[np.argmax(diff)]
    return ordered


def _edge_lengths(corners: np.ndarray) -> tuple[float, float]:
    top = np.linalg.norm(corners[1] - corners[0])
    bottom = np.linalg.norm(corners[2] - corners[3])
    left = np.linalg.norm(corners[3] - corners[0])
    right = np.linalg.norm(corners[2] - corners[1])
    return (top + bottom) / 2, (left + right) / 2


def _aspect_error(corners: np.ndarray) -> float | None:
    """How far this quadrilateral's shape is from a card, or None if degenerate."""
    width, height = _edge_lengths(corners)
    if width < 1 or height < 1:
        return None
    # Accept either orientation; a landscape card is rotated upright afterwards.
    ratio = min(width, height) / max(width, height)
    return abs(ratio - CARD_ASPECT)


def _score(corners: np.ndarray, contour: np.ndarray, frame_shape: tuple) -> float | None:
    """Rank a candidate by how card-like it is, not merely by how big it is.

    Taking the largest plausible contour picks a distractor whenever the photo has
    other rectangular objects in it — and on a play mat the distractors are other
    cards, which are card-shaped by definition. Shape alone cannot win that fight.

    Four signals, weighted: shape (aspect close to a card), centrality (the scan UI
    shows a guide frame, so the card the user means is the one they aimed at), size,
    and rectangularity (a card fills its own bounding quadrilateral; a blob does not).
    """
    error = _aspect_error(corners)
    if error is None or error > ASPECT_TOLERANCE:
        return None

    height, width = frame_shape[:2]
    frame_area = float(height * width)
    area = cv2.contourArea(corners.astype(np.float32))
    if area < frame_area * MIN_AREA_FRACTION:
        return None

    shape = 1.0 - error / ASPECT_TOLERANCE
    rectangularity = min(1.0, cv2.contourArea(contour) / area) if area > 0 else 0.0
    size = min(1.0, area / frame_area / 0.5)

    centroid = corners.mean(axis=0)
    offset = np.hypot((centroid[0] - width / 2) / width,
                      (centroid[1] - height / 2) / height)
    centrality = max(0.0, 1.0 - offset * 2.0)

    return shape * 2.0 + centrality * 2.0 + rectangularity + size


def find_card(image: np.ndarray) -> np.ndarray | None:
    """Find the card's four corners in a BGR image. Returns them in full-resolution
    coordinates, ordered, or None."""
    height, width = image.shape[:2]
    scale = min(1.0, WORKING_MAX_DIM / max(height, width))
    working = cv2.resize(image, None, fx=scale, fy=scale) if scale < 1.0 else image

    gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
    # Bilateral smoothing removes artwork detail while keeping the card's outer edge,
    # which a plain Gaussian would soften along with everything else.
    gray = cv2.bilateralFilter(gray, 9, 75, 75)

    # Canny thresholds from the image median rather than fixed values, so a dark photo
    # and a bright one both produce usable edges.
    median = float(np.median(gray))
    low = int(max(0, 0.66 * median))
    high = int(min(255, 1.33 * median))
    edges = cv2.Canny(gray, low, high)
    edges = cv2.morphologyEx(
        edges, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    )

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    frame_shape = working.shape
    candidates = sorted(contours, key=cv2.contourArea, reverse=True)[:15]

    # Score every candidate and keep the best, rather than the first that passes.
    # A clean quadrilateral is preferred over a rotated bounding box of the same
    # contour, since approxPolyDP tracks the real edge while minAreaRect only
    # encloses it.
    best_corners, best_score = None, -1.0
    for contour in candidates:
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)

        options = []
        if len(approx) == 4 and cv2.isContourConvex(approx):
            options.append((order_corners(approx), 0.15))       # bonus: exact quad
        # A rounded-corner card on a busy background often defeats approxPolyDP, so
        # always consider the enclosing rotated rectangle too.
        options.append((order_corners(cv2.boxPoints(cv2.minAreaRect(contour))), 0.0))

        for corners, bonus in options:
            score = _score(corners, contour, frame_shape)
            if score is not None and score + bonus > best_score:
                best_corners, best_score = corners, score + bonus

    if best_corners is None:
        return None
    return best_corners / scale


def deskew(image: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """Rectify the quadrilateral to the catalogue's 600x838 framing."""
    width, height = _edge_lengths(corners)
    if width > height:
        # Landscape capture: shift the corner order so the long side becomes vertical.
        corners = np.roll(corners, -1, axis=0)

    target = np.array(
        [[0, 0], [CANONICAL_WIDTH - 1, 0],
         [CANONICAL_WIDTH - 1, CANONICAL_HEIGHT - 1], [0, CANONICAL_HEIGHT - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(corners, target)
    return cv2.warpPerspective(
        image, matrix, (CANONICAL_WIDTH, CANONICAL_HEIGHT), flags=cv2.INTER_CUBIC
    )


def detect_and_deskew(image: np.ndarray) -> np.ndarray | None:
    corners = find_card(image)
    return None if corners is None else deskew(image, corners)


def whole_frame_as_card(image: np.ndarray) -> np.ndarray:
    """Treat the entire image as an already-framed card rather than a photo to search
    within it -- the fallback for an imported or pasted image, where find_card comes up
    empty because there is no background to separate a card from. Center-cropped to the
    card's own aspect ratio first, not stretched to it: hashing.py's ART_BOX assumes the
    same proportions the catalogue's own reference images carry, and squashing a
    differently-shaped source into that box would misalign the crop before the hash ever
    runs. Never applied to a live camera frame -- there, finding nothing is the correct
    "no card in view" signal, and this would turn an empty table into a confident-
    looking false match instead of a legitimate "not detected"."""
    height, width = image.shape[:2]
    current_aspect = width / height
    if current_aspect > CARD_ASPECT:
        # Wider than a card: crop the sides.
        target_width = int(height * CARD_ASPECT)
        left = (width - target_width) // 2
        image = image[:, left:left + target_width]
    elif current_aspect < CARD_ASPECT:
        # Taller than a card: crop top and bottom.
        target_height = int(width / CARD_ASPECT)
        top = (height - target_height) // 2
        image = image[top:top + target_height, :]
    return cv2.resize(image, (CANONICAL_WIDTH, CANONICAL_HEIGHT), interpolation=cv2.INTER_CUBIC)


def orientations(card: np.ndarray) -> list[np.ndarray]:
    """The upright card and its 180-degree rotation.

    Geometry cannot tell which way up a card was photographed — both orientations
    are a valid rectangle of the right aspect. Hashing both and keeping the better
    match costs one extra comparison and removes the failure mode entirely.
    """
    return [card, cv2.rotate(card, cv2.ROTATE_180)]
