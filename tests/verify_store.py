"""Fetch pinned upstream code and run the real Store/deployer preflight checks."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default="node")
    parser.add_argument("--store-source", type=Path)
    args = parser.parse_args()
    pin = json.loads((ROOT / "tests/store_upstream.json").read_text(encoding="utf-8"))
    upstream = args.store_source or ROOT / "dist" / ("store-upstream-" + pin["revision"])
    for name, expected in pin["files"].items():
        target = upstream / name
        if not target.is_file():
            if args.store_source:
                raise RuntimeError("Missing upstream source: " + str(target))
            url = "https://raw.githubusercontent.com/" + pin["repository"] + "/" + pin["revision"] + "/" + name
            data = urllib.request.urlopen(url, timeout=45).read()
        else:
            data = target.read_bytes()
        actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if actual != expected:
            raise RuntimeError("Upstream blob mismatch: " + name)
        if not target.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    subprocess.run([args.node, str(ROOT / "tests/store_preflight.cjs"), str(upstream)], check=True)


if __name__ == "__main__":
    main()
