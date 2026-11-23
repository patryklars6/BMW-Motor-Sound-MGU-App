# Reparatur 0.4.1 – tatsächliche Route und fehlender Diagnose-Socket

**Stand 23. November 2026.** Die bestehende App-ID patryklars6_motor_sound bleibt erhalten. Dies ist eine Paket-/Diagnosekorrektur der vorhandenen App, keine bestätigte Reparatur der BMW-Lautsprecherausgabe.

## Neuer Fahrzeugbefund

Vom Nutzer für die installierte 0.4.0 gemeldet:

- Audio-Dienst 0.4.0 installiert, erreichbar, PID 11338.
- Audio-Socket erfolgreich verbunden.
- Meldung „Kein separat freigegebener Mischpfad ausgewählt“.
- Unabhängiger Diagnosezugang: ENOENT.
- Weiterhin kein hörbarer Motorsound.

Damit ist der laufende Audio-Dienst belegt. Nicht belegt sind die vorhandenen Ausgabegeräte, eine gespeicherte Route, deren Freigabe und die tatsächlich angebotenen AudioManager-Quellen/Senken. Der neue Befund wird nicht als reines Dienststartproblem behandelt.

## Konkreter Fehler in der alten Diagnose

0.4.0 gibt denselben Fehler aus, wenn überhaupt keine Route gespeichert ist und wenn eine vorhandene Route nicht freigegeben ist. Die erste Menüzeile bezeichnet außerdem den separaten Mischpfad als gewählten Modus, selbst wenn noch kein Ausgang ausgewählt wurde.

0.4.1 unterscheidet:

| Zustand | Bedeutung |
| --- | --- |
| ROUTE_NOT_SELECTED | Keine Route gespeichert; keine Aussage, ob Hardware vorhanden ist. |
| ROUTE_APPROVAL_REQUIRED | Route gespeichert, erforderliche Freigabe fehlt. |
| ROUTE_MISSING | Freigegebener Ausgang wurde nicht im aktuellen Inventar beobachtet. |
| ROUTE_INVENTORY_UNAVAILABLE | Inventar konnte nicht gelesen werden; Geräteverfügbarkeit bleibt unbekannt. |
| ROUTE_NOT_SELECTABLE | Dieses Gerät ist kein freigebbarer separater Mischpfad. |
| ROUTE_BACKEND_UNSUPPORTED | Gespeicherter Audiomodus wird vom Dienst nicht unterstützt. |
| ROUTE_CHANGED | Inventar/Firmware und gespeicherter Nachweis stimmen nicht mehr überein. |

**Audioweg prüfen · ohne Aktivierung** zeigt zusätzlich reale Medien-PCM-, Quellen-, Senken- und Katalogbeobachtungen. Nicht lesbare Getter werden nicht zu „Quelle fehlt“ umgedeutet. Eine bereits belegte Medienquelle bleibt ein Hindernis. Diese Prüfung führt keine Freigabe, Quellenumschaltung oder PCM-Öffnung durch.

Ein weiterer Fehler wurde behoben: Eine alte Konfiguration mit route:null konnte beim bewussten Einrichten des Medienmodus eine Ausnahme verursachen. Null bleibt jetzt eine fehlende Auswahl und kann regulär konfiguriert werden. Einstellungen werden nicht zurückgesetzt.

## ENOENT und Dienstregistrierung

Erwarteter Pfad: **/run/luxo-motor-sound/diagnostics.sock**. 0.4.0 meldet nur ENOENT und verliert den konkret fehlgeschlagenen lstat-Pfad. 0.4.1 exportiert erwarteten Pfad, tatsächlich fehlgeschlagenen Dateizugriff und Syscall. Sie unterscheidet fehlende Socket-Datei und fehlendes Elternverzeichnis.

Der erreichbare Audio-Dienst liest unabhängig vom zweiten Prozess:
- Diagnose-Socket und mitgelieferte Diagnose-Dateien;
- Unit-Dateien, LoadState, ActiveState, FragmentPath, Listen, UnitFileState und Fehlerstatus;
- Registrierung ausschließlich der beiden LUXO-Dienste im Recovery-Manager-Verzeichnis.

