"""Small, checked adaptations of the pinned App Kit for LUXO's single canvas."""


def replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError("Unexpected App Kit source: " + old[:100])
    return source.replace(old, new)


def patch_runtime(runtime):
    file = runtime / "display.js"
    source = file.read_text(encoding="utf-8")
    source = replace_once(source,
        "Promise.resolve(this.ui.close(this.screen.name)).catch((e) => this.log.warn('back: ' + e));",
        "Promise.resolve(this.onBack ? this.onBack() : this.ui.close(this.screen.name)).catch((e) => this.log.warn('back: ' + e));")
    source = replace_once(source,
        "const native = this.screen.chrome !== false && process.env.MGU_RENDERD_PROTO !== 'upstream';",
        "const native = process.env.MGU_RENDERD_PROTO !== 'upstream';")
    source = replace_once(source,
        "this.layout() === 'full' && g.screen.w === h.screen.w && g.screen.h === h.screen.h);",
        "this.layout() === 'full' && g.screen.w >= 800 && g.screen.h >= 400);")
    source = replace_once(source,
        "        HMI = geometryFor(scr);\n        let pl;",
        """        HMI = geometryFor(scr);
        // A custom canvas still speaks mgu-render/1. Use the renderer's real
        // surface size, retain BMW's back/status area and use spare height.
        if (v === 'full' && this.gpu.native && scr.w >= 800 && scr.h >= 400) {
            const supplied = this.gpu.area;
            const left = Math.round(84 * scr.w / 1920);
            const top = Math.round(80 * scr.h / 720);
            const validArea = supplied && supplied.x >= 0 && supplied.y >= 0 && supplied.w > 0 && supplied.h > 0
                && supplied.x + supplied.w <= scr.w && supplied.y + supplied.h <= scr.h;
            const a = validArea ? supplied : { x: left, y: top, w: scr.w - left, h: scr.h - top };
            const scale = Math.min(a.w / 1600, a.h / 520);
            this.place = { x: 0, y: 0, w: scr.w, h: scr.h, full: true, scale,
                ox: a.x + (a.w - 1600 * scale) / 2, oy: a.y,
                extra: Math.max(0, Math.floor(a.h / scale - 520)) };
            this.gpu.place(this.place);
            this._grab();
            this._hmiBar();
            this.recorders.clear();
            this.app = null;
            this.lastWords = null;
            const key = JSON.stringify([this.place, this.own()]);
            if (key !== this.layoutKey) { this.layoutKey = key; this._layoutChanged(); }
            return;
        }
        let pl;""")
    source = replace_once(source,
        "        const pl = this.place;\n        const logical = (q)",
        """        const pl = this.place;
        if (this.own()) {
            this.tabs = [];
            this.gpu.claim([{ x: 0, y: 0, w: 1600, h: 520 + (pl.extra || 0) }]);
            return;
        }
        const logical = (q)""")
    source = replace_once(source,
        "        if (!this.sheet) { this.pageTargets = r.targets || []; this.pageScroll = r.scroll && typeof r.scroll === 'object' ? r.scroll : !!r.scroll; }",
        """        if (!this.sheet) { this.pageTargets = r.targets || []; this.pageScroll = r.scroll && typeof r.scroll === 'object' ? r.scroll : !!r.scroll; }
        if (this.own() && !r.chrome && this.focusKey) {
            const focused = this.pageTargets.find(q => 'tgt:' + q.key === this.focusKey);
            if (focused) r.strokeRoundRect(focused.x + 2, focused.y + 2, focused.w - 4, focused.h - 4,
                8, 2, this.theme().accent);
        }""")
    source = replace_once(source,
        "        this.lastWords = null;\n        if (!this.app || !this.active() || !this.place.full) return;",
        """        this.lastWords = null;
        if (!this.app && this.active() && this.screen.chrome === false) {
            this._layoutChanged();
            this.tickHandlers.forEach(fn => fn());
            return;
        }
        if (!this.app || !this.active() || !this.place.full) return;""")
    file.write_text(source, encoding="utf-8")

    file = runtime / "mgu.js"
    source = file.read_text(encoding="utf-8")
    # LUXO has its own native paginated settings. Avoid binding hundreds of
    # nonexistent SET_* widgets and retain every existing data/settings.json key.
    source = replace_once(source,
        "await step('settings screen', wireSettings(ctx), 3000);",
        "if (!SPEC.config || !SPEC.config.nativeSettings) await step('settings screen', wireSettings(ctx), 3000);")
    # The old kit reset the theme as a migration unrelated to this app.
    source = replace_once(source, "if (th && this.values._themeV !== 2) {", "if (false && th && this.values._themeV !== 2) {")
    file.write_text(source, encoding="utf-8")
