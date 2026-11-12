/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_PROPS } from '../ui/backdrop.js';
import { SCENE_THEMES } from '../ui/sceneTheme.js';

// Vitest blanks `?raw` CSS imports, so read the files directly (node types referenced above).
const readCss = (t: string): string =>
  readFileSync(new URL(`./themes/${t}.css`, import.meta.url), 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const themed = ['praca', 'gramado'] as const;

describe('theme stylesheets', () => {
  it('every non-default theme has a stylesheet scoped to its class', () => {
    for (const t of SCENE_THEMES.filter((t) => t !== 'taverna')) {
      expect(readCss(t)).toContain(`.theme-${t}`);
    }
  });
  it('never touch HUD or card selectors', () => {
    const banned = [
      '.score',
      '.mid-hud',
      '.vira',
      '.status',
      '.hand',
      '.action',
      '.bubble',
      '.tc',
      '.c ',
      '.bk',
      '.backs',
      '.pl',
      '.av',
      '.nm',
    ];
    for (const t of themed) {
      const css = stripComments(readCss(t));
      for (const b of banned) expect(css, `${t} uses ${b}`).not.toContain(b);
    }
  });
  it('leave the felt unfiltered so played cards stay crisp', () => {
    for (const t of themed) {
      expect(stripComments(readCss(t))).toMatch(
        new RegExp(`\\.theme-${t} \\.felt\\s*\\{[^}]*filter:\\s*none`),
      );
    }
  });
  it('style every prop in THEME_PROPS', () => {
    for (const t of themed) {
      const css = readCss(t);
      for (const p of THEME_PROPS[t])
        for (const cls of p.split(' ')) expect(css).toContain(`.${cls}`);
    }
  });
});
