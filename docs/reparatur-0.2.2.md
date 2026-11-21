# Installationskorrektur 0.2.2

Die App und ihr Audio-Dienst tragen Version **0.2.2**. Die App-ID bleibt `patryklars6_motor_sound`, der Dienst heißt weiterhin `luxo-motor-audio`. Profile, Einstellungen und deren Speicherpfad bleiben erhalten. Das Einstellungs-Schema wurde mit dem gebauten Paket 0.2.1 verglichen und ist identisch.

## Ursache und Paketdaten

Der Socket wird im Tool-Manifest so aktiviert:

```json
"enable": [{"unit": "luxo-motor-audio.socket", "target": "sockets.target"}]
```

Der echte Deployer verlangt bei jedem Eintrag `unit` und `target`. Das Paket 0.2.1 enthält stattdessen eine Zeichenkette und wird mit `bad enable entry` zurückgewiesen. Damit wird der Audio-Dienst nicht installiert; die App kann ihre benötigte Audio-Dienst-Version nicht vorfinden. Der Store-Packer übernimmt `enable` unverändert. Eine Prüfung des Packers allein deckt diesen Fehler nicht ab.

App-Spezifikation und `mgu-repo.json` fordern `luxo-motor-audio >= 0.2.2`. Die Version des Tool-Katalogeintrags liest der echte Store aus `tools/component.json`. Der Dienst benötigt weiterhin `mgu-python >= 1.0.2`. Beide systemd-Units sind im Paket vorhanden; nur der Socket wird für `sockets.target` aktiviert und neu gestartet. Die Datei `overlay_bridge.py` hat im Paket eine vom Store berechnete SHA-256-Prüfsumme.

## Prüfung mit dem tatsächlichen Store und Deployer

Verwendet wurde der unveränderte Quellcode aus [robertnisipeanu/mgu-store, Commit 3ecfafd4b6b2492c1776f53e3b74add5653c5c61](https://github.com/robertnisipeanu/mgu-store/tree/3ecfafd4b6b2492c1776f53e3b74add5653c5c61):

- `native/mgu-updater/js/sources.js`, `catalog.js` und `tar.js` lesen den echten Katalog und bauen das Audio-Dienstpaket.
- `deploy/unit/mgu-deploy.js`, Version **0.8.27**, führt seine eigene CLI-Prüfung `check --artifact` und seine Funktion `preflightApp` aus. Für Tools prüft diese Funktion das gesamte Archiv über `validateArtifact` und `validateTool`.
- Alle vier Dateien werden vor der Ausführung gegen ihre Git-Blob-Prüfsummen geprüft. Der Deployer-Code wird für den Test nicht verändert. Nur seine Ausgabe und sein Prozessende werden im Host-Kontext abgefangen. Seine konfigurierbaren Hardwarepfade zeigen auf ein isoliertes Testverzeichnis. Die Archive werden tatsächlich mit `tar` entpackt und ihre Nutzdateien vom Deployer gelesen und geprüft.

Ergebnis: **35 Node-Tests, vier Python-Tests, die App-Paketprüfung und zehn zusätzliche Store-/Deployer-Prüfungen bestanden.**

| Prüfung | Ergebnis |
| --- | --- |
| Echter Store-Katalog: App, Tool und Abhängigkeiten 0.2.2 | Bestanden |
| Unverändertes Audio-Paket 0.2.1 im echten Deployer | Fehler `bad enable entry`, Exitcode 2, reproduziert |
| Neu gepackter Audio-Dienst 0.2.2: echter Deployer `check` | Exitcode 0 |
| Audio-Dienst 0.2.2: echte Installationsvorprüfung `preflightApp` | Bestanden; kein Dienst installiert oder gestartet |
| Aktivierungsziel, enthaltene Units, Restart-Eintrag und Dateiprüfsumme | Bestanden |
| Fehlendes `enable.target` als beschädigtes Testpaket | Korrekt zurückgewiesen |
| Veränderte Python-Nutzdatei als beschädigtes Testpaket | Prüfsummenfehler korrekt zurückgewiesen |
| Fehlende Service-Unit als beschädigtes Testpaket | Korrekt zurückgewiesen |
| App-Archiv 0.2.2: echte Deployer-Archivvalidierung, App-ID und ID7 | Bestanden |
| App-ID und vollständiges Einstellungs-Schema gegenüber 0.2.1 | Identisch |

[Maschinenlesbares Ergebnis](validation/store-preflight-0.2.2.json) · [Ausgabe des echten Deployer-Checks mit gekürzten Testpfaden](validation/mgu-deploy-0.2.2-check.log)

## Update im Fahrzeug

1. Im MGU Store die bestehende Quelle `patryklars6/BMW-Motor-Sound-MGU-App` auf Branch `codex/luxo-sound-tuning-020` aktualisieren.
2. Prüfen, dass **LUXO Motor Sound 0.2.2** angeboten wird. Aktualisieren oder die bisher fehlgeschlagene Installation erneut starten. Der Store muss den Audio-Dienst **0.2.2** mitnehmen.
3. Falls der Store ausstehende Dienste meldet, dessen Hinweis zum nächsten regulären Start der MGU beachten.
4. Nach dem Öffnen unter **Lautstärke und Audio** den tatsächlichen Dienststatus prüfen.

## Noch nicht am Fahrzeug bestätigt

Die Prüfungen liefen auf Windows mit Node.js 24.22.3. Sie ersetzen weder den vollständigen Installationslauf auf der MGU noch einen Linux-systemd-Dienststart. Die App wurde durch den echten Deployer als Archiv validiert; ihre OEM-SDK-Verknüpfung und MainApp-Installation laufen erst auf der Head Unit. Der konkrete Manifestfehler ist reproduziert und seine Korrektur besteht die echte Audio-Dienst-Vorprüfung.

Eine hörbare Audioausgabe benötigt weiterhin einen auf der Fahrzeug-MGU bestätigten ALSA-Mischpfad `luxo_overlay`. Unabhängigkeit von der BMW-Musiklautstärke, parallele Medienwiedergabe und physische Kanalzuordnung sind weiter offen. Diese Installationskorrektur verändert keine Fahrzeugsteuergeräte und richtet keinen OEM-Audiopfad ein.
