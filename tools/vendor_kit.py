#!/usr/bin/env python3
"""Reproduce the small, offline copy of the MIT-licensed iDrive 7 App Kit."""
import argparse
import concurrent.futures
import hashlib
import pathlib
import urllib.request
import zipfile

COMMIT = "b2880634eb214e29f008422b970cf22ea2de280f"
BASE = "https://raw.githubusercontent.com/cauliflowermossgrape/idrive7-apps/" + COMMIT
ROOT = pathlib.Path(__file__).resolve().parents[1]
FILES = (
    "LICENSE",
    "kit/platform/permissions.json",
    "kit/tools/locale-revisions.json",
    *(f"kit/tools/{name}.py" for name in ("build", "localize", "pack_data")),
    *(f"kit/runtime/{name}.js" for name in (
        "canvas", "credits", "display", "fonts", "gauges", "hmi-text", "i18n",
        "mgu", "record", "renderd", "sheet", "text-layout", "themes",
    )),
    "kit/runtime/locale.json",
    *(f"kit/runtime/fonts/{name}.json" for name in ("bold", "label", "light", "num", "gear")),
)

def read_upstream(path):
    with urllib.request.urlopen(f"{BASE}/{path}", timeout=35) as response:
        return response.read()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=pathlib.Path, default=ROOT / "vendor" / "idrive7-kit.zip")
    args = parser.parse_args()
    args.output.parent.mkdir(exist_ok=True, parents=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        contents = list(pool.map(read_upstream, FILES))
    with zipfile.ZipFile(args.output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, content in sorted(zip(FILES, contents)):
            entry = zipfile.ZipInfo(path)
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, content)
    print(hashlib.sha256(args.output.read_bytes()).hexdigest(), args.output.name)

if __name__ == "__main__":
    main()
