# REWEAR

**Make more use of the clothes you already own.**

REWEAR is my personal project combining Python with my interest in fashion and modelling. The idea is simple: keep your clothes in one place, try different outfit combinations, and see how a potential purchase fits into your wardrobe before buying it.

The interface uses dark burgundy, warm neutrals and a few brass accents. The matching system uses tags you choose, so you can see why a combination was suggested.

**Project owner:** Priyansh Panwar

## What it does

- Add clothes with an optional photo, colour, category, fit, pattern, style and season tags.
- Build outfits by selecting pieces or dragging them onto the canvas.
- Find combinations using available clothes with shared style and season tags.
- Check a potential purchase against your wardrobe and flag items with the same tags.
- Estimate cost per wear using a price and expected number of wears you enter.
- Save outfits, log actual wears and export or restore a wardrobe backup.
- Expose the matching functions through four MCP tools.

## Run it locally

You need Python 3.10 or newer. After downloading or cloning the repository, open Terminal inside the project folder:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r python/requirements.txt
python python/server.py
```

Then open **http://127.0.0.1:8000**. Keep Terminal open while using the app. Stop it with **Control+C**.

Next time, you only need:

```sh
source .venv/bin/activate
python python/server.py
```

On Windows, use `py -m venv .venv` and `.venv\Scripts\activate` instead of the first two Mac commands. The remaining commands are the same.

To try it quickly, click **Explore sample wardrobe**. The sample clothes are demonstration records that you can replace with your own.

## Tech stack

| Part | Technology |
| --- | --- |
| Local matching logic | Python |
| Local MCP server | Official Python MCP SDK, pinned to the tested v1 API |
| Local web server | Starlette and Uvicorn |
| Frontend | HTML, CSS and JavaScript |
| Browser storage | IndexedDB |
| Hosted version | JavaScript Worker using the same matching rules |
| Checks | Python unittest and Node's test runner |

The local app runs the rules in Python. The hosted version uses JavaScript because the hosting runtime runs Workers. Tests compare the two implementations so their results stay consistent. There is no AI model or external shopping API in this version.

## How matching works

A complete outfit has a top, bottoms and shoes. You can add an outer layer. All selected pieces must be available and share a style and season tag.

The first version keeps colour and pattern matching simple: one accent colour and one patterned piece at most. Black, white, grey, beige, brown, navy and blue count as neutrals. These are editable rules, and your own taste has the final say.

When checking a purchase, the app looks for an available owned piece with the same category, colour, fit, pattern, style tags and season tags. If it finds one, the candidate adds zero new **tag combinations**. Two garments can have the same tags and still look different in real life; photos are displayed rather than analysed. Counts refer to combinations of item records, so visually similar outfits can appear more than once.

Cost per wear is simply `price / estimated wears`, shown in CAD.

## MCP tools

Local endpoint: **http://127.0.0.1:8000/mcp/**

| Tool | What it does |
| --- | --- |
| `search_wardrobe` | Search supplied clothes by name, colour or style. |
| `build_outfits` | Find complete combinations for selected filters. |
| `check_outfit` | Explain why a selected outfit passes or fails the rules. |
| `compare_purchase` | Find candidate-based outfits, similar owned pieces and estimated cost per wear. |

The frontend calls these tools. Each tool receives garment metadata supplied by its caller. A separate MCP client does not automatically have access to the wardrobe saved in your browser. Connecting the endpoint to an MCP host is a separate setup step.

## Files to start with

| File | Purpose |
| --- | --- |
| `python/wardrobe.py` | Matching rules and purchase comparison. Read this first. |
| `python/server.py` | Python MCP tools and local frontend serving. |
| `public/app.js` | User interactions, storage, photo resizing and MCP calls. |
| `public/index.html` | Page structure. |
| `public/styles.css` | Burgundy theme and responsive layouts. |
| `src/engine.js` | Hosted JavaScript version of the rules. |
| `src/worker-shell.js` | Hosted MCP endpoint and asset serving. |
| `tests/` | Rule, transport and Python/JavaScript comparison checks. |
| `docs/CODE_WALKTHROUGH.md` | Plain-language explanation of the code. |
| `docs/GITHUB_GUIDE.md` | Upload, setup and update instructions. |

## Run the checks

With the Python environment activated:

```sh
python -m unittest discover -s tests -p 'test_*.py'
```

With Node 18 or newer installed:

```sh
node --test tests/*.test.mjs
```

These cover complete outfits, missing pieces, unavailable clothes, conflicting tags, duplicate items, purchase costs, MCP calls and agreement between Python and JavaScript. Automated checks do not replace a visual browser check.

## Storage and current limits

Your collection, photos, saved outfits and wear journal are stored in this browser's IndexedDB. The matching server receives garment metadata; uploaded photo bytes stay in the browser. Collections do not sync between devices. Export a backup before clearing browser data.

The current limits are 60 wardrobe pieces, 300 saved outfits and 5,000 wear entries. Matching displays up to 24 results. Photo inputs support JPEG, PNG and WebP, and are resized before saving.

The local server listens only on `127.0.0.1` for personal development. The hosted version uses its platform's authenticated identity for data-bearing tool calls.

## Build the hosted files

The Python app does not need Node or a Worker build. If you want to inspect the hosted bundle:

```sh
npm run build
```

This creates `worker/index.js`, `dist/` and the downloadable source ZIP. A fresh checkout uses `.openai/hosting.example.json` for a local build. Actual deployment requires a registered hosting project and its own configuration.

## What I want to add next

- Fabric and cut tags for more useful comparisons.
- Feedback on combinations people like or dislike.
- A database in the Python version for controlled persistence.
- Better coverage for outer layers and different styling preferences.

## Development

Developed with AI assistance for the initial implementation and documentation. I’m using this project to learn how the Python rules, frontend and MCP server work together, and to build on the first version.
