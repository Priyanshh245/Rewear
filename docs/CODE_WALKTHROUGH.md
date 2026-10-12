# Read the project one part at a time

Start with `java/WardrobeEngine.java`. That is where the outfit decisions happen.

## A garment is an Item

The Java `Item` class stores ID, name, category, colour, fit, pattern, style tags, season tags and availability. Photos stay in the Python web app and are removed from matching requests.

Tags are sets. Comparing sets means the order of tags does not affect the result. Two pieces tagged `casual, smart` and `smart, casual` have the same style tags.

## Check one outfit

The `check` method looks up the selected IDs. It counts categories, checks availability, finds shared styles and seasons, and applies the colour and pattern rules. It returns a JSON object with a boolean `valid` plus readable `issues` and `reasons`.

The shared-tag check uses `retainAll`. For example, starting with `{casual, streetwear}` and retaining `{casual, smart}` leaves `{casual}`.

## Find several outfits

`build` uses three loops: one for tops, one for bottoms and one for shoes. It tries each combination and keeps valid results. A selected outer layer is added explicitly. Results are limited to 24 displayed outfits, while `total` counts all valid combinations.

The core search checks `T × B × S` combinations for `T` tops, `B` bottoms and `S` shoes. Each check also looks up selected IDs in the wardrobe, so larger collections require more work. This is why the first version has a collection limit.

## Compare a purchase

`compare` creates a temporary collection containing the proposed item. It finds outfits containing that item, then checks for owned pieces with the same matching tags.

An available substitute means zero new tag combinations. An unavailable substitute is still listed as similar, but it does not replace a piece you can use now. Price and estimated wears are optional. Java `BigDecimal` rounds cost per wear to two decimal places.

## Python and Java exchange JSON

`python/bridge.py` sends one request to Java's standard input:

```json
{"tool":"build_outfits","arguments":{"wardrobe":[]}}
```

`java/Main.java` reads it, calls `WardrobeEngine`, and writes one JSON response. Gson handles JSON parsing and serialization; it is a Java library.

Python starts the fixed Java program using `subprocess.run` without a shell. User input is JSON data, not a shell command. The bridge compiles the Java source when needed and reports useful errors if the JDK is missing.

## MCP wraps the Java functions

The functions marked `@mcp.tool()` in `python/server.py` expose the engine to an MCP client. A browser form goes to Python, which makes actual MCP initialization and tool-call requests. The MCP function invokes Java and the result is rendered into an HTML page.

The four MCP tools calculate results from supplied records. They do not edit the saved collection. The Python web routes handle those edits after validating forms and checking the collection revision.

## HTML/CSS is the frontend

Templates use ordinary links, forms, dropdowns and checkboxes. Jinja2 fills in wardrobe records and escapes user text. CSS controls the burgundy look. There are no JavaScript files or script tags.

Forms refresh the page when submitted. In the studio, select pieces and click Check combination to update the preview. Saving an outfit and checking a purchase work through separate form actions.

## Where data lives

`python/store.py` writes to `data/wardrobe.json`. It writes a temporary file and replaces the original after the write finishes. A revision number prevents an old form in another tab from overwriting newer changes.

Exported backups omit that internal revision. Import supports the earlier version 1 browser backup structure. The `data` directory is excluded from GitHub so personal wardrobes are not part of the source repository.

## A first change to understand

Find `NEUTRALS` near the top of `WardrobeEngine.java`. Review what happens when a colour is treated as an accent rather than a neutral. Add a test for the intended change, run the tests, restart the app and try the result.

Read the Java engine first, then the Python bridge, then the web routes. You can learn the HTML templates one page at a time.
