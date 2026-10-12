# REWEAR

**A wardrobe app built with Python, Java and MCP.**

REWEAR is my personal project combining programming with my interest in fashion and modelling. It helps users organise their clothes, put outfits together, and check how a potential purchase works with what they already own.

The website uses HTML and CSS forms. Python renders the pages and handles the MCP server. Java calculates the matches. There is no JavaScript in this version.

**Project owner:** Priyansh Panwar

## What you can do

- Add clothes with a photo and tags for category, colour, fit, pattern, style and season.
- Choose pieces in the outfit studio, check their tags and save a combination.
- Find outfits containing an optional outer layer.
- Test a purchase against your wardrobe and see similar owned pieces.
- Calculate estimated cost per wear from your own price and wear estimate.
- Save outfits, keep a wear journal and export or restore a backup.
- Use four read-only MCP tools backed by the Java engine.

## The stack

| Part | What it handles |
| --- | --- |
| Python | Web routes, page rendering, local storage and MCP calls. |
| Java | Wardrobe search, outfit checking, outfit generation and purchase comparison. |
| HTML/CSS | The burgundy browser interface and form controls. |
| MCP | Tool discovery and structured calls to the matching functions. |
| JSON | The saved wardrobe and messages between Python and Java. |

Python uses Starlette, Uvicorn, Jinja2 and the official Python MCP SDK. Java uses Gson for JSON. The tested Gson JAR and its license are included in `lib/`.

## Run it on a Mac

You need **Python 3.10+** and a **Java JDK 17+**. Python 3.13 and a JDK 21 installation are suitable choices.

Open Terminal in the extracted `rewear-python-java` folder. Check Java first:

```sh
java -version
javac -version
```

If Java is missing or older than 17, see `docs/SETUP_AND_GITHUB.md` for the official installer instructions.

Then run:

```sh
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install -r python/requirements.txt
python python/server.py
```

If you use another supported Python version, replace `python3.13` with that interpreter's command. The server compiles the Java source at startup when needed.

Open **http://127.0.0.1:8050**. Keep Terminal running. Press Control+C to stop it.

On another day, from the same folder:

```sh
source .venv/bin/activate
python python/server.py
```

The port is 8050 so the earlier version on port 8000 can remain separate while you switch over.

## Try the app

1. In My wardrobe, click Explore sample wardrobe, or add your own clothes.
2. In Outfit studio, choose a top, bottoms and shoes. Click Check combination to preview the pieces and see the matching notes.
3. Name the outfit and click Save combination.
4. In Before you buy, enter a potential item and click Test it with my wardrobe.
5. In Saved & worn, log an actual wear or undo the last entry.

The website uses ordinary forms, so a button press may refresh the page. Outfits use dropdown selections rather than drag-and-drop.

## How the rules work

A complete outfit has one top, one bottom and shoes. It can include an outer layer. The pieces must be available and share at least one style and season tag. The first rule set allows one distinct accent colour and one patterned piece. Black, white, grey, beige, brown, navy and blue count as neutrals.

A same-tag substitute matches category, colour, fit, pattern, style and season tags. If an available owned substitute exists, the candidate adds zero new tag combinations. Real fabrics or cuts may still look different. Counts refer to item combinations, so similar-looking outfits can be counted separately.

Photos are displayed rather than analysed. You choose the tags. Cost per wear is `price / estimated wears`, in CAD.

## MCP tools

Endpoint: **http://127.0.0.1:8050/mcp/**

| Tool | Result |
| --- | --- |
| `search_wardrobe` | Supplied pieces matching a search. |
| `build_outfits` | Compatible outfits and missing core categories. |
| `check_outfit` | Matching reasons or conflicts. |
| `compare_purchase` | Candidate outfits, same-tag substitutes and estimated cost per wear. |

The browser submits HTML forms to Python. Python makes actual MCP requests to this endpoint. The MCP tool then passes JSON to the Java engine and returns its result. All tool calls use caller-supplied records; an external MCP client cannot automatically read your local saved wardrobe.

## Files to read

| File | Purpose |
| --- | --- |
| `java/WardrobeEngine.java` | The main matching rules. |
| `java/Main.java` | Reads JSON from Python and returns JSON. |
| `python/bridge.py` | Compiles and invokes Java. |
| `python/server.py` | Web routes and MCP tools. |
| `python/store.py` | Validation, backup compatibility and JSON persistence. |
| `python/limits.py` | Request-size limit. |
| `templates/` | The HTML pages. |
| `static/styles.css` | The burgundy theme. |
| `tests/test_project.py` | Real HTTP form and MCP integration checks. |
| `docs/CODE_WALKTHROUGH.md` | A plain-language explanation of the flow. |
| `docs/SETUP_AND_GITHUB.md` | Mac setup, migration and GitHub upload steps. |

## Data and backups

The local server saves your collection to `data/wardrobe.json`. This folder is ignored by Git. Export a backup through the sidebar before replacing a collection. Backup import supports version 1 JSON files from the earlier browser app, including photos, saved outfits and wear entries.

The current limits are 60 clothes, 300 saved outfits, 5,000 wear entries and up to 24 displayed matches. Photo uploads support JPEG, PNG and WebP up to 12 MB and 25 megapixels. The app resizes them before saving.

This is a local, single-user app bound to `127.0.0.1`. It has stale-form checks, form tokens and upload limits. Multi-user hosting would require authentication, per-user data storage and a platform that can execute Python and Java. The earlier hosted preview remains the earlier implementation; this package is the corrected source.

## Test it

With your Python environment activated:

```sh
python -m unittest discover -s tests -p 'test_*.py'
```

The tests start a temporary local server and use a separate temporary data file. They check Java matching, actual MCP calls, HTML form actions, photos, backups and stale-form handling. They do not replace a visual browser check.

## Next improvements

- More useful fabric and cut tags.
- Feedback on suggested outfits.
- A database when the project grows beyond local JSON storage.

## Development

Developed with AI assistance for the implementation and documentation. I’m using this project to learn the Python/Java integration and extend the first version.
