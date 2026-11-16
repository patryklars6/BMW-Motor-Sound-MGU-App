# Language support

Open Settings → Interface → Language. The language names are always shown as **Türkçe**, **English**, and **Deutsch** so a user can recover from an unfamiliar language.

- **Automatic (vehicle language)** is the default. Turkish, English (UK/US), and German vehicle settings select the matching app language.
- Unsupported, invalid or unavailable vehicle language falls back to English. Automatic follows later vehicle language updates while the UI is open.
- A manual choice is saved using the existing app settings and overrides vehicle language. Selecting Automatic resumes following the vehicle.
- This changes only the app UI. The vehicle language, sound enable switch, profile mappings, levels and DSP are untouched.

The optional read-only `de.bmw.infotainment.vehicle.Vehicle.statusNewCurrentUnitsStatusExt` field supplies language. The adapter already clears fields on provider loss; notification-only language may remain valid while provider availability is confirmed. Head units without this interface still offer manual language and English fallback. Automatic language on actual vehicle hardware remains to be validated; host tests cover named/numeric values and transitions.

## Maintaining translations

`apps/patryklars6_motor_sound/translations.js` maps German UI text to `[English, Turkish]`. Keep semantic settings/group/navigation keys unchanged. Translation happens only when app-owned canvases draw text or native buttons receive a label; stored values and callbacks remain in the original key space. Include language in any new view's repaint cache.

Add new visible text to the catalog. Dynamic level/version messages and compound labels are handled in `i18n.js`. Model/brand names and numeric values stay unchanged. German is the original source text. Unknown source text is shown unchanged; translation coverage tests guard configurable UI labels.

The font baker includes German and Turkish glyphs in every label/bold size. To change its character set, run `python tools/vendor_fonts.py` with Pillow installed, then update `FONT_ATLAS_SHA256` in `tools/build_store.py` to the printed hash. Keep the Barlow Condensed OFL license in the atlas. No BMW font or SDK is bundled.

## Verification

```sh
node --test tests/*.test.js
python -m unittest discover -s tests -p 'test_*.py'
python tools/build_store.py
python tests/verify_package.py dist/patryklars6_motor_sound@0.2.0.tgz
```

Host tests cover auto/manual precedence, known BMW enums and locale names, fallback, invalidation, all screen/native label updates without sound mutation, reused-canvas isolation, unchanged navigation IDs, configurable-label coverage, and Turkish/German glyph coverage. Existing audio tests remain unchanged. No on-vehicle audio compatibility is implied by localization tests.
