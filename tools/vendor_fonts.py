#!/usr/bin/env python3
"""Bake German- and Turkish-capable Barlow Condensed label and bold atlases for the app."""
import hashlib
import json
import pathlib
import tempfile
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
KIT = "https://raw.githubusercontent.com/cauliflowermossgrape/idrive7-apps/b2880634eb214e29f008422b970cf22ea2de280f"
FONT = "https://raw.githubusercontent.com/google/fonts/60824dce48f7dd28fe7d65559f2da1f6e04e585b/ofl/barlowcondensed"

def download(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()

def main():
    source = download(KIT + "/kit/tools/bake_fonts.py")
    baker = {"__name__": "kit_baker", "__file__": str(ROOT / "tools" / "bake_fonts.py")}
    exec(compile(source, baker["__file__"], "exec"), baker)
    text = baker["TEXT"] + "ÄÖÜäöüßÇçĞğİıŞş−‹›"
    families = (("label", "Regular", (18, 24, 32, 44)), ("bold", "Bold", (24, 32, 44, 64)))
    target = ROOT / "vendor" / "luxo-fonts.zip"
    output = {"OFL-BarlowCondensed.txt": download(FONT + "/OFL.txt")}
    with tempfile.TemporaryDirectory(dir=ROOT / "vendor") as staging:
        baker["FONTDIR"] = staging
        for family, weight, sizes in families:
            font = "BarlowCondensed-" + weight + ".ttf"
            (pathlib.Path(staging) / font).write_bytes(download(FONT + "/" + font))
            data = {"family": family, "source": font, "cacheKey": "luxo-barlow-condensed-de-en-tr-1",
                    "sizes": [baker["bake"](font, None, size, text) for size in sizes]}
            output[family + ".json"] = json.dumps(data, separators=(",", ":")).encode("utf-8")
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(output.items()):
            entry = zipfile.ZipInfo(name)
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, data)
    print(hashlib.sha256(target.read_bytes()).hexdigest())

if __name__ == "__main__":
    main()
