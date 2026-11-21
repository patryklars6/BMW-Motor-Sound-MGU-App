"""Host-only PCM test sink using the production bridge protocol (no ALSA claim)."""
from pathlib import Path
import json
import socket
import sys
import tempfile
import threading

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import audio_backend as backend
import overlay_bridge as bridge

class Sink:
    def __init__(self, name, channels):
        self.channels = channels
        self.supported_channels = [2, 4, 5]
        self.written = 0
    def write(self, frame): self.written += len(frame) // (2 * self.channels)
    def status(self): return {'writtenFrames': self.written, 'droppedBlocks': 0}
    def close(self): pass

if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as temporary:
        observed = {'devices': [{'name': 'host_test_sink', 'selectable': True}], 'fingerprint': 'host-fixture', 'ram': {'model': None, 'verified': False}}
        manager = backend.AudioManager(Path(temporary) / 'config.json', lambda: observed, Sink)
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
