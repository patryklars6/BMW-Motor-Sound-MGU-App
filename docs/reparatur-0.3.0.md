# Reparaturupdate 0.3.0 – Audio und Navigation

Stand: 21. November 2026. Bestehendes Projekt, App-ID `patryklars6_motor_sound`, Dienst `luxo-motor-audio`; beide 0.3.0. Der Nutzer bestätigt echte RPM/Geschwindigkeit in 0.2.2 auf G31 530d xDrive 2018, Retrofit ID7 und MATCH UP 10. Mit 0.3.0 wurde keine Fahrzeughardware erreicht. Deshalb wird kein hörbarer BMW-Sound behauptet.

## Befund und Reparaturen

Der bisher feste ALSA-Name `luxo_overlay` war keine eingerichtete BMW-Route. Eine Gruppenberechtigung `tm_oap_app` wurde vorausgesetzt, ohne die Laufzeit-UID der konkreten App nachzuweisen. Außerdem startete das Dienstpaket beim Update nur den Socket neu, wodurch ein laufender alter Python-Dienst weiterlaufen konnte. Diese Punkte erklären mögliche Fehlerpfade, sind ohne Fahrzeugdiagnose aber keine abschließend bestätigte Ursache am G31.

- **Geräte und Ausgänge:** Neues `tools/audio_backend.py` liest ALSA-PCM-Hints, `/proc/asound/cards`, `/proc/asound/pcm` und Firmwaredaten. Keine automatische Wahl eines beliebigen Standard-/SmartX-/Hardwareausgangs. Ein namentlich sichtbarer, vor Ort separat freigegebener Mischpfad kann gespeichert werden. Geräte-/Firmwarefingerprintänderung sperrt die alte Freigabe.
- **Dienstzugriff:** Root-eigenes Socket-Verzeichnis bleibt geschützt; Socket 0666 erlaubt den Verbindungsaufbau, Befehle werden anschließend anhand Linux-`SO_PEERCRED` auf root bzw. die in der Store-Registry bestätigte App-UID beschränkt. Registry-`userId` und tatsächliches App-Paket werden abgeglichen. Gruppenmitgliedschaft wird nicht mehr vorausgesetzt. Kernel-/Registry-Abgleich ist am konkreten Store noch zu prüfen.
- **ALSA:** Separater Prozess öffnet die freigegebene Route nichtblockierend, prüft angebotene 2/4/5-Kanalformate bei S16LE/48 kHz und meldet erst nach erfolgreichem Setzen READY. Öffnungsversuch maximal vier Sekunden; begrenzte Queue verwirft überzählige Blöcke. Teilweise Writes verwenden korrekte Offsets, EAGAIN wird nicht als übertragener Frame gezählt. Worker wird bei Blockade beendet. Keine OEM-Medienquelle wird dafür aktiviert.
- **Diagnose:** App und nativer Menübereich zeigen Version, Start/Socket/UID, reale Geräte, Freigabe, ALSA-Annahme, Engine-/Transportzähler und konkrete Fehler. Motor-/Profilfreigabe trennt fehlenden Fahrmodus, Stumm-/Nullpegel und fehlende RPM vom Audiopfadfehler. Teure systemd-/AudioManager-Abfragen laufen bei expliziter Diagnose; die grafische Statusseite aktualisiert leichte Werte automatisch.
- **Lesender Audiokatalog:** Neues `tools/audio_probe.js` liest den real vorhandenen SOME/IP-Katalog und fragt nur `getListMainSources`, `getListMainSinks`, `getListMainConnections` ab. Keine Connect-, Routing-, Verfügbarkeits- oder Lautstärkebefehle. Fehlende Interfaces, Zeitüberschreitungen und einzelne Getterfehler bleiben als Ergebnis erhalten.
- **Tests und Berichte:** Leiser, pro Kanal sequenzieller Test nur bei echten Daten Motor aus / P / 0 km/h und freigegebenem Ausgang. Server begrenzt Test-Peak auf 2 %. Erst explizite Bestätigung nach tatsächlich gehörten Kanälen setzt `speakerMappingVerified`, Evidenz `operator-reported channel test`. JSON lokal in App-Daten, optional auf tatsächlich eingebundenen beschreibbaren USB-Datenträger. Export folgt keinen Symlinks, überschreibt keine Datei und formatiert nichts.
- **Navigation:** Gemeinsame Zurück-/Hauptmenü-/BMW-Menü-Ziele auf jeder Grafikunterseite; Verlauf merkt Seite, Gruppe, Zeile, Profil und Effekt. Grafik-Back-Ereignisse und native Back-/Home-Buttons verwenden denselben Verlauf. Gepinnte Renderer-Back-Behandlung wurde über den vorhandenen Runtime-Patch angebunden. Verlust des Renderers führt ins native Menü zurück. Tatsächliche BMW-Hardware-Ereignisse bleiben Fahrzeugtest.
- **Update:** Manifest aktiviert den Socket weiterhin über `{unit,target}` und startet beim Update **Socket und Service** neu. Abhängigkeit in App und `mgu-repo.json` verlangt Audio-Dienst 0.3.0. Settings-Schema unverändert; kein Ersatz für bestehende `settings.json`. Historische Pakete und Screenshots bleiben erhalten.

