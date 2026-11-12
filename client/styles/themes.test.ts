/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_PROPS } from '../ui/backdrop.js';
import { SCENE_THEMES, type SceneTheme } from '../ui/sceneTheme.js';

// Vitest blanks `?raw` CSS imports, so read the files directly (node types referenced above).
const readCss = (t: string): string =>
  readFileSync(new URL(`./themes/${t}.css`, import.meta.url), 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const themed = ['praca', 'gramado'] as const satisfies readonly SceneTheme[];

const BASE_CLASSES = [
  'backdrop',
  'props',
  'rugc',
  'chair',
  't1',
  't2',
  'mine',
  'away',
  'rim',
  'felt',
  'fring',
  'glow',
];

/** Splits on commas that are not inside parentheses. */
function splitTopLevel(sel: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim());
}

/** Last compound of a selector: the text after the final top-level combinator. */
function lastCompound(sel: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel.charAt(i);
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && /[\s>+~]/.test(ch)) start = i + 1;
  }
  return sel.slice(start);
}

/**
 * Selector allowlist for a theme stylesheet: every selector is scoped to `.v1.theme-<t>`, targets
 * only scenery classes, the bare root rule declares custom properties only, and the felt is never
 * filtered. Returns human-readable violations (empty when clean).
 */
function checkThemeCss(css: string, t: SceneTheme): string[] {
  const out: string[] = [];
  const allowed = new Set([...BASE_CLASSES, ...THEME_PROPS[t].flatMap((p) => p.split(' '))]);
  const scope = new RegExp(`^\\.v1\\.theme-${t}(\\s|$|::?)`);
  let felt = false;
  let feltNone = false;
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = (m[2] ?? '')
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d): [string, string] => {
        const i = d.indexOf(':');
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
      });
    for (const sel of splitTopLevel(m[1] ?? '')) {
      if (!scope.test(sel)) {
        out.push(`out of scope selector: ${sel}`);
        continue;
      }
      const rest = sel.slice(`.v1.theme-${t}`.length);
      for (const cls of rest.matchAll(/\.([\w-]+)/g))
        if (!allowed.has(cls[1] ?? '')) out.push(`class .${cls[1]} not allowed: ${sel}`);
      const residue = rest
        .replace(/\.[\w-]+/g, '')
        .replace(/::?(before|after)\b/g, '')
        .replace(/:is\(/g, '')
        .replace(/[\s>+~,()]/g, '');
      if (residue) out.push(`unexpected syntax "${residue}": ${sel}`);
      if (rest === '') {
        for (const [prop] of decls)
          if (!prop.startsWith('--')) out.push(`root rule sets ${prop}: ${sel}`);
      }
      const last = lastCompound(rest);
      if (/\.felt\b/.test(last) && !last.includes('::')) {
        felt = true;
        for (const [prop, val] of decls)
          if (prop === 'filter') {
            if (val === 'none') feltNone = true;
            else out.push(`felt filter must be none: ${sel}`);
          }
      }
    }
  }
  if (!felt || !feltNone) out.push('no felt rule sets filter: none');
  return out;
}

describe('theme CSS checker self-tests', () => {
  const cases: [string, RegExp][] = [
    ['.v1 .rim{}', /out of scope/],
    ['.v1.theme-praca .table{filter:x}', /not allowed/],
    ['.v1.theme-praca{filter:x}', /root/],
    ['.v1.theme-praca .c{}', /not allowed/],
    ['.v1.theme-praca .felt{filter:var(--grade)}', /felt filter must be none/],
  ];
  for (const [css, re] of cases)
    it(`rejects ${css}`, () => {
      expect(checkThemeCss(css, 'praca').join('|')).toMatch(re);
    });
});

describe('theme stylesheets', () => {
  it('every non-default theme has a stylesheet scoped to its class', () => {
    for (const t of SCENE_THEMES.filter((t) => t !== 'taverna')) {
      expect(readCss(t)).toContain(`.theme-${t}`);
    }
  });
  it('only target scenery through scoped selectors, and keep the felt unfiltered', () => {
    for (const t of themed) expect(checkThemeCss(readCss(t), t), t).toEqual([]);
  });
  it('style every prop in THEME_PROPS', () => {
    for (const t of themed) {
      const css = readCss(t);
      for (const p of THEME_PROPS[t])
        for (const cls of p.split(' ')) expect(css).toContain(`.${cls}`);
    }
  });
});
