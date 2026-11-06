import { chairPosition, type Anchor } from './layout.js';
import { el } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  for (const child of children) node.append(child);
  return node;
}

/** Top-down bar table: wood top, checkered cloth patch, bottles, glasses, bowl of peanuts. */
function tableSvg(): SVGSVGElement {
  const defs = svg('defs', {}, [
    svg('pattern', { id: 'cloth', width: 16, height: 16, patternUnits: 'userSpaceOnUse' }, [
      svg('rect', { width: 16, height: 16, fill: '#f4ead2' }),
      svg('rect', { width: 8, height: 8, fill: '#c0392b' }),
      svg('rect', { x: 8, y: 8, width: 8, height: 8, fill: '#c0392b' }),
    ]),
    svg('linearGradient', { id: 'wood', x1: 0, y1: 0, x2: 1, y2: 1 }, [
      svg('stop', { offset: 0, 'stop-color': '#8b5a2b' }),
      svg('stop', { offset: 1, 'stop-color': '#5a3a1f' }),
    ]),
  ]);

  const grain: SVGElement[] = [];
  for (let y = 18; y < 240; y += 22) {
    grain.push(
      svg('path', {
        d: `M6 ${y} Q100 ${y - 4} 194 ${y + 2}`,
        stroke: '#3d2713',
        'stroke-opacity': 0.35,
        'stroke-width': 1,
        fill: 'none',
      }),
    );
  }

  const bottle = (x: number, y: number, body: string): SVGElement =>
    svg('g', {}, [
      svg('circle', { cx: x, cy: y, r: 7, fill: body, stroke: '#0f2a1b', 'stroke-width': 1 }),
      svg('circle', { cx: x, cy: y, r: 3, fill: '#d9b24a' }),
      svg('circle', { cx: x - 2, cy: y - 2, r: 1.5, fill: '#fff', 'fill-opacity': 0.5 }),
    ]);

  const glass = (x: number, y: number): SVGElement =>
    svg('g', {}, [
      svg('circle', { cx: x, cy: y, r: 8, fill: '#f5b631', 'fill-opacity': 0.55 }),
      svg('circle', { cx: x, cy: y, r: 8, fill: 'none', stroke: '#fff', 'stroke-opacity': 0.7 }),
      svg('circle', { cx: x - 2, cy: y - 3, r: 2, fill: '#fff', 'fill-opacity': 0.6 }),
    ]);

  const nuts: SVGElement[] = [
    [0, 0],
    [5, -3],
    [-4, 4],
    [3, 5],
    [-5, -4],
  ].map(([dx = 0, dy = 0]) =>
    svg('ellipse', { cx: 30 + dx, cy: 212 + dy, rx: 3, ry: 2, fill: '#c98d4b', stroke: '#8b5a2b' }),
  );
  const bowl = svg('g', {}, [
    svg('circle', {
      cx: 30,
      cy: 212,
      r: 15,
      fill: '#e8dcc0',
      stroke: '#8c7b58',
      'stroke-width': 2,
    }),
    svg('circle', { cx: 30, cy: 212, r: 11, fill: '#6b4a2a' }),
    ...nuts,
  ]);

  return svg(
    'svg',
    {
      class: 'scene-table-svg',
      viewBox: '0 0 200 240',
      preserveAspectRatio: 'xMidYMid meet',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    [
      defs,
      svg('rect', {
        x: 2,
        y: 6,
        width: 196,
        height: 234,
        rx: 26,
        fill: '#000',
        'fill-opacity': 0.35,
      }),
      svg('rect', { x: 2, y: 2, width: 196, height: 234, rx: 26, fill: 'url(#wood)' }),
      ...grain,
      svg('rect', {
        x: 2,
        y: 2,
        width: 196,
        height: 234,
        rx: 26,
        fill: 'none',
        stroke: '#2b1a0c',
        'stroke-width': 4,
      }),
      svg('rect', {
        x: 28,
        y: 36,
        width: 144,
        height: 166,
        rx: 8,
        fill: 'url(#cloth)',
        'fill-opacity': 0.92,
      }),
      svg('rect', {
        x: 28,
        y: 36,
        width: 144,
        height: 166,
        rx: 8,
        fill: 'none',
        stroke: '#7a1f15',
        'stroke-width': 2,
      }),
      bottle(168, 24, '#1f5d3a'),
      bottle(150, 18, '#2c7a4b'),
      glass(24, 24),
      glass(176, 216),
      glass(160, 222),
      bowl,
    ],
  );
}

/** String of bulbs along the top edge. */
function lightsSvg(): SVGSVGElement {
  const colours = ['#f5b631', '#c0392b', '#ffd36b', '#2c7a4b'];
  const bulbs: SVGElement[] = [];
  for (let i = 0; i < 10; i++) {
    const x = 20 + i * 40;
    const y = 14 + Math.sin((i / 9) * Math.PI) * 4;
    bulbs.push(
      svg('circle', {
        class: 'bulb',
        cx: x,
        cy: y + 6,
        r: 4.5,
        fill: colours[i % colours.length] ?? '#f5b631',
        style: `animation-delay:${(i % 4) * 0.4}s`,
      }),
    );
  }
  return svg(
    'svg',
    {
      class: 'scene-lights',
      viewBox: '0 0 400 32',
      preserveAspectRatio: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    [
      svg('path', {
        d: 'M0 4 Q200 28 400 4',
        stroke: '#1a110a',
        'stroke-width': 1.5,
        fill: 'none',
      }),
      ...bulbs,
    ],
  );
}

export function renderScene(): { root: HTMLElement; tableArea: HTMLElement } {
  const root = el('div', 'scene');
  const tv = el('div', 'scene-tv');
  tv.setAttribute('aria-hidden', 'true');
  const sign = el('div', 'scene-sign');
  sign.append(el('span', 'scene-neon', 'BOTECO DO ZÉ'));
  const tableArea = el('div', 'table-area');
  const tableWrap = el('div', 'scene-table');
  tableWrap.append(tableSvg());
  tableArea.append(tableWrap);
  root.append(tv, lightsSvg(), sign, tableArea);
  return { root, tableArea };
}

/** Positions a chair (or any seat-anchored element) inside the table area. */
export function placeAtAnchor(node: HTMLElement, anchor: Anchor): void {
  const { x, y, angle } = chairPosition(anchor);
  node.style.left = `${x}%`;
  node.style.top = `${y}%`;
  node.style.setProperty('--angle', `${angle}deg`);
}

export interface ChairOptions {
  seat: number;
  name: string;
  team: 0 | 1;
  mine: boolean;
  connected: boolean;
  active: boolean;
}

export function renderChair(anchor: Anchor, opts: ChairOptions): HTMLElement {
  const chair = el('div', `chair anchor-${anchor} team-${opts.team}`);
  chair.dataset.seat = String(opts.seat);
  if (opts.mine) chair.classList.add('mine');
  if (opts.active) chair.classList.add('turn');
  if (!opts.connected) chair.classList.add('away');
  const tag = el('span', 'chair-tag', opts.name);
  tag.title = opts.name;
  chair.append(el('span', 'chair-seat'), el('span', 'chair-back'), tag);
  placeAtAnchor(chair, anchor);
  return chair;
}
