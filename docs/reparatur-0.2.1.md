# Reparatur 0.2.1

Version 0.2.0 wurde vom Nutzer im BMW G31 530d xDrive, Baujahr 2018, mit nachgerüsteter MGU / iDrive 7 und MATCH UP 10 DSP installiert. Die Oberfläche erschien, die Grafikknöpfe reagierten jedoch nicht und die Lautsprecher blieben stumm.

## Korrigierte Ursachen

- Die Zeichenflächen waren mit `chrome: false` konfiguriert. Das verwendete App Kit koppelte daran den älteren Renderer-Dialekt. Dadurch wurde `cv.own` nicht aktiv, die Seiten registrierten keine Touch-Ziele und `ctx.onTap` wurde für die Seiten nicht ausgewertet.
- Der Kit-Display-Controller verwaltet eine aktive Zeichenfläche. Die App verwendete sechs getrennte RHMI-Zeichenflächen. In 0.2.1 teilen sich die sechs LUXO-Ansichten eine Zeichenfläche. Die Navigation wechselt den Inhalt.
- Das erste Menü ist ein echtes BMW-Menü mit anklickbaren, zweizeiligen RHMI-Zeilen. Es enthält Profile, Tuning, alle Einstellungen, Live-Daten, Audio-Diagnose und Hilfe. Ohne passenden Renderer bleibt dieses Menü die bedienbare Oberfläche.
- Die LUXO-Oberfläche fordert `mgu-render/1` an. Der Renderer muss seine Touch-Unterstützung melden. Bei Ausfall wechselt die App in das BMW-Menü zurück. Die neue Skalierung verwendet die gemeldete Bildschirmgröße und gegebenenfalls den gemeldeten Anzeigebereich. Der Controller-Fokus wird auch auf der selbst gezeichneten Oberfläche sichtbar gemacht.
- In 0.2.0 wartete die App ausschließlich auf einen Unix-Socket. Ein Store-installierbarer Audio-Gegendienst war nicht dabei. 0.2.1 ergänzt diesen Dienst als eigene Store-Komponente und als Abhängigkeit der App. Eine Abfrage unterscheidet fehlenden Dienst, fehlende ALSA-Route und Verbindungsfehler.
- Fehlt das separate Motorstatusfeld auf der Firmware, kann eine frische, tatsächlich gemessene Kurbelwellendrehzahl den Motorzustand liefern. Eine explizite Motorstatusmeldung hat Vorrang. Veraltete Drehzahl liefert keinen Ersatzwert.

## Automatisch geprüft

Die Prüfung über `python tests/run_checks.py` umfasst 35 Node-Tests, vier Python-Tests sowie Paket- und RHMI-Prüfungen.

- Start und native Menübedienung mit deaktiviertem GPU-Pfad.
- Native Auswahl von Sport Diesel, App-Pegel und Design einschließlich Seitennavigation.
- Grafische Auswahl von BMW M5 F90, Öffnen des Individual-Tunings und eines Effekts auf derselben Zeichenfläche.
- Rückkehr ins BMW-Menü beim Verlust der Touch-Unterstützung.
- Touch-Ziele und Controller-Drehung/Druck im tatsächlichen, gepatchten Display-Code.
- Skalierung und Touch-Fläche für gemeldete Auflösungen von 1280 × 480, 1440 × 540 und 1920 × 720.
- Laden, Ändern und erneutes Laden einer Einstellungsdatei im Format von 0.2.0 einschließlich unbekannter zusätzlicher Schlüssel.
- PCM-Erzeugung der sechs Profile, Einzelpegel, Turbo, synthetische Pop & Bangs, Pegelgrenze und getrennte Effektmatrix.
- Erkennung von fehlendem Audio-Dienst und fehlender ALSA-Route. Eine reine Statusabfrage erzeugt keinen Audiostream.
- Der tatsächliche Hintergrundprozess liefert bei eingespeisten Test-Signalen nichtleere PCM-Blöcke über den echten Ausgabe-Handshake an einen lokalen Testempfänger und stoppt die Ausgabe bei Stummschaltung.
- Transport vollständiger PCM-Blöcke zur Audio-Senke im Testsystem und Ablehnung unpassender Anfragen.
- Weiterhin ausschließlich lesende Fahrzeug-Signalabonnements.
- Die Paketkennung bleibt `patryklars6_motor_sound`, die Version steigt von 0.2.0 auf 0.2.1.

