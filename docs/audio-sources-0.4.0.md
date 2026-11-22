# Aufnahmequellen und Lizenzen

Diese App verwendet bearbeitete Ausschnitte aus öffentlich angebotenen Freesound-HQ-Vorschauen. Die Quellen und ihre individuellen Lizenzen sind unten angegeben. Keine Aufnahme wurde mit einem KI-Modell erzeugt oder zum Modelltraining verwendet.

Die Bearbeitung umfasst Ausschnittwahl, Mono-Umwandlung, Frequenzfilter, Pegelanpassung, 24-kHz-PCM, Schleifenüberblendung und dynamische Wiedergabe. Die Referenzdrehzahlen sind Wiedergabe-Abstimmungen; in den Aufnahmen wurde keine Drehzahl gemessen. Die Profile BMW M5 F90 und BMW M Sound verwenden andere, ausdrücklich benannte Fahrzeugaufnahmen als Klangbasis und sind keine Originalaufnahmen dieser BMW-Modelle.

| Quelle | Urheber | Lizenz |
| --- | --- | --- |
| [Car Revving (Engine and Exhaust Mix)](https://freesound.org/people/EvanBoyerman/sounds/755999/) | EvanBoyerman | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [Big Block V8 Rev.mp3](https://freesound.org/people/Henaway/sounds/127980/) | Henaway | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [v8 engine rev.wav](https://freesound.org/people/overmedium/sounds/651534/) | overmedium | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [Import car revs on Chassis Dyno with Turbo.wav](https://freesound.org/people/editboy23/sounds/496171/) | editboy23 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [SFX_Car_Engine_Inside_RPMHigh.wav](https://freesound.org/people/GiocoSound/sounds/401549/) | GiocoSound | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [Car Antilag (No cleanup, 32float)](https://freesound.org/people/modusmogulus/sounds/797835/) | modusmogulus | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [Turbo Spooling and Blow Off.WAV](https://freesound.org/people/EwanPenman11/sounds/659544/) | EwanPenman11 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [SFX_Car_Engine_Inside_Stop.wav](https://freesound.org/people/GiocoSound/sounds/401553/) | GiocoSound | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

V6 basiert auf der V6-/Auspuff-Aufnahme von EvanBoyerman (CC BY 4.0); die übrigen hier benutzten Quellen sind vom jeweiligen Autor als CC0 gekennzeichnet. Die Autoren unterstützen oder bestätigen dieses Projekt nicht automatisch.

`sources.json` enthält beobachtete Vorschau-URLs und SHA-256 der Quelldateien. `manifest.json` beschreibt jeden enthaltenen bearbeiteten Ausschnitt mit Intervall, Verarbeitung und eigener Prüfsumme. Reproduktion: `python tools/prepare_audio_assets.py --cache /pfad/zum/cache` (Entwicklungsrechner mit NumPy und python-soundfile). Diese Hilfsprogramme werden zur Fahrzeuglaufzeit nicht benötigt.

Die Audiodateien behalten die oben angegebenen Quellenlizenzen. Diese Zuordnung verleiht keine BMW-Markenrechte und behauptet keine Herstellerfreigabe.
