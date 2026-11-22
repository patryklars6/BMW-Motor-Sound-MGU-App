"""Host transport fixture for the production independent diagnostic handler.
USB writer is deliberately injected: Windows is not a BMW Linux USB mount.
"""
import importlib.abc
import json
from pathlib import Path
import socket
import sys
import threading

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
class NoAudioBackend(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, *args):
        if fullname in ("audio_backend", "overlay_bridge"):
            raise ImportError("PCM backend deliberately unavailable")
sys.meta_path.insert(0, NoAudioBackend())
import diagnostics_bridge as bridge

root = Path(sys.argv[1])
def collect(extended=True):
    return {"independentOfPcmProcess": True, "inventory": {"devices": [
        {"name": "observed_fixture_pcm", "selectable": False}]}, "usbMounts": [str(root)],
        "audioSystemd": {"service": {"ActiveState": "failed", "Result": "exit-code"}},
        "physicalSoundAutomaticallyVerified": False}
def export(report, target, mounts):
    if target not in mounts:
        raise bridge.AudioError("NO_USB")
    path = root / "audio-fixture-report.json"
    path.write_text(json.dumps(report), encoding="utf-8")
    return str(path)
def handle(conn):
    with conn: bridge.serve_connection(conn, collect, lambda: [str(root)], export)
server = socket.socket()
server.bind(("127.0.0.1", 0))
server.listen(4)
print(json.dumps({"port": server.getsockname()[1]}), flush=True)
while True:
    conn, _ = server.accept()
    threading.Thread(target=handle, args=(conn,), daemon=True).start()
