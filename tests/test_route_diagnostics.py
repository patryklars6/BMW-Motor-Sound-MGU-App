import copy
import errno
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from route_diagnostics import route_assessment, media_prerequisites, MEDIA_PCMS
import diagnostic_support as support
from audio_backend import AudioManager, AudioError

class RouteDiagnosisTest(unittest.TestCase):
    def setUp(self):
        self.observed = {"devices": [{"name": "confirmed_mix"}, {"name": MEDIA_PCMS[0]}], "fingerprint": "current", "alsaError": None}
        self.route = {"backend": "alsa-approved-overlay", "device": "confirmed_mix", "approvedOverlay": True,
            "channels": 2, "fingerprint": "current"}

    def test_selection_approval_and_missing_device_are_different_without_opening_any_pcm(self):
        self.assertEqual(route_assessment({}, self.observed)["code"], "ROUTE_NOT_SELECTED")
        unapproved = dict(self.route, approvedOverlay=False)
        self.assertEqual(route_assessment({"route": unapproved}, self.observed)["code"], "ROUTE_APPROVAL_REQUIRED")
        missing = dict(self.route, device="absent")
        self.assertEqual(route_assessment({"route": missing}, self.observed)["code"], "ROUTE_MISSING")
        good = route_assessment({"route": self.route}, self.observed)
        self.assertEqual(good["state"], "device-observed")
        self.assertFalse(good["speakerOutputVerified"])

    def test_inventory_failure_is_not_evidence_that_selected_hardware_is_absent(self):
        self.observed["alsaError"] = {"code": "ALSA_UNAVAILABLE"}
        self.observed["devices"] = []
        value = route_assessment({"route": self.route}, self.observed)
        self.assertEqual(value["code"], "ROUTE_INVENTORY_UNAVAILABLE")
        self.assertEqual(value["device"], "unknown")

    def test_unsupported_backend_and_oem_pcm_are_never_approved_by_the_diagnosis(self):
        self.assertEqual(route_assessment({"route": dict(self.route, backend="unknown")}, self.observed)["code"], "ROUTE_BACKEND_UNSUPPORTED")
        oem = dict(self.route, device=MEDIA_PCMS[0])
        self.assertEqual(route_assessment({"route": oem}, self.observed)["code"], "ROUTE_NOT_SELECTABLE")

    def test_null_legacy_route_can_be_selected_as_media_instead_of_crashing_the_service(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory)/"config.json"
            config.write_text('{"route":null}', encoding="utf-8")
            manager = AudioManager(config, lambda: copy.deepcopy(self.observed),
                lambda *args: self.fail("A configuration change must not open PCM"))
            result = manager.select_media({"acceptSharedMedia": True})
            self.assertEqual(result["backend"], "bmw-media-source")

    def test_invalid_config_remains_invalid_in_the_saved_diagnostic_classification(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory)/"config.json"
            config.write_text('[]', encoding="utf-8")
            manager = AudioManager(config, lambda: self.observed)
            report = manager.diagnostics(False)
            self.assertEqual(report["routeError"]["code"], "CONFIG_INVALID")
            self.assertEqual(report["routeAssessment"]["code"], "CONFIG_INVALID")

    def complete_manager(self):
        return {"available": True, "routingObserver": {"requiredMethodDeclared": True, "unambiguousInstance": True},
            "observations": {
                "getListMainSources": {"listSources": [{"sourceID": 22, "name": "CarLifeMedia", "availability": {"availability": "A_UNAVAILABLE"}}]},
                "getListMainSinks": {"listSinks": [{"sinkID": 33, "name": "MediaSink_Front"}]},
                "getListMainConnections": {"listConnections": []}}}

    def test_read_only_requirements_never_claim_a_connected_or_audible_output(self):
        report = media_prerequisites(self.observed, self.complete_manager())
        self.assertEqual(report["state"], "requirements-observed")
        self.assertFalse(report["activationAttempted"])
        self.assertFalse(report["speakerOutputVerified"])
        self.assertFalse(report["independentBmwVolume"])

    def test_failed_getter_and_busy_source_are_visible_not_treated_as_missing_hardware(self):
        manager = self.complete_manager()
        manager["observations"]["getListMainSources"] = {"error": "timeout"}
        report = media_prerequisites(self.observed, manager)
        self.assertEqual(report["sourceState"], "unavailable")
        self.assertNotIn("source-not-observed", report["missing"])
        manager = self.complete_manager()
        manager["observations"]["getListMainConnections"]["listConnections"] = [{"sourceID":22,"mainConnectionID":55,"connectionState":"CS_CONNECTED"}]
        self.assertIn("media-source-in-use", media_prerequisites(self.observed, manager)["missing"])

    def test_enoent_reports_the_exact_missing_filename_and_unit_state(self):
        missing = support.DIAGNOSTIC_SOCKET
        def stat_path(name):
            raise FileNotFoundError(errno.ENOENT, "missing", name)
        with patch.object(support.os, "lstat", side_effect=stat_path), \
             patch.object(support, "systemd_status", return_value={"socket":{"LoadState":"loaded","ActiveState":"inactive"}}):
            report = support.diagnostic_endpoint_health()
        self.assertEqual(report["expectedSocketPath"], missing)
        self.assertEqual(report["observedFiles"][missing]["errorPath"], missing)
        self.assertEqual(report["state"], "socket-unit-not-active")

    def test_recovery_manager_report_lists_only_own_services_and_does_not_claim_boot_reload(self):
        raw = '[Whitelist]\nforeign_service\nluxo-motor-audio # own\nluxo-motor-diagnostics\n[WhitelistExitSuccess]\nluxo-motor-audio\n'
        with patch.object(support, 'text_file', return_value=raw):
            report = support.diagnostic_registration()
        self.assertEqual(report['ownEntries']['luxo-motor-audio'], ['Whitelist', 'WhitelistExitSuccess'])
        self.assertEqual(report['ownEntries']['luxo-motor-diagnostics'], ['Whitelist'])
        self.assertNotIn('foreign_service', str(report))
        self.assertFalse(report['loadedAtBootVerified'])

if __name__ == "__main__": unittest.main()
