"""Host-only PCM test sink using the production bridge protocol (no ALSA claim)."""
from pathlib import Path
import json
import socket
import sys
import tempfile
import threading
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import audio_backend as backend
import overlay_bridge as bridge

class Sink:
    total_frames = 0
    total_blocks = 0
    nonzero_blocks = 0
    last_write = None
    max_gap = 0
    def __init__(self, name, channels):
        self.channels = channels
        self.supported_channels = [2, 4, 5]
        self.written = 0
    def write(self, frame):
        self.written += len(frame) // (2 * self.channels)
        Sink.total_frames += len(frame) // (2 * self.channels)
        Sink.total_blocks += 1
        Sink.nonzero_blocks += bool(any(frame))
        now = time.monotonic()
        if Sink.last_write is not None:
            Sink.max_gap = max(Sink.max_gap, now - Sink.last_write)
        Sink.last_write = now
    def status(self): return {'writtenFrames': self.written, 'droppedBlocks': 0}
    def close(self): pass

if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as temporary:
        observed = {'devices': [{'name': 'host_test_sink', 'selectable': True}], 'fingerprint': 'host-fixture', 'ram': {'model': None, 'verified': False}}
        manager = backend.AudioManager(Path(temporary) / 'config.json', lambda: observed, Sink)
        original_diagnose = manager.diagnostics
        def diagnose(*args, **kwargs):
            result = original_diagnose(*args, **kwargs)
            result['hostSink'] = {'frames': Sink.total_frames, 'blocks': Sink.total_blocks,
                'nonzeroBlocks': Sink.nonzero_blocks, 'maxGapSeconds': Sink.max_gap}
            return result
        manager.diagnostics = diagnose
        backend.systemd_status = lambda: {'fixture': True}
        backend.manager_inventory = lambda: {'available': False, 'error': 'Host fixture has no BMW'}
        with socket.socket() as server:
            server.bind(('127.0.0.1', 0))
            server.listen(4)
            print(json.dumps({'port': server.getsockname()[1]}), flush=True)
            def serve(client):
                with client:
                    try: bridge.serve_connection(client, manager)
                    except OSError: pass
            while True:
                client, _ = server.accept()
                threading.Thread(target=serve, args=(client,), daemon=True).start()
