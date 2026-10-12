"""REWEAR wardrobe rules. Project owner: Priyansh Panwar."""

from decimal import Decimal, ROUND_HALF_UP

CATEGORIES = {"top", "bottom", "shoes", "outer"}
COLORS = {
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
}
STYLES = {"casual", "streetwear", "smart"}
SEASONS = {"warm", "cool", "cold"}
NEUTRALS = {"black", "white", "grey", "beige", "brown", "navy", "blue"}


def validate_item(item):
    """Check the fields and tags for one piece of clothing."""
    if not isinstance(item, dict):
        raise ValueError("Each garment must be an object.")
    for field, limit in (("id", 80), ("name", 100)):
        if (
            not isinstance(item.get(field), str)
            or not 1 <= len(item[field].strip()) <= limit
        ):
            raise ValueError(f"Invalid garment {field}.")
    if item.get("category") not in CATEGORIES or item.get("color") not in COLORS:
        raise ValueError("Choose a supported category and colour.")
    for field, allowed in (("styles", STYLES), ("seasons", SEASONS)):
        values = item.get(field)
        if (
            not isinstance(values, list)
            or not 1 <= len(values) <= 3
            or any(x not in allowed for x in values)
        ):
            raise ValueError(f"Choose at least one valid {field} tag.")
    if item.get("fit") not in {"slim", "regular", "relaxed"} or item.get(
        "pattern"
    ) not in {"plain", "stripe", "print"}:
        raise ValueError("Choose a supported fit and pattern.")
    if not isinstance(item.get("available"), bool):
        raise ValueError("Availability must be true or false.")
    return item


def validate_wardrobe(wardrobe):
    """Check the collection size, garment records and unique IDs."""
    if not isinstance(wardrobe, list) or len(wardrobe) > 60:
        raise ValueError("Use a wardrobe of at most 60 items.")
    for item in wardrobe:
        validate_item(item)
    if len({x["id"] for x in wardrobe}) != len(wardrobe):
        raise ValueError("Garment IDs must be unique.")
    return wardrobe


def check_outfit(wardrobe, item_ids, style="any", season="any"):
    """Return the matching result and explanations for a selected outfit."""
    validate_wardrobe(wardrobe)
    if style not in STYLES | {"any"} or season not in SEASONS | {"any"}:
        raise ValueError("Invalid style or season filter.")
    if (
        not isinstance(item_ids, list)
        or len(item_ids) > 4
        or any(not isinstance(x, str) for x in item_ids)
    ):
        raise ValueError("Select up to four garment IDs.")
    lookup = {x["id"]: x for x in wardrobe}
    if len(set(item_ids)) != len(item_ids) or any(x not in lookup for x in item_ids):
        raise ValueError("Select unique items that exist in the wardrobe.")
    items = [lookup[x] for x in item_ids]
    issues = []
    categories = [x["category"] for x in items]
    for category in ("top", "bottom", "shoes"):
        if categories.count(category) != 1:
            issues.append(f"Choose exactly one {category}.")
    if categories.count("outer") > 1:
        issues.append("Choose at most one outer layer.")
    if any(not x["available"] for x in items):
        issues.append("An item is marked unavailable.")
    common_styles = set(STYLES)
    common_seasons = set(SEASONS)
    for item in items:
        common_styles &= set(item["styles"])
        common_seasons &= set(item["seasons"])
    if not common_styles or (style != "any" and style not in common_styles):
        issues.append("The pieces need a shared style tag.")
    if not common_seasons or (season != "any" and season not in common_seasons):
        issues.append("The pieces need a shared season tag.")
    accents = {x["color"] for x in items} - NEUTRALS
    if len(accents) > 1:
        issues.append("This simple rule allows one accent colour at a time.")
    if sum(x["pattern"] != "plain" for x in items) > 1:
        issues.append("This simple rule allows one patterned piece at a time.")
    reasons = []
    if not issues:
        reasons = [
            "Shared style: " + ", ".join(sorted(common_styles)),
            "Shared season: " + ", ".join(sorted(common_seasons)),
            "One accent colour and one patterned piece at most.",
        ]
    return {
        "valid": not issues,
        "issues": issues,
        "reasons": reasons,
        "item_ids": item_ids,
        "styles": sorted(common_styles),
        "seasons": sorted(common_seasons),
    }