Der echte Store-Katalogleser und Paketpacker aus `robertnisipeanu/mgu-store` unter Commit `3ecfafd4b6b2492c1776f53e3b74add5653c5c61` liest beide Komponenten, erkennt die Audio-Abhängigkeit und packt das Audio-Tool samt systemd-Dateien. Sein Paketleser erkennt bei 0.2.0 und 0.2.1 dieselbe App-ID. Diese Prüfung lief auf dem Entwicklungsrechner.

## Audio im Fahrzeug

Der neue Audio-Dienst öffnet ausschließlich den lokal bestätigten ALSA-Namen `luxo_overlay`. Der Name muss in den ALSA-PCM-Hinweisen der Head Unit sichtbar sein. Eine funktionsfähige Route muss vor Ort durch den tatsächlichen Audioaufbau bestätigt sein.

Der Dienst richtet keinen OEM-Audiokanal ein. Die öffentlichen MGU-Untersuchungen belegen Entertainment-Routen, die die Medienquelle umschalten und über den BMW-Lautstärkeregler laufen. Ein dauerhaft mit Radio/CarPlay paralleler, separat lautstärkegeregelter PCM-Eingang auf dieser nachgerüsteten MGU ist bisher nicht nachgewiesen. [MGU-Audioanalyse](https://github.com/Vizualyse/idrive-apps/blob/main/knowledge/sound.md)

Ohne diese Route zeigt die App **Audio-Dienst vorhanden · ALSA-Mischpfad luxo_overlay fehlt**. Die Installation des Dienstes allein bestätigt keine hörbare Ausgabe. Eine allgemeine Zuordnung zu einem CarPlay- oder OEM-SmartX-Ausgang würde keinen Nachweis für parallelen Betrieb liefern.

Ein Ausgang, der nach dem App-Mix noch vom gemeinsamen RAM-/Verstärkerpegel beeinflusst wird, kann die Lautstärkeabhängigkeit von Musik und Motorsound nicht durch einen App-Regler beseitigen. Der App-Regler begrenzt den eigenen PCM-Strom. Die akustische Unabhängigkeit bleibt am tatsächlichen Ausgang zu prüfen.

Die Standardausgabe ist Stereo. Vier oder fünf PCM-Kanäle lassen sich erst nach lokaler Bestätigung in `/var/opt/luxo-motor-audio/config.json` mit `{"channels": 4}` bzw. `{"channels": 5}` einstellen. Die Kanalfolge ist FL, FR, RL, RR, optional Center. Das ist eine Konfiguration des App-Mischpfads. Eine Verstärkerauswahl allein bestätigt keine physische Lautsprecherzuordnung.

## Nächster Fahrzeugtest

1. Auf dem bestehenden Branch auf 0.2.1 aktualisieren und gegebenenfalls die vom Store gemeldeten ausstehenden Dienste beim nächsten regulären MGU-Start aktivieren lassen.
2. Im BMW-Menü Profil, Lautstärke, MATCH UP 10, Design und Fahrmoduszuordnung ändern. Nach einem normalen Neustart die Werte erneut prüfen.
3. Unter **LUXO-Oberfläche** den gemeldeten Rendererstatus prüfen. Die Grafik öffnen, sofern Touch angeboten wird. Touch, Controller und BMW-Zurücktaste auf allen Unterseiten prüfen.
4. Unter **Live-Fahrzeugdaten** die realen Signale mit den Anzeigen des BMW vergleichen.
5. Unter **Lautstärke und Audio** den genauen Dienst-/Routenstatus ablesen. Erst bei lokal bestätigtem Mischpfad die Lautsprecherwiedergabe, parallele Musik, Pegelunabhängigkeit und Kanalfolge prüfen.

Ein vollständiger Installations- oder Updatevorgang in der nachgerüsteten MGU sowie die akustische Ausgabe können erst im Fahrzeug bestätigt werden.
