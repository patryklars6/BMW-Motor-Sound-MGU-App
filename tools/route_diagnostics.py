"""Read-only route prerequisites. Observations never certify a working speaker path."""
from diagnostic_support import eligible_name
MEDIA_PCMS = ("plug:smartx:CarLifeMedia_CF_48_STEREO", "smartx:CarLifeMedia_CF_48_STEREO")


def route_assessment(config, observed):
    route = config.get("route")
    if route is None or route == {}:
        return {"state": "not-selected", "code": "ROUTE_NOT_SELECTED", "selected": False,
            "approval": "not-applicable", "device": "not-assessed", "speakerOutputVerified": False}
    if not isinstance(route, dict):
        return {"state": "invalid", "code": "CONFIG_INVALID", "selected": False,
            "speakerOutputVerified": False}
    backend = route.get("backend", "alsa-approved-overlay")
    if backend not in ("alsa-approved-overlay", "bmw-media-source"):
        return {"state": "unsupported-backend", "code": "ROUTE_BACKEND_UNSUPPORTED", "selected": True,
            "backend": backend, "speakerOutputVerified": False}
    accepted = route.get("acceptedSharedMedia") is True if backend == "bmw-media-source" else route.get("approvedOverlay") is True
    if not accepted:
        return {"state": "approval-required", "code": "ROUTE_APPROVAL_REQUIRED", "selected": True,
            "backend": backend, "approval": "missing", "device": "not-assessed", "speakerOutputVerified": False}
    if backend == "alsa-approved-overlay" and not eligible_name(route.get("device")):
        return {"state": "unsupported-device", "code": "ROUTE_NOT_SELECTABLE", "selected": True,
            "backend": backend, "approval": "accepted", "device": "unsupported", "speakerOutputVerified": False}
    if observed.get("alsaError"):
        return {"state": "inventory-unavailable", "code": "ROUTE_INVENTORY_UNAVAILABLE", "selected": True,
            "backend": backend, "approval": "accepted", "device": "unknown", "speakerOutputVerified": False}
    names = [row.get("name") for row in observed.get("devices", [])]
    present = any(name in names for name in MEDIA_PCMS) if backend == "bmw-media-source" else route.get("device") in names
    state, code = ("device-observed", None) if present else ("device-not-observed", "ROUTE_MISSING")
    if present and route.get("fingerprint") != observed.get("fingerprint"):
        state, code = "inventory-changed", "ROUTE_CHANGED"
    return {"state": state, "code": code, "selected": True, "backend": backend, "approval": "accepted",
        "device": "observed" if present else "not-observed", "speakerOutputVerified": False}


def _entries(value, field, depth=0):
    if depth > 6:
        return []
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict) and type(row.get(field)) is int]
    if isinstance(value, dict):
        return [row for item in value.values() for row in _entries(item, field, depth + 1)]
    return []


def media_prerequisites(observed, manager):
    devices = [row.get("name") for row in observed.get("devices", [])]
    available = manager.get("available") is True if isinstance(manager, dict) else False
    observations = manager.get("observations", {}) if isinstance(manager, dict) else {}
    sources = [row for row in _entries(observations.get("getListMainSources"), "sourceID") if row.get("name") == "CarLifeMedia"]
    sinks = [row for row in _entries(observations.get("getListMainSinks"), "sinkID") if row.get("name") == "MediaSink_Front"]
    observer = manager.get("routingObserver", {}) if isinstance(manager, dict) else {}
    def readable(reply):
        if isinstance(reply, list):
            return True
        return isinstance(reply, dict) and not reply.get("error") and reply.get("amError", "E_OK") == "E_OK" and any(isinstance(value, list) for value in reply.values())
    sources_read = available and readable(observations.get("getListMainSources"))
    sinks_read = available and readable(observations.get("getListMainSinks"))
    connections_reply = observations.get("getListMainConnections") or {}
    connection_list = connections_reply.get("listConnections") if isinstance(connections_reply, dict) else None
    missing = []
    pcm_state = "unknown" if observed.get("alsaError") else "observed" if any(name in devices for name in MEDIA_PCMS) else "not-observed"
    if pcm_state != "observed":
        missing.append("pcm-inventory-unavailable" if pcm_state == "unknown" else "media-pcm-not-observed")
    if not available:
        missing.append("audio-manager-unavailable-or-not-probed")
    for field, entries, valid in (("source", sources, sources_read), ("sink", sinks, sinks_read)):
        if not available:
            continue
        if not valid:
            missing.append(field + "-list-unavailable")
            continue
        if len(entries) != 1:
            missing.append(field + ("-ambiguous" if entries else "-not-observed"))
    if sources_read and len(sources) == 1:
        availability = sources[0].get("availability")
        if not isinstance(availability, dict) or availability.get("availability") not in ("A_AVAILABLE", "A_UNAVAILABLE"):
            missing.append("source-availability-format-unconfirmed")
        if not isinstance(connection_list, list):
            missing.append("connection-inventory-unavailable")
        elif any(isinstance(row, dict) and row.get("sourceID") == sources[0]["sourceID"] and row.get("connectionState") != "CS_DISCONNECTED" for row in connection_list):
            missing.append("media-source-in-use")
    if observer.get("requiredMethodDeclared") is not True or observer.get("unambiguousInstance") is not True:
        missing.append("routing-observer-not-declared-or-ambiguous")
    return {"state": "requirements-observed" if not missing else "requirements-incomplete",
        "pcmState": pcm_state, "observedPcms": [name for name in MEDIA_PCMS if name in devices],
        "audioManager": "reachable" if available else "unavailable-or-not-probed",
        "sourceState": "not-assessed" if not available else "unavailable" if not sources_read else "observed" if len(sources) == 1 else "ambiguous" if sources else "not-observed",
        "sinkState": "not-assessed" if not available else "unavailable" if not sinks_read else "observed" if len(sinks) == 1 else "ambiguous" if sinks else "not-observed",
        "source": sources[0] if len(sources) == 1 else None,
        "sink": sinks[0] if len(sinks) == 1 else None,
        "routingObserver": observer, "missing": missing, "activationAttempted": False,
        "channels": 2, "parallelMusicSupportedByThisMode": False, "independentBmwVolume": False,
        "speakerOutputVerified": False}
