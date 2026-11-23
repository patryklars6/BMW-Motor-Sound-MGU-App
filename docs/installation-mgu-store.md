# Installation über GitHub und MGU Store

0.4.1 aktualisiert die vorhandene App patryklars6_motor_sound. Einstellungen, Profile und Menüs bleiben erhalten. Keine allgemeine ID7-Freigabe; tatsächliche Lautsprecherausgabe im BMW und Klangqualität noch unbestätigt.

1. Im bereits installierten Community-MGU-Store die Quelle **patryklars6/BMW-Motor-Sound-MGU-App** aktualisieren.
2. Den Branch **codex/luxo-sound-tuning-020** wählen.
3. Bei LUXO Motor Sound Version **0.4.1** prüfen und **Aktualisieren** wählen. Keine Deinstallation.
4. Der Store plant die Abhängigkeiten: **mgu-python >= 1.0.2 → luxo-motor-audio >= 0.4.1 → vorhandene App**. Ausreichende installierte Versionen werden übersprungen. Fehlt eine nötige Laufzeit in Installation und Quellen, verweigert der Store den Plan.
5. Das Audio-Tool richtet PCM-Ausgabe und unabhängige Diagnose/USB-Export automatisch ein. Keine manuelle Dienstinstallation. Reguläre Store-Hinweise zum nächsten Head-Unit-Start beachten.
6. **BMW-Menü → Audio-Diagnose → Diagnose aktualisieren** öffnen und Dienstversion/Fehler prüfen.
7. **Audiomodus einrichten → BMW-Medienquelle einrichten** öffnen. Der Modus ist **Stereo, ersetzt die Musikquelle und folgt der BMW-Lautstärke**. Mit **Diesen Medienmodus verwenden** bewusst aktivieren.
8. Für den leisen Kanaltest: Motor aus, gemessene Geschwindigkeit 0 und P. Für Motorsound sind frische reale RPM/Motorwerte und ein gewähltes Profil erforderlich. Fehlende Voraussetzungen bleiben als Fehler sichtbar.

**Ausschließlich Installation über die bestehende GitHub-Quelle im MGU Store. Keine ZIP-/USB-Installation und keine manuelle Diensteinrichtung.** USB ist nur für Diagnoseberichte vorgesehen.

[README mit allen Bildern](../README.md) · [Audiopfad und Grenzen](audiopfad-0.4.0.md) · [Fahrzeugdiagnose](diagnosebericht-bmw.md)

Die abgelehnte Klangbank bleibt unfertig. Das Update ist keine bestätigte Realsound-Freigabe. Die echte Store-Planung und Paketvorprüfung bestehen im Host-Test; der vollständige Vorgang auf deiner Head Unit bleibt offen.

0.4.1 ergänzt die eigenen Recovery-Manager-Dienstregistrierungen. Ein neuer Eintrag wird gegebenenfalls erst beim regulären nächsten Head-Unit-Start geladen; keine manuelle Diensteinrichtung und kein Umgehen des Recovery Managers. [Neue Fahrzeugdiagnose und Reparatur](reparatur-0.4.1.md).
