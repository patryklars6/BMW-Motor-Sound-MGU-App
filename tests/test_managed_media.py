import copy
import io
import json
import os
import subprocess
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import audio_backend as backend
import managed_media as media

class Sink:
    channels = 2
    supported_channels = [2]
    def status(self): return {"writtenFrames": 960, "droppedBlocks": 0}
    def close(self): pass
    def write(self, frame): pass

class MediaBackendTest(unittest.TestCase):
    def test_real_python_to_node_lease_protocol_restores_source_on_pcm_close(self):
        node = os.environ.get('LUXO_TEST_NODE')
        self.assertTrue(node, 'run via tests/run_checks.py')
        evidence = Path(self.temp.name) / 'release.json'
        script = Path(__file__).with_name('managed-media-host.cjs')
        def spawn(args, **kwargs): return subprocess.Popen([node, str(script), str(evidence)], **kwargs)
        output = media.ManagedMediaOutput([], lambda *args: Sink(), spawn=spawn)
        self.assertEqual(output.channels, 2)
        self.assertEqual(output.status()['writtenFrames'], 960)
        self.assertFalse(output.route['speakerOutputVerified'])
        output.close()
        calls = json.loads(evidence.read_text())
        self.assertTrue(any(row[0] == 'disconnect' and row[1]['mainConnectionID'] == 7 for row in calls))
        self.assertTrue(any(row[0] == 'connect' and row[1]['sourceID'] == 13 for row in calls))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.data = {"fingerprint": "fixture", "devices": [{"name": "owner_mix"},
            {"name": "plug:smartx:CarLifeMedia_CF_48_STEREO"}]}
        self.manager = backend.AudioManager(Path(self.temp.name)/"config.json", lambda: copy.deepcopy(self.data), lambda *args: Sink())

    def test_media_mode_requires_explicit_shared_source_acceptance_and_preserves_overlay(self):
        self.manager.select({"device": "owner_mix", "approvedOverlay": True})
        with self.assertRaises(backend.AudioError):
            self.manager.select_media({})
        result = self.manager.select_media({"acceptSharedMedia": True})
        self.assertFalse(result["approvedOverlay"])
        self.assertEqual(self.manager.load()["previousOverlayRoute"]["device"], "owner_mix")
        self.assertFalse(result["independentVolumeVerified"])
        self.assertEqual(self.manager.route()["channels"], 2)

    def test_no_observed_media_pcm_and_changed_hardware_cannot_produce_a_route(self):
        self.manager.select_media({"acceptSharedMedia": True})
        self.data["fingerprint"] = "other"
        with self.assertRaises(backend.AudioError) as caught:
            self.manager.route()
        self.assertEqual(caught.exception.code, "ROUTE_CHANGED")
        self.data["devices"] = []
        with self.assertRaises(backend.AudioError) as caught:
            self.manager.select_media({"acceptSharedMedia": True})
        self.assertEqual(caught.exception.code, "MEDIA_UNSUPPORTED")

    def test_source_loss_does_not_automatically_reclaim_the_music_source(self):
        self.manager.select_media({"acceptSharedMedia": True})
        self.manager.last_error = {"code": "MEDIA_SOURCE_LOST"}
        with self.assertRaises(backend.AudioError) as caught:
            self.manager.open()
        self.assertEqual(caught.exception.code, "MEDIA_SOURCE_LOST")
        self.assertFalse(self.manager.stream_lock.locked())
        self.manager.select_media({"acceptSharedMedia": True})
        self.assertIsNone(self.manager.last_error)

    def test_managed_output_releases_the_helper_if_pcm_open_fails(self):
        gate = threading.Event()
        class Child:
            stdin = io.StringIO()
            stdout = io.StringIO(json.dumps({"ready": True, "route": {"device": "fixture"}})+"\n")
            def poll(self): return None
            def wait(self, timeout): gate.set(); return 0
        def fail(*args): raise backend.AudioError("ALSA_OPEN_FAILED")
        with self.assertRaises(backend.AudioError) as caught:
            media.ManagedMediaOutput([], fail, spawn=lambda *args, **kwargs: Child())
        self.assertEqual(caught.exception.code, "ALSA_OPEN_FAILED")
        self.assertTrue(gate.is_set())

    def test_stereo_only_media_mode_rejects_multichannel_request_without_opening(self):
        self.manager.select_media({"acceptSharedMedia": True})
        with self.assertRaises(backend.AudioError) as caught:
            self.manager.open(test=True, guard={"stationary":True,"park":True,"engineOff":True,"channels":5})
        self.assertEqual(caught.exception.code, "CONFIG_INVALID")
        self.assertFalse(self.manager.stream_lock.locked())

if __name__ == "__main__": unittest.main()
