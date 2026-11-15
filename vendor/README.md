# iDrive 7 App Kit

`idrive7-kit.zip` enthält eine Auswahl aus dem MIT-lizenzierten iDrive 7 App Kit unter Commit `b2880634eb214e29f008422b970cf22ea2de280f`. Das Archiv enthält den Original-Lizenztext. Die Auswahl und der Download sind in `tools/vendor_kit.py` dokumentiert. [Upstream-Commit](https://github.com/cauliflowermossgrape/idrive7-apps/tree/b2880634eb214e29f008422b970cf22ea2de280f)

Der Paketbauer verwendet das Kit für RHMI-Ressourcen, iDrive-Menü, Grafik und OAP-Lebenszyklus. Er passt die Staging-Kopie des Builders an den Store-Installationsweg an. Die proprietäre BMW SDK bleibt auf der jeweiligen MGU. Die Fahrzeugschnittstellen der App verwenden eine eigene lesende Implementierung.

`luxo-fonts.zip` enthält die mit `tools/vendor_fonts.py` gebackenen Barlow-Condensed-Glyphen für deutsche Menüs. Die SIL Open Font License ist im Archiv enthalten. [Barlow Condensed und Lizenz](https://github.com/google/fonts/tree/60824dce48f7dd28fe7d65559f2da1f6e04e585b/ofl/barlowcondensed)
