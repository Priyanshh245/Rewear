"""REWEAR: Python web pages and MCP tools, with a Java matching engine."""

from contextlib import asynccontextmanager
import asyncio
import base64
from datetime import date
import io
import json
from pathlib import Path
import secrets
from urllib.parse import urlencode
from uuid import uuid4
import httpx
from jinja2 import Environment, FileSystemLoader, select_autoescape
from mcp.server.fastmcp import FastMCP
from PIL import Image
from starlette.applications import Starlette
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import HTMLResponse, RedirectResponse, Response
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles
import bridge
import store
from limits import RequestLimit

ROOT = Path(__file__).resolve().parent.parent
TOKEN = secrets.token_urlsafe(32)
templates = Environment(
    loader=FileSystemLoader(ROOT / "templates"), autoescape=select_autoescape(["html"])
)
mcp = FastMCP(
    "REWEAR Python + Java",
    stateless_http=True,
    json_response=True,
    streamable_http_path="/",
    host="127.0.0.1",
    instructions="Explore caller-supplied wardrobe records using Java matching rules. The tools are read-only and do not automatically read the local saved wardrobe.",
)


@mcp.tool()
def search_wardrobe(
    wardrobe: list[dict],
    query: str = "",
    category: str = "any",
    available_only: bool = False,
) -> dict:
    """Search supplied wardrobe records using the Java engine."""
    return bridge.call_java("search_wardrobe", locals())


@mcp.tool()
def build_outfits(
    wardrobe: list[dict],
    style: str = "any",
    season: str = "any",
    focus_id: str | None = None,
) -> dict:
    """Find available combinations with shared style and season tags."""
    return bridge.call_java("build_outfits", locals())


@mcp.tool()
def check_outfit(
    wardrobe: list[dict], item_ids: list[str], style: str = "any", season: str = "any"
) -> dict:
    """Explain matching conflicts in selected pieces."""
    return bridge.call_java("check_outfit", locals())


@mcp.tool()
def compare_purchase(
    wardrobe: list[dict],
    candidate: dict,
    style: str = "any",
    season: str = "any",
    price: float | None = None,
    expected_wears: int | None = None,
) -> dict:
    """Find candidate-based outfits, owned same-tag substitutes and cost per wear."""
    return bridge.call_java("compare_purchase", locals())


async def tool(request, name, arguments):
    # The browser submits an HTML form. Python makes the actual MCP requests.
    arguments = dict(arguments)
    if "wardrobe" in arguments:
        arguments["wardrobe"] = [
            bridge.metadata(item) for item in arguments["wardrobe"]
        ]
    if "candidate" in arguments:
        arguments["candidate"] = bridge.metadata(arguments["candidate"])
    port = request.scope.get("server", ("127.0.0.1", 8050))[1] or 8050
    endpoint = f"http://127.0.0.1:{port}/mcp/"
    headers = {"Accept": "application/json, text/event-stream"}
    async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
        initial = await client.post(
            endpoint,
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "REWEAR Python frontend", "version": "2"},
                },
            },
        )
        initial.raise_for_status()
        response = await client.post(
            endpoint,
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            },
        )
        response.raise_for_status()
    body = response.json()
    if body.get("error"):
        raise ValueError(body["error"]["message"])
    result = body["result"]
    if result.get("isError"):
        raise ValueError(result["content"][0]["text"])
    return result.get("structuredContent") or json.loads(result["content"][0]["text"])


def render(request, page, data=None, **context):
    state = data if data is not None else store.read()
    common = {
        "state": state,
        "page": page,
        "csrf": TOKEN,
        "lookup": {x["id"]: x for x in state["wardrobe"]},
        "categories": store.CATEGORIES,
        "colors": store.COLORS,
        "styles": store.STYLES,
        "seasons": store.SEASONS,
        "message": request.query_params.get("message", ""),
    }
    return HTMLResponse(
        templates.get_template(page + ".html").render(**common, **context),
        headers={
            "Cache-Control": "no-store",
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
        },
    )


def redirect(path, message):
    return RedirectResponse(
        path + "?" + urlencode({"message": message}), status_code=303
    )


async def form(request):
    values = await request.form()
    if not secrets.compare_digest(str(values.get("csrf", "")), TOKEN):
        raise ValueError("Reload the page before submitting this form.")
    return values


def revision(values, state):
    if str(values.get("revision")) != str(state["revision"]):
        raise ValueError("Your wardrobe changed. Reload the page and try again.")


