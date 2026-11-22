"""Read-only hardware inventory, authenticated diagnostics and bounded USB report export.
No PCM stream, source connection or vehicle control is opened by this module.
"""
import ctypes as c
import hashlib
import json
import os
import re
import socket
import stat
import struct
import subprocess
import sys
import time
from pathlib import Path

APP_ID = "patryklars6_motor_sound"

class AudioError(Exception):
    def __init__(self, code, detail=""):
        super().__init__(detail or code)
        self.code = code



def text_file(name, limit=8192):
    try:
        with open(name, encoding="utf-8", errors="replace") as file:
            return file.read(limit)
    except OSError:
        return None



def pcm_devices():
    """ALSA hints are observations, never evidence of a connected speaker."""
    lib = c.CDLL("libasound.so.2")
    hints = c.c_void_p()
    lib.snd_device_name_hint.argtypes = [c.c_int, c.c_char_p, c.POINTER(c.c_void_p)]
    lib.snd_device_name_get_hint.argtypes = [c.c_void_p, c.c_char_p]
    lib.snd_device_name_get_hint.restype = c.c_void_p
    lib.snd_device_name_free_hint.argtypes = [c.c_void_p]
    libc = c.CDLL(None)
    libc.free.argtypes = [c.c_void_p]
    if lib.snd_device_name_hint(-1, b"pcm", c.byref(hints)) < 0:
        raise AudioError("ALSA_ENUM_FAILED")
    devices = []
    try:
        entries = c.cast(hints, c.POINTER(c.c_void_p))
        for index in range(64):
            if not entries[index]:
                break
            item = {}
            for key in ("NAME", "DESC", "IOID"):
                value = lib.snd_device_name_get_hint(entries[index], key.encode())
                if value:
                    try:
                        item[key] = c.string_at(value).decode("utf-8", errors="replace")[:160]
                    finally:
                        libc.free(value)
            if item.get("NAME") and item.get("IOID") != "Input":
                name = item["NAME"]
                devices.append({"name": name, "description": item.get("DESC", ""),
                    "backend": "bmw-smartx" if name.lower().startswith("smartx:") else "alsa",
                    "selectable": eligible_name(name), "speakerMappingVerified": False})
    finally:
        lib.snd_device_name_free_hint(hints)
    return devices



def eligible_name(name):
    # OEM sources require source ownership/routing; opening one blindly can
    # block CarPlay. A named PCM alone does not establish an overlay.
    return isinstance(name, str) and bool(re.fullmatch(r"[A-Za-z0-9_.-]{1,96}", name)) and name.lower() not in {
        "default", "null", "pulse", "sysdefault", "hw", "plughw", "dmix", "dsnoop"}



def inventory():
    out = {"devices": [], "alsaError": None, "cards": text_file("/proc/asound/cards"),
        "pcms": text_file("/proc/asound/pcm"), "firmware": text_file("/etc/os-release-id-dlt", 256),
        "ram": {"model": None, "verified": False}, "amplifier": {"model": None, "verified": False}}
    try:
        out["devices"] = pcm_devices()
    except (OSError, AttributeError, AudioError) as error:
        out["alsaError"] = {"code": getattr(error, "code", "ALSA_UNAVAILABLE"), "message": str(error)[:256]}
    raw = json.dumps([out["devices"], out["cards"], out["pcms"], out["firmware"]], sort_keys=True).encode()
    out["fingerprint"] = hashlib.sha256(raw).hexdigest()
    return out



def systemd_status(prefix="luxo-motor-audio"):
    result = {}
    for kind in ("socket", "service"):
        try:
            proc = subprocess.run(["systemctl", "show", prefix + "." + kind,
                "--property=LoadState,ActiveState,SubState,Result,MainPID", "--no-pager"],
                capture_output=True, text=True, timeout=1.5, check=False)
            result[kind] = dict(line.split("=", 1) for line in proc.stdout.splitlines() if "=" in line) if proc.returncode == 0 else {"error": proc.stderr[:256]}
        except (OSError, subprocess.TimeoutExpired) as error:
            result[kind] = {"error": str(error)[:256]}
    return result



def manager_inventory():
    try:
        proc = subprocess.run(["/usr/bin/node", str(Path(__file__).with_name("audio_probe.js"))],
            capture_output=True, text=True, timeout=4, check=False)
        if proc.returncode == 0 and len(proc.stdout) <= 32768:
            return json.loads(proc.stdout)
        return {"available": False, "error": proc.stderr[:256] or "AudioManager probe failed"}
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        return {"available": False, "error": str(error)[:256]}



def allowed_peer(conn, registry="/var/opt/public/oap/oap_12201/data/apps/patryklars6_motor_sound.json"):
    """Kernel peer UID instead of assuming every OAP app has tm_oap_app."""
    try:
        _, uid, _ = struct.unpack("3i", conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        if uid == 0:
            return True
        data = json.loads(Path(registry).read_text(encoding="utf-8"))
        expected = data.get("userId")
        if isinstance(expected, str) and expected.isdecimal():
            expected = int(expected)
        if type(expected) is not int or expected <= 0 or uid != expected:
            return False
        source = Path(registry).parents[3] / ("oap_" + str(uid)) / "source/package.json"
        # Registry is <oap>/oap_12201/data/apps/id.json.
        return json.loads(source.read_text(encoding="utf-8")).get("name") == APP_ID
    except (OSError, ValueError, AttributeError):
        return False



def usb_mounts():
    mounts = text_file("/proc/mounts", 32768) or ""
    found = []
    for line in mounts.splitlines():
        fields = line.split()
        if len(fields) < 4 or "rw" not in fields[3].split(",") or not re.fullmatch(r"/dev/sd[a-z]+[0-9]*", fields[0]):
            continue
        device, target = fields[0], fields[1].replace("\\040", " ").replace("\\134", "\\")
        try:
            origin = os.path.realpath("/sys/class/block/" + os.path.basename(device))
            if target != "/" and "/usb" in origin and os.stat(target).st_dev == os.stat(device).st_rdev:
                found.append(target)
        except OSError:
            pass
    return found



def export_usb(report, target, mounts=None):
    if target not in (usb_mounts() if mounts is None else mounts):
        raise AudioError("NO_USB", "No matching writable mounted USB device")
    # The caller chooses an observed USB mount. Never overwrite or follow a link.
    parent = os.open(target, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    directory = None
    try:
        try:
            os.mkdir("LUXO-Diagnose", 0o755, dir_fd=parent)
        except FileExistsError:
            pass
        directory = os.open("LUXO-Diagnose", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        if not stat.S_ISDIR(os.fstat(directory).st_mode) or os.fstat(directory).st_dev != os.fstat(parent).st_dev:
            raise AudioError("NO_USB")
        name = "audio-" + time.strftime("%Y%m%d-%H%M%S", time.gmtime()) + "-" + os.urandom(3).hex() + ".json"
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644, dir_fd=directory)
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(report, file, ensure_ascii=False, indent=2)
            file.flush()
            os.fsync(file.fileno())
        return str(Path(target) / "LUXO-Diagnose" / name)
    finally:
        if directory is not None:
            os.close(directory)
        os.close(parent)

