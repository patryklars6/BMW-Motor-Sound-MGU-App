import pathlib
import socket
import sys
import threading
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "tools"))
import overlay_bridge as bridge

class TestBridge(unittest.TestCase):
    def run_client(self, payload, channels, exists=None):
        received = []
        stops = []
        class Device:
            def __init__(self, count):
                self.count = count
            def write(self, frame):
                received.append((self.count, frame))
            def close(self):
                stops.append(True)

        host, client = socket.socketpair()
        def run():
            with host:
                bridge.serve_client(host, channels, Device, exists)
        thread = threading.Thread(target=run)
        thread.start()
        with client:
            client.settimeout(2)
            client.sendall(payload)
            client.shutdown(socket.SHUT_WR)
            reply = client.recv(128)
        thread.join(2)
        self.assertFalse(thread.is_alive())
        return reply, received, stops

    def test_full_frames_reach_the_negotiated_channel_order(self):
        frame = bytes(range(256)) * 30
        reply, frames, stops = self.run_client(bridge.HELLO + frame + b"incomplete", 4)
        self.assertEqual(reply, b"READY 4\n")
        self.assertEqual(frames, [(4, frame)])
        self.assertEqual(stops, [True])

    def test_invalid_format_cannot_open_audio(self):
        reply, frames, stops = self.run_client(b"UNSUPPORTED FORMAT\n", 2)
        self.assertEqual(reply, b"")
        self.assertEqual(frames, [])
        self.assertEqual(stops, [])

    def test_probe_does_not_open_audio(self):
        reply, frames, stops = self.run_client(b"PROBE\n", 2, lambda: True)
        self.assertEqual(reply, b"STATUS available 2\n")
        self.assertEqual(frames, [])
        self.assertEqual(stops, [])

    def test_missing_route_returns_a_specific_error(self):
        reply, frames, stops = self.run_client(bridge.HELLO, 2, lambda: False)
        self.assertEqual(reply, b"ERROR ALSA_ROUTE_MISSING\n")
        self.assertEqual(frames, [])
        self.assertEqual(stops, [])

if __name__ == "__main__":
    unittest.main()
