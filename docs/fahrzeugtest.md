# Fahrzeugtest für Update 0.4.0

## Bisherige Fahrzeugbeobachtung

Der Nutzer bestätigt für **0.2.2** auf BMW G31 530d xDrive, Baujahr 2018, nachgerüstete MGU ID7, MATCH UP 10: App läuft, echte Drehzahl und Geschwindigkeit sichtbar, kein Motorsound; Meldungen Audio-Dienst nicht erreichbar / Audiopfad fehlt / Audiokanäle nicht bestätigt. 0.4.0 ist noch nicht auf diesem Fahrzeug getestet. Es gibt keine pauschale Freigabe anderer MGU-/RAM-Kombinationen.

## Prüfablauf

1. Bestehende Installation gemäß [README](../README.md#installation-und-update-über-den-mgu-store) aktualisieren. **App und Dienst 0.4.0** prüfen. Vorhandene Profile, Einzelpegel, Amp-Auswahl, Moduszuordnungen und Theme müssen erhalten bleiben; nach normalem Neustart erneut prüfen.
2. **Audio-Diagnose → Diagnose aktualisieren**. Versionsdaten, UID/GID, systemd, Socket, Ausgabehindernis und sichtbar gemeldete Geräte erfassen. Bericht lokal speichern und, falls angeboten, auf vorhandenen USB-Datenträger exportieren. Dienst nicht erreichbar: lokale Berichtsdaten und Fehlermeldung zurückgeben. USB-Schreiben auf MGU ist ungetestet.
3. RAM-Typ, Verstärker, Kabelbaum und Fahrzeugsoftware vor Ort dokumentieren. Die App erkennt diese Modelle nicht aus der gewählten Soundsystem-Vorgabe. AudioManager-Listen sind Beobachtungen der vorhandenen Firmware, keine Freigabe von Quellen oder Verbindungen.
4. Nur einen vor Ort bestätigten separaten ALSA-Mischpfad auswählen. Kein `luxo_overlay` wird vorausgesetzt oder eingerichtet. Ohne nutzbaren Ausgang endet die Audiofreigabe hier mit Diagnosebericht; OEM-/SmartX-Standardquellen nicht versuchsweise übernehmen.
5. Bei Motor aus, gemessener Geschwindigkeit 0 und eindeutig P den leisen Stereo-Test durchführen. Fehlende oder mehrdeutige P/N-Daten sperren den Test. App-Peak etwa 1,5 %, serverseitige Grenze 2 %; die Lautstärke am Lautsprecher ist damit nicht gemessen. Abbruch durch Stoppen, Motorstart, Signalverlust oder Verlassen der Grafik prüfen.
6. Erst nach erfolgreicher ALSA-Formatannahme und gehörtem Stereo-Test den ausgewählten Mehrkanalpfad prüfen, sofern vorhanden. Reihenfolge **vorn links, vorn rechts, hinten links, hinten rechts, optional Center**. Jeden angezeigten Bereich tatsächlich abhören; bei falscher/zusammengefasster Ausgabe keine Zuordnung bestätigen. PCM-Kanäle sind nicht mit den DSP-Ausgängen eines MATCH-Verstärkers gleichzusetzen.
7. Nur bei vollständig korrekt gehörtem Test **Gehörte Kanalzuordnung bestätigen**. Bericht bezeichnet die Evidenz als Benutzerbeobachtung. Neue Route/anderes Kanalformat/Geräte- oder Firmwareänderung muss neu geprüft werden.
8. Mit niedrigem App-Pegel laufenden Motor und reale RPM prüfen. Alle sechs Profile, vier Effekte, Schalter, Einzelpegel, Bass, Charakter, Turbo-Varianten und Balance testen. Gaswegnahme-Effekte brauchen echte aufeinanderfolgende Pedalsignale. Fehlende/frische RPM, Motor-Aus und Stummschaltung prüfen. Automatik bei fehlendem Fahrmodus durch manuelle Profilwahl ersetzen.
9. Radio, Bluetooth und CarPlay getrennt testen: bleiben sie hörbar? BMW-Musiklautstärke ändern und Motorsound an den Lautsprechern vergleichen. App-Pegel verändern und Musik vergleichen. Bei gegenseitiger Lautstärkekopplung den Ausgang ausdrücklich als gekoppelt dokumentieren. Warn-/Navigations-/Anruftöne und Medienwechsel kontrollieren. Keine Unabhängigkeit allein aus getrennten Software-Reglern ableiten.
10. Navigation mehrfach prüfen: natives Hauptmenü → LUXO → Fahrmodus → Zurück → grafisches Hauptmenü. Aus Profilen, Tuning, Motor, Turbo, Auspuff, Pop & Bangs, Lautsprecher, allgemeinen Einstellungen, Design, Live-Daten und Audio-Diagnose zurückkehren. Onscreen-Zurück, Hauptmenü, BMW-Menü, originale BMW-Zurücktaste, Controller drehen/drücken/links und Touch separat testen. Auch native Untermenüs testen. Die Hosttests bestätigen Ereignisverarbeitung, nicht reale Hardware-Ereignisse.
11. Volle tatsächlich verfügbare Fläche, BMW-Statusleisten, Fokus und Touchpunkte auf dem verbauten Display prüfen. Renderer-Ausfall muss zum nativen Menü führen. Tatsächliche Bildrate, Hintergrundbetrieb, normales Aufwachen/Neustart separat messen.
12. Erneut Diagnosebericht erfassen, gehörte Beobachtungen (einschließlich Quelle und Lautstärkeabhängigkeit) ergänzen und zum Projekt zurückgeben. Berichtdateien vor öffentlichem Upload auf private Informationen prüfen.

## Grenzen

63 Node-, 19 Python- und zehn echte Store-/Deployer-Prüfungen plus App-Archivvalidierung bestehen auf dem Entwicklungsrechner. Sie ersetzen keinen Fahrzeugtest. Als Erfolg getrennt erfassen: **Engine erzeugt PCM → Socket nimmt Daten an → ALSA nimmt Frames an → richtige Lautsprecher hörbar → Musikparallelität → unabhängige akustische Lautstärke**.

Die Fahrzeuganbindung verwendet vorhandene SOME/IP-Getter/Abonnements und sendet keine ECU-/Getriebe-/Codierbefehle. Im Diagnosewerkzeug werden ausschließlich die katalogdefinierten AudioManager-Listen gelesen. Es werden keine Medienquellen verbunden oder OEM-Routen verändert. [Technischer Bericht und Quellen](reparatur-0.4.0.md)

## Zusätzliche Klangprüfung in 0.4.0

- Fünf Aufnahme-Grundprofile und Individual direkt vergleichen. Ein unterschiedliches PCM-Signal oder eine andere Quelldatei beweist noch keine subjektiv realistische Wiedergabe. M5/M sind Klangabstimmungen auf anderer Aufnahmebasis.
- Gang in der App mit dem Fahrzeug vergleichen. Echte Hoch-/Rückschaltungen im Vorwärtsbetrieb prüfen; bei fehlendem Gang darf kein Drehzahlabfall als Ersatz-Schaltung dienen. Erster Gangwert, P/N/R und konstante/repetierte Werte dürfen keine Knallfolge auslösen. Die tatsächliche Verfügbarkeit des Gangs auf dem G31 ist bisher nicht bestätigt.
- Pop-Volume auf null, Härte, Häufigkeit, Schaltknall-Aus und Turbo-Schalten-Aus getrennt prüfen. Gas langsam und schnell wegnehmen; es darf ohne neues Ereignis kein neuer Effekt entstehen.
- Bei P, echter Geschwindigkeit 0 und laufendem Motor stoppen: maximal 0,85 s optionaler Nachklang nach gemeldetem Motor aus/RPM 0. Unbekannte Park-/RPM-Daten sperren ihn. App-Neustart bei bereits abgestelltem Motor darf ihn nicht nachspielen.
- Menü verlassen und Hintergrundbetrieb mit kontinuierlich frischen RPM prüfen. Reguläres Einschlafen und Aufwachen der MGU testen. Ein Hosttest kann keinen Dauerbetrieb gegen die Lebenszyklusverwaltung der Head Unit garantieren.
