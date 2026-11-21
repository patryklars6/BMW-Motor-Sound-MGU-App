"""Build the actual package and run runtime, input, persistence and package checks."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default="node")
    parser.add_argument("--store-source", help="Optional checkout of the pinned upstream MGU Store")
    args = parser.parse_args()
    spec = json.loads((ROOT / "apps/patryklars6_motor_sound/app.json").read_text(encoding="utf-8"))
    archive = ROOT / "dist" / f"{spec['id']}@{spec['version']}.tgz"
    subprocess.run([sys.executable, "-B", str(ROOT / "tools/build_store.py")], check=True)
    with tempfile.TemporaryDirectory(prefix="luxo-check-", dir=ROOT / "dist") as temp:
        with tarfile.open(archive) as tar:
            tar.extractall(temp, filter="data")
        env = dict(os.environ, LUXO_TEST_PACKAGE=str(Path(temp) / "package"))
        subprocess.run([args.node, "--test", str(ROOT / "tests/runtime.test.js"), str(ROOT / "tests/interaction.test.js")], env=env, check=True)
    subprocess.run([sys.executable, "-B", "-m", "unittest", "discover", "-s", str(ROOT / "tests"), "-p", "test_bridge.py"], check=True)
    subprocess.run([sys.executable, "-B", str(ROOT / "tests/verify_package.py"), str(archive)], check=True)
    store_check = [sys.executable, "-B", str(ROOT / "tests/verify_store.py"), "--node", args.node]
    if args.store_source:
        store_check += ["--store-source", args.store_source]
    subprocess.run(store_check, check=True)


if __name__ == "__main__":
    main()
