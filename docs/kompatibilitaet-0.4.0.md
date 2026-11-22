# Kompatibilität – belegter Stand

ID7 ist als Plattform deklariert. Keine allgemeine Freigabe beliebiger originaler oder nachgerüsteter MGU, Firmware, RAM-Module oder Verstärker ist nachgewiesen. Das Fahrzeug des Nutzers ist ein G31 530d xDrive 2018 mit Retrofit ID7 und MATCH UP 10. Bestätigt wurden App-Start, RPM und Geschwindigkeit in 0.2.2; hörbarer App-Sound wurde bisher nicht bestätigt.

| Soundsystem | App-Auswahl und PCM-Abstimmung | Konkretes RAM / Firmware identifiziert | Hörbare Ausgabe / Kanäle / parallele Musik |
| --- | --- | --- | --- |
| Standard | Softwaretest bestanden | Nein | Nicht am Fahrzeug bestätigt |
| BMW HiFi | Softwaretest bestanden | Nein | Nicht am Fahrzeug bestätigt |
| Harman Kardon | Softwaretest bestanden | Nein | Nicht am Fahrzeug bestätigt |
| Bowers & Wilkins | Softwaretest bestanden | Nein | Nicht am Fahrzeug bestätigt |
| MATCH UP 8 | Softwaretest bestanden | Nein | Nicht am Fahrzeug bestätigt |
| MATCH UP 10 | Softwaretest bestanden; Nutzer hat Auswahl und Live-Daten genutzt | Konkrete Route nicht belegt | Nutzer meldet fehlenden Ton; offen |
| Sonstiges / Aftermarket | Anpassbare Softwarewerte getestet | Nein | Nicht am Fahrzeug bestätigt |

Die Menüauswahl ist ein Klangpreset und kein Geräte-Nachweis. Tatsächliche PCM-Geräte werden über ALSA ermittelt. RAM-Modell und Verstärker werden ohne messbare Information als unbekannt geführt. Die Kanalzahl wird erst nach erfolgreicher Formatverhandlung gemeldet; die physische Belegung erfordert den gehörten Kanaltest. Stereo erlaubt keinen getrennten Front-/Heck-/Center-Nachweis. Die App konfiguriert keinen Verstärker-DSP und beansprucht keine OEM-Medienquelle automatisch.

Für jede zusätzliche Kombination sind Firmware, RAM-Typ, Verstärker/Kabelbaum, gewählter PCM-Ausgang, verhandeltes Format, gehörte Zuordnung, Radio/Bluetooth/CarPlay und Lautstärkekopplung separat zu protokollieren. [Fahrzeugtest](fahrzeugtest.md) · [Benötigter Bericht](diagnosebericht-bmw.md)

Der neue optionale [BMW-Medienmodus](audiopfad-0.4.0.md) erkennt Quelle/Senke aus dem Katalog und öffnet einen beobachteten CarLife-Stereo-PCM erst nach bestätigter Verbindung. Dies ist kein Parallelmixer und keine Mehrkanalfreigabe; er ersetzt Musik und folgt BMW-Lautstärke. Hardwarefreigaben in der Tabelle bleiben offen.
