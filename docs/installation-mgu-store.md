# Installation und Update im MGU Store

Die vollständige deutsche Anleitung mit allen Menübildern steht direkt in der [README](../README.md#installation-und-update-über-den-mgu-store).

Für **0.3.0** die vorhandene Quelle `patryklars6/BMW-Motor-Sound-MGU-App` auf Branch `codex/luxo-sound-tuning-020` aktualisieren. **LUXO Motor Sound → Aktualisieren** wählen. Die bestehende App-ID und `data/settings.json` bleiben erhalten. Nur eine bisher fehlgeschlagene Erstinstallation über **Installieren** erneut anstoßen. Der Audio-Dienst `luxo-motor-audio >= 0.3.0` wird als Abhängigkeit benötigt; er benötigt weiterhin `mgu-python >= 1.0.2`.

Ausstehende Dienste gemäß Store-Anzeige beim nächsten regulären MGU-Start aktivieren lassen. Danach **Audio-Diagnose → Diagnose aktualisieren → Diagnosebericht speichern**. Ein fehlender Mischpfad wird nicht automatisch eingerichtet und ein sichtbares PCM-Gerät ist keine bestätigte Lautsprecherroute. Bitte zuerst einen Bericht erfassen. Hörbarer Ton und vollständiger Updateablauf mit 0.3.0 sind noch nicht am Fahrzeug bestätigt.

[Reparaturbericht 0.3.0](reparatur-0.3.0.md) · [Fahrzeugtest](fahrzeugtest.md)
