'use strict';

const THEMES = {
    luxo: {
        label: 'LUXO', bg: '#151419', top: '#19171e', panel: '#211e27', raised: '#2a2532', line: '#443b52',
        text: '#f7f5fa', dim: '#c9c0d4', subdued: '#a79ab6', accent: '#c3a3f2', light: '#d4bff5',
        fill: '#30263e', wave: '#8067a1', waveSoft: '#40344c', hero: '#191522', ring: '#3b2d4c', track: '#534461'
    },
    mperformance: {
        label: 'M-Performance', bg: '#101725', top: '#142032', panel: '#1a293e', raised: '#22354d', line: '#3d5877',
        text: '#f0f7ff', dim: '#c2d5e8', subdued: '#8ea9c4', accent: '#90cbff', light: '#c4e6ff',
        fill: '#233951', wave: '#6cacd9', waveSoft: '#375879', hero: '#181f33', ring: '#314663', track: '#41617f',
        secondary: '#f26272'
    },
    orange: {
        label: 'Orange Sport', bg: '#0d0c0d', top: '#141213', panel: '#1a1719', raised: '#272021', line: '#443633',
        text: '#fcf8f5', dim: '#d1c6cb', subdued: '#a4979e', accent: '#ff8b24', light: '#ffb454',
        fill: '#4a250f', wave: '#ab5725', waveSoft: '#60311b', hero: '#191416', ring: '#50250f', track: '#514039'
    },
    ice_white: {
        label: 'Ice White', bg: '#f3f7fb', top: '#eaf2f9', panel: '#ffffff', raised: '#e6f0f8', line: '#bccfdf',
        text: '#18334a', dim: '#38546d', subdued: '#49647b', accent: '#1d6a91', light: '#124c72',
        fill: '#d4eaf8', wave: '#5296bd', waveSoft: '#9bc6e2', hero: '#e5f2fb', ring: '#b5d9ee', track: '#abc8dd'
    }
};

function themeFor(id) {
    return Object.prototype.hasOwnProperty.call(THEMES, id) ? THEMES[id] : THEMES.luxo;
}

function kitTheme(t) {
    return {
        name: t.label, bg: t.bg, panelTop: t.raised, panelBottom: t.panel, panelEdge: t.line,
        tab: t.text, track: t.track, tick: t.subdued, text: t.text, dim: t.dim,
        accent: t.accent, accent2: t.secondary || t.light, ok: t.accent, sel: t.accent, selText: t.text,
        stripes: [t.accent, t.secondary || t.accent], bar: t.accent
    };
}

module.exports = { THEMES, themeFor, kitTheme };
