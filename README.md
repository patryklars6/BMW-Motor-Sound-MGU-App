# BMW Motor Sound MGU App

**LUXO Motor Sound** für BMW MGU mit iDrive 7. Die App zeigt reale Fahrzeugdaten über die lesenden SOME/IP-Schnittstellen der Head Unit an und erzeugt daraus einen separat regelbaren Motorsound. Die erste Version **0.1.0** ist für den Fahrzeugtest vorbereitet.

## Im MGU Store hinzufügen

Vorausgesetzt werden eine mit dem Community-MGU-Store kompatible MGU mit iDrive 7, ein funktionierender Store und die dort verfügbare Python-Buildumgebung. Unter **Einstellungen → Quelle hinzufügen** `patryklars6/BMW-Motor-Sound-MGU-App` eingeben, den Branch **main** wählen, die Quelle aktualisieren und **LUXO Motor Sound** öffnen. Der Store baut das Paket auf der Head Unit mit ihrem eigenen BMW SDK. [MGU-Store-Paketformat](https://github.com/robertnisipeanu/mgu-store/blob/main/docs/PUBLISHING.md)

Für Tests am PC steht das gebaute [ID7-Paket 0.1.0](packages/patryklars6_motor_sound@0.1.0.tgz) bereit. Der Branch-Build passt die Fahrzeugdatenfelder an den Katalog der jeweiligen MGU an.

## Funktionen

- LUXO-Oberfläche in Dunkelgrau und Weiß mit dezentem Lila. Live-Ansicht für Drehzahl, Geschwindigkeit, Motorstatus, Gang, Fahrmodus und Motorleerlauf. Fehlende Werte erscheinen als Strich.
- **V8 Sound**, **BMW M5 F90**, **BMW M Sound** und **Individual**. Die Klänge werden synthetisiert. Individual bietet getrennte Regler für Motor, Turbo, Auspuff, Bass und den Effekt bei Gaswegnahme.
- Automatische Profilzuordnung für **ECO PRO**, **COMFORT**, **SPORT** und **SPORT PLUS**, mit einzeln änderbarer Klangwahl. Alternativ lässt sich ein Profil manuell wählen.
- **Standard**, **BMW HiFi**, **Harman Kardon**, **Bowers & Wilkins**, **MATCH UP 8**, **MATCH UP 10** und **Sonstiges**. Die Auswahl passt den App-Mix an. Sonstiges bietet eine Startvorlage und Einstellungen für Pegel, Bass und hintere Lautsprecher.
- Getrennter Motorsound-Pegel mit Obergrenze, Balance und Fader. Der Fader verteilt den Sound auf vordere und hintere Kanäle, wenn der Audiopfad vier Kanäle anbietet.
- Hintergrundbetrieb über MGU-Autostart angelegt. Für die Wiedergabe müssen der Motor laufen, frische Drehzahldaten anliegen und ein separater Mischpfad verfügbar sein. Der Motorsound ist bei der Erstinstallation ausgeschaltet.

## Stand im Fahrzeug

Der Paketbau und die automatisierten Tests sind lokal prüfbar. Ein Test auf der MGU im BMW G31 530d mit MATCH UP 10 steht aus. Insbesondere ist für Serien-MGU bislang kein separater BMW-Mischpfad verifiziert, der Radio und CarPlay ununterbrochen weiterlaufen lässt. Die App meldet in diesem Fall **Kein freigegebener Audiopfad** und bleibt stumm. Der [Fahrzeugtestplan und Audiopfad](docs/fahrzeugtest.md) enthält die offenen Schritte.

## Bauen und testen

```sh
python tools/build_store.py
node --test tests/runtime.test.js
python -m unittest discover -s tests -p test_bridge.py
python tests/verify_package.py dist/patryklars6_motor_sound@0.1.0.tgz
```

Der Paketbau braucht Python 3 und das mitgelieferte App-Kit-Archiv. Die Hosttests verwenden Node.js ab Version 20. Die App-Laufzeit zielt auf die Node.js-8-Umgebung der ID7-MGU. [Herkunft des App-Kits](vendor/README.md)
