"""Package readable source and embed the frontend in the hosted Worker."""

from pathlib import Path
import base64
import json
import zipfile
import shutil

ROOT = Path(__file__).resolve().parent.parent
zip_path = ROOT / "downloads/rewear-starter.zip"
zip_path.parent.mkdir(exist_ok=True)
paths = [
    ROOT / "README.md",
    ROOT / "package.json",
    ROOT / ".gitignore",
    ROOT / ".openai/hosting.example.json",
]
for directory in ("python", "public", "src", "tests", "scripts", "docs"):
    paths.extend(
        p
        for p in (ROOT / directory).rglob("*")
        if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc"
    )
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(paths):
        info = zipfile.ZipInfo(
            "rewear/" + path.relative_to(ROOT).as_posix(),
            date_time=(2026, 10, 12, 0, 0, 0),
        )
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, path.read_bytes())
shutil.copyfile(zip_path, ROOT / "downloads/rewear-github.zip")
engine = (ROOT / "src/engine.js").read_text().replace("export ", "")
constants = "\n".join(
    "const " + name + "=" + json.dumps((ROOT / relative).read_text()) + ";"
    for name, relative in (
        ("HTML", "public/index.html"),
        ("CSS", "public/styles.css"),
        ("APP_JS", "public/app.js"),
    )
)
constants += (
    "\nconst STARTER_ZIP="
    + json.dumps(base64.b64encode(zip_path.read_bytes()).decode())
    + ";\n"
)
worker_path = ROOT / "worker/index.js"
worker_path.parent.mkdir(exist_ok=True)
worker_path.write_text(
    engine + "\n" + constants + (ROOT / "src/worker-shell.js").read_text()
)
print(f"Packaged {len(paths)} source files and REWEAR Worker.")
