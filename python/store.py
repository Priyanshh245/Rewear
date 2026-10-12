"""Save the local wardrobe as JSON, with atomic writes and stale-form checks."""

import base64
import copy
import json
import os
from pathlib import Path
import re
import threading
from datetime import date

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = Path(os.environ.get("REWEAR_DATA_FILE", str(ROOT / "data/wardrobe.json")))
lock = threading.RLock()
CATEGORIES = ("top", "bottom", "shoes", "outer")
COLORS = (
    "black",
    "white",
    "grey",
    "beige",
    "brown",
    "navy",
    "blue",
    "green",
    "red",
    "pink",
    "purple",
    "orange",
)
STYLES = ("casual", "streetwear", "smart")
SEASONS = ("warm", "cool", "cold")


def blank():
    return {
        "version": 1,
        "revision": 0,
        "wardrobe": [],
        "looks": [],
        "wears": [],
        "demo": False,
    }


def short_text(value, maximum):
    return isinstance(value, str) and 0 < len(value.strip()) <= maximum


def clean_item(item):
    if (
        not isinstance(item, dict)
        or not short_text(item.get("id"), 80)
        or not short_text(item.get("name"), 100)
    ):
        raise ValueError("Invalid garment ID or name.")
    if (
        item.get("category") not in CATEGORIES
        or item.get("color") not in COLORS
        or item.get("fit") not in ("slim", "regular", "relaxed")
        or item.get("pattern") not in ("plain", "stripe", "print")
        or not isinstance(item.get("available"), bool)
    ):
        raise ValueError("Invalid garment fields.")
    for key, allowed in (("styles", STYLES), ("seasons", SEASONS)):
        values = item.get(key)
        if (
            not isinstance(values, list)
            or not 1 <= len(values) <= 3
            or any(value not in allowed for value in values)
        ):
            raise ValueError("Choose at least one supported style and season tag.")
    image = item.get("image")
    if image and (
        not isinstance(image, str)
        or len(image) > 240000
        or not re.fullmatch(r"data:image/jpeg;base64,[A-Za-z0-9+/=]+", image)
    ):
        raise ValueError("A photo has an unsupported format or size.")
    if image:
        try:
            base64.b64decode(image.split(",", 1)[1], validate=True)
        except Exception:
            raise ValueError("Invalid photo data.") from None
    keys = (
        "id",
        "name",
        "category",
        "color",
        "fit",
        "pattern",
        "styles",
        "seasons",
        "available",
    )
    return {**{key: copy.deepcopy(item[key]) for key in keys}, "image": image or None}


def normalise(data):
    if not isinstance(data, dict) or data.get("version") != 1:
        raise ValueError("Use a version 1 REWEAR backup.")
    for key, maximum in (("wardrobe", 60), ("looks", 300), ("wears", 5000)):
        if not isinstance(data.get(key), list) or len(data[key]) > maximum:
            raise ValueError("The backup exceeds a collection limit.")
    wardrobe = [clean_item(item) for item in data["wardrobe"]]
    lookup = {item["id"]: item for item in wardrobe}
    if len(lookup) != len(wardrobe):
        raise ValueError("Garment IDs must be unique.")
    looks = []
    for look in data["looks"]:
        if (
            not isinstance(look, dict)
            or not short_text(look.get("id"), 80)
            or not short_text(look.get("name"), 80)
        ):
            raise ValueError("A saved outfit is invalid.")
        ids = look.get("item_ids")
        if (
            not isinstance(ids, list)
            or not 3 <= len(ids) <= 4
            or any(not isinstance(i, str) or i not in lookup for i in ids)
            or len(set(ids)) != len(ids)
        ):
            raise ValueError("An outfit references a missing or duplicate piece.")
        categories = [lookup[i]["category"] for i in ids]
        if (
            any(categories.count(c) != 1 for c in CATEGORIES[:3])
            or categories.count("outer") > 1
        ):
            raise ValueError("An outfit is missing its top, bottoms or shoes.")
        looks.append({"id": look["id"], "name": look["name"], "item_ids": ids})
    if len({look["id"] for look in looks}) != len(looks):
        raise ValueError("Saved outfit IDs must be unique.")
    wears = []
    for entry in data["wears"]:
        if (
            not isinstance(entry, dict)
            or not short_text(entry.get("id"), 80)
            or not short_text(entry.get("name"), 80)
            or not short_text(entry.get("look_id"), 80)
        ):
            raise ValueError("An entry in the wear journal is invalid.")
        try:
            date.fromisoformat(entry["date"])
        except (ValueError, KeyError, TypeError):
            raise ValueError("A wear date is invalid.") from None
        wears.append({key: entry[key] for key in ("id", "look_id", "name", "date")})
    return {
        "version": 1,
        "revision": (
            data.get("revision", 0) if type(data.get("revision", 0)) is int else 0
        ),
        "wardrobe": wardrobe,
        "looks": looks,
        "wears": wears,
        "demo": data.get("demo") is True,
    }


def read():
    with lock:
        if not DATA_FILE.exists():
            return blank()
        if DATA_FILE.stat().st_size > 20 * 1024 * 1024:
            raise ValueError(
                "The wardrobe file is too large. Restore a smaller backup."
            )
        return normalise(json.loads(DATA_FILE.read_text(encoding="utf-8")))


def write(data, expected_revision):
    with lock:
        current = read()
        if current["revision"] != expected_revision:
            raise ValueError(
                "Your wardrobe changed in another tab. Reload this page and try again."
            )
        data = normalise(data)
        data["revision"] = current["revision"] + 1
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = DATA_FILE.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        temporary.replace(DATA_FILE)
