#!/usr/bin/env python3
import json
import pathlib
import sys
import tarfile
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
repo = json.loads((ROOT / "mgu-repo.json").read_text(encoding="utf-8"))
component = repo["components"][0]
spec = json.loads((ROOT / component["path"] / "app.json").read_text(encoding="utf-8"))
archive = pathlib.Path(sys.argv[1])
assert archive.name == f"{spec['id']}@{spec['version']}.tgz"
with tarfile.open(archive, "r:gz") as tar:
    files = set(tar.getnames())

    def read(name):
        return tar.extractfile(f"package/{name}").read()

    def data(name):
        return json.loads(read(name))

    assert files and all(name.startswith("package/") and ".." not in name.split("/") for name in files)
    assert all("node_modules" not in name and "ID8/" not in name for name in files)
    meta = data("package.json")
    assert meta["name"] == component["id"] == spec["id"]
    assert meta["version"] == spec["version"]
    assert meta["mguHmi"] == component["mguHmi"] == ["ID7"]
    assert meta["mguAppStartType"] == "autostart"
    assert component["id"] == "patryklars6_motor_sound"
    assert component["requires"]["luxo-motor-audio"] == "0.2.1"
    assert data("config/base.json")["rhmiLoadingEnabled"]
    assert b"require('oap-sdk')" in read("javascript/kit/mgu.js")
    application = data("rhmiData/application.json")["application"]
    assert application["uiDescriptions"][0]["hmi"] == ["ID7"]
    xml = read("rhmiData/uiDescriptions/ID7/application.xml")
    ET.fromstring(xml)
    ui = data("rhmiData/uiDescriptions/ID7/uiDescription.json")
    native = next(state for state in ui["containers"].values() if state["name"] == "NATIVE")
    rows = [item for item in native["components"].values() if item.get("name", "").startswith("NATIVE_ROW_")]
    assert len(rows) == 8
    assert all(row["type"] == "button" and row["properties"]["Focusable"]["value"] == 2 for row in rows)
    assert all(set(row["rows"][0]) == {"Text1stRow", "Text2ndRow"} for row in rows)
    assert b"process.env.MGU_RENDERD_PROTO !== 'upstream'" in read("javascript/kit/display.js")
    icon = application["entryPoints"][0]["icon"]
    assert read("rhmiData/variantGroups/Common/images/" + icon).startswith(b"\x89PNG\r\n\x1a\n")
    assert b"MIT License" in read("javascript/LICENSE")
    manifest = data("manifest.json")
    for iface in spec["signals"]:
        entry = manifest["proxies"][iface]
        assert set(entry) == {"attributes", "instances"}
        assert all(flags == "rs" for flags in entry["attributes"].values())
    assert b"Sim" not in read("javascript/telemetry.js")
print(f"OK: {archive.name} ({len(files)} files, manifest, ID7 layout, icon, and no BMW SDK)")
