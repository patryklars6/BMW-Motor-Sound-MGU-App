#!/usr/bin/env python3
"""Connect LUXO PCM to an existing, separately validated ALSA overlay."""
import argparse
import ctypes as c
import errno
import os
import socket
import sys
import json
import array
import threading
from audio_backend import AudioManager, AudioError, allowed_peer, usb_mounts, export_usb

HELLO = b"LUXO/1 S16LE 48000\n"
RATE = 48000
FRAMES = 960
SND_PCM_PLAYBACK = 0
SND_PCM_NONBLOCK = 1
SND_PCM_FORMAT_S16_LE = 2
SND_PCM_ACCESS_RW_INTERLEAVED = 3
SUSPENDED = getattr(errno, "ESTRPIPE", 86)  # Linux ALSA code; absent from Windows' errno module.

class AlsaOutput:
    def __init__(self, channels, device=None):
        if not device:
            raise OSError(errno.ENODEV, "No approved PCM route")
        self.lib = c.CDLL("libasound.so.2")
        self.handle = c.c_void_p()
        p, i, u = c.c_void_p, c.c_int, c.c_uint
        signatures = {
            "snd_pcm_open": ([c.POINTER(p), c.c_char_p, i, i], i),
            "snd_pcm_set_params": ([p, i, i, u, u, i, u], i),
            "snd_pcm_writei": ([p, p, c.c_ulong], c.c_long),
            "snd_pcm_recover": ([p, i, i], i),
            "snd_pcm_drop": ([p], i),
            "snd_pcm_close": ([p], i),
            "snd_strerror": ([i], c.c_char_p),
        }
        for name, (args, result) in signatures.items():
            function = getattr(self.lib, name)
            function.argtypes = args
            function.restype = result
        self.channels = channels
        self.supported_channels = None
        self._check(self.lib.snd_pcm_open(c.byref(self.handle), device.encode("utf-8"), SND_PCM_PLAYBACK, SND_PCM_NONBLOCK))
        try:
            self.supported_channels = self._channels()
            self._check(self.lib.snd_pcm_set_params(
                self.handle, SND_PCM_FORMAT_S16_LE, SND_PCM_ACCESS_RW_INTERLEAVED,
                channels, RATE, 0, 40000,
            ))
        except OSError:
            self.close()
            raise

    def _check(self, result):
        if result < 0:
            raise OSError(-result, self.lib.snd_strerror(result).decode("utf-8", errors="replace"))

    def write(self, frame):
        buf = c.create_string_buffer(frame)
        total = len(frame) // (2 * self.channels)
        written = 0
        recovered = False
        while written < total:
            result = self.lib.snd_pcm_writei(self.handle, c.byref(buf, written * self.channels * 2), total - written)
            if result in (-errno.EPIPE, -SUSPENDED) and not recovered:
                self._check(self.lib.snd_pcm_recover(self.handle, result, 1))
                recovered = True
            elif result == -errno.EAGAIN or result == 0:
                break
            else:
                self._check(result)
                written += result
        return written

    def _channels(self):
        params = c.c_void_p()
        p = c.c_void_p
        functions = {
            "snd_pcm_hw_params_malloc": ([c.POINTER(p)], c.c_int),
            "snd_pcm_hw_params_any": ([p, p], c.c_int),
            "snd_pcm_hw_params_set_access": ([p, p, c.c_int], c.c_int),
            "snd_pcm_hw_params_set_format": ([p, p, c.c_int], c.c_int),
            "snd_pcm_hw_params_set_rate": ([p, p, c.c_uint, c.c_int], c.c_int),
            "snd_pcm_hw_params_test_channels": ([p, p, c.c_uint], c.c_int),
            "snd_pcm_hw_params_free": ([p], None),
        }
        try:
            for name, (args, result) in functions.items():
                getattr(self.lib, name).argtypes = args
                getattr(self.lib, name).restype = result
            self._check(self.lib.snd_pcm_hw_params_malloc(c.byref(params)))
            self._check(self.lib.snd_pcm_hw_params_any(self.handle, params))
            self._check(self.lib.snd_pcm_hw_params_set_access(self.handle, params, SND_PCM_ACCESS_RW_INTERLEAVED))
            self._check(self.lib.snd_pcm_hw_params_set_format(self.handle, params, SND_PCM_FORMAT_S16_LE))
            self._check(self.lib.snd_pcm_hw_params_set_rate(self.handle, params, RATE, 0))
            return [count for count in (2, 4, 5) if self.lib.snd_pcm_hw_params_test_channels(self.handle, params, count) == 0]
        except (OSError, AttributeError):
            return None
        finally:
            if params.value:
                self.lib.snd_pcm_hw_params_free(params)

    def close(self):
        self.lib.snd_pcm_drop(self.handle)
        self.lib.snd_pcm_close(self.handle)

def read_exact(conn, length):
    data = bytearray()
    while len(data) < length:
        part = conn.recv(length - len(data))
        if not part:
            return None
        data.extend(part)
    return bytes(data)

