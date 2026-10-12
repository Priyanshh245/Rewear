import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))
import wardrobe as rules


def wardrobe():
    return json.loads((ROOT / "tests/fixtures.json").read_text())


class RulesTests(unittest.TestCase):
    def test_complete_outfits_and_filters(self):
        self.assertEqual(rules.build_outfits(wardrobe())["total"], 8)
        self.assertEqual(rules.build_outfits(wardrobe(), "smart")["total"], 1)
        self.assertEqual(rules.build_outfits(wardrobe(), "streetwear")["total"], 0)
        for outfit in rules.build_outfits(wardrobe())["outfits"]:
            self.assertTrue(rules.check_outfit(wardrobe(), outfit["item_ids"])["valid"])

    def test_unavailable_and_incomplete(self):
        w = wardrobe()
        w[0]["available"] = False
        self.assertEqual(rules.build_outfits(w)["total"], 4)
        self.assertFalse(rules.check_outfit(w, ["t1", "b1", "s1"])["valid"])
        self.assertEqual(
            rules.build_outfits([])["missing_categories"], ["bottom", "shoes", "top"]
        )

    def test_same_tags_are_not_new_combinations(self):
        w = wardrobe()
        c = {
            **w[0],
            "id": "new",
            "name": "Another white tee",
            "styles": list(reversed(w[0]["styles"])),
        }
        result = rules.compare_purchase(w, c, price=85, expected_wears=25)
        self.assertEqual(result["compatible_count"], 4)
        self.assertEqual(result["new_tag_combinations"], 0)
        self.assertEqual(result["similar_items"], ["t1"])
        self.assertEqual(result["cost_per_wear"], 3.4)
        w[0]["available"] = False
        self.assertEqual(rules.compare_purchase(w, c)["new_tag_combinations"], 4)

    def test_outer_layer_keeps_core_and_checks_accent(self):
        c = {
            **wardrobe()[0],
            "id": "jacket",
            "name": "Green jacket",
            "category": "outer",
            "color": "green",
            "styles": ["casual"],
        }
        result = rules.compare_purchase(wardrobe(), c)
        self.assertEqual(result["compatible_count"], 4)
        self.assertTrue(
            all(
                "jacket" in x["item_ids"] and len(x["item_ids"]) == 4
                for x in result["outfits"]
            )
        )

    def test_conflicting_seasons_and_patterns(self):
        w = wardrobe()
        w[0]["seasons"] = ["warm"]
        w[2]["seasons"] = ["cold"]
        self.assertFalse(rules.check_outfit(w, ["t1", "b1", "s1"])["valid"])
        w = wardrobe()
        w[0]["pattern"] = "print"
        w[2]["pattern"] = "stripe"
        self.assertFalse(rules.check_outfit(w, ["t1", "b1", "s1"])["valid"])

    def test_bad_ids_and_parameters(self):
        with self.assertRaises(ValueError):
            rules.build_outfits(wardrobe(), focus_id="missing")
        with self.assertRaises(ValueError):
            rules.check_outfit(wardrobe(), ["t1", "t1", "s1"])
        with self.assertRaises(ValueError):
            rules.build_outfits([], "bogus")
        with self.assertRaises(ValueError):
            rules.compare_purchase(wardrobe(), wardrobe()[0])
        candidate = {**wardrobe()[0], "id": "new"}
        for args in (
            {"expected_wears": 0},
            {"expected_wears": True},
            {"price": -1},
            {"price": float("nan")},
        ):
            with self.assertRaises(ValueError):
                rules.compare_purchase(wardrobe(), candidate, **args)
        self.assertEqual(
            rules.compare_purchase(
                wardrobe(), candidate, price=267.5, expected_wears=100
            )["cost_per_wear"],
            2.68,
        )


if __name__ == "__main__":
    unittest.main()
