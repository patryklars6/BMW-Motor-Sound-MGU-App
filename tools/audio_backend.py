"""Measured audio inventory, approved ALSA routes and bounded PCM workers."""
import json
import multiprocessing as mp
import os
import queue
import threading
import time
from pathlib import Path

from diagnostic_support import (APP_ID, AudioError, text_file, pcm_devices, eligible_name,
    inventory, systemd_status, manager_inventory, allowed_peer, usb_mounts, export_usb)
CONFIG = "/var/opt/luxo-motor-audio/config.json"
CHANNELS = (2, 4, 5)


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
        if route and route.get("backend") == "bmw-media-source":
            if route.get("acceptedSharedMedia") is not True or route.get("channels") != 2:
                raise AudioError("CONFIG_INVALID", "Shared media consent missing")
            if route.get("fingerprint") != data["fingerprint"]:
                raise AudioError("ROUTE_CHANGED")
            if not any(item["name"] in ("smartx:CarLifeMedia_CF_48_STEREO", "plug:smartx:CarLifeMedia_CF_48_STEREO") for item in data["devices"]):
                raise AudioError("MEDIA_UNSUPPORTED", "No observed CarLife stereo PCM")
            return route
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

    def select_media(self, value):
        if self.stream_lock.locked():
            raise AudioError("AUDIO_BUSY")
        if value.get("acceptSharedMedia") is not True:
            raise AudioError("APPROVAL_REQUIRED", "Media source replaces music and follows BMW volume")
        data = self.discover()
        candidates = [item["name"] for item in data["devices"] if item["name"] in
            ("plug:smartx:CarLifeMedia_CF_48_STEREO", "smartx:CarLifeMedia_CF_48_STEREO")]
        if not candidates:
            raise AudioError("MEDIA_UNSUPPORTED", "No observed CarLife stereo PCM")
        cfg = self.load()
        if cfg.get("route", {}).get("backend") != "bmw-media-source":
            cfg["previousOverlayRoute"] = cfg.get("route")
        cfg["route"] = {"backend": "bmw-media-source", "device": candidates[0], "channels": 2,
            "acceptedSharedMedia": True, "approvedOverlay": False, "fingerprint": data["fingerprint"],
            "speakerMappingVerified": False, "parallelMusicVerified": False, "independentVolumeVerified": False}
        self.save(cfg)
        self.negotiated = None
        self.last_test = None
        self.last_error = None
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
            if route.get("backend") == "bmw-media-source":
                if channels != 2:
                    raise AudioError("CONFIG_INVALID", "Media source is stereo only")
                if self.last_error and self.last_error.get("code") == "MEDIA_SOURCE_LOST":
                    raise AudioError("MEDIA_SOURCE_LOST", "Reselect media mode explicitly after another source took over")
                from managed_media import ManagedMediaOutput
                output = ManagedMediaOutput(self.discover()["devices"], self.output_factory)
            else:
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
        return {"protocol": 2, "serviceVersion": "0.4.0", "serviceStarted": True, "pid": os.getpid(), "collectedAt": time.time(),
            "inventory": data, "route": route, "routeError": route_error, "negotiated": self.negotiated,
            "stream": stream, "lastStream": self.last_stream, "lastError": self.last_error,
            "systemd": systemd_status() if extended else None,
            "audioManager": manager_inventory() if extended else None,
            "physicalSoundAutomaticallyVerified": False}