Ein Paketfehler ist im echten Store-Code nachgewiesen: In 0.4.0 fehlt die recmgr-Deklaration. Der MGU-Deployer startet auf Systemen mit Recovery Manager neue Socket-Units nicht sofort, solange deren eigene Einträge nicht als geladen gelten. Der laufende alte Audio-Socket beweist nicht, dass der neue Diagnose-Socket bereits gestartet wurde. Das ist eine passende Erklärung für den Befund, **noch kein aus dem Fahrzeugbericht bewiesener Einzelfall**.

0.4.1 deklariert ausschließlich luxo-motor-audio und luxo-motor-diagnostics für den normalen Store-Installationsweg. Fremde Einträge und Schutzfunktionen bleiben erhalten. Die eigenen Audio-Units wünschen zusätzlich die Diagnose-Socket-Unit über eine schwache systemd-Abhängigkeit; ein Diagnosefehler blockiert den Audio-Dienst nicht. Der Recovery Manager wird nicht umgangen oder im laufenden Betrieb neu geladen. Einen gegebenenfalls verlangten regulären Head-Unit-Start zeigt der Store an.

[Unveränderter echter Deployer, recmgrLoaded und Socket-Aktivierung](https://github.com/robertnisipeanu/mgu-store/blob/d878bed5ce5848d0c1ce852be23fac539e434a0b/deploy/unit/mgu-deploy.js) · [systemd-Socket-Dokumentation](https://www.freedesktop.org/software/systemd/man/248/systemd.socket.html)

## Benötigte Daten aus der bereits installierten 0.4.0

Weil der Audio-Dienst erreichbar ist, kann schon 0.4.0 den Bericht über diesen Dienst exportieren, auch wenn der unabhängige Zugang fehlt:

1. **BMW-Menü → Audio-Diagnose → Diagnose aktualisieren**.
2. **Diagnosebericht speichern**.
3. **Diagnosebericht auf USB exportieren** und einen tatsächlich erkannten beschreibbaren Datenträger wählen.
4. Bei angezeigtem Erfolg die Datei **LUXO-Diagnose/audio-…json** senden.

Falls der USB-Mount nicht erscheint oder das Schreiben scheitert: Fotos von **Audiogeräte anzeigen / auswählen** mit den tatsächlichen Gerätenamen, **BMW-Audiomanager**, **Audiopfad** und **Ausgabehindernis**. Falls der Medienmodus bereits bewusst gewählt wurde, dessen genaue Fehlermeldung mitliefern. Eine unbestätigte OEM-Quelle nicht als Mischpfad freigeben.

Der vorhandene BMW-Medienmodus bleibt ein separater ausdrücklich gewählter Stereo-Modus: Er ersetzt die Musikquelle und folgt BMW-Lautstärke. Er löst keinen unabhängigen Parallelmix.

## Tests und Grenzen

78 Node-, 39 Python- und 15 Prüfungen mit unverändertem echtem Store-/Deployer-Code: **132 bestanden**. Der neue Deployer-Test reproduziert „alter Audio-Dienst registriert, neuer Diagnosedienst unregistriert“ und prüft die additive Registrierung nur unserer Namen. Das ist eine Host-Testliste, kein Neustart eines BMW-Recovery-Managers. Weitere Tests prüfen fehlende Auswahl/Freigabe/Geräte, fehlgeschlagene Inventar-Getter, Null-Konfiguration, genaue ENOENT-Pfade und USB-Fallback über den laufenden Audio-Dienst.

App-ID und bisherige Einstellungsdefinitionen werden gegen das frühere Paket geprüft. Echte Archive, Abhängigkeiten und Installationsvorprüfung bestehen. Die Lizenz-/Aufnahmebank, Audioklangerzeugung und Fahrzeugdecoder werden durch diese Reparatur nicht als neu freigegeben bezeichnet.

**Offen:** tatsächliche Geräte-/Katalogdaten dieses BMW, bestätigter MGU-/RAM-/Verstärkerausgang, hörbare Ausgabe, genaue Ursache des fehlenden Diagnose-Sockets, unabhängiger Musikmix, verifizierte Kanäle und Klangrealismus. Die bisher beanstandeten Aufnahmen bleiben unfertig. Keine neue Motoraufnahme wird vorgetäuscht. Gang-/Leerlaufcode und optionale Effekte bleiben erhalten; echte Getriebe-Rohwerte im Bericht sind nötig, bevor weitere Signalformate geändert werden.
