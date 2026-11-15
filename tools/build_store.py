#!/usr/bin/env python3
"""Build an ID7 OAP package without redistributing the BMW SDK."""
import argparse
import gzip
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import re
import shutil
import struct
import sys
import tarfile
import tempfile
import zipfile
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
ID = "patryklars6_motor_sound"
KIT = ROOT / "vendor" / "idrive7-kit.zip"
FONT_ATLAS = ROOT / "vendor" / "luxo-fonts.zip"
FONT_ATLAS_SHA256 = "39ccb95d9bec9509f7f9554623fdcb818dcdf394fa1fc3bdfe0eab6549449907"
KIT_SHA256 = "bd9c0bdf4034ea9b21cbfb5caf867c97a366359e8338d247148ad5748b923ab6"

def write_json(file, value):
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def write_icon(file):
    width = 140
    rows = []
    for y in range(width):
        line = bytearray([0])
        for x in range(width):
            radius = ((x - 70) ** 2 + (y - 70) ** 2) ** 0.5
            bar = 43 <= x <= 97 and abs(y - (70 + 12 * (((x - 43) % 27) / 13.5 - 1))) <= 2
            rgb = (185, 156, 235) if (47 <= radius <= 50 or bar) else (31, 29, 38)
            line.extend(rgb)
        rows.append(line)
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    file.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, width, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + chunk(b"IEND", b"")
    )

def patch_builder(path):
    source = path.read_text(encoding="utf-8")
    # The Store installs the donor SDK locally. Skip the three lines that
    # require/copy it and the legacy .mgu helper copy in the pinned builder.
    edits = {
        "if not preview_only and not all(": "if False and not all(",
        "    shutil.copy(os.path.join(SDK, 'index.js'), os.path.join(src, 'node_modules', 'oap-sdk', 'index.js'))\n": "",
        "    shutil.copy(os.path.join(SDK, 'package.json'), os.path.join(src, 'node_modules', 'oap-sdk', 'package.json'))\n": "",
        "    shutil.copytree(os.path.join(KIT, 'tools', 'oapgen'), os.path.join(stage, 'oapgen'))\n": "",
    }
    for old, new in edits.items():
        if source.count(old) != 1:
            raise ValueError("Unexpected iDrive App Kit source: " + old.strip())
        source = source.replace(old, new)
    path.write_text(source, encoding="utf-8")

def stage_app(work, app_id, app_dir):
    archive = KIT.read_bytes()
    if hashlib.sha256(archive).hexdigest() != KIT_SHA256:
        raise ValueError("iDrive App Kit checksum mismatch")
    with zipfile.ZipFile(io.BytesIO(archive)) as kit:
        kit.extractall(work)
    runtime = work / "kit" / "runtime"
    fonts = FONT_ATLAS.read_bytes()
    if hashlib.sha256(fonts).hexdigest() != FONT_ATLAS_SHA256:
        raise ValueError("LUXO glyph atlas checksum mismatch")
    with zipfile.ZipFile(io.BytesIO(fonts)) as atlas:
        atlas.extractall(runtime / "fonts")
    # Required by the kit's general-purpose context; LUXO uses its own read-only adapter.
    (runtime / "signals.js").write_text("'use strict';\nmodule.exports = {};\n", encoding="utf-8")
    upstream = work / "kit" / "tools" / "build.py"
    patch_builder(upstream)
    target = work / "apps" / app_id
    target.parent.mkdir()
    shutil.copytree(app_dir, target)
    spec_file = target / "app.json"
    spec = json.loads(spec_file.read_text(encoding="utf-8"))
    if spec["id"] != ID and spec["id"] != app_id:
        raise ValueError("unexpected app id")
    spec["id"] = app_id
    write_json(spec_file, spec)
    write_icon(target / "icon.png")
    shutil.copy2(work / "LICENSE", target / "LICENSE")
    sys.path.insert(0, str(upstream.parent))
    module_spec = importlib.util.spec_from_file_location("kit_build", upstream)
    builder = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(builder)
    builder.build(app_id)

    package = work / "dist" / app_id / "source"
    shutil.rmtree(package / "node_modules")
    metadata_path = package / "package.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["mguHmi"] = ["ID7"]
    metadata["mguLocalOnly"] = True
    write_json(metadata_path, metadata)
    app_path = package / "rhmiData" / "application.json"
    rhmi = json.loads(app_path.read_text(encoding="utf-8"))
    rhmi["application"]["uiDescriptions"] = [
        item for item in rhmi["application"]["uiDescriptions"] if item.get("hmi") == ["ID7"]
    ]
    for variant in rhmi["application"]["variantGroups"]:
        variant["hmi"] = ["ID7"]
    write_json(app_path, rhmi)
    shutil.rmtree(package / "rhmiData" / "uiDescriptions" / "ID8")
    return package, metadata["version"]

def archive_package(package, destination):
    with destination.open("wb") as output, gzip.GzipFile(fileobj=output, filename="", mode="wb", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as tar:
            for file in sorted(package.rglob("*")):
                if not file.is_file():
                    continue
                data = file.read_bytes()
                entry = tarfile.TarInfo("package/" + file.relative_to(package).as_posix())
                entry.mode = 0o644
                entry.size = len(data)
                tar.addfile(entry, io.BytesIO(data))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app_id", nargs="?", default=ID)
    parser.add_argument("app_dir", nargs="?")
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path(os.environ.get("MGU_OUT", ROOT / "dist")))
    args = parser.parse_args()
    if not re.fullmatch(re.escape(ID) + r"(?:[2-9]|[1-9][0-9]+)?", args.app_id):
        parser.error("invalid app id")
    app_dir = (ROOT / (args.app_dir or ("apps/" + ID))).resolve()
    if ROOT not in app_dir.parents or not (app_dir / "app.json").is_file():
        parser.error("invalid app folder")
    args.out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="luxo-build-", dir=args.out.resolve()) as temp:
        package, version = stage_app(pathlib.Path(temp), args.app_id, app_dir)
        destination = args.out / f"{args.app_id}@{version}.tgz"
        archive_package(package, destination)
    print(hashlib.sha256(destination.read_bytes()).hexdigest(), destination.name)

if __name__ == "__main__":
    main()