def enumerate_outfits(wardrobe, style="any", season="any", focus_id=None):
    validate_wardrobe(wardrobe)
    lookup = {x["id"]: x for x in wardrobe}
    if focus_id is not None and focus_id not in lookup:
        raise ValueError("The focus garment does not exist.")
    tops = []
    bottoms = []
    shoes = []
    for item in wardrobe:
        if not item["available"]:
            continue
        if item["category"] == "top":
            tops.append(item)
        elif item["category"] == "bottom":
            bottoms.append(item)
        elif item["category"] == "shoes":
            shoes.append(item)

    focus_item = lookup.get(focus_id)
    results = []
    for top in tops:
        for bottom in bottoms:
            for pair_of_shoes in shoes:
                items = [top, bottom, pair_of_shoes]
                # Include a jacket only when it is the piece being tested.
                if focus_item and focus_item["category"] == "outer":
                    items.append(focus_item)
                item_ids = [item["id"] for item in items]
                if focus_id and focus_id not in item_ids:
                    continue
                result = check_outfit(wardrobe, item_ids, style, season)
                if result["valid"]:
                    results.append(result)
    return results


def build_outfits(wardrobe, style="any", season="any", focus_id=None):
    # Validate filters even for empty wardrobes.
    check_outfit(wardrobe, [], style, season)
    results = enumerate_outfits(wardrobe, style, season, focus_id)
    available = {x["category"] for x in wardrobe if x["available"]}
    return {
        "total": len(results),
        "outfits": results[:24],
        "missing_categories": sorted({"top", "bottom", "shoes"} - available),
        "note": "Tag-compatible combinations, not a guarantee of visual fit. Showing up to 24.",
    }


def equivalent(a, b):
    """Two pieces are similar here when all of their matching tags agree."""
    for field in ("category", "color", "fit", "pattern"):
        if a[field] != b[field]:
            return False
    for field in ("styles", "seasons"):
        if set(a[field]) != set(b[field]):
            return False
    return True


def compare_purchase(
    wardrobe, candidate, style="any", season="any", price=None, expected_wears=None
):
    """Test a potential purchase without saving it as an owned garment."""
    validate_wardrobe(wardrobe)
    validate_item(candidate)
    if len(wardrobe) >= 60:
        raise ValueError("Remove an item before testing a purchase in a full wardrobe.")
    if candidate["id"] in {x["id"] for x in wardrobe}:
        raise ValueError("Give the potential purchase a separate ID.")
    if not candidate["available"]:
        raise ValueError("Mark the potential purchase available to test it.")
    if price is not None and (
        isinstance(price, bool)
        or not isinstance(price, (int, float))
        or not 0 <= price <= 100000
    ):
        raise ValueError("Price must be between 0 and 100000 CAD.")
    if expected_wears is not None and (
        isinstance(expected_wears, bool)
        or not isinstance(expected_wears, int)
        or not 1 <= expected_wears <= 10000
    ):
        raise ValueError("Expected wears must be a whole number from 1 to 10000.")
    combined = wardrobe + [candidate]
    result = build_outfits(combined, style, season, candidate["id"])
    similar = [x for x in wardrobe if equivalent(x, candidate)]
    available_similar = [x for x in similar if x["available"]]
    new_count = 0 if available_similar else result["total"]
    cost_per_wear = None
    if price is not None and expected_wears is not None:
        cost = Decimal(str(price)) / Decimal(expected_wears)
        cost_per_wear = float(cost.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

    if result["total"] == 0:
        summary = "No compatible outfits yet"
    elif available_similar:
        summary = "You own an available piece with the same tags"
    else:
        summary = "Adds tag combinations to explore"
    return {
        "candidate_id": candidate["id"],
        "compatible_count": result["total"],
        "new_tag_combinations": new_count,
        "similar_items": [x["id"] for x in similar],
        "outfits": result["outfits"],
        "missing_categories": result["missing_categories"],
        "cost_per_wear": cost_per_wear,
        "summary": summary,
        "note": "Similarity uses category, colour, fit, pattern, style and season tags. Material and cut details are not inferred from photos. Cost per wear uses your estimate.",
    }


def search_wardrobe(wardrobe, query="", category="any", available_only=False):
    """Find pieces by name, colour, category or style."""
    validate_wardrobe(wardrobe)
    if (
        not isinstance(query, str)
        or len(query) > 100
        or category not in CATEGORIES | {"any"}
    ):
        raise ValueError("Invalid wardrobe search.")
    if not isinstance(available_only, bool):
        raise ValueError("Availability filter must be a boolean.")
    results = []
    for item in wardrobe:
        text = " ".join(
            [item["name"], item["color"], item["category"], *item["styles"]]
        ).lower()
        matches_text = query.lower() in text
        matches_category = category == "any" or item["category"] == category
        matches_availability = not available_only or item["available"]
        if matches_text and matches_category and matches_availability:
            results.append(item)
    return {"items": results, "total": len(results)}