async def photo_from_upload(upload):
    if not upload or not getattr(upload, "filename", ""):
        return None
    raw = await upload.read(12 * 1024 * 1024 + 1)
    if len(raw) > 12 * 1024 * 1024:
        raise ValueError("Choose a photo smaller than 12 MB.")
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if (
                source.format not in ("JPEG", "PNG", "WEBP")
                or source.width * source.height > 25000000
            ):
                raise ValueError(
                    "Choose a JPEG, PNG or WebP photo under 25 megapixels."
                )
            source.thumbnail((600, 600))
            image = Image.new("RGB", source.size, "#d7cdbf")
            if source.mode in ("RGBA", "LA") or "transparency" in source.info:
                rgba = source.convert("RGBA")
                image.paste(rgba, mask=rgba.getchannel("A"))
            else:
                image.paste(source.convert("RGB"))
            for quality in (82, 70, 55, 40, 25):
                output = io.BytesIO()
                image.save(output, format="JPEG", quality=quality)
                value = (
                    "data:image/jpeg;base64,"
                    + base64.b64encode(output.getvalue()).decode()
                )
                if len(value) <= 240000:
                    return value
    except (OSError, Image.DecompressionBombError):
        raise ValueError("This photo could not be read.") from None
    raise ValueError("Use a smaller or simpler photo.")


async def item_from_form(values, item_id=None, previous=None):
    image = previous.get("image") if previous else None
    if values.get("remove_photo"):
        image = None
    upload = await photo_from_upload(values.get("photo"))
    if upload:
        image = upload
    item = {
        "id": item_id or str(uuid4()),
        "name": str(values.get("name", "")).strip(),
        "category": values.get("category"),
        "color": values.get("color"),
        "fit": values.get("fit"),
        "pattern": values.get("pattern"),
        "styles": values.getlist("styles"),
        "seasons": values.getlist("seasons"),
        "available": values.get("mode") == "purchase"
        or values.get("available") == "on",
        "image": image,
    }
    return store.clean_item(item)


async def wardrobe_page(request):
    state = store.read()
    query, category = request.query_params.get("query", ""), request.query_params.get(
        "category", "any"
    )
    matches = await tool(
        request,
        "search_wardrobe",
        {"wardrobe": state["wardrobe"], "query": query, "category": category},
    )
    visible = [
        item
        for item in state["wardrobe"]
        if item["id"] in {x["id"] for x in matches["items"]}
    ]
    return render(
        request, "wardrobe", state, visible=visible, query=query, category=category
    )


async def item_page(request):
    state = store.read()
    item_id = request.query_params.get("id")
    old = next((x for x in state["wardrobe"] if x["id"] == item_id), None)
    if request.method == "GET":
        if item_id and not old:
            raise ValueError("This piece no longer exists.")
        return render(request, "item", state, item=old or {}, mode="item")
    values = await form(request)
    revision(values, state)
    item_id = values.get("id") or None
    old = next((x for x in state["wardrobe"] if x["id"] == item_id), None)
    if item_id and not old:
        raise ValueError("This piece no longer exists.")
    item = await item_from_form(values, item_id, old)
    state["wardrobe"] = [x for x in state["wardrobe"] if x["id"] != item["id"]] + [item]
    await tool(request, "check_outfit", {"wardrobe": state["wardrobe"], "item_ids": []})
    store.write(state, state["revision"])
    return redirect("/", "Piece saved.")


async def demo(request):
    values, state = await form(request), store.read()
    revision(values, state)
    if state["wardrobe"]:
        raise ValueError("Sample clothes can only be loaded into an empty wardrobe.")
    specs = [
        ("White everyday tee", "top", "white", ["casual", "streetwear"], "regular"),
        ("Black oversized tee", "top", "black", ["casual", "streetwear"], "relaxed"),
        ("Navy shirt", "top", "navy", ["casual", "smart"], "regular"),
        ("Blue relaxed jeans", "bottom", "blue", ["casual", "streetwear"], "relaxed"),
        ("Black trousers", "bottom", "black", ["casual", "smart"], "regular"),
        ("Beige chinos", "bottom", "beige", ["casual", "smart"], "regular"),
        ("White sneakers", "shoes", "white", ["casual", "streetwear"], "regular"),
        ("Brown loafers", "shoes", "brown", ["casual", "smart"], "regular"),
        ("Green overshirt", "outer", "green", ["casual", "streetwear"], "relaxed"),
    ]
    state["wardrobe"] = [
        {
            "id": str(uuid4()),
            "name": n,
            "category": c,
            "color": color,
            "styles": tags,
            "fit": fit,
            "pattern": "plain",
            "seasons": list(store.SEASONS),
            "available": True,
            "image": None,
        }
        for n, c, color, tags, fit in specs
    ]
    state["demo"] = True
    store.write(state, state["revision"])
    return redirect("/", "Sample wardrobe loaded.")


