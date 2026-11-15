# Fahrzeugtest für BMW G31 530d und MATCH UP 10

Der Test an einer Fahrzeug-MGU steht aus. Die Paketprüfung und die Anwendungstests laufen außerhalb des Fahrzeugs. Testdaten sind auf die Tests beschränkt.

| Bereich | Prüfung am Fahrzeug |
| --- | --- |
| Installation und Oberfläche | Quelle auf `main` hinzufügen. Paketbau, Installation, Entfernung und erneute Installation prüfen. Menütitel, Darstellung, iDrive-Controller und Speichern nach Neustart kontrollieren. |
| Drehzahl und Motor | Drehzahl mit der Instrumentenanzeige vergleichen, vom Start über laufenden Motor bis zum Stopp. Im Stand Start-Stopp testen, soweit vorhanden. Ausbleibende oder ungültige Werte müssen die Wiedergabe stoppen. |
| Gang und Leerlauf | P, R, N, D und einzeln gemeldete Gänge prüfen. Der Motorleerlauf wird aus Motorstatus, Drehzahl, Wählhebel, Pedal und Geschwindigkeit abgeleitet. Ein Signal, das P oder N gemeinsam meldet, löst die Auswahl nicht auf. |
| Fahrmodi | ECO PRO, COMFORT, SPORT und SPORT PLUS einzeln prüfen, soweit am Fahrzeug verfügbar. BMW-Varianten mit gemeldeter Zuordnung verwenden die jeweilige Profilfamilie. Bei unbekanntem Fahrmodus wartet die Automatik auf einen bekannten Wert. |
| Klang und Pegel | Mit freigegebenem Audiopfad die vier Profile, Gaswegnahme, Lautstärkebegrenzung und Kanäle prüfen. Ausfälle und Neustarts des Audiopfads prüfen. |
| Radio, CarPlay und Hintergrund | Erst mit validiertem Audiopfad Radio, CarPlay und Bluetooth einzeln prüfen. Medienwechsel, Anruf, Sprachführung, Warnsignale, Verlassen des Menüs und Aufwachen der MGU kontrollieren. Der Motorsound muss sich separat regeln und abschalten lassen. |
| Lautsprecher | MATCH UP 10 mit dem verbauten RAM zuerst prüfen. Weitere Anlagen separat auf Abstimmung, Verzerrung und tatsächliche Kanalbelegung prüfen. Presets verändern die App-Samples. |

Die Fahrzeugdaten nutzt die App über den von BMW bereitgestellten SOME/IP-Katalog. Ihr Fahrzeugadapter liest Felder und abonniert Änderungen. Er sendet keine Diagnose-, Codier-, Motor- oder Getriebebefehle. [Feldnamen und Skalierung im iDrive-7-Referenzprojekt](https://github.com/cauliflowermossgrape/idrive7-apps/blob/b2880634eb214e29f008422b970cf22ea2de280f/apps/live_data/signals.js)

## Separater Audiopfad

Die App beansprucht keine BMW-Medienquelle und verändert weder die AudioManager-Konfiguration noch die OEM-Kanäle. Die öffentliche MGU-Audioanalyse dokumentiert, dass getestete Medienpfade wie `OAPGenericMedia` bei der Aktivierung das Radio ablösen können. Für die parallele Wiedergabe muss eine separat gemischte Route auf der konkreten MGU nachgewiesen werden. [Messungen zu SmartX und AudioManager](https://github.com/Vizualyse/idrive-apps/blob/main/knowledge/sound.md)

Das mitgelieferte Werkzeug `tools/overlay_bridge.py` kann nach der Fahrzeugprüfung eine bereits eingerichtete ALSA-Route namens `luxo_overlay` versorgen. Es öffnet ausschließlich diese Route. Es installiert und erstellt keine ALSA-Konfiguration. Der Store installiert die Brücke nicht automatisch.

Die Brücke erwartet einen von systemd bereitgestellten Unix-Listen-Socket auf FD 3 unter `/run/luxo-motor-sound/pcm.sock`. Das Verzeichnis und der Socket gehören root. Die OAP-App braucht Verbindungsrechte, beispielsweise über die Gruppe `tm_oap_app` und Modus `0660` für den Socket. Das Elternverzeichnis darf für Gruppe und andere nicht beschreibbar sein. Die Brücke selbst kann unter einem Dienstbenutzer laufen, der die bestätigte ALSA-Route öffnen darf.

Die App sendet `LUXO/1 S16LE 48000\n`. Die Brücke antwortet erst nach erfolgreichem Öffnen des Audiopfads mit `READY 2\n` oder `READY 4\n`. Es folgen PCM-Blöcke mit je 960 interleavten Frames. Vier Kanäle folgen der Reihenfolge vorn links, vorn rechts, hinten links, hinten rechts. Stereo erhält eine links/rechts zusammengefasste Mischung. Auf der MGU müssen die physische Kanalzuordnung, Signalüberlagerung und Priorität der Serientöne geprüft werden.
