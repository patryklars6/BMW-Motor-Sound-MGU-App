#!/usr/bin/env python3
"""Connect LUXO PCM to an existing, separately validated ALSA overlay."""
import argparse
import ctypes as c
import errno
import os
import socket
import sys
import json

DEVICE = b"luxo_overlay"
HELLO = b"LUXO/1 S16LE 48000\n"
RATE = 48000
FRAMES = 960
SND_PCM_PLAYBACK = 0
SND_PCM_NONBLOCK = 1
SND_PCM_FORMAT_S16_LE = 2
SND_PCM_ACCESS_RW_INTERLEAVED = 3

class AlsaOutput:
    def __init__(self, channels):
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
        self._check(self.lib.snd_pcm_open(c.byref(self.handle), DEVICE, SND_PCM_PLAYBACK, SND_PCM_NONBLOCK))
        try:
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
        result = self.lib.snd_pcm_writei(self.handle, c.c_char_p(frame), FRAMES)
        if result in (-errno.EPIPE, -errno.ESTRPIPE):
            self._check(self.lib.snd_pcm_recover(self.handle, result, 1))
        elif result != -errno.EAGAIN:
            self._check(result)

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

def route_exists():
    """Enumerate ALSA names without opening a BMW/SmartX PCM."""
    lib = c.CDLL("libasound.so.2")
    hints = c.c_void_p()
    lib.snd_device_name_hint.argtypes = [c.c_int, c.c_char_p, c.POINTER(c.c_void_p)]
    lib.snd_device_name_hint.restype = c.c_int
    lib.snd_device_name_get_hint.argtypes = [c.c_void_p, c.c_char_p]
    lib.snd_device_name_get_hint.restype = c.c_void_p
    lib.snd_device_name_free_hint.argtypes = [c.c_void_p]
    libc = c.CDLL(None)
    libc.free.argtypes = [c.c_void_p]
    libc.free.restype = None
    if lib.snd_device_name_hint(-1, b"pcm", c.byref(hints)) < 0:
        return False
    try:
        entries = c.cast(hints, c.POINTER(c.c_void_p))
        index = 0
        while entries[index]:
            name = lib.snd_device_name_get_hint(entries[index], b"NAME")
            index += 1
            if name:
                try:
                    if c.string_at(name) == DEVICE:
                        return True
                finally:
                    libc.free(name)
        return False
    finally:
        lib.snd_device_name_free_hint(hints)


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

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--channels", type=int, choices=(2, 4, 5), default=None)
    parser.add_argument("--config", default="/var/opt/luxo-motor-audio/config.json")
    args = parser.parse_args()
    if os.environ.get("LISTEN_PID") != str(os.getpid()) or os.environ.get("LISTEN_FDS") != "1":
        parser.error("requires one systemd Unix listen socket")
    with socket.socket(fileno=3) as server:
        if server.family != socket.AF_UNIX or not server.getsockopt(socket.SOL_SOCKET, socket.SO_ACCEPTCONN):
            parser.error("fd 3 must be a listening Unix socket")
        while True:
            client, _ = server.accept()
            with client:
                try:
                    channels = args.channels or 2
                    if args.channels is None and os.path.exists(args.config):
                        with open(args.config, encoding="utf-8") as config:
                            value = json.load(config)
                        if not isinstance(value, dict):
                            raise ValueError("configuration must be an object")
                        channels = value.get("channels", 2)
                    if type(channels) is not int or channels not in (2, 4, 5):
                        client.sendall(b"ERROR CONFIG_INVALID\n")
                        continue
                    serve_client(client, channels, inspect_route=route_exists)
                except (ValueError, TypeError):
                    client.sendall(b"ERROR CONFIG_INVALID\n")
                except (OSError, TimeoutError) as error:
                    print(f"LUXO overlay: {error}", file=sys.stderr, flush=True)

if __name__ == "__main__":
    main()
