# Klangqualität 0.4.0 – offen und nicht freigegeben

Der Nutzer hat die bisherigen sechs Arbeitsproben als dünn, elektronisch und „Roblox-artig“ abgelehnt. Dieser Befund wird nicht durch bestandene PCM-/Pegeltests entkräftet. Die vorhandene Bank ist im Manifest ausdrücklich als „rejected-by-user“, „productionReady: false“ markiert; die Audio-Diagnose zeigt den unfertigen Klangstand. Dateien, Regler, Profile und gespeicherte Werte bleiben erhalten. Keine erneute Veröffentlichung dieses Versuchs als fertiger Realsound.

## Konkrete Grenzen der jetzigen Bank

- Pro Grundprofil existieren nur zwei sehr kurze Ausschnitte aus wechselnden Rev-Aufnahmen. Teilweise liegen die Schleifen unter einer Sekunde. Wiederholungen, bereits im Original veränderliche Drehzahl und erneute Tonhöhenänderung können den beanstandeten monotonen Charakter erklären. Das ist eine Code-/Quellenanalyse, keine objektive Messung subjektiver Natürlichkeit.
- Die Referenz-RPM sind Wiedergabe-Abstimmungswerte. Drehzahl und Last der Aufnahme wurden nicht gemessen. Es gibt kein verifiziertes mehrstufiges Last-/Schubbetrieb-Dataset.
- Motor und Auspuff werden aus derselben Motorbasis bearbeitet; es fehlen getrennt aufgenommene Engine-/Exhaust-Stems pro Profil.
- Alle Profile greifen auf dieselben Turbo-Spool-/Release-Quellen zu. Stil-/Pitch-/Pegeländerungen erzeugen keine eigenen authentischen Turboaufnahmen.
- Das Profil BMW M5 F90 verwendet derzeit eine nicht als F90 identifizierte V8-Quelle. BMW M Sound basiert auf einer Supra-Aufnahme. Die Namen bleiben zum Erhalt der Einstellungen bestehen; originale BMW-Modellidentität wird nicht behauptet.
- Digital begrenzter Pegel, keine stillen Testfenster und verschiedene Hashes/PCM-Ausgaben beweisen weder Realismus noch deutlich unterschiedliche gehörte Profile.

## Geprüfte weitere Quellen

Recherche am 22. November 2026:

| Quelle | Beleg | Ergebnis |
| --- | --- | --- |
| Freesound, Omidzamani „Car Rev“ | [Autorenseite](https://freesound.org/people/Omidzamani/sounds/755507/) nennt BMW M5, 38,5 s, CC BY-NC 4.0 | Kein F90-Modellnachweis, keine gemessenen RPM-/Laststufen; nicht als fertig geeignet übernommen. |
| Sonniss / Pole Position BMW M5 E39 | [Produktseite](https://sonniss.com/sound-effects/bmw-m5-v8/) beschreibt getrennte Motor-/Auspuff-/Ansaugaufnahmen und verschiedene RPM-Zustände | E39, kein F90. Kein Kauf und kein Download der geschützten Originaldateien durchgeführt. |
| Sonniss GDC-Bundle | [Tatsächliche Lizenz](https://sonniss.com/gdc-bundle-license/) unterscheidet Projektnutzung von Weitergabe als Soundeffekt-/Samplepaket | Keine pauschale Erlaubnis abgeleitet, Dateien als öffentliches GitHub-Samplepaket weiterzugeben. Keine Aufnahme daraus integriert. |

Es liegt weiterhin **kein geprüftes passendes, öffentlich weiterverteilbares Original-F90-Aufnahmepaket** vor. Allgemeine Suchergebnisse, MP3-Previews und der Kauf einer allgemeinen SFX-Lizenz ersetzen diese Prüfung nicht. Keine YouTube-/Spielaudio-Extraktion, kein Umbenennen eines anderen Motors in eine „echte F90-Aufnahme“.

## Für den nächsten tragfähigen Klangschritt benötigt

Eine geeignete freigegebene Originalbank oder eigene Aufnahmen mit dokumentierter Erlaubnis für Bearbeitung, App-Nutzung und öffentliche GitHub-Weitergabe:

1. Tatsächlicher Fahrzeug-/Motortyp und Quelle; für F90 eine bestätigte F90-Aufnahme.
2. Saubere zusammenhängende Leerlauf- und mehrere gehaltene RPM-Stufen, jeweils mit bekannten Mess-RPM und möglichst getrennten Motor-/Auspuffperspektiven.
3. Beschleunigungs- und Schubzustände, echte Turbo-Spool-/Release-Ereignisse sowie geeignete Schalt-/Stoppaufnahmen des jeweiligen Klangtyps.
4. Unbeschnittene WAV-/FLAC-Originale ohne Musik, Windübersteuerung oder eingerechnete künstliche Effekte; zugehörige Lizenz/Einwilligung.

Eigene vorhandene Originaldateien können gezielt geprüft werden. Es wird keine gefährliche Aufnahmefahrt oder manuelle Installation beim Nutzer verlangt. Ein künftiger benötigter Soundbestandteil muss Bestandteil der bestehenden Store-Quelle bzw. ihrer korrekt deklarierten Abhängigkeiten sein; das aktuelle optionale Packformat ist nur ein getesteter Entwicklungsweg, kein ausgeliefertes fertiges Paket.

Zuerst muss der reale Lautsprecherpfad anhand des [Fahrzeug-Diagnoseberichts](diagnosebericht-bmw.md) geklärt werden. Ein Wechsel der Klangdateien behebt einen fehlenden MGU-/RAM-Ausgang nicht.