## Audio-Recherche und tatsächliche Grenzen

Die öffentliche [MGU-Audioanalyse von Vizualyse/idrive-apps](https://github.com/Vizualyse/idrive-apps/blob/9766d42b9c1250c7e78461ea070194fcd2ec6461/knowledge/sound.md) beschreibt reale Tests auf Firmware I_21w12.2-1-4: Der funktionierende `OAPGenericMedia`-Medienpfad ersetzt Radio und folgt dem BMW-Pegel. SmartX-Quellen benötigen passende Source-/Routing-Zustände; ein bloß geöffnetes PCM erzeugt keinen gültigen Fahrzeugpfad. Eine CarLife-Route wurde dort nur im Emulator geprüft. Daraus lässt sich keine funktionierende parallele, unabhängige Overlay-Route auf dem Nutzerfahrzeug ableiten. Deshalb wird keine solche Route automatisch aktiviert und auch `luxo_overlay` nicht erzeugt.

Die Umsetzung verwendet die dokumentierten [ALSA-PCM-Funktionen](https://www.alsa-project.org/alsa-doc/alsa-lib/pcm.html) für nichtblockierendes Öffnen, Format-/Kanalprüfung und tatsächliche Write-Rückgaben. **ALSA unterstützt ein Format** bedeutet nicht **BMW verteilt dieses Format auf die gewünschten Lautsprecher**. RAM-Modell und Verstärker werden mangels nachgewiesener Geräteidentifikation als unbekannt geführt; die Soundsystem-Presets bleiben wirksame App-Abstimmungen, keine Hardwareerkennung.

Separate App-/Effektpegel und deren Begrenzung verändern die erzeugten Samples tatsächlich. Ob ein nachgeschalteter BMW-Mixer Radio und Motorsound gemeinsam regelt, kann nur über den realen Signalweg bzw. Hörtest geprüft werden. `parallelMusicVerified` und `independentVolumeVerified` bleiben bewusst false. Keine automatische Kanal-/Klangbestätigung, kein CarPlay-Claim, keine Steuergeräteänderung.

## Durchgeführte Prüfungen

**45 Node-Tests + 19 Python-Tests + zehn unveränderte Store-/Deployer-Prüfungen = 74 automatisierte Tests**, zusätzlich App-Archivvalidierung. Host: Windows, Node.js 24.22.3. Testdaten existieren ausschließlich in Tests, nicht als App-Livewerte.

| Bereich | Geprüfter Umfang |
| --- | --- |
| Native/Grafik-Bedienung | Native Profile, Regler, Pagination, Themes; Grafik-Touchziele aller Bereiche; alle vier Effektseiten; wiederholte Zurück-/Home-/BMW-Menü-Wechsel; simulierte BMW-Back-Ereignisse; Renderer-Ausfall. |
| Anzeige | Tatsächlich gepatchte Display-Klasse bei 1280×480, 1440×540 und 1920×720; Zielkoordinaten und Controller-Press; Diagnosepagination ohne übersprungene Zeilen bei mehreren Höhen. |
| Fahrzeugadapter | Getter/Subscriptions, Skalierungen, ungültige/veraltete Signale, Providerverlust, unbekannter Fahrmodus, keine erfundenen sichtbaren RPM. |
| Sound und Speicher | Sechs Stimmen, Einzelpegel/Schalter, Turbo-Varianten/Gaswegnahme, Pop-Häufigkeit, Bass, Balance/Fader, optionale fünfte PCM-Spur, Mute/Limit/fehlende Signale; alte Settings bleiben erhalten. |
| Audio-Dienst | Freigabe/Persistenz, Inventarwechsel, unbekannter Pfad, UID-Registry, Kanalformat, konkurrierende Steuerverbindungen, begrenzter Worker, Öffnungs-Timeout ohne verwaisten Prozess, Partial-Write/EAGAIN. |
| Ende-zu-Ende-Hostpfad | Reale JS-Synthese → App-PcmOutput → echtes Python-Bridge-Protokoll und Manager → injizierte Host-Testsenke mit positiven Frames/Peak. Keine ALSA-Hardware und kein BMW-Lautsprecher. |
| Diagnose/Test | Fragmentierte RPC-Antwort, konkreter PEER_DENIED, JSON-Bericht mit unbekannter Hardware, lesender Getter-Whitelist, Stoppen bei Bewegung, Test-Peaklimit, manuelle Bestätigung nur mit passendem vorherigen Test. Nicht beobachteter USB-Mount wird abgewiesen. |
| Echter Store/Deployer | Katalog/Abhängigkeiten 0.3.0, beide Pakete, tatsächliche Dateien/Hashes/Units/Enable/Restart, altes 0.2.1-Enable reproduzierbar abgewiesen, manipulierte Nutzdatei/fehlende Unit/fehlendes Target abgewiesen. |

Verwendet: [robertnisipeanu/mgu-store Commit d878bed5ce5848d0c1ce852be23fac539e434a0b](https://github.com/robertnisipeanu/mgu-store/tree/d878bed5ce5848d0c1ce852be23fac539e434a0b). Vier unveränderte Quelldateien werden durch Git-Blob-Hashes abgesichert. Der echte Store-Packer baut das Tool; Deployer 0.8.27 akzeptiert `check --artifact` mit Exitcode 0 sowie seine echte Funktion `preflightApp`. Hardwarepfade zeigen auf einen isolierten Testroot. Ausgabe/Prozessende/Host-Umask werden abgefangen, Validierungscode bleibt unverändert. App-Archivvalidierung ist kein MainApp-/SDK-Installationslauf.

[Maschinenlesbare Ergebnisse](validation/store-preflight-0.3.0.json) · [Echte Deployer-Ausgabe mit gekürzten Hostpfaden](validation/mgu-deploy-0.3.0-check.log) · [Neue Softwareaufnahmen](../README.md#menübilder--version-030--luxo)

## Verbleibende Fahrzeugprüfung

Vollständiger Store-Updatevorgang, systemd-/Python-Multiprocessing unter der MGU-Linux-Laufzeit, Registry-/Socketzugriff, native SOME/IP-Bibliothek auf der verbauten Firmware, echte ALSA-Inventarisierung und Hardwareformate, hörbare Lautsprecher und physische Zuordnung, tatsächlicher USB-Schreibvorgang, originale BMW-Zurücktaste/native Untermenüs, Touch/Controller-Fokus, Bildrate, Hintergrund/Aufwachen sowie Medienparallelität und akustische Lautstärkeunabhängigkeit. [Ausführlicher Fahrzeugtestplan](fahrzeugtest.md)

Dieses Update liefert bei fehlender unterstützter Fahrzeugroute die verlangte Diagnose statt eines erfundenen Audioerfolgs. Für die nächste konkrete Routenreparatur wird der reale JSON-Bericht vom Fahrzeug benötigt.

## Geänderte Dateien

[Vollständige Dateiliste dieses Updates](validation/changed-files-0.3.0.txt)

| Dateien | Änderung |
| --- | --- |
| `apps/patryklars6_motor_sound/main.js`, `navigation.js`, `home.js`, `native-menu.js` | Seitenverlauf, Rückwege, native Rückfallebene, Hilfe und Diagnosezugang. |
| `apps/patryklars6_motor_sound/audio-diagnostics.js`, `output.js`, `tuning-view.js` | Diagnose, Export, Test, konkrete Socketfehler und ehrliche PCM-/Lautsprecherstatus. |
| `tools/audio_backend.py`, `audio_probe.js`, `overlay_bridge.py` | Tatsächliches Geräteinventar, Freigaben, UID-Abgleich, begrenzte Ausgabeprozesse, ALSA-Status und lesender AudioManager. |
| `tools/systemd/*`, `tools/component.json` | Socketzugriff mit Peer-Authentifizierung, vollständiger Nutzdateiumfang, Socket-/Service-Neustart. |
| `tools/patch_runtime.py`, `tools/render_screenshots.cjs` | Renderer-Back-Anbindung, tatsächliche neue Paketaufnahmen. |
| `app.json`, `mgu-repo.json` | Version 0.3.0, passende Abhängigkeit, native Zurück-/Home-/Diagnosebuttons; Settings bleiben identisch. |
| `tests/*` laut Dateiliste | Navigation, Diagnose, PCM-Testsenke, ALSA-Rückgaben, Zugriff, Speicherung und echte Store-Vorprüfung. |
| `README.md`, `docs/*.md`, `docs/validation/*`, `docs/screenshots/0.3.0/*` | Deutsche Anleitung, technische Quellen, ehrliche Testgrenzen und 19 Menüaufnahmen. |
| `packages/*@0.3.0.tgz` | Neu gebaute App und Audio-Dienst. |
