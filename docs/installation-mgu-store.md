# LUXO Motor Sound im MGU Store installieren

Diese Anleitung gilt für den Community-MGU-Store auf BMW-MGU-Head-Units mit **iDrive 7**. Sie setzt voraus, dass der MGU Store bereits installiert ist, sich öffnen lässt und Internetzugang hat. [Dokumentation zum MGU Store](https://github.com/robertnisipeanu/mgu-store#readme)

## 1. GitHub-Quelle hinzufügen

1. Öffne den **MGU Store** in deinem BMW.
2. Wähle **Einstellungen → Quelle hinzufügen**. Bei englischer Sprache steht dort **Settings → Add source**.
3. Gib den Namen des öffentlichen GitHub-Projekts ein.

   ```text
   patryklars6/BMW-Motor-Sound-MGU-App
   ```

4. Wähle in der angezeigten Kanalauswahl den passenden Branch.

   | Welche Version möchtest du installieren? | Branch im MGU Store |
   | --- | --- |
   | **0.2.0** mit der neuen LUXO-Oberfläche, sechs Klangprofilen und Sound-Tuning | `codex/luxo-sound-tuning-020` |
   | **0.1.1** vom Hauptbranch, solange die Testversion im Pull Request liegt | `main` |

   Die Version 0.2.0 liegt in [Pull Request #1](https://github.com/patryklars6/BMW-Motor-Sound-MGU-App/pull/1). Für öffentliche GitHub-Quellen ist normalerweise keine GitHub-Anmeldung nötig.

## 2. App installieren

1. Lass den Store die gewählte Quelle laden. Aktualisiere die Quelle im Store, falls die App noch nicht angezeigt wird.
2. Wähle **LUXO Motor Sound** und prüfe im Store, ob die gewünschte Versionsnummer angezeigt wird.
3. Wähle **Installieren** bzw. **Install**. Der Store lädt die Dateien aus dem gewählten Branch und baut die App auf deiner Head Unit. Wenn der Store einen weiteren Schritt anzeigt, folge seiner Meldung. [So verarbeitet der MGU Store einen GitHub-Branch](https://github.com/robertnisipeanu/mgu-store/blob/main/docs/PUBLISHING.md#3-repo-tree)
4. Öffne **LUXO Motor Sound** anschließend aus der iDrive-App-Liste. In Version 0.2.0 findest du die Versionsnummer auch unter **Info** im Hauptmenü.

## 3. Erster Start

1. Öffne **Live-Daten** und prüfe im Stand, ob Drehzahl und Motorstatus angezeigt werden. Fehlende Werte erscheinen als **Nicht verfügbar**.
2. Wähle unter **Lautsprecher** dein System, zum Beispiel **MATCH UP 10**, und unter **Soundprofile** den gewünschten Klang.
3. Stelle unter **Einstellungen → Motorsound** zuerst einen niedrigen Pegel und eine Obergrenze ein. Der Motorsound ist bei der ersten Einrichtung ausgeschaltet. Einschalten kannst du ihn über den großen Schalter im Hauptmenü.

Die Installation im Fahrzeug steht noch zur Prüfung aus. Für hörbaren Motorsound braucht die App zusätzlich einen bestätigten Audiomischpfad. Bis dahin kann die App **Audiopfad nicht verfügbar** anzeigen. [Fahrzeugtest und Audiopfad](fahrzeugtest.md)

## Wenn du nicht weiterkommst

| Was siehst du? | Was kannst du prüfen? |
| --- | --- |
| Die Quelle lässt sich nicht laden | Prüfe den Internetzugang des Stores und die Schreibweise des Repository-Namens. |
| Die App erscheint als 0.1.1 | Prüfe den gewählten Branch. Für 0.2.0 verwende `codex/luxo-sound-tuning-020`. |
| Der Store meldet einen Paketbaufehler | Prüfe die Detailmeldung im Store. Für diesen Branch benötigt der Store seinen Python-Build-Support `mgu-python`. |
| Die App öffnet sich, aber es kommt kein Ton | Prüfe den Motorsound-Schalter und die Meldung zum Audiopfad. |

[Menüs im LUXO-Design ansehen](menuevorschau.md) · [Vollständige Bedienungsanleitung](../README.md)
