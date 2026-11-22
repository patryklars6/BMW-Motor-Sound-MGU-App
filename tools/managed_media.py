"""Opt-in BMW entertainment route. No independent mixer or speaker mapping claim."""
import json
import os
from pathlib import Path
import queue
import stat
import subprocess
import threading
from diagnostic_support import AudioError


def prepare_smartx_lock(device, directory="/run/smartx"):
    if not device.startswith(("smartx:", "plug:smartx:")):
        return
    # Only the documented, catalog-discovered CarLife stereo input is managed.
    stream = device.split("smartx:", 1)[1]
    if stream != "CarLifeMedia_CF_48_STEREO":
        raise AudioError("MEDIA_UNSUPPORTED", "Unrecognized managed PCM")
    folder = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        owner = os.fstat(folder)
        if owner.st_uid == 0:
            raise AudioError("MEDIA_LOCK_UNSAFE", "SmartX runtime owner not observed")
        name = "smartx_" + stream + "_p.lock"
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o660, dir_fd=folder)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise AudioError("MEDIA_LOCK_UNSAFE", "SmartX lock is not a regular private inode")
            if info.st_uid == 0:
                os.fchown(fd, owner.st_uid, owner.st_gid)
                os.fchmod(fd, 0o660)
            elif info.st_uid != owner.st_uid or info.st_gid != owner.st_gid or stat.S_IMODE(info.st_mode) != 0o660:
                raise AudioError("MEDIA_LOCK_UNSAFE", "Unexpected existing SmartX lock permissions")
        finally:
            os.close(fd)
    finally:
        os.close(folder)


class ManagedMediaOutput:
    def __init__(self, devices, output_factory, spawn=subprocess.Popen, timeout=13):
        self.child = None
        self.pcm = None
        self.error = None
        self.route = None
        self.closed = False
        self.started = queue.Queue(maxsize=1)
        try:
            self.child = spawn(["/usr/bin/node", str(Path(__file__).with_name("media_source.js")),
                json.dumps(devices)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, encoding="utf-8", bufsize=1)
            threading.Thread(target=self._read, daemon=True).start()
            try:
                result = self.started.get(timeout=timeout)
            except queue.Empty:
                raise AudioError("MEDIA_CONNECT_TIMEOUT", "Managed source readiness timed out")
            if not result.get("ready"):
                raise AudioError(result.get("error", "MEDIA_CONNECT_FAILED"), result.get("detail", ""))
            self.route = result["route"]
            self.pcm = output_factory(self.route["device"], 2)
            self.channels = self.pcm.channels
            self.supported_channels = self.pcm.supported_channels
        except Exception:
            self.close()
            raise

    def _read(self):
        first = True
        try:
            for line in self.child.stdout:
                if len(line) > 8192:
                    value = {"error": "MEDIA_CONNECT_FAILED", "detail": "Oversized source response"}
                else:
                    try:
                        value = json.loads(line)
                    except ValueError:
                        value = {"error": "MEDIA_CONNECT_FAILED", "detail": "Invalid source response"}
                if first:
                    self.started.put_nowait(value)
                    first = False
                if value.get("error"):
                    self.error = value
        finally:
            if first:
                self.started.put_nowait({"error": "MEDIA_CONNECT_FAILED", "detail": "Source helper exited before readiness"})
            if not self.closed and not self.error:
                self.error = {"error": "MEDIA_SOURCE_LOST", "detail": "Source helper ended"}

    def status(self):
        if self.error:
            raise AudioError(self.error["error"], self.error.get("detail", ""))
        if self.child.poll() is not None:
            raise AudioError("MEDIA_SOURCE_LOST", "Source helper exited")
        return self.pcm.status()

    def write(self, frame):
        self.status()
        self.pcm.write(frame)

    def close(self):
        if self.closed:
            return
        self.closed = True
        if self.pcm:
            self.pcm.close()
        if self.child:
            if self.child.stdin:
                try:
                    self.child.stdin.close()
                except OSError:
                    pass
            try:
                self.child.wait(timeout=11)
            except subprocess.TimeoutExpired:
                self.child.terminate()
                try:
                    self.child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.child.kill()
                    self.child.wait(timeout=1)
            if self.child.stdout:
                self.child.stdout.close()
