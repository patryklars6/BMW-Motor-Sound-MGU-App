# BMW Motor Sound MGU App

## Reparaturupdate 0.3.0 · 21. November 2026

**Bestehende App aktualisieren: Quelle `patryklars6/BMW-Motor-Sound-MGU-App`, Branch `codex/luxo-sound-tuning-020`.** App und Audio-Dienst tragen Version **0.3.0**. [Pull Request #1](https://github.com/patryklars6/BMW-Motor-Sound-MGU-App/pull/1) · [Technischer Reparaturbericht](docs/reparatur-0.3.0.md)

Dieses Update repariert die Rücknavigation und ergänzt eine echte Audio-Diagnose mit Geräteinventar, konkreten Verbindungsfehlern, Kanaltests und JSON-Berichten. Der Audio-Dienst setzt **keinen bereits vorhandenen Pfad `luxo_overlay`** mehr voraus. Die App-ID `patryklars6_motor_sound`, alle sechs Soundprofile, vier Themes und bisherigen Einstellungen bleiben erhalten.

**Fahrzeugstand:** Der Nutzer bestätigt echte Drehzahl und Geschwindigkeit in 0.2.2 auf einem BMW G31 530d xDrive (2018), nachgerüstete MGU ID7, MATCH UP 10. Dort blieb die Audioausgabe stumm. **Hörbarer Motorsound mit 0.3.0, physische Lautsprecherkanäle sowie parallele Musik und unabhängige BMW-Lautstärke sind noch nicht am Fahrzeug bestätigt.** PCM-Erzeugung und erfolgreiche ALSA-Schreibvorgänge gelten ausdrücklich nicht als Lautsprechernachweis.

**Getestet auf dem Entwicklungsrechner:** 45 Node-Tests, 19 Python-Tests, App-Paketvalidierung und zehn Prüfungen mit unverändertem Code des tatsächlichen MGU Stores und Deployers. [Prüfergebnisse](docs/validation/store-preflight-0.3.0.json)

## Installation und Update über den MGU Store

Voraussetzung ist der Community-Store [robertnisipeanu/mgu-store](https://github.com/robertnisipeanu/mgu-store), nicht der offizielle BMW ConnectedDrive Store. Die App ist für **iDrive 7** deklariert. Eine allgemeine Freigabe sämtlicher MGU-Firmwarestände besteht nicht. Der Store muss Repository-Quellen, Python-App-Builds und Tool-Abhängigkeiten unterstützen; der Dienst benötigt `mgu-python >= 1.0.2`. [Tatsächliche Store-Paketspezifikation](https://github.com/robertnisipeanu/mgu-store/blob/d878bed5ce5848d0c1ce852be23fac539e434a0b/docs/PUBLISHING.md)

1. Im BMW den **MGU Store** öffnen und die vorhandene Quelle `patryklars6/BMW-Motor-Sound-MGU-App` aktualisieren. Falls die Quelle noch fehlt: **Einstellungen → Quelle hinzufügen / Settings → Add source**, Repository-Namen eintragen.
2. Den Branch **`codex/luxo-sound-tuning-020`** auswählen. Auf `main` liegt die aktuelle Anleitung; der beauftragte App-Code liegt im Entwicklungsbranch.
3. Bei **LUXO Motor Sound** die angebotene Version **0.3.0** prüfen und **Aktualisieren** wählen. Nur bei bisher fehlgeschlagener Erstinstallation **Installieren** wählen. Eine Deinstallation ist nicht vorgesehen.
4. Der Store muss den **Audio-Dienst `luxo-motor-audio` 0.3.0 oder neuer** als Abhängigkeit mitnehmen. Falls ausstehende Dienste gemeldet werden, den Store-Hinweis zum nächsten regulären Head-Unit-Start beachten. Keine erzwungenen Neustarts während der Fahrt.
5. Die App öffnen. Sie startet im **nativen BMW-Menü**. Unter **Audio-Diagnose** Dienstversion, Erreichbarkeit, Socket und Fehler prüfen. Die Diagnose läuft auch nach dem App-Start automatisch.
6. Bei verfügbarem kompatiblem `mgu-render/1` mit Touch-Routing **LUXO-Oberfläche** öffnen. Jede grafische Unterseite besitzt **Zurück**, **Hauptmenü** und **BMW-Menü**. Bei Renderer-Ausfall steht das native Menü als Rückfallebene bereit.

Die bisherigen Einstellungen bleiben in `data/settings.json` der App. Das Update liefert keine Ersatzdatei aus. Einstellungs-Schema und App-ID sind gegenüber 0.2.1 unverändert. Automatisierte Persistenztests bestehen; der vollständige Store-Updatevorgang auf deiner Head Unit steht noch aus.

[App-Paket 0.3.0](https://github.com/patryklars6/BMW-Motor-Sound-MGU-App/blob/codex/luxo-sound-tuning-020/packages/patryklars6_motor_sound@0.3.0.tgz) · [Audio-Dienst 0.3.0](https://github.com/patryklars6/BMW-Motor-Sound-MGU-App/blob/codex/luxo-sound-tuning-020/packages/luxo-motor-audio@0.3.0.tgz)

## Audio-Diagnose und erster Fahrzeugtest

1. **Audio-Diagnose → Diagnose aktualisieren** wählen. Das Menü zeigt Installation, Dienststart/Erreichbarkeit, Socket, PCM-Engine, Motor-/Profilfreigabe, Geräte, Kanalformat und Ausgabehindernis. Längere Listen über **Weitere Einträge** durchblättern.
2. **Diagnosebericht speichern** legt `diagnostics/audio-report.json` im vorhandenen App-Datenverzeichnis ab. Er enthält reale Messwerte oder ausdrücklich fehlende Daten, Softwarestände, Geräte, systemd-Ergebnisse und lesend abgefragte AudioManager-Informationen.
3. Optional **Diagnosebericht auf USB exportieren** wählen. Nur ein vom Linux-System bereits eingebundener, beschreibbarer USB-Datenträger wird angeboten. Die Datei liegt danach unter `LUXO-Diagnose/audio-…json`. Es wird nichts formatiert. Falls kein Mount oder kein erreichbarer Dienst vorliegt, ist USB-Export nicht verfügbar. Lokales Speichern bleibt möglich. USB-Schreiben auf einer MGU ist noch ungetestet.
4. **Audiogeräte anzeigen / auswählen** zeigt tatsächlich von ALSA gemeldete PCMs. Sichtbarkeit beweist keine Verbindung zu RAM oder Lautsprechern. RAM-Modell und Verstärker werden ohne belegbare Daten als unbekannt geführt; deine Soundsystemauswahl ist eine Benutzervorgabe.
5. Einen Ausgang **nur dann freigeben**, wenn vor Ort bereits belegt ist, dass er ein zulässiger separater Mischpfad ist. Das Bestätigen einer Menüzeile stellt diese Route nicht her. Generische Standardgeräte, direkte Hardware-PCMs und SmartX-OEM-Quellen werden nicht automatisch als Overlay geöffnet. Ist kein geeigneter Ausgang vorhanden: Bericht exportieren. Die App richtet keine unbelegte BMW-Route ein.
6. Bei bestätigter Route den Wagen abstellen: **Motor aus, gemessene Geschwindigkeit 0, Wählhebel P**. Unbekannte Werte sperren den Test. **Leisen Stereo-Test** wählen; ein Mehrkanaltest ist nur bei entsprechend ausgewähltem Format möglich. Die App erzeugt etwa 1,5 % PCM-Peak, der Dienst begrenzt Testdaten zusätzlich auf 2 %. Das ist keine Messung der akustischen Lautstärke.
7. Auf die angezeigte Kanalfolge achten. Der Test stoppt bei geänderten/fehlenden Fahrzeugwerten, beim Verlassen der Grafik oder über **Audiotest stoppen**. **Gehörte Kanalzuordnung bestätigen** nur wählen, wenn jeder ausgegebene Kanal tatsächlich aus dem angezeigten Lautsprecherbereich gehört wurde. Die Bestätigung wird als Benutzerbeobachtung gespeichert, niemals aus erfolgreichen Schreibvorgängen abgeleitet.

Ohne freigegebenen Ausgang bleiben die Soundregler mit der PCM-Engine verbunden, die Fahrzeugausgabe bleibt gesperrt. App-Pegel und Einzelpegel verändern die eigenen Audiodaten. Eine von Radio/CarPlay unabhängige Lautstärke hinter dem BMW-Mixer wird damit **nicht** nachgewiesen. Öffentliche MGU-Tests zeigen einen Medienpfad, der Radio ersetzt und dem BMW-Pegel folgt; eine universelle parallele Overlay-Route ist nicht belegt. [Quellen, Architektur und Grenzen](docs/reparatur-0.3.0.md#audio-recherche-und-tatsächliche-grenzen)

## Menübilder · Version 0.3.0 · LUXO

Alle 19 Aufnahmen stammen aus dem gebauten **Paket 0.3.0**, durchlaufen dessen wirkliche Zeichenfunktionen und verwenden dasselbe **LUXO**-Theme: Dunkelgrau, Weiß und Violett. Sie sind Softwareaufnahmen ohne Fahrzeugverbindung; echte Live-Werte bleiben deshalb **Nicht verfügbar**. MATCH UP 10 ist als Benutzereinstellung ausgewählt. Die Diagnose zeigt den tatsächlich fehlenden Dienst auf dem Entwicklungsrechner, keine erfundene Fahrzeugverbindung. [Aufnahmeprotokoll und Bildprüfsummen](docs/screenshots/0.3.0/capture.json)

Die optionale Grafik benötigt einen kompatiblen Renderer. Die native BMW-Menüdarstellung hängt von der Head Unit ab; ein Foto davon im Fahrzeug steht aus.

### Hauptmenü

![Hauptmenü · 0.3.0 · LUXO](docs/screenshots/0.3.0/hauptmenue.png)


### Live-Daten

![Live-Daten · 0.3.0 · LUXO](docs/screenshots/0.3.0/live-daten.png)


### Soundprofile

![Soundprofile · 0.3.0 · LUXO](docs/screenshots/0.3.0/soundprofile.png)


### Sound-Tuning

![Sound-Tuning · 0.3.0 · LUXO](docs/screenshots/0.3.0/sound-tuning.png)


### Motor-Einstellungen

![Motor-Einstellungen · 0.3.0 · LUXO](docs/screenshots/0.3.0/motor-einstellungen.png)


### Turbo-Einstellungen

![Turbo-Einstellungen · 0.3.0 · LUXO](docs/screenshots/0.3.0/turbo-einstellungen.png)


### Turbo-Varianten

![Turbo-Varianten · 0.3.0 · LUXO](docs/screenshots/0.3.0/turbo-varianten.png)


### Auspuff-Einstellungen

![Auspuff-Einstellungen · 0.3.0 · LUXO](docs/screenshots/0.3.0/auspuff-einstellungen.png)


### Künstliche Pop & Bangs

![Künstliche Pop & Bangs · 0.3.0 · LUXO](docs/screenshots/0.3.0/pop-bangs.png)


### Lautsprecher

![Lautsprecher · 0.3.0 · LUXO](docs/screenshots/0.3.0/lautsprecher.png)


### Fahrmodi

![Fahrmodi · 0.3.0 · LUXO](docs/screenshots/0.3.0/fahrmodi.png)


### Allgemeine Einstellungen

![Allgemeine Einstellungen · 0.3.0 · LUXO](docs/screenshots/0.3.0/einstellungen.png)


### Design

![Design · 0.3.0 · LUXO](docs/screenshots/0.3.0/design.png)


### Info und Hilfe

![Info und Hilfe · 0.3.0 · LUXO](docs/screenshots/0.3.0/info.png)


### Audio-Diagnose: Dienst und Socket

![Audio-Diagnose: Dienst und Socket · 0.3.0 · LUXO](docs/screenshots/0.3.0/audio-diagnose.png)


### Audio-Diagnose: Pfad und Geräte

![Audio-Diagnose: Pfad und Geräte · 0.3.0 · LUXO](docs/screenshots/0.3.0/audio-geraete.png)


### Audio-Diagnose: Kanalformat und Grenzen

![Audio-Diagnose: Kanalformat und Grenzen · 0.3.0 · LUXO](docs/screenshots/0.3.0/audio-tests.png)


### Audio-Diagnose: gesperrte Tests und Bestätigung

![Audio-Diagnose: gesperrte Tests und Bestätigung · 0.3.0 · LUXO](docs/screenshots/0.3.0/audio-export.png)


### Audio-Diagnose: Bericht und Fehler

![Audio-Diagnose: Bericht und Fehler · 0.3.0 · LUXO](docs/screenshots/0.3.0/audio-fehler.png)

## Soundprofile und Regler

**V6 Sound**, **V8 Sound**, **BMW M5 F90**, **BMW M Sound**, **Sport Diesel** und **Individual** besitzen jeweils eigene Einstellungen. Öffne **Tuning** auf der Profilseite oder im Hauptmenü **Individual**. Die Karten **Motor**, **Turbo**, **Auspuff** und **Pop & Bangs** führen zu den jeweiligen Reglern. In den allgemeinen Einstellungen findest du alle Werte auch in der Kategorie des Profils. Bei **Individual** lässt sich zusätzlich der Grundklang wählen. Die App erzeugt die Klänge selbst.

| Regler | Wirkung |
| --- | --- |
| Motorsound, Turbosound, Auspuffklang | Schaltet die jeweilige Klangschicht ein oder aus. |
| Motor, Turbo, Auspuff | Stellt die Intensität der jeweiligen Schicht ein. |
| Lautstärke Motor, Turbo, Auspuff | Regelt den eigenen Pegel jeder Schicht unabhängig vom App-Gesamtpegel. |
| Bass und Klangtiefe | Aktiviert den Tieftonanteil und regelt dessen Stärke und Gewichtung im Motor-Klang. |
| Klangcharakter | Wählt Profiltypisch, Tief, Ausgewogen, Sportlich oder M Performance. Die Auswahl verändert Obertöne, Bass und Klangstruktur. |
| Turbo-Klang und Turbo-Pfeifen | Wählt Dezent, Klassisch, Hell oder Twin-Scroll. Für Beschleunigung und Gaswegnahme gibt es separate Schalter und Intensitäten. |
| Pop & Bangs | Spielt bei passender Drehzahl und erfasster Gaswegnahme kurze synthetische Impulse. Intensität und Häufigkeit lassen sich separat ändern. Die Funktion ist anfangs ausgeschaltet. |
| Pegel und Pegelgrenze | Bestimmt die Lautstärke der Motorsound-App und begrenzt ihren maximalen Ausgangspegel. |
| Profil-Balance und Profil-Fader | Verteilt die Klangschichten links/rechts und bei geeignetem Mehrkanal-Mischpfad vorn/hinten. `Lautsprechereinstellung` übernimmt die Vorgabe des Systems. |

Änderungen werden automatisch gespeichert. **Reset** im Hauptmenü setzt die Werte des dort angezeigten Klangprofils auf seine Vorgaben zurück. Die Wahl des Lautsprechersystems und das Design bleiben erhalten.

## Lautsprecher und Fahrmodi

Das Lautsprechermenü bietet angepasste Ausgangspegel und Basswerte. Bei **Sonstiges / Aftermarket** kannst du hintere Lautsprecher, Pegel und Bass selbst angeben. Die Auswahl wird gespeichert. Unter **Tuning** hat jeder Effekt eigene Balance-, Fader- und Verteilungspegel. Negative Balancewerte verschieben nach links, positive nach rechts. Ein negativer Faderwert verschiebt nach vorn, ein positiver nach hinten. Die Voreinstellung platziert Motor vorn, Turbo vorn rechts und Auspuff sowie Pop & Bangs hinten. Center-Anteil ist nur bei einem Fünfkanal-Mischpfad einstellbar. Stereo überträgt nur links/rechts. Die Anzeige nennt die angenommenen PCM-Kanäle. Erst ein tatsächlich gehörter Kanaltest kann deren physische Zuordnung bestätigen. Die Wahl MATCH UP 10 erkennt weder den Verstärker automatisch noch schaltet sie RAM-Kanäle frei.

Der App-Pegel und seine Obergrenze gelten ausschließlich für den PCM-Strom der App. Der große Schalter im Hauptmenü schaltet ihn sofort stumm. Profilwechsel und Pegelanpassungen werden geglättet. Ob Radio, Bluetooth oder CarPlay parallel laufen und ob der BMW-Lautstärkeregler hinter dem Mischpfad beide Quellen beeinflusst, hängt von der tatsächlichen Audioarchitektur ab. [Fahrzeugtest und Mischpfad](docs/fahrzeugtest.md)

Aktiviere unter **Fahrmodus** die Automatik und wähle pro Modus ein Profil für **ECO PRO**, **COMFORT**, **SPORT**, **SPORT PLUS** und **INDIVIDUAL**. Die Zuordnung folgt dem gemeldeten BMW-Modus. Einzelne Individual-Varianten verwenden dieselbe Individual-Zuordnung. Du kannst die Automatik im Hauptmenü abschalten oder ein Profil direkt auswählen.

## Design und Dashboard

Unter **Design** wählst du **LUXO**, **M-Performance**, **Orange Sport** oder **Ice White**. Orange Sport entspricht der orangefarbenen Hauptmenü-Vorlage. Die Auswahl gilt für Hauptmenü, Live-Daten, Profile, Einstellungen und Hilfe und wird gespeichert. Ebenfalls dort kannst du die Beschleunigung im Dashboard ausblenden.

Die Drehzahlzahl zeigt den letzten real empfangenen, gerundeten Messwert. Nur der Drehzahlbogen wird zwischen empfangenen Messpunkten animiert. Mit einem kompatiblen GPU-Renderer kann die Darstellung bis zu 60 Bilder pro Sekunde erreichen. Die BMW-Menüzeilen aktualisieren sich etwa alle halbe Sekunde. Die Messrate hängt von der Head Unit ab.

## Bedienung und Fehlerbehebung

Im nativen BMW-Menü eine Zeile per Touch oder Controller öffnen, bei Reglern anschließend den Wert wählen. **Weitere Einträge / Vorherige Seite** blättert. **Zurück / Hauptmenü** führt zurück. In der Grafik verwenden Touch-Ziele und Controller denselben Seitenzustand. Die neue Kopfzeile bietet Rückweg, Hauptmenü und native Rückfallebene. BMW-Statusleisten werden nicht entfernt; die App nutzt den vom Renderer tatsächlich gemeldeten Anzeigebereich.

| Anzeige | Bedeutung und nächster Schritt |
| --- | --- |
| Audio-Dienst nicht gefunden / Socket fehlt | Dienstversion und systemd-Ergebnis in Audio-Diagnose prüfen. Store-Abhängigkeit und ausstehende Dienstaktivierung prüfen, dann Bericht speichern. |
| UID-Zugriff verweigert / PEER_DENIED | Der Dienst konnte die App-UID nicht anhand der Store-Installation bestätigen. Bericht mit UID, GID und Socketdaten exportieren. Keine pauschalen Dateirechte ändern. |
| Kein freigegebener Mischpfad | Sichtbare Geräte sind noch kein Overlay. Bericht exportieren; keinen beliebigen OEM-Ausgang freigeben. |
| Audioinventar geändert | Nach Geräte-/Firmwareänderung muss die Route vor Ort erneut geprüft werden. |
| ALSA-Öffnen fehlgeschlagen / Zeitüberschreitung | Konkreter Ausgang ist blockiert, nicht nutzbar oder unterstützt das Format nicht. Dienst trennt den Öffnungsversuch nach vier Sekunden. Bericht enthält den Fehler. |
| PCM angenommen, aber nichts hörbar | ALSA-Annahme beweist keine aktive BMW-/RAM-Route oder Lautsprecherbelegung. Keine Kanäle als gehört bestätigen; Bericht und Beobachtung weitergeben. |
| Wartet auf Fahrzeugdaten | Motorstatus und frische Drehzahl prüfen. Fehlende/ungültige Werte schalten den Sound stumm. |
| Automatik wartet auf Fahrmodus | Auf unterstütztes Signal warten oder Automatik abschalten und Profil manuell wählen. |
| Motorsound ausgeschaltet / Pegel null | Hauptschalter, App-Pegel, Pegelgrenze und einzelne Effekt-Schalter prüfen. |
| Audiotest gesperrt | Motor aus, P und exakt 0 km/h müssen tatsächlich gemeldet werden; fehlende Signale werden nicht geraten. |

## Bestätigt und noch offen

**Vom Nutzer im Fahrzeug bestätigt (0.2.2):** App-Start sowie echte Drehzahl und Geschwindigkeit auf dem genannten G31. **Automatisiert mit 0.3.0 geprüft:** Grafik-/native Aktionen, wiederholte Rücknavigation, simulierte BMW-Back-Ereignisse, Touch-Skalierung bei 1280×480 / 1440×540 / 1920×720, Renderer-Rückfall, Settings, Soundprofile und Pegelwirkung, PCM bis zur Host-Testsenke, Socketfehler und Deployer-Vorprüfung.

**Noch am Fahrzeug zu prüfen:** kompletter Store-Updatevorgang, Dienststart unter Linux, Kernel-UID-Abgleich mit der konkreten Store-Registry, tatsächliche BMW-Zurücktaste und Controller-/Touch-Routing, AudioManager-Abfragen auf dem verbauten Firmwarestand, nutzbarer Mischpfad, ALSA-Kanalformat, hörbarer Ton, Front/Heck/Center, RAM-/Verstärkerkombination, USB-Schreiben, Radio/Bluetooth/CarPlay, unabhängige akustische Lautstärke, Hintergrundbetrieb/Aufwachen und gemessene Bildrate. Auch weitere Fahrzeugfelder bleiben vom realen Anbieter abhängig. [Fahrzeugtestplan](docs/fahrzeugtest.md)

Es werden ausschließlich Fahrzeugdaten gelesen. Keine Motorsteuergeräte, Auspuffklappen oder Sicherheitsfunktionen werden verändert. AudioManager wird für die Diagnose nur lesend abgefragt; keine BMW-Medienquelle wird automatisch beansprucht.

## Paket bauen und testen

```sh
git switch codex/luxo-sound-tuning-020
python tests/run_checks.py
```

Python 3 baut die Pakete mit dem mitgelieferten iDrive-App-Kit; Node.js ab Version 20 führt die Hosttests aus. Die App zielt auf die Node.js-8-Laufzeit von iDrive 7. [App-Kit-Herkunft](vendor/README.md)

Der Test lädt vier unveränderte Store-Dateien aus dem Commit in `tests/store_upstream.json`, prüft ihre Git-Blob-Hashes und verwendet danach den Cache unter `dist/`. Alternativ `--store-source /pfad/zum/mgu-store` mit diesem Checkout angeben. Der echte Store-Packer baut den Dienst; der echte Deployer prüft `check --artifact` und `preflightApp`. Dabei zeigen seine Hardwarepfade auf ein isoliertes Host-Verzeichnis. OEM-SDK-Verknüpfung, MainApp-Installation, systemd-Start und Fahrzeugaudio werden dadurch nicht getestet.
