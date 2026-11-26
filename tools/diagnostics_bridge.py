#!/usr/bin/env python3
"""Independent read-only diagnostics and USB export; never opens a PCM stream."""
import json
import os
import socket
import stat
import subprocess
import sys
import threading
import time
from pathlib import Path
from diagnostic_support import (APP_ID, AudioError, allowed_peer, text_file,
    inventory, systemd_status, manager_inventory, usb_mounts, export_usb, diagnostic_endpoint_health)

PREFIX = b"LUXODIAG/1 "
LIMIT = 393216


def command(args, limit=16384, timeout=2):
    try:
        proc = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
        return {"exitCode": proc.returncode, "stdout": proc.stdout[:limit].decode("utf-8", "replace"),
            "stderr": proc.stderr[:2048].decode("utf-8", "replace"), "truncated": len(proc.stdout) > limit}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"error": str(error)[:256]}


def observed_file(name):
    try:
        info = os.lstat(name)
        return {"exists": True, "uid": info.st_uid, "gid": info.st_gid,
            "mode": oct(stat.S_IMODE(info.st_mode)), "symlink": stat.S_ISLNK(info.st_mode)}
    except OSError as error:
        return {"exists": False if error.errno == 2 else None, "errno": error.errno}


def collect(extended=True):
    root = "/var/opt/luxo-motor-audio/current/"
    endpoint_health = diagnostic_endpoint_health()
    result = {"serviceVersion": "0.4.1", "independentOfPcmProcess": True,
        "collectedAt": time.time(), "pid": os.getpid(), "python": sys.version.split()[0],
        "uid": os.getuid() if hasattr(os, "getuid") else None,
        "inventory": inventory(), "usbMounts": usb_mounts(),
        "observedFiles": {name: observed_file(name) for name in [
            root + "component.json", root + "overlay_bridge.py", root + "audio_backend.py",
            "/var/opt/mgu-python/current/bin/python3", "/run/luxo-motor-sound/pcm.sock",
            "/var/opt/public/oap/oap_12201/data/apps/" + APP_ID + ".json"]},
        "audioSystemd": systemd_status(), "diagnosticsSystemd": endpoint_health["systemd"],
        "diagnosticEndpointHealth": endpoint_health,
        "physicalSoundAutomaticallyVerified": False}
    # Read existing route metadata without approving, opening or changing it.
    route = text_file("/var/opt/luxo-motor-audio/config.json", 16384)
    try:
        config = json.loads(route) if route else {}
        result["storedRoute"] = config.get("route") if isinstance(config, dict) else None
    except ValueError:
        result["storedRouteError"] = "CONFIG_INVALID"
    if extended:
        result["audioManager"] = manager_inventory()
        result["audioJournal"] = command(["journalctl", "-u", "luxo-motor-audio.service",
            "-u", "luxo-motor-audio.socket", "-n", "60", "--no-pager", "-o", "short-monotonic"])
    return result


def serve_connection(conn, gather=collect, mounts=usb_mounts, exporter=export_usb):
    conn.settimeout(3)
    message = bytearray()
    while len(message) <= LIMIT and not message.endswith(b"\n"):
        chunk = conn.recv(1)
        if not chunk:
            return
        message.extend(chunk)
    try:
        if len(message) > LIMIT or not message.startswith(PREFIX):
            raise AudioError("BAD_REQUEST")
        value = json.loads(message[len(PREFIX):].decode("utf-8"))
        if not isinstance(value, dict):
            raise AudioError("BAD_REQUEST")
        if value.get("op") == "diagnose":
            result = gather(value.get("extended", True) is not False)
        elif value.get("op") == "export":
            report = value.get("report")
            if not isinstance(report, dict) or report.get("appId") != APP_ID:
                raise AudioError("BAD_REQUEST")
            report = dict(report)
            report["diagnosticsAtExport"] = gather(False)
            result = {"path": exporter(report, value.get("target"), mounts=mounts())}
        else:
            # No route selection, source control or PCM/test operations here.
            raise AudioError("BAD_REQUEST")
        answer = {"ok": True, "data": result}
        payload = (json.dumps(answer, ensure_ascii=True) + "\n").encode()
        if len(payload) > LIMIT:
            raise AudioError("REPORT_LIMIT")
    except (AudioError, OSError, ValueError, TypeError) as error:
        payload = (json.dumps({"ok": False, "error": getattr(error, "code", "DIAGNOSTIC_IO_FAILED"),
            "detail": str(error)[:256]}) + "\n").encode()
    conn.sendall(payload)


def main():
    if os.environ.get("LISTEN_PID") != str(os.getpid()) or os.environ.get("LISTEN_FDS") != "1":
        raise SystemExit("requires one systemd Unix listen socket")
    with socket.socket(fileno=3) as server:
        if server.family != socket.AF_UNIX or not server.getsockopt(socket.SOL_SOCKET, socket.SO_ACCEPTCONN):
            raise SystemExit("fd 3 must be a listening Unix socket")
        clients = threading.BoundedSemaphore(4)
        def handle(client):
            try:
                with client:
                    if allowed_peer(client):
                        serve_connection(client)
                    else:
                        client.sendall(b'{"ok":false,"error":"PEER_DENIED"}\n')
            except (OSError, TimeoutError) as error:
                print("LUXO diagnostics: " + str(error), file=sys.stderr, flush=True)
            finally:
                clients.release()
        while True:
            client, _ = server.accept()
            if clients.acquire(blocking=False):
                threading.Thread(target=handle, args=(client,), daemon=True).start()
            else:
                client.close()


if __name__ == "__main__":
    main()
