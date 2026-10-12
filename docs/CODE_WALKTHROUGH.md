# How REWEAR works

Start with the local Python app. You do not need to read every file at once.

## 1. A piece of clothing is a dictionary

Here is a small example:

```python
tee = {
    "id": "white-tee",
    "name": "White everyday tee",
    "category": "top",
    "color": "white",
    "fit": "regular",
    "pattern": "plain",
    "styles": ["casual", "streetwear"],
    "seasons": ["warm", "cool"],
    "available": True,
}
```

A wardrobe is a list of these dictionaries. `id` identifies a particular item even when two pieces have the same name. The frontend may also store a photo, but it removes photo bytes before sending the matching request.

## 2. The rules live in `python/wardrobe.py`

`validate_item` checks that a garment has the required fields and supported tags. `validate_wardrobe` also checks the collection size and unique IDs.

`check_outfit` receives a wardrobe and selected item IDs. It looks up the pieces and checks whether the outfit has a top, bottoms and shoes, whether those pieces are available, and whether their tags agree.

The style and season checks use set intersections. For example:

```python
top_styles = {"casual", "streetwear"}
bottom_styles = {"casual", "smart"}
shared_styles = top_styles & bottom_styles
# shared_styles is {"casual"}
```

The function returns a dictionary containing `valid`, `issues` and `reasons`. Returning explanations makes it easier to understand the result in the interface.

## 3. Finding outfits means trying combinations

`enumerate_outfits` groups available tops, bottoms and shoes. It uses loops to try each possible top/bottom/shoes combination, then keeps the ones that pass `check_outfit`.

When an outer layer is the focus item, it is added to the outfit before the rules are checked. `build_outfits` returns the total count, up to 24 displayed results and any missing core categories.

If there are `T` tops, `B` bottoms and `S` pairs of shoes, the number of core combinations to check is `T × B × S`. The current implementation validates records again inside each check, so that validation adds work as the wardrobe grows. Caching validated lookups would be a useful later optimisation.

## 4. Checking a purchase

`compare_purchase` adds the proposed piece to a temporary wardrobe list. It asks for outfits containing that piece and looks for owned pieces with the same matching tags.

An available same-tag substitute means zero new tag combinations. An unavailable substitute is still listed as similar, but it does not replace a piece you can wear right now. This comparison describes the tags; it cannot tell whether fabrics or exact cuts look different.

If you supply price and expected wears, it calculates cost per wear. `Decimal` is used to round the Python money result consistently to two decimal places.

## 5. The MCP server exposes those functions

In `python/server.py`, `@mcp.tool()` registers a function as a tool. A client can discover it and call it with structured arguments.

The four tools are wardrobe search, outfit generation, outfit checking and purchase comparison. They are read-only: they calculate results from supplied metadata. Saving or deleting a browser item happens in the frontend.

Starlette serves the HTML, CSS and JavaScript files and mounts the MCP endpoint at `/mcp/`. Uvicorn runs the app on the local port.

## 6. The frontend handles the interaction

`public/app.js` keeps the user's collection in `state`. It renders clothing cards and outfit slots, handles clicks and drag-and-drop, resizes photos and sends MCP requests using `fetch`.

The `rpc` function initializes the MCP client and calls the selected tool. When the result arrives, the interface displays combinations or explanations.

The `saveState` function writes the collection to IndexedDB, the browser's database. This is why the data survives a reload in the same browser but does not automatically appear on a different device.

## 7. Why there is also JavaScript server code

`src/engine.js` implements the same rules for the hosted Worker. `src/worker-shell.js` handles the hosted HTTP/MCP requests and checks the authenticated identity on data-bearing calls.

`scripts/assemble.py` combines the readable source files into the generated Worker and creates the download ZIP. The GitHub package contains the original source; generated Worker and build folders can be recreated.

The cross-language tests compare Python and JavaScript results across several wardrobes, filters and purchase candidates. This helps catch a change made in one implementation but missed in the other.

## A small first change

Change a sample garment's colour or style tags in `addDemo` inside `public/app.js`. Reload the app, clear the old sample collection through **Start my wardrobe**, and load the sample again. Notice which combinations change.

Next, change one matching rule in `python/wardrobe.py` and add a test showing the intended behaviour. If you want the hosted version to match, make the corresponding change in `src/engine.js` and run the parity checks too.
