// REWEAR matching rules. Project owner: Priyansh Panwar.
// Python calls this class through Main.java; all outfit decisions happen here.
import com.google.gson.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

public class WardrobeEngine {
    private static final Gson JSON = new Gson();
    private static final Set<String> CATEGORIES = Set.of("top", "bottom", "shoes", "outer");
    private static final Set<String> STYLES = Set.of("casual", "streetwear", "smart");
    private static final Set<String> SEASONS = Set.of("warm", "cool", "cold");
    private static final Set<String> COLORS = Set.of("black", "white", "grey", "beige", "brown", "navy", "blue", "green", "red", "pink", "purple", "orange");
    private static final Set<String> NEUTRALS = Set.of("black", "white", "grey", "beige", "brown", "navy", "blue");

    // One record for one piece of clothing. The photo belongs to the web app.
    public static class Item {
        String id, name, category, color, fit, pattern;
        Set<String> styles, seasons;
        boolean available;
    }

    private static String text(JsonObject object, String key) {
        JsonElement value = object.get(key);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) {
            throw new IllegalArgumentException("Missing or invalid field: " + key);
        }
        return value.getAsString();
    }

    private static Set<String> tags(JsonObject object, String key, Set<String> allowed) {
        JsonElement value = object.get(key);
        if (value == null || !value.isJsonArray() || value.getAsJsonArray().isEmpty() || value.getAsJsonArray().size() > 3) {
            throw new IllegalArgumentException("Choose at least one valid " + key + " tag.");
        }
        Set<String> result = new TreeSet<>();
        for (JsonElement tag : value.getAsJsonArray()) {
            if (!tag.isJsonPrimitive() || !tag.getAsJsonPrimitive().isString() || !allowed.contains(tag.getAsString())) {
                throw new IllegalArgumentException("Unsupported " + key + " tag.");
            }
            result.add(tag.getAsString());
        }
        return result;
    }

    public static Item readItem(JsonObject object) {
        Item item = new Item();
        item.id = text(object, "id");
        item.name = text(object, "name");
        if (item.id.isBlank() || item.id.length() > 80 || item.name.isBlank() || item.name.length() > 100) {
            throw new IllegalArgumentException("Use a valid garment ID and name.");
        }
        item.category = text(object, "category");
        item.color = text(object, "color");
        item.fit = text(object, "fit");
        item.pattern = text(object, "pattern");
        if (!CATEGORIES.contains(item.category) || !COLORS.contains(item.color)) {
            throw new IllegalArgumentException("Choose a supported category and colour.");
        }
        if (!Set.of("slim", "regular", "relaxed").contains(item.fit) || !Set.of("plain", "stripe", "print").contains(item.pattern)) {
            throw new IllegalArgumentException("Choose a supported fit and pattern.");
        }
        item.styles = tags(object, "styles", STYLES);
        item.seasons = tags(object, "seasons", SEASONS);
        JsonElement available = object.get("available");
        if (available == null || !available.isJsonPrimitive() || !available.getAsJsonPrimitive().isBoolean()) {
            throw new IllegalArgumentException("Availability must be true or false.");
        }
        item.available = available.getAsBoolean();
        return item;
    }

    private static List<Item> readWardrobe(JsonObject arguments) {
        JsonElement value = arguments.get("wardrobe");
        if (value == null || !value.isJsonArray() || value.getAsJsonArray().size() > 60) {
            throw new IllegalArgumentException("Use a wardrobe of at most 60 pieces.");
        }
        List<Item> wardrobe = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (JsonElement element : value.getAsJsonArray()) {
            if (!element.isJsonObject()) throw new IllegalArgumentException("Invalid wardrobe record.");
            Item item = readItem(element.getAsJsonObject());
            if (!ids.add(item.id)) throw new IllegalArgumentException("Garment IDs must be unique.");
            wardrobe.add(item);
        }
        return wardrobe;
    }

    private static String option(JsonObject arguments, String key, String fallback) {
        return arguments.has(key) && !arguments.get(key).isJsonNull() ? text(arguments, key) : fallback;
    }

    private static void validateFilters(String style, String season) {
        if ((!style.equals("any") && !STYLES.contains(style)) || (!season.equals("any") && !SEASONS.contains(season))) {
            throw new IllegalArgumentException("Invalid style or season filter.");
        }
    }

    private static JsonObject check(List<Item> wardrobe, List<String> ids, String style, String season) {
        validateFilters(style, season);
        if (ids.size() > 4 || new HashSet<>(ids).size() != ids.size()) throw new IllegalArgumentException("Select up to four unique pieces.");
        List<Item> pieces = new ArrayList<>();
        for (String id : ids) {
            Item found = null;
            for (Item item : wardrobe) if (item.id.equals(id)) found = item;
            if (found == null) throw new IllegalArgumentException("An outfit piece no longer exists.");
            pieces.add(found);
        }
        List<String> issues = new ArrayList<>();
        for (String category : List.of("top", "bottom", "shoes")) {
            int count = 0;
            for (Item item : pieces) if (item.category.equals(category)) count++;
            if (count != 1) issues.add("Choose exactly one " + category + ".");
        }
        Set<String> sharedStyles = new TreeSet<>(STYLES);
        Set<String> sharedSeasons = new TreeSet<>(SEASONS);
        Set<String> accents = new HashSet<>();
        int outerCount = 0, patternedCount = 0;
        boolean unavailable = false;
        for (Item item : pieces) {
            sharedStyles.retainAll(item.styles);
            sharedSeasons.retainAll(item.seasons);
            if (!NEUTRALS.contains(item.color)) accents.add(item.color);
            if (!item.pattern.equals("plain")) patternedCount++;
            if (item.category.equals("outer")) outerCount++;
            if (!item.available) unavailable = true;
        }
        if (outerCount > 1) issues.add("Choose at most one outer layer.");
        if (unavailable) issues.add("An item is marked unavailable.");
        if (sharedStyles.isEmpty() || (!style.equals("any") && !sharedStyles.contains(style))) issues.add("The pieces need a shared style tag.");
        if (sharedSeasons.isEmpty() || (!season.equals("any") && !sharedSeasons.contains(season))) issues.add("The pieces need a shared season tag.");
        if (accents.size() > 1) issues.add("This simple rule allows one accent colour at a time.");
        if (patternedCount > 1) issues.add("This simple rule allows one patterned piece at a time.");
        List<String> reasons = new ArrayList<>();
        if (issues.isEmpty()) {
            reasons.add("Shared style: " + String.join(", ", sharedStyles));
            reasons.add("Shared season: " + String.join(", ", sharedSeasons));
            reasons.add("One accent colour and one patterned piece at most.");
        }
        JsonObject result = new JsonObject();
        result.addProperty("valid", issues.isEmpty());
        result.add("issues", JSON.toJsonTree(issues));
        result.add("reasons", JSON.toJsonTree(reasons));
        result.add("item_ids", JSON.toJsonTree(ids));
        result.add("styles", JSON.toJsonTree(sharedStyles));
        result.add("seasons", JSON.toJsonTree(sharedSeasons));
        return result;
    }

    private static List<Item> category(List<Item> wardrobe, String category) {
        List<Item> items = new ArrayList<>();
        for (Item item : wardrobe) if (item.available && item.category.equals(category)) items.add(item);
        return items;
    }

    private static JsonObject build(List<Item> wardrobe, String style, String season, String focusId) {
        validateFilters(style, season);
        Item focus = null;
        for (Item item : wardrobe) if (item.id.equals(focusId)) focus = item;
        if (focusId != null && focus == null) throw new IllegalArgumentException("The focus piece does not exist.");
        JsonArray outfits = new JsonArray();
        int total = 0;
        for (Item top : category(wardrobe, "top")) {
            for (Item bottom : category(wardrobe, "bottom")) {
                for (Item shoes : category(wardrobe, "shoes")) {
                    List<String> ids = new ArrayList<>(List.of(top.id, bottom.id, shoes.id));
                    if (focus != null && focus.category.equals("outer")) ids.add(focus.id);
                    if (focusId != null && !ids.contains(focusId)) continue;
                    JsonObject result = check(wardrobe, ids, style, season);
                    if (result.get("valid").getAsBoolean()) {
                        total++;
                        if (outfits.size() < 24) outfits.add(result);
                    }
                }
            }
        }
        List<String> missing = new ArrayList<>();
        for (String name : List.of("bottom", "shoes", "top")) if (category(wardrobe, name).isEmpty()) missing.add(name);
        JsonObject result = new JsonObject();
        result.addProperty("total", total);
        result.add("outfits", outfits);
        result.add("missing_categories", JSON.toJsonTree(missing));
        result.addProperty("note", "Tag-compatible combinations, not a guarantee of visual fit. Showing up to 24.");
        return result;
    }

    private static boolean equivalent(Item a, Item b) {
        return a.category.equals(b.category) && a.color.equals(b.color) && a.fit.equals(b.fit)
            && a.pattern.equals(b.pattern) && a.styles.equals(b.styles) && a.seasons.equals(b.seasons);
    }

    private static JsonObject compare(List<Item> wardrobe, JsonObject arguments, String style, String season) {
        if (wardrobe.size() >= 60) throw new IllegalArgumentException("Remove an item before testing a purchase in a full wardrobe.");
        Item candidate = readItem(arguments.getAsJsonObject("candidate"));
        if (!candidate.available) throw new IllegalArgumentException("Mark the potential purchase available to test it.");
        for (Item item : wardrobe) if (item.id.equals(candidate.id)) throw new IllegalArgumentException("Give the potential purchase a separate ID.");
        List<Item> combined = new ArrayList<>(wardrobe);
        combined.add(candidate);
        JsonObject matches = build(combined, style, season, candidate.id);
        List<String> similar = new ArrayList<>();
        boolean availableSubstitute = false;
        for (Item item : wardrobe) {
            if (equivalent(item, candidate)) {
                similar.add(item.id);
                if (item.available) availableSubstitute = true;
            }
        }
        BigDecimal price = null, wears = null;
        if (arguments.has("price") && !arguments.get("price").isJsonNull()) {
            if (!arguments.get("price").isJsonPrimitive() || !arguments.get("price").getAsJsonPrimitive().isNumber()) throw new IllegalArgumentException("Price must be a number.");
            price = arguments.get("price").getAsBigDecimal();
            if (price.signum() < 0 || price.compareTo(new BigDecimal("100000")) > 0) throw new IllegalArgumentException("Price must be between 0 and 100000 CAD.");
        }
        if (arguments.has("expected_wears") && !arguments.get("expected_wears").isJsonNull()) {
            if (!arguments.get("expected_wears").isJsonPrimitive() || !arguments.get("expected_wears").getAsJsonPrimitive().isNumber()) throw new IllegalArgumentException("Expected wears must be a whole number.");
            wears = arguments.get("expected_wears").getAsBigDecimal();
            if (wears.scale() > 0 && wears.stripTrailingZeros().scale() > 0 || wears.compareTo(BigDecimal.ONE) < 0 || wears.compareTo(new BigDecimal("10000")) > 0) throw new IllegalArgumentException("Expected wears must be from 1 to 10000.");
        }
        int count = matches.get("total").getAsInt();
        JsonObject result = new JsonObject();
        result.addProperty("candidate_id", candidate.id);
        result.addProperty("compatible_count", count);
        result.addProperty("new_tag_combinations", availableSubstitute ? 0 : count);
        result.add("similar_items", JSON.toJsonTree(similar));
        result.add("outfits", matches.get("outfits"));
        result.add("missing_categories", matches.get("missing_categories"));
        result.add("cost_per_wear", price != null && wears != null ? new JsonPrimitive(price.divide(wears, 2, RoundingMode.HALF_UP)) : JsonNull.INSTANCE);
        result.addProperty("summary", count == 0 ? "No compatible outfits yet" : availableSubstitute ? "You own an available piece with the same tags" : "Adds tag combinations to explore");
        result.addProperty("note", "Similarity uses category, colour, fit, pattern, style and season tags. Material and cut details are not inferred from photos. Cost per wear uses your estimate.");
        return result;
    }

    public static JsonObject call(String tool, JsonObject arguments) {
        List<Item> wardrobe = readWardrobe(arguments);
        String style = option(arguments, "style", "any"), season = option(arguments, "season", "any");
        switch (tool) {
            case "build_outfits": return build(wardrobe, style, season, option(arguments, "focus_id", null));
            case "compare_purchase": return compare(wardrobe, arguments, style, season);
            case "check_outfit":
                if (!arguments.has("item_ids") || !arguments.get("item_ids").isJsonArray()) throw new IllegalArgumentException("Select outfit IDs.");
                List<String> ids = new ArrayList<>();
                for (JsonElement value : arguments.getAsJsonArray("item_ids")) {
                    if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) throw new IllegalArgumentException("Garment IDs must be strings.");
                    ids.add(value.getAsString());
                }
                return check(wardrobe, ids, style, season);
            case "search_wardrobe":
                String query = option(arguments, "query", "").toLowerCase(Locale.ROOT);
                String filter = option(arguments, "category", "any");
                if (query.length() > 100 || !filter.equals("any") && !CATEGORIES.contains(filter)) throw new IllegalArgumentException("Invalid wardrobe search.");
                boolean availableOnly = arguments.has("available_only") && arguments.get("available_only").getAsBoolean();
                JsonArray items = new JsonArray();
                for (Item item : wardrobe) {
                    String text = (item.name + " " + item.color + " " + item.category + " " + String.join(" ", item.styles)).toLowerCase(Locale.ROOT);
                    if (text.contains(query) && (filter.equals("any") || filter.equals(item.category)) && (!availableOnly || item.available)) items.add(JSON.toJsonTree(item));
                }
                JsonObject result = new JsonObject();
                result.add("items", items);
                result.addProperty("total", items.size());
                return result;
            default: throw new IllegalArgumentException("Unknown MCP tool.");
        }
    }
}
