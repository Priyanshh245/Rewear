"""REWEAR local app and MCP server. Project owner: Priyansh Panwar."""

from contextlib import asynccontextmanager
from pathlib import Path
from mcp.server.fastmcp import FastMCP
from starlette.applications import Starlette
from starlette.responses import FileResponse
from starlette.routing import Mount, Route
import wardrobe as rules
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
mcp = FastMCP(
    "REWEAR",
    instructions="Use supplied wardrobe metadata to explore outfits and purchases. Matching is based on manual tags. Images are not analysed. This stateless server cannot access a browser's saved wardrobe.",
    stateless_http=True,
    json_response=True,
    streamable_http_path="/",
    host="127.0.0.1",
)


@mcp.tool()
def search_wardrobe(
    wardrobe: list[dict],
    query: str = "",
    category: str = "any",
    available_only: bool = False,
) -> dict:
    """Search supplied wardrobe records by name, colour and style tags."""
    return rules.search_wardrobe(wardrobe, query, category, available_only)


@mcp.tool()
def build_outfits(
    wardrobe: list[dict],
    style: str = "any",
    season: str = "any",
    focus_id: str | None = None,
) -> dict:
    """Find complete, available outfits with common style and season tags."""
    return rules.build_outfits(wardrobe, style, season, focus_id)


@mcp.tool()
def check_outfit(
    wardrobe: list[dict], item_ids: list[str], style: str = "any", season: str = "any"
) -> dict:
    """Explain matching conflicts in a selected outfit using supplied records."""
    return rules.check_outfit(wardrobe, item_ids, style, season)


@mcp.tool()
def compare_purchase(
    wardrobe: list[dict],
    candidate: dict,
    style: str = "any",
    season: str = "any",
    price: float | None = None,
    expected_wears: int | None = None,
) -> dict:
    """Find candidate-based outfits, same-tag owned substitutes and estimated cost per wear in CAD."""
    return rules.compare_purchase(
        wardrobe, candidate, style, season, price, expected_wears
    )


async def page(request):
    paths = {
        "/": ("public/index.html", "text/html"),
        "/styles.css": ("public/styles.css", "text/css"),
        "/app.js": ("public/app.js", "text/javascript"),
        "/rewear-starter.zip": ("downloads/rewear-starter.zip", "application/zip"),
        "/rewear-github.zip": ("downloads/rewear-github.zip", "application/zip"),
    }
    relative, mime = paths[request.url.path]
    if mime == "application/zip" and not (ROOT / relative).is_file():
        # A fresh checkout creates its source download when it is first requested.
        subprocess.run(
            [sys.executable, str(ROOT / "scripts/assemble.py")],
            cwd=ROOT,
            check=True,
            capture_output=True,
        )
    return FileResponse(ROOT / relative, media_type=mime)


@asynccontextmanager
async def lifespan(app):
    async with mcp.session_manager.run():
        yield


app = Starlette(
    routes=[
        Route(path, page)
        for path in (
            "/",
            "/styles.css",
            "/app.js",
            "/rewear-starter.zip",
            "/rewear-github.zip",
        )
    ]
    + [Mount("/mcp", app=mcp.streamable_http_app())],
    lifespan=lifespan,
)

if __name__ == "__main__":
    import uvicorn

    print("REWEAR: http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
