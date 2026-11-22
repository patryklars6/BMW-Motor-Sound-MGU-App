**Aktueller Auftrag 22.11.2026:** Veröffentlichung von 0.4.0 mit optionalem verwaltetem BMW-Medienpfad und neuen Bildern ist ausdrücklich beauftragt. Kein universeller ID7- oder BMW-Lautsprechernachweis. Die zuvor beschriebene Veröffentlichungssperre ist damit aufgehoben; die Klangbank bleibt unfertig. Aktueller Stand: [Audiopfad und Einrichtung](audiopfad-0.4.0.md), 76 Node-, 30 Python- und 14 echte Store-/Deployer-Prüfungen bestanden. Ältere Untersuchungsergebnisse unten dokumentieren den bisherigen Verlauf.

**Aktueller Befund: Die bisherigen 0.4.0-Hörproben sind vom Nutzer klanglich abgelehnt. Sie bleiben ein unfertiger Versuch; die folgenden technischen Beschreibungen sind keine Klangfreigabe. [Klanganalyse](sound-quality-0.4.0.md).**

**Stand 22. November 2026: lokaler Entwicklungskandidat, nicht als Store-Update verÃ¶ffentlicht. Fahrzeug-Audiopfad weiterhin offen.**

# Klangupdate 0.4.0 â€“ Aufnahmen, Schalten und Nachklang

Die bestehende App-ID `patryklars6_motor_sound` und der Branch `codex/luxo-sound-tuning-020` bleiben erhalten. App und Audio-Dienst tragen 0.4.0. Alle bisherigen Profile, Lautsprecherpresets, Themes, Navigations- und Diagnosefunktionen bleiben bestehen. Die bestehenden Einstellungsdefinitionen wurden mit 0.2.1 verglichen und unverÃ¤ndert erhalten; 49 neue Definitionen werden ergÃ¤nzt. Es wird keine vorhandene Settings-Datei ersetzt.

## Warum der Klang geÃ¤ndert wurde

Die alte Engine baute Motor/Auspuff vorwiegend aus Sinusschwingungen und Rauschen auf. Die frÃ¼here HÃ¶rprobe gefiel dem Nutzer nicht. Jetzt bilden bearbeitete Fahrzeugaufnahmen die Basis: zwei Ã¼berblendete Drehzahlbereiche je Grundprofil, Turbo-Spulen/Release, drei Varianten einer aufgezeichneten Auspuff-FehlzÃ¼ndung und ein kurzer Stopp-Ausschnitt. Die Dateien werden lokal aus 16 mono S16LE-Ausschnitten bei 24 kHz geladen und fÃ¼r den bestehenden 48-kHz-Ausgang gemischt. Rund 500 kB PCM werden mitgeliefert. Kein KI-Modell und kein Internetdownload werden zur MGU-Laufzeit benÃ¶tigt.

FÃ¼nf Grundprofile verwenden fÃ¼nf verschiedene Quellen. Individual bleibt eine frei bearbeitbare Abstimmung auf einer gewÃ¤hlten Basis. BMW M5 F90 und BMW M Sound bleiben als Profilnamen erhalten, sind aber **keine Originalaufnahmen dieser BMW-Modelle**. Wiedergabe-Referenzdrehzahlen sind Abstimmungswerte, keine Messungen der Quelldrehzahl. Pitch-Ã„nderung und SchleifenÃ¼berblendung kÃ¶nnen hÃ¶rbare Artefakte erzeugen; ein Test beweist keine subjektive Originaltreue.

## Lizenzen und Nachvollziehbarkeit

