# Fahrzeugtest für BMW G31 530d und MATCH UP 10

Der Test an einer Fahrzeug-MGU steht aus. Die Paketprüfung und die Anwendungstests laufen außerhalb des Fahrzeugs. Testdaten sind auf die Tests beschränkt.

| Bereich | Prüfung am Fahrzeug |
| --- | --- |
| Installation und Oberfläche | Quelle auf `main` hinzufügen. Paketbau, Installation, Entfernung und erneute Installation prüfen. Hauptmenü, alle vier Themes, Live-Ansicht und Klangprofilkarten auf den unterstützten Displayformaten prüfen. Profile und Einstellungen mit dem iDrive-Controller und, sofern vorhanden, per Touch bedienen. Gespeicherte Werte nach Neustart kontrollieren. |
| Drehzahl und Motor | Drehzahl mit der Instrumentenanzeige vergleichen, vom Start über laufenden Motor bis zum Stopp. Im Stand Start-Stopp testen, soweit vorhanden. Ausbleibende oder ungültige Werte müssen die Wiedergabe stoppen. |
| Beschleunigung | Längsbeschleunigung im Stand und bei einem kontrollierten Fahrversuch vergleichen. Vorzeichen, Einheit und Datenrate prüfen. |
| Gang und Leerlauf | P, R, N, D und einzeln gemeldete Gänge prüfen. Der Motorleerlauf wird aus Motorstatus, Drehzahl, Wählhebel, Pedal und Geschwindigkeit abgeleitet. Ein Signal, das P oder N gemeinsam meldet, löst die Auswahl nicht auf. |
| Fahrmodi | ECO PRO, COMFORT, SPORT, SPORT PLUS und INDIVIDUAL einzeln prüfen, soweit am Fahrzeug verfügbar. Gemeldete Individual-Varianten von ECO PRO, COMFORT und SPORT verwenden die konfigurierbare Zuordnung INDIVIDUAL. Bei unbekanntem Fahrmodus wartet die Automatik auf einen bekannten Wert. |
| Klang und Pegel | Mit freigegebenem Audiopfad die sechs Profile, Standgas, Einzelpegel, separate Schalter, Turbo bei Gaswegnahme, synthetische Pop & Bangs, Lautstärkebegrenzung und Kanäle prüfen. Ausfälle und Neustarts des Audiopfads prüfen. |
| Radio, CarPlay und Hintergrund | Erst mit validiertem Audiopfad Radio, CarPlay und Bluetooth einzeln prüfen. Medienwechsel, Anruf, Sprachführung, Warnsignale, Verlassen des Menüs und Aufwachen der MGU kontrollieren. Der Motorsound muss sich separat regeln und abschalten lassen. |
| Lautsprecher | MATCH UP 10 mit dem verbauten RAM zuerst prüfen. Weitere Anlagen separat auf Abstimmung, Verzerrung und tatsächliche Kanalbelegung prüfen. Presets verändern die App-Samples. |

Die Fahrzeugdaten nutzt die App über den von BMW bereitgestellten SOME/IP-Katalog. Ihr Fahrzeugadapter liest Felder und abonniert Änderungen. Bei Feldinhalten, die BMW nur bei einer Änderung meldet, bleiben Gang, Motorstatus, Geschwindigkeit und Fahrmodus sichtbar, solange der Datenanbieter verbunden bleibt. Die Drehzahl muss regelmäßig aktualisiert werden. Er sendet keine Diagnose-, Codier-, Motor- oder Getriebebefehle. [Feldnamen und Skalierung im iDrive-7-Referenzprojekt](https://github.com/cauliflowermossgrape/idrive7-apps/blob/b2880634eb214e29f008422b970cf22ea2de280f/apps/live_data/signals.js)

## Separater Audiopfad

Die App beansprucht keine BMW-Medienquelle und verändert weder die AudioManager-Konfiguration noch die OEM-Kanäle. Die öffentliche MGU-Audioanalyse dokumentiert, dass getestete Medienpfade wie `OAPGenericMedia` bei der Aktivierung das Radio ablösen können. Für die parallele Wiedergabe muss eine separat gemischte Route auf der konkreten MGU nachgewiesen werden. [Messungen zu SmartX und AudioManager](https://github.com/Vizualyse/idrive-apps/blob/main/knowledge/sound.md)

Das mitgelieferte Werkzeug `tools/overlay_bridge.py` kann nach der Fahrzeugprüfung eine bereits eingerichtete ALSA-Route namens `luxo_overlay` versorgen. Es öffnet ausschließlich diese Route. Es installiert und erstellt keine ALSA-Konfiguration. Der Store installiert die Brücke nicht automatisch.

Die Brücke erwartet einen von systemd bereitgestellten Unix-Listen-Socket auf FD 3 unter `/run/luxo-motor-sound/pcm.sock`. Das Verzeichnis und der Socket gehören root. Die OAP-App braucht Verbindungsrechte, beispielsweise über die Gruppe `tm_oap_app` und Modus `0660` für den Socket. Das Elternverzeichnis darf für Gruppe und andere nicht beschreibbar sein. Die Brücke selbst kann unter einem Dienstbenutzer laufen, der die bestätigte ALSA-Route öffnen darf.

Die App sendet `LUXO/1 S16LE 48000\n`. Die Brücke antwortet erst nach erfolgreichem Öffnen des Audiopfads mit `READY 2\n`, `READY 4\n` oder `READY 5\n`. Es folgen PCM-Blöcke mit je 960 interleavten Frames. Vier Kanäle folgen der Reihenfolge vorn links, vorn rechts, hinten links, hinten rechts. Der optionale fünfte Kanal ist Center. Stereo erhält eine links/rechts zusammengefasste Mischung. Die Meldung der Kanäle beschreibt die Fähigkeiten des Mischpfads. Auf der MGU müssen die physische Kanalzuordnung, Signalüberlagerung und Priorität der Serientöne geprüft werden.

Die MATCH UP 10DSP hat eigene DSP-Ausgänge und ein Virtual Channel Processing. Ein RAM-Kabelbaum kann Mehrkanal-Eingänge zum Verstärker führen. Für getrennte App-Effekte müssen aber bereits vor dem Verstärker getrennte App-PCM-Kanäle vorliegen. RealCenter im Verstärker kann einen Center aus vorhandenen Eingangssignalen ableiten. Die App besitzt dadurch noch keinen separaten Center-Eingang. Die für Serien-iDrive-7 nachgewiesenen Entertainment-Routen belegen keine dokumentierte unabhängige App-Mischung mit einem gemeinsamen Lautstärkeregler. [MATCH UP 10DSP](https://www.audiotec-fischer.de/match/verstaerker/up-10dsp) [BMW RAM-Kabelbaum](https://www.audiotec-fischer.de/match/adapter-kabel/pp-bmw-1-9ram-hk) [MGU-Audioanalyse](https://github.com/Vizualyse/idrive-apps/blob/main/knowledge/sound.md)

Beim Fahrzeugtest zunächst je einen Effekt bei geringem App-Pegel abhören. Links/rechts, Front/Heck und gegebenenfalls Center über den tatsächlich gemessenen Mischpfad prüfen. Mit einer aktiven Musikquelle den BMW-Medienpegel getrennt vom App-Pegel ändern und prüfen, ob der Motorsound am Lautsprecher konstant bleibt. Die Prüfung für Radio, Bluetooth und CarPlay wiederholen.
