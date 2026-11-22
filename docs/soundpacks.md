# Optionale Aufnahme-Pakete

Der Grundsatz bleibt: nur selbst aufgenommene oder nachweislich passend lizenzierte Audiodaten. Der mitgelieferte kompakte Satz umfasst rund 500 kB PCM. Ein optionales größeres Paket ist eine **Datenbank ohne ausführbaren Plugin-Code** und ersetzt keine MGU-Audioroute.

Die lokale Entwicklungsversion 0.4.0 kann unter **Einstellungen → Motorsound → Aufnahme-Paket** zwischen **Mitgeliefert** und **Optional installiert** wählen. Bei fehlendem/ungültigem Zusatzpaket wird ausdrücklich ein Klangdatei-Fehler gemeldet und stumm geblieben. Zurück auf Mitgeliefert lädt die vorhandene Bank. Nach einer Paketinstallation kann durch diesen Wechsel die optionale Bank neu eingelesen werden. Der Standard bleibt Mitgeliefert; gespeicherte Einstellungen werden nicht überschrieben.

Es wird hier **kein zusätzliches Original-M5-/BMW-M-Paket als verfügbar behauptet**. Die optionale Schnittstelle und der Store-Paketbau wurden mit der vorhandenen lizenzierten Bank als Testeingabe geprüft. Größere/andere Originalpakete benötigen eigene rechtmäßige Aufnahmen und eine Hör-/Hardwareprüfung.

## Für Paketautoren

Das Format entspricht `apps/patryklars6_motor_sound/audio/manifest.json`: schema 1, mono S16LE bei 24 kHz, die 16 benannten Motor-/Effektrollen, tatsächliche Frameanzahl und SHA-256 je Datei, Quellen in `sources.json` und `ATTRIBUTION.md`. Motoraufnahmen brauchen eine als Wiedergabe-Abstimmung erklärte Referenzdrehzahl. Maximal zehn Sekunden je Ausschnitt und zwölf MB PCM insgesamt begrenzen die Laufzeitlast. Der Bau prüft Länge, Prüfsummen, Format und vorhandene Lizenzangaben; er kann die Rechteinhaberschaft nicht automatisch bestätigen.

```sh
python tools/build_soundpack.py /pfad/zur/vorbereiteten-bank --output /pfad/zur/store-quellstruktur --version 0.4.0
```

Das erzeugt `pack/component.json`, `pack/audio/*` und einen tatsächlichen `mgu-repo.json`-Tool-Eintrag mit ID **luxo-soundpack**. Der echte Store-Packer und die unveränderte Deployer-Vorprüfung wurden mit dieser Struktur getestet. Der Store würde das Tool unter `/var/opt/luxo-soundpack/current` ablegen; die App liest daraus `audio/`. Die App hat keine neue App-ID und keine Pflichtabhängigkeit zu diesem optionalen Tool.

Für eine spätere Veröffentlichung im bestehenden Repository muss dessen Maintainer die geprüfte Tool-Quellstruktur und den passenden Katalogeintrag integrieren. Aktuell wurde kein solches Zusatzpaket in den öffentlichen Katalog hochgeladen. Es gibt keine erfundene Importfunktion im MGU-Menü und keinen direkten Download beliebiger Internet-Sounds auf dem Fahrzeug.
