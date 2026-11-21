"""Measured audio inventory, approved ALSA routes and bounded PCM workers."""
import ctypes as c
import hashlib
import json
import multiprocessing as mp
import os
import queue
import re
import socket
import stat
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path

APP_ID = "patryklars6_motor_sound"
CONFIG = "/var/opt/luxo-motor-audio/config.json"
CHANNELS = (2, 4, 5)


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


def systemd_status():
    result = {}
    for kind in ("socket", "service"):
        try:
            proc = subprocess.run(["systemctl", "show", "luxo-motor-audio." + kind,
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


def _pcm_worker(device, channels, frames, feedback, stop):
    from overlay_bridge import AlsaOutput
    pcm = None
    try:
        pcm = AlsaOutput(channels, device)
        feedback.send({"ready": True, "channels": channels, "supportedChannels": pcm.supported_channels})
        total = 0
        while not stop.is_set():
            try:
                frame = frames.get(timeout=0.1)
            except queue.Empty:
                continue
            total += pcm.write(frame)
            feedback.send({"writtenFrames": total})
    except (OSError, AudioError, AttributeError) as error:
        feedback.send({"error": getattr(error, "code", "ALSA_OPEN_FAILED"), "detail": str(error)[:256]})
    finally:
        if pcm:
            pcm.close()
        feedback.close()


class ProcessOutput:
    def __init__(self, device, channels, timeout=4, worker=None):
        ctx = mp.get_context("spawn")
        self.frames = ctx.Queue(maxsize=2)
        self.feedback, sender = ctx.Pipe(duplex=False)
        self.stop = ctx.Event()
        self.process = ctx.Process(target=worker or _pcm_worker, args=(device, channels, self.frames, sender, self.stop), daemon=True)
        self.written_frames = 0
        self.dropped_blocks = 0
        self.feedback_lock = threading.Lock()
        self.closed = False
        self.process.start()
        sender.close()
        if not self.feedback.poll(timeout):
            self.close()
            raise AudioError("ALSA_OPEN_TIMEOUT", "ALSA open exceeded four seconds")
        result = self.feedback.recv()
        if not result.get("ready"):
            self.close()
            raise AudioError(result.get("error", "ALSA_OPEN_FAILED"), result.get("detail", ""))
        self.channels = result["channels"]
        self.supported_channels = result.get("supportedChannels")

    def status(self):
        with self.feedback_lock:
            while not self.closed and self.feedback.poll():
                try:
                    result = self.feedback.recv()
                except EOFError:
                    break
                if result.get("error"):
                    raise AudioError(result["error"], result.get("detail", ""))
                self.written_frames = result.get("writtenFrames", self.written_frames)
        if not self.closed and not self.process.is_alive():
            raise AudioError("AUDIO_WORKER_EXITED")
        return {"writtenFrames": self.written_frames, "droppedBlocks": self.dropped_blocks}

    def write(self, frame):
        self.status()
        try:
            self.frames.put_nowait(frame)
        except queue.Full:
            self.dropped_blocks += 1

    def close(self):
        if self.closed:
            return
        self.stop.set()
        self.process.join(0.2)
        if self.process.is_alive():
            self.process.terminate()
            self.process.join(0.5)
        self.frames.cancel_join_thread()
        self.frames.close()
        with self.feedback_lock:
            self.closed = True
            self.feedback.close()


class AudioManager:
    def __init__(self, config=CONFIG, discover=inventory, output=ProcessOutput):
        self.config = Path(config)
        self.discover = discover
        self.output_factory = output
        self.lock = threading.Lock()
        self.stream_lock = threading.Lock()
        self.active = None
        self.negotiated = None
        self.last_error = None
        self.last_test = None
        self.last_stream = None
        self.last_inventory = None

    def load(self):
        try:
            value = json.loads(self.config.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except FileNotFoundError:
            return {}
        except (OSError, ValueError) as error:
            raise AudioError("CONFIG_INVALID", str(error))

    def save(self, value):
        self.config.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
        if self.config.is_symlink():
            raise AudioError("CONFIG_INVALID", "configuration is a symlink")
        target = self.config.with_name(self.config.name + ".tmp-" + str(os.getpid()) + "-" + os.urandom(3).hex())
        with self.lock:
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as file:
                    json.dump(value, file)
                    file.flush()
                    os.fsync(file.fileno())
                os.replace(target, self.config)
            finally:
                if target.exists():
                    target.unlink()

    def route(self):
        cfg = self.load()
        data = self.discover()
        self.last_inventory = data
        route = cfg.get("route")
        if not route or route.get("approvedOverlay") is not True:
            raise AudioError("NO_APPROVED_ROUTE", "No separately approved overlay route selected")
        if not eligible_name(route.get("device")) or route["device"] not in [item["name"] for item in data["devices"]]:
            raise AudioError("ROUTE_MISSING", "Selected ALSA PCM is not visible")
        if route.get("fingerprint") != data["fingerprint"]:
            raise AudioError("ROUTE_CHANGED", "Audio inventory or firmware changed; approval must be reviewed")
        if type(route.get("channels")) is not int or route["channels"] not in CHANNELS:
            raise AudioError("CONFIG_INVALID", "Unsupported channel request")
        return route

    def select(self, value):
        if self.stream_lock.locked():
            raise AudioError("AUDIO_BUSY")
        data = self.discover()
        name = value.get("device")
        if not eligible_name(name) or name not in [item["name"] for item in data["devices"]]:
            raise AudioError("ROUTE_NOT_SELECTABLE", "OEM, discard and generic default PCMs are not overlay backends")
        if value.get("approvedOverlay") is not True:
            raise AudioError("APPROVAL_REQUIRED")
        channels = value.get("channels", 2)
        if type(channels) is not int or channels not in CHANNELS:
            raise AudioError("CONFIG_INVALID")
        cfg = self.load()
        cfg["route"] = {"backend": "alsa-approved-overlay", "device": name, "channels": channels,
            "approvedOverlay": True, "fingerprint": data["fingerprint"], "speakerMappingVerified": False,
            "parallelMusicVerified": False, "independentVolumeVerified": False}
        self.save(cfg)
        self.negotiated = None
        self.last_test = None
        return cfg["route"]

    def open(self, test=False, guard=None):
        if test and not (guard and all(guard.get(key) is True for key in ("stationary", "park", "engineOff"))):
            raise AudioError("PARK_REQUIRED")
        if not self.stream_lock.acquire(blocking=False):
            raise AudioError("AUDIO_BUSY")
        try:
            route = self.route()
            channels = guard.get("channels", route["channels"]) if test else route["channels"]
            if type(channels) is not int or channels not in CHANNELS:
                raise AudioError("CONFIG_INVALID")
            output = self.output_factory(route["device"], channels)
            self.active = output
            self.negotiated = {"channels": output.channels, "supportedChannels": output.supported_channels,
                "device": route["device"], "speakerMappingVerified": False}
            self.last_error = None
            return output, route
        except Exception as error:
            self.last_error = {"code": getattr(error, "code", "ALSA_OPEN_FAILED"), "message": str(error)[:256]}
            self.stream_lock.release()
            raise

    def close(self, output, test=False):
        try:
            stats = output.status()
            self.last_stream = dict(stats, channels=output.channels)
            if test:
                self.last_test = {"id": os.urandom(6).hex(), "channels": output.channels,
                    "writtenFrames": stats["writtenFrames"], "at": time.monotonic()}
            return self.last_test if test else stats
        finally:
            output.close()
            self.active = None
            self.stream_lock.release()

    def confirm(self, value):
        test = self.last_test
        if not test or value.get("testId") != test["id"] or time.monotonic() - test["at"] > 120 or test["writtenFrames"] <= 0:
            raise AudioError("TEST_REQUIRED")
        cfg = self.load()
        self.route()
        if cfg["route"]["channels"] != test["channels"]:
            raise AudioError("TEST_REQUIRED", "Test must cover the selected channel count")
        if value.get("heardAllChannels") is not True:
            raise AudioError("HEARING_CONFIRMATION_REQUIRED")
        cfg["route"]["speakerMappingVerified"] = True
        cfg["route"]["mappingEvidence"] = "operator-reported channel test"
        self.save(cfg)
        return cfg["route"]

    def diagnostics(self, extended=True):
        data = self.discover()
        try:
            cfg = self.load()
            route = self.route()
            route_error = None
        except AudioError as error:
            cfg = self.load() if error.code != "CONFIG_INVALID" else {}
            route = cfg.get("route")
            route_error = {"code": error.code, "message": str(error)}
        stream = None
        if self.active:
            try:
                stream = self.active.status()
            except AudioError as error:
                self.last_error = {"code": error.code, "message": str(error)}
        return {"protocol": 2, "serviceVersion": "0.3.0", "serviceStarted": True, "pid": os.getpid(), "collectedAt": time.time(),
            "inventory": data, "route": route, "routeError": route_error, "negotiated": self.negotiated,
            "stream": stream, "lastStream": self.last_stream, "lastError": self.last_error,
            "systemd": systemd_status() if extended else None,
            "audioManager": manager_inventory() if extended else None,
            "physicalSoundAutomaticallyVerified": False}


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
