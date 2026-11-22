**Aktueller Auftrag 22.11.2026:** Veröffentlichung von 0.4.0 mit optionalem verwaltetem BMW-Medienpfad und neuen Bildern ist ausdrücklich beauftragt. Kein universeller ID7- oder BMW-Lautsprechernachweis. Die zuvor beschriebene Veröffentlichungssperre ist damit aufgehoben; die Klangbank bleibt unfertig. Aktueller Stand: [Audiopfad und Einrichtung](audiopfad-0.4.0.md), 76 Node-, 30 Python- und 14 echte Store-/Deployer-Prüfungen bestanden. Ältere Untersuchungsergebnisse unten dokumentieren den bisherigen Verlauf.

# Welchen Bericht vom BMW benötigen wir?

Die bisher gemeldete Zeile **„Audiopfad fehlt · Details im BMW-Menü“** ist der Sammelstatus des Dashboards. Sie belegt weder die Erreichbarkeit des Dienstes noch die Liste der tatsächlich vorhandenen Ausgänge. Auch „Audiokanäle nicht bestätigt“ ist keine Messung der Kanalzahl. Dafür benötigen wir den Detailbericht der schon installierten **0.3.0**.

## Im Fahrzeug

1. Die vorhandene LUXO-App öffnen und **BMW-Menü → Audio-Diagnose** wählen.
2. **Diagnose aktualisieren** wählen und das Ende der Prüfung abwarten.
3. Über **Weitere Einträge** zur Zeile **Diagnosebericht speichern** wechseln und diese ausführen. Die App speichert `diagnostics/audio-report.json` in ihrem bisherigen App-Datenverzeichnis. Die Meldung muss bestätigen, dass gespeichert wurde.
4. Wenn angeboten: **Diagnosebericht auf USB exportieren** wählen, einen bereits eingebundenen beschreibbaren USB-Datenträger auswählen. Die Datei liegt unter **`LUXO-Diagnose/audio-…json`**. Ein nicht eingebundener Datenträger wird nicht formatiert oder erfunden.
5. Genau diese JSON-Datei zum Projekt zurückgeben. Sinnvoll ist ein Bericht bei **Motor läuft, Fahrzeug steht**, zusätzlich die in Live-Daten tatsächlich sichtbaren Angaben zu P/N/D und Gang notieren. Ein Audiotest ist hierfür nicht erforderlich.

## Wenn USB-Export nicht angeboten wird

**In der bereits installierten 0.3.0** läuft der USB-Export über den Audio-Dienst. Ist dieser nicht erreichbar, kann er den lokalen Bericht nicht auf USB kopieren. Diese Version besitzt noch keinen zweiten Exportweg. Im lokalen 0.4.0-Kandidaten ist dafür die unten beschriebene Reparatur implementiert; sie ist auf deinem BMW noch nicht installiert.

Bitte in diesem Fall **BMW-Menü → Audio-Diagnose → Diagnose aktualisieren** öffnen und die Detailseiten fotografieren. Über **Weitere Einträge** alle Seiten durchblättern, auf denen folgende Zeilen stehen: **Audio-Dienst installiert** (Version), **Audio-Dienst gestartet/erreichbar**, **Socket-Verbindung**, **Audiopfad**, **Audiogeräte anzeigen/auswählen** (tatsächliche Gerätenamen, wenn vorhanden), **BMW-Audiomanager** und **Ausgabehindernis** (vollständiger Text, besonders Fehlercodes). Diese Detailangaben sind erforderlich; die Dashboard-Zeile allein reicht nicht. Zusätzlich die Seite **Live-Fahrzeugdaten** bei sicherem Stillstand und laufendem Motor mit Drehzahl, Geschwindigkeit, Motor, Gang/Wählstufe und Leerlauf erfassen. Keine Fotografie während der Fahrt.

## Was damit entschieden wird

| Befund | Nächste technische Prüfung |
| --- | --- |
| Komponente fehlt oder falsche Version | Tatsächliche Store-Abhängigkeit und Dienstinstallation untersuchen. |
| ENOENT / fehlender Socket | Unit-Aktivierung und systemd-Status prüfen. |
| EACCES / PEER_DENIED | App-UID, Store-Registry und Socketrechte anhand des Berichts abgleichen. |
| Dienst erreichbar, NO_APPROVED_ROUTE | Tatsächliches ALSA-Inventar und lesende AudioManager-Listen auswerten. Keine beliebige OEM-Quelle als Overlay übernehmen. |
| Route vorhanden, Öffnen/Format scheitert | Konkretes Gerät, Parameter und errno prüfen. |
| ALSA nimmt Frames an, kein Ton | BMW-Quellen-/RAM-Routing und physische Ausgabe vor Ort prüfen. Ein Write-Erfolg bestätigt keine Lautsprecher. |

0.4.0 ergänzt für eine spätere gezielte Diagnose außerdem die Katalog-Instanz, die tatsächlich vorhandenen Getriebefelder und die empfangenen Rohwerte. Diese Informationen sind in 0.3.0 noch nicht vollständig enthalten. Aus einem dort fehlenden Gangwert wird jetzt keine neue Codierung erraten. Falls der 0.3.0-Bericht die Getriebefrage offenlässt, ist dafür ein gezielter Diagnose-Build erforderlich, keine pauschale Sound-Freigabe.

Bis diese Befunde vorliegen und eine geeignete Route nachgewiesen ist, bleibt die Veröffentlichung 0.4.0 zurückgehalten.

## Unabhängiger Export im noch unveröffentlichten 0.4.0

Das **bestehende** Store-Tool `luxo-motor-audio` enthält zusätzlich `luxo-motor-diagnostics.socket` und `.service`. Dieser eigene Prozess importiert den PCM-Backendcode nicht und besitzt keine Abhängigkeit von dessen Service-Unit. Beide Socket-Units werden durch das Tool-Manifest automatisch eingerichtet. Es gibt keine zusätzliche App und keine manuelle Einrichtung oder USB-Installation.

Die App verwendet den separaten Diagnosezugang zum USB-Export auch bei ausgefallenem PCM-Prozess. Der Bericht enthält beide Endpunktfehler, systemd-Zustände, Firmware, ALSA-Karten/PCM-Hinweise, Dateirechte, begrenzte Audio-Unit-Logs und lesende AudioManager-Listen. Die tatsächlichen Fahrzeugfelder/-instanzen, Getriebe-Rohwerte und Signalalter ergänzen den Bericht. Ein Gerät wird nicht aus dem Namen als bestätigtes RAM-/Verstärkermodell ausgegeben.

**Grenzen:** Fehlen das gesamte Tool, die gemeinsame Python-Laufzeit oder die zulässige App-UID, können beide Prozesse ausfallen. Dann bleiben lokales Speichern und die oben genannten Fotos. USB muss bereits eingebunden und beschreibbar sein. Es wird kein Datenträger formatiert und kein ungeprüfter Dateipfad beschrieben. Der getrennte Protokoll-/Host-Dateiexport ist getestet; ein echter BMW-USB-Schreibtest steht aus. Erfolgreicher Export beweist keine Lautsprecherausgabe.
