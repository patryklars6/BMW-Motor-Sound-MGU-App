import copy
import json
import multiprocessing
from pathlib import Path
import socket
import struct
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import audio_backend as backend
import overlay_bridge as bridge


def stalled_worker(*args):
    time.sleep(10)


class Sink:
    def __init__(self, device, channels):
        self.device = device
        self.channels = channels
        self.supported_channels = [2, 4, 5]
        self.frames = []

    def write(self, data):
        self.frames.append(data)

    def status(self):
        return {'writtenFrames': sum(len(frame) // (self.channels * 2) for frame in self.frames), 'droppedBlocks': 0}

    def close(self):
        pass


class TestAudioBackend(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.observed = {'devices': [{'name': 'owner_mix', 'selectable': True}, {'name': 'smartx:CarPlayMain', 'selectable': False}],
            'fingerprint': 'fixture-firmware-and-devices', 'ram': {'model': None, 'verified': False}}
        self.manager = backend.AudioManager(self.root / 'config.json', lambda: copy.deepcopy(self.observed), Sink)

    def approve(self, channels=2):
        return self.manager.select({'device': 'owner_mix', 'channels': channels, 'approvedOverlay': True})

    def exchange(self, payload):
        host, client = socket.socketpair()
        errors = []
        def run():
            try:
                with host:
                    bridge.serve_connection(host, self.manager)
            except Exception as error:
                errors.append(error)
        thread = threading.Thread(target=run)
        thread.start()
        with client:
            client.settimeout(3)
            client.sendall(payload)
            client.shutdown(socket.SHUT_WR)
            data = bytearray()
            while True:
                block = client.recv(131072)
                if not block:
                    break
                data.extend(block)
        thread.join(3)
        self.assertFalse(thread.is_alive())
        self.assertEqual(errors, [])
        return bytes(data)

    def test_no_alias_or_channel_count_is_assumed(self):
        self.observed['devices'].append({'name': 'luxo_overlay'})
        with self.assertRaises(backend.AudioError) as caught:
            self.manager.route()
        self.assertEqual(caught.exception.code, 'NO_APPROVED_ROUTE')
        report = self.manager.diagnostics(extended=False)
        self.assertIsNone(report['negotiated'])
        self.assertFalse(report['physicalSoundAutomaticallyVerified'])

    def test_oem_and_discard_pc_ms_are_never_auto_claimed(self):
        for name in ['smartx:CarPlayMain', 'default', 'null', 'hw:0,0', '../route', 'dmix']:
            with self.assertRaises(backend.AudioError):
                self.manager.select({'device': name, 'approvedOverlay': True})
        with self.assertRaises(backend.AudioError):
            self.manager.select({'device': 'owner_mix'})

    def test_approved_route_survives_restart_without_inventing_speaker_mapping(self):
        self.approve()
        restarted = backend.AudioManager(self.manager.config, lambda: self.observed, Sink)
        self.assertEqual(restarted.route()['device'], 'owner_mix')
        self.assertFalse(restarted.route()['speakerMappingVerified'])
        self.assertFalse(restarted.route()['independentVolumeVerified'])
        self.assertFalse(restarted.route()['parallelMusicVerified'])

    def test_changed_inventory_invalidates_route_approval(self):
        self.approve()
        self.observed['fingerprint'] = 'changed'
        with self.assertRaises(backend.AudioError) as caught:
            self.manager.open()
        self.assertEqual(caught.exception.code, 'ROUTE_CHANGED')
        self.assertFalse(self.manager.stream_lock.locked())

    def test_unsupported_channel_requests_are_rejected(self):
        for channels in [1, 3, 6, True, '2']:
            with self.assertRaises(backend.AudioError):
                self.approve(channels)

    def test_pcm_reaches_selected_sink_and_control_remains_available(self):
        self.approve(4)
        sink, route = self.manager.open()
        self.assertEqual(sink.channels, 4)
        with patch.object(backend, 'systemd_status', return_value={}), patch.object(backend, 'manager_inventory', return_value={'available': False}):
            answer = self.exchange(b'LUXO/2 {"op":"diagnose"}\n')
        self.assertTrue(json.loads(answer)['data']['serviceStarted'])
        with self.assertRaises(backend.AudioError):
            self.approve()
        self.manager.close(sink)
        self.assertIsNone(self.manager.active)

    def test_test_tones_require_full_stationary_guard(self):
        self.approve()
        for guard in [None, {}, {'stationary': True}, {'stationary': True, 'park': True, 'engineOff': False}]:
            with self.assertRaises(backend.AudioError) as caught:
                self.manager.open(test=True, guard=guard)
            self.assertEqual(caught.exception.code, 'PARK_REQUIRED')

    def test_test_stream_is_clipped_and_never_auto_confirms_speakers(self):
        self.approve()
        sinks = []
        def capture(device, channels):
            result = Sink(device, channels)
            sinks.append(result)
            return result
        self.manager.output_factory = capture
        command = b'LUXO/2 {"op":"test","stationary":true,"park":true,"engineOff":true,"channels":2}\n'
        frame = struct.pack('<h', 32000) * (bridge.FRAMES * 2)
        answer = self.exchange(command + frame)
        self.assertTrue(answer.startswith(b'READY 2\nTEST_DONE '))
        self.assertEqual(max(struct.unpack('<' + 'h' * (len(sinks[0].frames[0]) // 2), sinks[0].frames[0])), 655)
        self.assertFalse(self.manager.route()['speakerMappingVerified'])
        self.manager.confirm({'testId': self.manager.last_test['id'], 'heardAllChannels': True})
        self.assertEqual(self.manager.route()['mappingEvidence'], 'operator-reported channel test')

    def test_test_confirmation_requires_written_audio_and_matching_channels(self):
        self.approve(4)
        with self.assertRaises(backend.AudioError):
            self.manager.confirm({'testId': 'missing', 'heardAllChannels': True})
        self.manager.last_test = {'id': 'test', 'channels': 2, 'writtenFrames': 960, 'at': time.monotonic()}
        with self.assertRaises(backend.AudioError):
            self.manager.confirm({'testId': 'test', 'heardAllChannels': True})

    def test_kernel_uid_is_checked_against_actual_app_registry(self):
        registry = self.root / 'oap/oap_12201/data/apps/patryklars6_motor_sound.json'
        registry.parent.mkdir(parents=True)
        registry.write_text(json.dumps({'userId': 13001}))
        source = self.root / 'oap/oap_13001/source/package.json'
        source.parent.mkdir(parents=True)
        source.write_text(json.dumps({'name': backend.APP_ID}))
        class Peer:
            def __init__(self, uid): self.uid = uid
            def getsockopt(self, *args): return struct.pack('3i', 100, self.uid, 901)
        with patch.object(socket, 'SO_PEERCRED', 17, create=True):
            self.assertTrue(backend.allowed_peer(Peer(13001), registry))
            registry.write_text(json.dumps({'userId': '13001'}))
            self.assertTrue(backend.allowed_peer(Peer(13001), registry))
            self.assertFalse(backend.allowed_peer(Peer(13002), registry))
            source.write_text(json.dumps({'name': 'other_app'}))
            self.assertFalse(backend.allowed_peer(Peer(13001), registry))

    def test_unobserved_usb_path_is_never_written(self):
        with self.assertRaises(backend.AudioError) as caught:
            backend.export_usb({'report': True}, str(self.root), mounts=[])
        self.assertEqual(caught.exception.code, 'NO_USB')

    def test_worker_open_timeout_leaves_no_live_worker(self):
        before = {p.pid for p in multiprocessing.active_children()}
        with self.assertRaises(backend.AudioError) as caught:
            backend.ProcessOutput('fixture', 2, timeout=0.05, worker=stalled_worker)
        self.assertEqual(caught.exception.code, 'ALSA_OPEN_TIMEOUT')
        self.assertEqual({p.pid for p in multiprocessing.active_children()}, before)

    def test_failed_stream_reports_error_and_releases_sink_lock(self):
        self.approve()
        def fail(*args): raise backend.AudioError('ALSA_OPEN_FAILED', 'fixture failure')
        self.manager.output_factory = fail
        self.assertIn(b'ERROR ALSA_OPEN_FAILED', self.exchange(bridge.HELLO))
        self.assertFalse(self.manager.stream_lock.locked())
        self.assertEqual(self.manager.last_error['code'], 'ALSA_OPEN_FAILED')

    def test_partial_alsa_writes_continue_at_the_correct_frame_offset(self):
        class Library:
            def __init__(self): self.requests = []
            def snd_pcm_writei(self, handle, pointer, frames):
                self.requests.append(frames)
                return min(480, frames)
        pcm = object.__new__(bridge.AlsaOutput)
        pcm.lib, pcm.handle, pcm.channels = Library(), None, 2
        self.assertEqual(pcm.write(bytes(960 * 2 * 2)), 960)
        self.assertEqual(pcm.lib.requests, [960, 480])

    def test_alsa_backpressure_never_claims_frames_were_written(self):
        import errno
        class Library:
            def snd_pcm_writei(self, *args): return -errno.EAGAIN
        pcm = object.__new__(bridge.AlsaOutput)
        pcm.lib, pcm.handle, pcm.channels = Library(), None, 2
        self.assertEqual(pcm.write(bytes(960 * 2 * 2)), 0)


if __name__ == '__main__':
    unittest.main()