[Alle Aufnahmequellen und Urheber](audio-sources-0.4.0.md). V6 beruht auf [EvanBoyerman: Car Revving (Engine and Exhaust Mix)](https://freesound.org/people/EvanBoyerman/sounds/755999/) unter [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Die weiteren benutzten Quellen sind auf ihren Autorenseiten als CC0 ausgewiesen, darunter [Henaway: Ford-460-V8-Rev](https://freesound.org/people/Henaway/sounds/127980/), [modusmogulus: Car Antilag](https://freesound.org/people/modusmogulus/sounds/797835/) und [EwanPenman11: Turbo Spooling and Blow Off](https://freesound.org/people/EwanPenman11/sounds/659544/).

Genutzt werden die auf den jeweiligen Seiten Ã¶ffentlich verlinkten HQ-Vorschauen. [Freesound dokumentiert den frei abrufbaren Vorschauweg getrennt vom authentifizierten Originaldownload](https://freesound.org/docs/api/overview.html#downloading-sounds). Es werden keine Login-Sperren umgangen. Quell-URL, Lizenz-URL und Eingangs-SHA stehen in `audio/sources.json`; jeder bearbeitete PCM-Ausschnitt besitzt Intervall, Verarbeitung und eigenen SHA in `audio/manifest.json`. `ATTRIBUTION.md` wird mit dem Paket ausgeliefert. `tools/prepare_audio_assets.py` reproduziert Filter, Mono-/Sampleraten-Umwandlung, Pegel und Loops; NumPy/python-soundfile sind nur Entwicklungshilfen.

## Fahrzeugsignale und Effekte

- **Gaswegnahme:** Frische Pedalmeldungen werden innerhalb eines 650-ms-Fensters ausgewertet. Dadurch lÃ¶st auch eine schrittweise RÃ¼cknahme einen Release bzw. bei stÃ¤rkerem Abfall Pop & Bangs aus. Konstante Werte und derselbe MeldungszÃ¤hler lÃ¶sen keine neue Folge aus; veraltete Meldungen bilden keine EreignisbrÃ¼cke.
- **Gangwechsel:** `Telemetry` reicht den gemeldeten VorwÃ¤rtsgang mit Signalquelle, Zeitpunkt und ZÃ¤hler weiter. Nur ein beobachteter numerischer Gangwechsel innerhalb derselben Quelle bei gemeldeter Bewegung und laufendem Motor kann einen Schalt-Effekt auslÃ¶sen. Initialsignal, unbekannter Gang, P/N/R, Quellenwechsel oder fehlende Geschwindigkeit werden nicht zu Schaltungen umgedeutet. Keine SchÃ¤tzung aus Drehzahlabfall.
- **Knall:** Drei bearbeitete echte Impulsaufnahmen statt kurzer Rausch-Piepsen. Eigene LautstÃ¤rke, HÃ¤rte, IntensitÃ¤t und HÃ¤ufigkeit. Schaltknall bleibt zusÃ¤tzlich vom Pop-&-Bangs-Schalter abhÃ¤ngig; gespeichertes Aus bleibt Aus. Der Masterpegel und die Pegelgrenze gelten weiterhin fÃ¼r alle Komponenten.
- **Turbo:** Eigene Aufnahme-Loops und Release-Ausschnitt; vorhandene Stilwahl, Last-/Beschleunigungs-/Liftregler bleiben wirksam. Turbo-Schalten kann unabhÃ¤ngig deaktiviert werden. Fehlende Pedal- oder Gangdaten werden nicht ersetzt.
- **Abstellen:** Optionaler einmaliger Nachklang hÃ¶chstens 0,85 s nach zuvor erkanntem Motorlauf, ausschlieÃŸlich bei tatsÃ¤chlich gemeldetem Motor aus, RPM 0, Geschwindigkeit 0 und P. Ohne diese Daten bleibt er aus. Mute/Signalverlust/Bewegung beenden ihn. Kein Nachspielen nach einem App-Kaltstart.
- **Hintergrund:** Der bestehende `background()`-Teil und `autostart` bleiben aktiv. Audiotakt und Render-Sichtbarkeit sind getrennt; ein MenÃ¼wechsel beendet den Audiotakt nicht. Das mitgelieferte Kit registriert die App als aktiv und respektiert MainApp-Shutdown. Es wird keine schlafende MGU aufgeweckt oder endlos gegen deren Shutdown gearbeitet.

Die App liest weiter ausschlieÃŸlich Fahrzeugdaten. Es werden keine Befehle an MotorsteuergerÃ¤t, Getriebe, reale Klappen oder Sicherheitssysteme gesendet. AudioManager-/ALSA-Freigaben und die Diagnosearchitektur von 0.3.0 bleiben erhalten. Das Dienstupdate fÃ¼hrt die Versionskennung nach; es richtet keinen neuen OEM-Audiopfad ein.

## Tests

**64 Node-Tests, 19 Python-Tests und elf PrÃ¼fungen mit unverÃ¤ndertem echtem Store-/Deployer-Code bestanden: insgesamt 120.** ZusÃ¤tzlich wird das vollstÃ¤ndige App-Archiv inklusive aller 16 PCM-LÃ¤ngen, SHA-256 und Attribution validiert. Die vorherigen Tests fÃ¼r Navigation, Touch-Ziele, Controller-Ereignisse, DisplayauflÃ¶sungen, Settings, Audio-Dienst, UID, ALSA-Fehler, Testsenke und Store bleiben erhalten.

Neue PrÃ¼fungen betreffen verschiedene Aufnahmequellen und ihre Hashes, nur einmalige Hoch-/RÃ¼ckschalt-Ereignisse, Quell-/Providerwechsel und ungÃ¼ltige GÃ¤nge, echte Adapter-Gangtokens bis zur Audioengine, schrittweise Gaswegnahme, getrennte Pop-LautstÃ¤rke/HÃ¤rte, Turbo-Schalten, einmaligen begrenzten Stopp-Nachklang, Abbruch bei fehlenden Daten/Mute, beschÃ¤digte Klangdaten mit konkreter Fehlermeldung sowie begrenzte PCM-Pegel wÃ¤hrend fortgesetzter Synthese und schneller Profilwechsel bei fÃ¼nf AusgangskanÃ¤len.

Der tatsÃ¤chliche Store-/Deployer-Code bleibt auf [d878bed5ce5848d0c1ce852be23fac539e434a0b](https://github.com/robertnisipeanu/mgu-store/tree/d878bed5ce5848d0c1ce852be23fac539e434a0b) fixiert und vor AusfÃ¼hrung per Git-Blob-Hash geprÃ¼ft. Tool `check --artifact` und die echte InstallationsvorprÃ¼fung `preflightApp` bestehen fÃ¼r 0.4.0 im isolierten Host-Testroot. Das alte fehlerhafte 0.2.1-Paket sowie manipulierte Hashes/Units/Targets werden weiter korrekt abgewiesen. Es wird kein Fahrzeug oder systemd auf dem Entwicklungsrechner gestartet.

[Store-PrÃ¼fergebnis](validation/store-preflight-0.4.0.json) Â· [Echte Deployer-Ausgabe](validation/mgu-deploy-0.4.0-check.log) Â· [GeÃ¤nderte Dateien](validation/changed-files-0.4.0.txt)

## HÃ¶rproben und Grenzen

Sechs HÃ¶rproben wurden aus dem tatsÃ¤chlich gebauten Paket erzeugt. Ihre Eingabesequenz ist ausschlieÃŸlich ein als solcher dokumentierter Vorschauverlauf, kein Fahrzeugtrace. Leerlauf, eine Phase konstanter Drehzahl, zwei Hochschaltungen, eine RÃ¼ckschaltung, Gaswegnahme und Motorstopp werden als Ereignisse geprÃ¼ft. Kein zusÃ¤tzlicher Klang und keine Lautheitsnormalisierung werden nachtrÃ¤glich ergÃ¤nzt. MP3 ist fÃ¼r den kleineren Repository-Download verlustbehaftet aus den WAV-Dateien kodiert. [Protokoll](audio/0.4.0/previews.json) Â· [Anleitung und Aufnahmen](../README.md)

Vom Nutzer am BMW G31 bisher bestÃ¤tigt: echte RPM/Geschwindigkeit unter 0.2.2. **FÃ¼r 0.4.0 weiterhin nicht am Fahrzeug bestÃ¤tigt:** geeignete MGU-/RAM-Mischroute, hÃ¶rbare Lautsprecher, Gear-/PedalverfÃ¼gbarkeit, Schalt-Effekte mit echten Fahrdaten, konkrete Kanalzuordnung, KlangqualitÃ¤t am MATCH UP 10, Radio/CarPlay/Bluetooth parallel, akustisch unabhÃ¤ngige LautstÃ¤rke, Autostart/Langzeitbetrieb/Aufwachen, kompletter Store-Updateablauf und Head-Unit-Rechenlast. Ein anderer Klang oder mehr erfolgreiche Tests beheben einen fehlenden Hardware-Audiopfad nicht automatisch. Ohne bestÃ¤tigte Route bleibt die Ausgabe gesperrt; Diagnosebericht erforderlich.

[Fahrzeugtestplan](fahrzeugtest.md). Ein grenzenloser Dauerbetrieb bei ausgeschalteter MGU oder ohne gÃ¼ltige Fahrzeugdaten wird nicht zugesagt.

## ZusÃ¤tzliche Reparatur nach dem Fahrzeugbericht

Die Sammelmeldung â€žAudiopfad fehltâ€œ wurde nicht als konkrete Route oder errno ausgegeben. 0.4.0 meldet deshalb nicht mehr â€ž0 sichtbare GerÃ¤teâ€œ, wenn der Dienst gar nicht erreichbar ist; sie unterscheidet fehlende Ermittlung von einem tatsÃ¤chlich leeren Inventar. Der notwendige Bericht aus der installierten 0.3.0 ist in [Diagnosebericht BMW](diagnosebericht-bmw.md) beschrieben. Eine neue Store-VerÃ¶ffentlichung wird bis zur KlÃ¤rung zurÃ¼ckgehalten.

Ein echter Host-Dauertest zeigte ein Software-Timingproblem: ein Block je 20-ms-Timeraufruf erzeugte auf dem Windows-Host nur etwa 32 statt 50 BlÃ¶cken pro Sekunde. Die neue `AudioClock` berechnet BlÃ¶cke aus monoton verstrichener Zeit und holt hÃ¶chstens drei BlÃ¶cke nach. GroÃŸe VerzÃ¶gerungen werden begrenzt und als Ã¼bersprungene BlÃ¶cke gezÃ¤hlt. Im inaktiven Zustand wird die Deadline zurÃ¼ckgesetzt; es gibt keinen nachtrÃ¤glichen Tonstau nach Mute oder Signalverlust. Das ist ein belegter Host-Fehler, noch keine belegte ErklÃ¤rung fÃ¼r den konkreten BMW-Audiopfad.

Getriebesignal-Abonnements bevorzugen einen tatsÃ¤chlich angegebenen eindeutigen Katalog-Instanznamen statt pauschal Instanz 1 zu Ã¶ffnen; mehrdeutige Kataloge werden als Fehler dokumentiert. Das Legacy-Verhalten 1 bleibt nur bei fehlender Instanzliste erhalten. Exportiert werden Interface-VerfÃ¼gbarkeit, vorhandene Getter/Notifier, Getriebefeld-Deskriptoren, empfangene Rohwerte, Dekodierergebnis und Signalalter. Schaltbeobachtungen erfassen tatsÃ¤chlich gemessene RPM vor, bei und nach dem Ereignis sowie Pedal/Last, soweit vorhanden. Die Soundengine erzeugt keinen kÃ¼nstlichen Drehzahlabfall als Gangersatz.

Knall-/Turbo-Schalteffekte benÃ¶tigen neben einem echten VorwÃ¤rtsgangwechsel eine passende Lastsituation: belastetes Hochschalten bzw. belegtes Schubbetrieb-/Gaswegnahme-Herunterschalten. Ein Gangwechsel ohne geeignete Lastdaten bleibt als Beobachtung sichtbar, lÃ¶st aber keinen willkÃ¼rlichen Effekt aus. Gleichzeitiger Lift/Shift wird zu einem Impulsereignis zusammengefasst. Die Impuls-Wiedergabe ist pro Grundprofil unterschiedlich abgestimmt.

Motorleerlauf kann nun auch in D bei tatsÃ¤chlichem Stillstand, niedriger realer RPM und bekanntem unbelastetem Pedal erkannt werden. Getriebe-N und Motorleerlauf werden getrennt gefÃ¼hrt. StationÃ¤r, fahrend, Motor aus/startend, Stand mit P/N/D/R, Pedalverlauf und widersprÃ¼chliche Motor-/RPM-Signale werden getrennt ausgewiesen. Fehlende Werte bleiben unbekannt.

[Technische Audiomessungen](validation/audio-qa-0.4.0.json) prÃ¼fen digitale Pegel, DC, unerwartete stille Konstantdrehzahlfenster und Loop-ÃœbergÃ¤nge. Das Ergebnis behauptet ausdrÃ¼cklich keine subjektiv bestÃ¤tigte Originaltreue oder Abwesenheit hÃ¶rbarer Wiederholung. Sechs 24-s-HÃ¶rproben enthalten Leerlauf, Beschleunigung, konstante RPM, Hoch-/RÃ¼ckschalten, Gaswegnahme und Stopp. [Optionale Datenpakete](soundpacks.md) bleiben getrennt von der kompakten Standardbank.

## Ergebnis der lÃ¤ngeren AusgabeprÃ¼fung

Der zeitlich gepacete Echtzeittest lief **180 Sekunden** mit der tatsÃ¤chlichen verpackten Hintergrundfunktion, dem Telemetrie-Decoder, App-PcmOutput und dem unverÃ¤nderten Python-BrÃ¼ckenprotokoll zu einer Host-Testsenke. Es wurde keine OberflÃ¤che gestartet. Erfasst wurden **8.639.040 Frames / 179,98 Sekunden Audio**, 8999 von 8999 nichtleere BlÃ¶cke, grÃ¶ÃŸte AnkunftslÃ¼cke 47 ms. RSS stieg im Hostprozess von ca. 48,3 auf 51,7 MiB. Die Eingabedaten sind ausschlieÃŸlich markierte Testdaten, keine BMW-Messfahrt. Ein zuvor gemessener Callback-Unterlauf wurde durch die zeitbasierte AudioClock behoben.

[Reproduzierbares Ergebnis](validation/headless-endurance-0.4.0.json). FÃ¼r eine Wiederholung nach Entpacken des Kandidaten: `node tests/headless-endurance.cjs /pfad/zum/package /pfad/zu/python 180 /pfad/zum/bericht.json`. Der spÃ¤tere Diagnose-Flag fÃ¼r unbekannte Motorstatuskonflikte wurde danach auf unbekannt statt false korrigiert; der Audiotakt und der in diesem Test ausgefÃ¼hrte Audiozweig bleiben identisch. Die erneut erzeugten WAV-Dateien aus dem endgÃ¼ltigen Paket stimmen bytegenau mit den Quellen der bereitgestellten MP3-/QA-Dateien Ã¼berein.

Die 120 schnellen automatisierten PrÃ¼fungen bestehen zusÃ¤tzlich. Kein CPU-/Timing-/Speicherwert dieses Windows-Tests ist eine zugesagte Eigenschaft der MGU. Es gibt keinen Beleg fÃ¼r einen hÃ¶rbar unterbrechungsfreien BMW-Mixer oder eine reparierte Fahrzeugroute. Die VerÃ¶ffentlichung bleibt nach Nutzerauftrag zurÃ¼ckgehalten.

## Unabhängiger Diagnosezugang und Store-Abhängigkeiten

Das bestehende Tool `luxo-motor-audio` enthält zusätzlich `diagnostics_bridge.py` und das gemeinsame rein lesende Modul `diagnostic_support.py`. Der Diagnoseprozess importiert weder `audio_backend` noch `overlay_bridge` und besitzt keinen PCM-, Test-, Routing- oder Fahrzeugsteuerungsbefehl. Er liest ALSA-Hinweise, Karten/PCMs/Firmware, vorhandene Dateien/Rechte, systemd-Zustände und begrenzt die letzten Audio-Unit-Logs. Der vorhandene AudioManager-Probe fragt nur katalogdeklarierte Listen ab. Eine RAM-/Verstärkertypkennung wird nicht aus Namen geraten.

`luxo-motor-diagnostics.socket` und `.service` sind vom PCM-Dienst unabhängig; sie hängen nur von ihrer eigenen Socket-Unit und derselben Store-Python-Laufzeit ab. Socket-Zugriffe benötigen weiterhin den Kernel-Peer und die passende OAP-App-Registry. USB-Ziele müssen tatsächliche eingebundene USB-Geräte sein; Export legt einen neuen Bericht mit Symlink-/Pfadschutz an. Die bestehende sichere Exportfunktion wurde in das gemeinsame Modul verschoben, nicht durch einen beliebigen Dateischreiber ersetzt.

Die App fragt beide Prozesse getrennt ab, behält Fehler des PCM-Prozesses im Bericht und verwendet den Diagnosezugang zum USB-Export. Geräte können auch bei PCM-Ausfall angezeigt, aber nicht als funktionierender Ausgang ausgewählt oder bestätigt werden. Lokales Speichern wartet eine laufende Diagnose ab und benötigt keinen Dienst zum Schreiben der Datei. Fehlende Python-/Toolinstallation oder eine verweigerte Peer-Autorisierung können beide Prozesse treffen; dann wird kein USB-Erfolg vorgetäuscht.

Neue Tests: Produktions-Diagnosehandler über echten Host-Socket mit absichtlich nicht importierbarem PCM-Backend; lokales Speichern und Host-Dateiexport des Fehlerberichts; beide Endpunkte ausgefallen; unerlaubte Befehle, fremde App-ID und USB-Verweigerung. Der Host-Dateischreiber im Protokolltest ist ausdrücklich eine injizierte Windows-Testfunktion, kein Nachweis von Linux-USB-Rechten oder Fahrzeug-USB.

Die vollständige unveränderte Updater-Klasse aus demselben gepinnten Store-Commit prüft außerdem drei echte Installationspläne: Erstinstallation Python → Audio-Tool → bestehende App; Update eines alten Audio-Tools bei ausreichender Python-Version; Ablehnung ohne ausreichende installierte/verfügbare Python-Version. Nur unbenutzte benachbarte UI-/Netz-/Build-Hilfen sind beim Laden inert; die rekursiven Methoden `requirementMet`, `findRequirement` und `installPlan` laufen unverändert auf Testkatalogen. Das ist keine Installation auf der Head Unit.

Der 180-s-Test oben stammt vom vorherigen PCM-identischen Kandidaten. Die neuen Diagnoseprozesse und Statusmetadaten sind durch die aktuellen schnellen Tests geprüft; es wurde kein erneuter Fahrzeug- oder 180-s-Nachweis behauptet.
