# BMW-Medienpfad in 0.4.0

## Belegbarer Umfang

0.4.0 ergänzt einen echten, ausdrücklich auswählbaren Entertainment-Audiopfad. Er ist **keine universelle Freigabe aller MGU-ID7-Versionen** und kein unabhängiger Audiomixer. Ein kompatibles System benötigt die lokalen SOME/IP-Audiodienste, eine eindeutig angebotene CarLife-Medienquelle, MediaSink_Front, den beobachteten CarLife-Stereo-PCM und passende SmartX-Laufzeitrechte. Fehlt eine Voraussetzung, wird ein konkreter Fehler ausgegeben.

Diese Route ersetzt die aktive Musikquelle und folgt der BMW-Lautstärke. Die bisher gewünschte parallele Musik mit unabhängigem Motorsound bleibt Ziel des getrennten Mischpfadmodus; sie wird durch den Medienmodus nicht als gelöst ausgegeben.

## Einschalten nach dem Store-Update

1. Bestehende GitHub-Quelle und Branch aktualisieren, LUXO Motor Sound 0.4.0 über den MGU Store aktualisieren. Der Store installiert das Audio-Tool einschließlich PCM-, Medienrouten- und Diagnosekomponenten.
2. In der App **BMW-Menü → Audio-Diagnose → Audiomodus einrichten** öffnen.
3. **BMW-Medienquelle einrichten** wählen. Dort stehen die Grenzen für Musik, Lautstärke und Stereo.
4. **Diesen Medienmodus verwenden** aktivieren. Der alte Stream wird beendet, der Modus wird im bestehenden Audio-Dienst gespeichert. Eine vorherige Overlay-Konfiguration bleibt zusätzlich in dessen Konfiguration erhalten.
5. Für den ersten leisen Kanaltest: Motor aus, gemessene Geschwindigkeit 0 und P. Fehlende Werte sperren diesen Test. Für Motorsound sind frische reale RPM/Motorwerte und ein freigegebenes Profil nötig; bei fehlendem Fahrmodus ein Profil manuell wählen.
6. Den Diagnosebericht speichern/exportieren. Eine angenommene Verbindung oder positive PCM-Frames sind noch keine Bestätigung, dass die Fahrzeuglautsprecher hörbar spielen.

Kein USB-Installer und keine manuelle Dienstkonfiguration. In **Separaten Mischpfad wählen** bleibt die bisherige Auswahl eines tatsächlich bestätigten separaten Ausgangs verfügbar.

## Ablauf und Begrenzungen im Code

- Quellen-/Senken-IDs werden aus aktuellen AudioManager-Listen gelesen, nicht als 287/1024 vorausgesetzt.
- SOME/IP-Schemas und Instanzen werden aus dem lokalen Katalog gebildet; mehrdeutige/fehlende Angaben scheitern ausdrücklich.
- Nur der dokumentierte CarLife-Stereo-PCM wird genutzt, und nur wenn er im Inventar tatsächlich beobachtet wurde. Ein nicht als Hinweis sichtbarer PCM wird nicht erfunden.
- Eine bereits belegte CarLife-Quelle wird nicht übernommen. Die eigene Connect-Antwort muss eine Verbindungs-ID enthalten, und die Verbindung muss CS_CONNECTED erreichen.
- PCM läuft erst nach dieser Bestätigung. Auf einen nicht konsumierten Eingang wird nicht blind gestreamt.
- Der eigene Helper bleibt an den PCM-Prozess gebunden. Schließen beendet die eigene Verbindung und stellt nach Möglichkeit die vorher tatsächlich aktive Quelle wieder her. Fremde Verbindungen werden nicht getrennt.
- Bei einem BMW-Quellenwechsel endet die Motorsound-Sitzung. Sie beansprucht die Quelle nicht automatisch erneut; zum Fortsetzen muss der Medienmodus bewusst neu gewählt werden.
- SmartX-Lockdateien werden über einen festen bekannten Streamnamen, Verzeichnisdeskriptor und Symlinkschutz geprüft. Eigentümer/Gruppe stammen aus dem beobachteten Systemverzeichnis; keine erfundenen Benutzernamen. Unbekannte Rechte führen zum Abbruch.
- Stereo bestätigt weder Center noch getrennte Front-/Heckkanäle. Keine Verstärker-DSP- oder Fahrzeugsteuerungsänderung.

## Tests und noch offene Fahrzeugprüfung

Host-Tests prüfen Erkennung, belegte/fremde Quellen, Verbindungsantworten, Owner-Timeout, Rückgabe, Quellenverlust, Schema-/Instanzauswahl und Grenzen. Ein echter Python→Node-Prozesstest verwendet den Produktions-Routencontroller mit einem ausdrücklich markierten AudioManager-Testadapter und prüft die Rückgabe bei PCM-Close. Das ist kein BMW-Lautsprechertest.

Nicht bestätigt: der vollständige Ablauf auf dem G31 des Nutzers oder weiteren MGU-/RAM-/Verstärkerkombinationen, tatsächliche SmartX-Rechte, Audiowiedergabe, Latenz, Schlaf-/Aufwachverhalten und USB-Schreiben im Fahrzeug. Die Klangbank bleibt vom Nutzer abgelehnter Entwicklungsstand.

## Primäre Recherchequellen

- [MGU-Audio-Beobachtungen mit Trennung von Fahrzeug und Emulator](https://github.com/Vizualyse/idrive-apps/blob/main/knowledge/sound.md)
- [Speakers-Komponente: dokumentierter CarLife-/AudioManager-Ablauf und Testgrenze](https://github.com/Vizualyse/idrive-apps/blob/main/platform/tool/speakers/CHANGELOG.md)
- [TVH-Player: beschriebener Stereo-Audiopfad und geteilte Quellenbelegung](https://github.com/aurelmarius/bmw-apps/blob/main/native/aurelm-tvhplayer/README.md)

Die neue LUXO-Implementierung verwendet die AudioManager-Aufrufe und den bestehenden eigenen Schema-Generator; es wurde kein GPL-Quellcode in das Projekt kopiert. Die Quellen beschreiben bestimmte getestete Systeme, keine Herstellerfreigabe aller ID7-Fahrzeuge.
