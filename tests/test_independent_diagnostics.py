import json
from pathlib import Path
import socket
import sys
import threading
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import diagnostics_bridge as bridge
from diagnostic_support import APP_ID, AudioError


class IndependentDiagnosticsTest(unittest.TestCase):
    def exchange(self, value, gather=None, exporter=None):
        host, client = socket.socketpair()
        errors = []
        def run():
            try:
                with host:
                    bridge.serve_connection(host, gather or (lambda extended: {"serviceStarted": False}),
                        lambda: ["/fixture-usb"], exporter or (lambda *args, **kwargs: None))
            except Exception as error:
                errors.append(error)
        thread = threading.Thread(target=run)
        thread.start()
        with client:
            client.settimeout(3)
            client.sendall(bridge.PREFIX + json.dumps(value).encode() + b"\n")
            answer = bytearray()
            while True:
                chunk = client.recv(393216)
                if not chunk: break
                answer.extend(chunk)
        thread.join(3)
        self.assertFalse(thread.is_alive())
        self.assertEqual(errors, [])
        return json.loads(answer)

    def test_export_works_without_any_audio_manager_and_keeps_failure_evidence(self):
        saved = []
        def exporter(report, target, mounts):
            self.assertEqual(target, "/fixture-usb")
            self.assertEqual(mounts, ["/fixture-usb"])
            saved.append(report)
            return "/fixture-usb/LUXO-Diagnose/audio.json"
        reply = self.exchange({"op": "export", "target": "/fixture-usb",
            "report": {"appId": APP_ID, "service": None, "error": {"code": "ENOENT"}}},
            gather=lambda extended: {"independentOfPcmProcess": True}, exporter=exporter)
        self.assertTrue(reply["ok"])
        self.assertEqual(saved[0]["error"]["code"], "ENOENT")
        self.assertTrue(saved[0]["diagnosticsAtExport"]["independentOfPcmProcess"])
        self.assertIsNone(saved[0]["service"])

    def test_independent_endpoint_cannot_open_select_confirm_or_test_pcm(self):
        for op in ["select", "test", "confirm", "connect"]:
            self.assertEqual(self.exchange({"op": op})["error"], "BAD_REQUEST")

    def test_export_rejects_reports_for_another_app(self):
        answer = self.exchange({"op": "export", "report": {"appId": "other"}})
        self.assertEqual(answer["error"], "BAD_REQUEST")

    def test_diagnostic_export_preserves_usb_refusal(self):
        def refuse(*args, **kwargs): raise AudioError("NO_USB")
        reply = self.exchange({"op": "export", "target": "/not-usb",
            "report": {"appId": APP_ID}}, exporter=refuse)
        self.assertEqual(reply["error"], "NO_USB")

    def test_missing_audio_files_and_failed_service_are_observations_not_audio_success(self):
        with patch.object(bridge, "inventory", return_value={"devices": [], "alsaError": {"code": "ALSA_UNAVAILABLE"}}), \
             patch.object(bridge, "systemd_status", return_value={"service": {"ActiveState": "failed"}}), \
             patch.object(bridge, "usb_mounts", return_value=[]), \
             patch.object(bridge, "observed_file", return_value={"exists": False, "errno": 2}), \
             patch.object(bridge, "text_file", return_value=None):
            result = bridge.collect(False)
        self.assertFalse(result["physicalSoundAutomaticallyVerified"])
        self.assertTrue(result["independentOfPcmProcess"])
        self.assertEqual(result["inventory"]["alsaError"]["code"], "ALSA_UNAVAILABLE")
        self.assertEqual(result["audioSystemd"]["service"]["ActiveState"], "failed")
        self.assertNotIn("audioManager", result)


if __name__ == "__main__":
    unittest.main()
