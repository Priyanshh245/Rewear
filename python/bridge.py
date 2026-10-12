"""Pass JSON between the Python MCP tools and the Java matching engine."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import threading

ROOT = Path(__file__).resolve().parent.parent
JAR = ROOT / "lib/gson-2.13.2.jar"
BUILD = ROOT / "build"
compile_lock = threading.Lock()
TOOLS = {"search_wardrobe", "check_outfit", "build_outfits", "compare_purchase"}
FIELDS = (
    "id",
    "name",
    "category",
    "color",
    "fit",
    "pattern",
    "styles",
    "seasons",
    "available",
)


def executable(name):
    java_home = os.environ.get("JAVA_HOME")
    if java_home:
        candidate = Path(java_home) / "bin" / name
        if candidate.is_file():
            return str(candidate)
    return shutil.which(name)


def compile_java():
    sources = list((ROOT / "java").glob("*.java"))
    with compile_lock:
        output = BUILD / "Main.class"
        if output.exists() and output.stat().st_mtime >= max(
            p.stat().st_mtime for p in sources + [JAR]
        ):
            return
        java, javac = executable("java"), executable("javac")
        if not java:
            raise RuntimeError("Install a Java JDK 17 or newer, then reopen Terminal.")
        # Standard JDKs provide javac. A modular JDK can also invoke its compiler this way.
        command = (
            [javac] if javac else [java, "-m", "jdk.compiler/com.sun.tools.javac.Main"]
        )
        BUILD.mkdir(exist_ok=True)
        result = subprocess.run(
            command
            + ["--release", "17", "-cp", str(JAR), "-d", str(BUILD)]
            + [str(p) for p in sources],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode:
            raise RuntimeError(
                "Java compilation failed. Check that your JDK is version 17 or newer.\n"
                + result.stderr[-1800:]
            )


def metadata(item):
    return {key: item.get(key) for key in FIELDS}


def call_java(tool, arguments):
    if tool not in TOOLS:
        raise ValueError("Unknown matching tool.")
    compile_java()
    data = dict(arguments)
    if isinstance(data.get("wardrobe"), list):
        data["wardrobe"] = [
            metadata(item) if isinstance(item, dict) else item
            for item in data["wardrobe"]
        ]
    if isinstance(data.get("candidate"), dict):
        data["candidate"] = metadata(data["candidate"])
    payload = json.dumps(
        {"tool": tool, "arguments": data}, ensure_ascii=False, allow_nan=False
    )
    if len(payload.encode()) > 600000:
        raise ValueError("Matching request is too large.")
    classpath = os.pathsep.join([str(BUILD), str(JAR)])
    result = subprocess.run(
        [
            executable("java"),
            "-Dfile.encoding=UTF-8",
            "-Xmx128m",
            "-cp",
            classpath,
            "Main",
        ],
        input=payload,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=20,
    )
    if result.returncode:
        raise RuntimeError(
            "The Java matching engine could not run. Check your JDK installation."
        )
    response = json.loads(result.stdout)
    if "error" in response:
        raise ValueError(response["error"])
    return response