async def studio(request):
    state = store.read()
    selected = {c: request.query_params.get(c, "") for c in store.CATEGORIES}
    name = request.query_params.get("name", "")
    return render(
        request,
        "studio",
        state,
        selected=selected,
        outfit_name=name,
        result=None,
        suggestions=None,
        selected_style="any",
        selected_season="any",
    )


async def outfit(request):
    state, values = store.read(), await form(request)
    revision(values, state)
    selected = {c: str(values.get(c, "")) for c in store.CATEGORIES}
    ids = [selected[c] for c in store.CATEGORIES if selected[c]]
    style, season = values.get("style", "any"), values.get("season", "any")
    result = await tool(
        request,
        "check_outfit",
        {
            "wardrobe": state["wardrobe"],
            "item_ids": ids,
            "style": style,
            "season": season,
        },
    )
    name = str(values.get("name", "")).strip() or "My combination"
    if len(name) > 80:
        raise ValueError("Use an outfit name under 80 characters.")
    if values.get("action") == "save" and result["valid"]:
        if len(state["looks"]) >= 300:
            raise ValueError(
                "Saved outfits are full. Remove one before adding another."
            )
        if any(set(look["item_ids"]) == set(ids) for look in state["looks"]):
            raise ValueError("This combination is already saved.")
        state["looks"].append({"id": str(uuid4()), "name": name, "item_ids": ids})
        store.write(state, state["revision"])
        return redirect("/saved", "Combination saved.")
    return render(
        request,
        "studio",
        state,
        selected=selected,
        outfit_name=name,
        result=result,
        suggestions=None,
        selected_style=style,
        selected_season=season,
    )


async def suggest(request):
    state, values = store.read(), await form(request)
    revision(values, state)
    style, season = values.get("style", "any"), values.get("season", "any")
    focus_id = values.get("focus_id") or None
    suggestions = await tool(
        request,
        "build_outfits",
        {
            "wardrobe": state["wardrobe"],
            "style": style,
            "season": season,
            "focus_id": focus_id,
        },
    )
    return render(
        request,
        "studio",
        state,
        selected={},
        outfit_name="",
        result=None,
        suggestions=suggestions,
        selected_style=style,
        selected_season=season,
    )


async def purchase(request):
    state = store.read()
    if request.method == "GET":
        return render(
            request,
            "purchase",
            state,
            item={},
            mode="purchase",
            result=None,
            candidate=None,
        )
    values = await form(request)
    revision(values, state)
    candidate = await item_from_form(values)
    price = float(values["price"]) if values.get("price") else None
    wears = int(values["expected_wears"]) if values.get("expected_wears") else None
    result = await tool(
        request,
        "compare_purchase",
        {
            "wardrobe": state["wardrobe"],
            "candidate": candidate,
            "style": values.get("style", "any"),
            "season": values.get("season", "any"),
            "price": price,
            "expected_wears": wears,
        },
    )
    lookup = {x["id"]: x for x in state["wardrobe"] + [candidate]}
    return render(
        request,
        "purchase",
        state,
        item=candidate,
        mode="purchase",
        result=result,
        candidate=candidate,
        candidate_json=json.dumps(candidate),
        purchase_lookup=lookup,
        price=values.get("price", ""),
        expected_wears=values.get("expected_wears", ""),
    )


async def own_purchase(request):
    state, values = store.read(), await form(request)
    revision(values, state)
    candidate = store.clean_item(json.loads(values["candidate"]))
    if any(x["id"] == candidate["id"] for x in state["wardrobe"]):
        raise ValueError("This piece is already owned.")
    state["wardrobe"].append(candidate)
    await tool(request, "check_outfit", {"wardrobe": state["wardrobe"], "item_ids": []})
    store.write(state, state["revision"])
    return redirect("/", "Purchase added as an owned piece.")


async def saved(request):
    state = store.read()
    return render(
        request,
        "saved",
        state,
        wear_counts={
            look["id"]: sum(w["look_id"] == look["id"] for w in state["wears"])
            for look in state["looks"]
        },
    )


async def wear(request):
    state, values = store.read(), await form(request)
    revision(values, state)
    look = next((x for x in state["looks"] if x["id"] == values.get("id")), None)
    if not look:
        raise ValueError("This outfit no longer exists.")
    today = date.today().isoformat()
    if any(x["look_id"] == look["id"] and x["date"] == today for x in state["wears"]):
        return redirect("/saved", "This outfit is already logged today.")
    if len(state["wears"]) >= 5000:
        raise ValueError("The wear journal is full. Export a backup.")
    state["wears"].append(
        {"id": str(uuid4()), "look_id": look["id"], "name": look["name"], "date": today}
    )
    store.write(state, state["revision"])
    return redirect("/saved", "Wear logged.")