def serve_client(conn, channels, open_pcm=AlsaOutput, inspect_route=None):
    conn.settimeout(0.25)
    message = bytearray()
    while len(message) <= 64 and not message.endswith(b"\n"):
        part = conn.recv(1)
        if not part:
            return
        message.extend(part)
    if bytes(message) not in (HELLO, b"PROBE\n"):
        return
    if inspect_route:
        try:
            available = inspect_route()
        except (OSError, AttributeError):
            conn.sendall(b"ERROR ALSA_UNAVAILABLE\n")
            return
        if not available:
            conn.sendall(b"ERROR ALSA_ROUTE_MISSING\n")
            return
    if message == b"PROBE\n":
        conn.sendall(f"STATUS available {channels}\n".encode("ascii"))
        return
    try:
        pcm = open_pcm(channels)
    except OSError as error:
        conn.sendall(b"ERROR ALSA_OPEN_FAILED\n")
        print(f"LUXO ALSA open: {error}", file=sys.stderr, flush=True)
        return
    try:
        conn.sendall(f"READY {channels}\n".encode("ascii"))
        while True:
            frame = read_exact(conn, FRAMES * channels * 2)
            if frame is None:
                return
            try:
                pcm.write(frame)
            except OSError:
                conn.sendall(b"ERROR AUDIO_WRITE_FAILED\n")
                return
    finally:
        pcm.close()

def serve_connection(conn, manager):
    conn.settimeout(2)
    message = bytearray()
    while len(message) <= 131072 and not message.endswith(b"\n"):
        part = conn.recv(1)
        if not part:
            return
        message.extend(part)
    if len(message) > 131072:
        return
    try:
        request = None
        if message.startswith(b"LUXO/2 "):
            request = json.loads(message[7:].decode("utf-8"))
            if not isinstance(request, dict):
                raise AudioError("BAD_REQUEST")
            operation = request.get("op")
            if operation == "diagnose":
                result = manager.diagnostics(extended=request.get("extended", True) is not False)
                result["usbMounts"] = usb_mounts()
            elif operation == "select":
                result = manager.select(request)
            elif operation == "confirm":
                result = manager.confirm(request)
            elif operation == "export":
                report = request.get("report")
                if not isinstance(report, dict):
                    raise AudioError("BAD_REQUEST")
                report["serviceAtExport"] = manager.diagnostics()
                result = {"path": export_usb(report, request.get("target"))}
            elif operation != "test":
                raise AudioError("BAD_REQUEST")
            if operation != "test":
                conn.sendall((json.dumps({"ok": True, "data": result}, ensure_ascii=True) + "\n").encode())
                return
        elif message == b"PROBE\n":
            route = manager.route()
            conn.sendall(("STATUS available " + str(route["channels"]) + "\n").encode())
            return
        elif message != HELLO:
            raise AudioError("BAD_REQUEST")
        test = bool(request and request.get("op") == "test")
        pcm, _ = manager.open(test=test, guard=request)
        conn.settimeout(0.5)
        result = None
        try:
            conn.sendall(("READY " + str(pcm.channels) + "\n").encode())
            while True:
                frame = read_exact(conn, FRAMES * pcm.channels * 2)
                if frame is None:
                    break
                if test:
                    samples = array.array("h", frame)
                    if sys.byteorder != "little":
                        samples.byteswap()
                    samples = array.array("h", (min(655, max(-655, value)) for value in samples))
                    if sys.byteorder != "little":
                        samples.byteswap()
                    frame = samples.tobytes()
                pcm.write(frame)
        finally:
            result = manager.close(pcm, test=test)
        if test:
            conn.sendall(("TEST_DONE " + json.dumps(result) + "\n").encode())
    except (AudioError, OSError, ValueError, TypeError) as error:
        code = getattr(error, "code", "AUDIO_IO_FAILED")
        manager.last_error = {"code": code, "message": str(error)[:256]}
        if message.startswith(b"LUXO/2 ") and (not isinstance(locals().get("request"), dict) or request.get("op") != "test"):
            conn.sendall((json.dumps({"ok": False, "error": code, "detail": str(error)[:256]}) + "\n").encode())
        else:
            conn.sendall(("ERROR " + code + "\n").encode())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="/var/opt/luxo-motor-audio/config.json")
    args = parser.parse_args()
    if os.environ.get("LISTEN_PID") != str(os.getpid()) or os.environ.get("LISTEN_FDS") != "1":
        parser.error("requires one systemd Unix listen socket")
    with socket.socket(fileno=3) as server:
        if server.family != socket.AF_UNIX or not server.getsockopt(socket.SOL_SOCKET, socket.SO_ACCEPTCONN):
            parser.error("fd 3 must be a listening Unix socket")
        manager = AudioManager(args.config)
        clients = threading.BoundedSemaphore(8)
        def handle(client):
            try:
                with client:
                    if allowed_peer(client):
                        serve_connection(client, manager)
                    else:
                        client.sendall(b"ERROR PEER_DENIED\n")
            except (OSError, TimeoutError) as error:
                print(f"LUXO audio client: {error}", file=sys.stderr, flush=True)
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