async def undo_wear(request):
    state, values = store.read(), await form(request)
    revision(values, state)
    state["wears"] = state["wears"][:-1]
    store.write(state, state["revision"])
    return redirect("/saved", "Last wear undone.")


async def remove(request):
    state = store.read()
    values = request.query_params if request.method == "GET" else await form(request)
    item_id, kind = values.get("id"), values.get("kind", "item")
    if kind not in ("item", "look"):
        raise ValueError("Unknown collection type.")
    collection = "wardrobe" if kind == "item" else "looks"
    item = next((x for x in state[collection] if x["id"] == item_id), None)
    if not item:
        raise ValueError("This record no longer exists.")
    if request.method == "GET":
        return render(
            request,
            "confirm",
            state,
            title="Remove " + item["name"] + "?",
            explanation="Removing a piece also removes saved outfits containing it. Past wear entries remain.",
            action="/remove",
            fields={"id": item_id, "kind": kind},
        )
    revision(values, state)
    state[collection] = [x for x in state[collection] if x["id"] != item_id]
    if kind == "item":
        state["looks"] = [x for x in state["looks"] if item_id not in x["item_ids"]]
    store.write(state, state["revision"])
    return redirect("/" if kind == "item" else "/saved", "Record removed.")


async def reset(request):
    state = store.read()
    if request.method == "GET":
        return render(
            request,
            "confirm",
            state,
            title="Start your own wardrobe?",
            explanation="This clears all current pieces, saved outfits and wear entries. Export a backup first if you want to keep them.",
            action="/reset",
            fields={},
        )
    values = await form(request)
    revision(values, state)
    store.write(store.blank(), state["revision"])
    return redirect("/", "Ready for your own clothes.")


async def backup(request):
    data = store.read()
    data.pop("revision", None)
    return Response(
        json.dumps(data, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition": 'attachment; filename="rewear-wardrobe-backup.json"',
            "Cache-Control": "no-store",
        },
    )


async def restore(request):
    state = store.read()
    if request.method == "GET":
        return render(request, "restore", state)
    values = await form(request)
    revision(values, state)
    upload = values.get("backup")
    if not upload or not getattr(upload, "filename", ""):
        raise ValueError("Choose a JSON backup file.")
    raw = await upload.read(16 * 1024 * 1024 + 1)
    if len(raw) > 16 * 1024 * 1024:
        raise ValueError("Use a backup under 16 MB.")
    data = store.normalise(json.loads(raw))
    await tool(request, "check_outfit", {"wardrobe": data["wardrobe"], "item_ids": []})
    store.write(data, state["revision"])
    return redirect("/", "Backup restored.")


async def photo(request):
    item = next(
        (
            x
            for x in store.read()["wardrobe"]
            if x["id"] == request.query_params.get("id")
        ),
        None,
    )
    if not item or not item.get("image"):
        return Response(status_code=404)
    return Response(
        base64.b64decode(item["image"].split(",", 1)[1]),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


async def error_page(request, error):
    return HTMLResponse(
        templates.get_template("error.html").render(error=str(error)),
        status_code=400,
        headers={"Cache-Control": "no-store"},
    )


@asynccontextmanager
async def lifespan(app):
    await asyncio.to_thread(bridge.compile_java)
    async with mcp.session_manager.run():
        yield


routes = [
    Route("/", wardrobe_page),
    Route("/item", item_page, methods=["GET", "POST"]),
    Route("/demo", demo, methods=["POST"]),
    Route("/studio", studio),
    Route("/outfit", outfit, methods=["POST"]),
    Route("/suggest", suggest, methods=["POST"]),
    Route("/purchase", purchase, methods=["GET", "POST"]),
    Route("/own-purchase", own_purchase, methods=["POST"]),
    Route("/saved", saved),
    Route("/wear", wear, methods=["POST"]),
    Route("/undo-wear", undo_wear, methods=["POST"]),
    Route("/remove", remove, methods=["GET", "POST"]),
    Route("/reset", reset, methods=["GET", "POST"]),
    Route("/backup", backup),
    Route("/restore", restore, methods=["GET", "POST"]),
    Route("/photo", photo),
    Mount("/static", StaticFiles(directory=ROOT / "static")),
    Mount("/mcp", mcp.streamable_http_app()),
]
app = Starlette(
    routes=routes,
    lifespan=lifespan,
    exception_handlers={ValueError: error_page, RuntimeError: error_page},
)
app.add_middleware(RequestLimit)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])

if __name__ == "__main__":
    import uvicorn

    print("REWEAR Python + Java: http://127.0.0.1:8050")
    uvicorn.run(app, host="127.0.0.1", port=8050)
