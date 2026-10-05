/**
 * Generates the evidence placeholder images used by the seed scenarios.
 *
 * These are deliberately abstract SVGs, not stock photographs. A demo that
 * shows a real crash photo implies the system analysed that photo; a labelled
 * placeholder is honest about what the seed data is.
 *
 * Run: node scripts/make-placeholders.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'uploads');

const BG = '#ECE8E1';
const GRID = '#DFD9CF';
const MARK = '#8A8276';
const LABEL = '#6E675C';
const TITLE = '#3A362F';
const OK = '#4F7A58';

const glyphs = {
  accident: `<path d="M-46 14 L-6 -14 M6 -14 L46 14" /><path d="M-18 -2 L18 -2" /><circle cx="0" cy="26" r="5" />`,
  flood: `<path d="M-52 -10 q13 -11 26 0 t26 0 t26 0" /><path d="M-52 8 q13 -11 26 0 t26 0 t26 0" /><path d="M-52 26 q13 -11 26 0 t26 0 t26 0" />`,
  tree: `<path d="M-46 28 L34 -22" /><path d="M-8 2 L-20 -18" /><path d="M10 -10 L2 -32" /><path d="M-28 14 L-42 -2" />`,
  leak: `<path d="M0 -30 q20 24 20 36 a20 20 0 0 1 -40 0 q0 -12 20 -36 z" /><path d="M-44 30 q44 10 88 0" />`,
  pothole: `<ellipse cx="0" cy="4" rx="46" ry="22" /><ellipse cx="-4" cy="2" rx="24" ry="11" /><path d="M-56 30 L56 30" />`,
  garbage: `<rect x="-42" y="-6" width="26" height="34" rx="8" /><rect x="-10" y="-18" width="26" height="46" rx="8" /><rect x="22" y="0" width="22" height="28" rx="7" />`,
  sewage: `<circle cx="0" cy="0" r="22" /><path d="M-40 18 q18 10 36 0 t36 0" /><path d="M-30 -26 q10 -8 20 0" />`,
  check: `<path d="M-30 2 L-10 22 L32 -22" />`,
};

const files = [
  ['sample-accident.svg', 'accident', 'Road accident', 'Sion Circle — citizen app'],
  ['sample-accident-2.svg', 'accident', 'Road accident', 'Sion Circle — social media'],
  ['sample-flood.svg', 'flood', 'Water-logging', 'Hindmata Junction'],
  ['sample-tree.svg', 'tree', 'Fallen branch', 'Central Avenue, Chembur'],
  ['sample-leak.svg', 'leak', 'Pipeline leak', 'Jawahar Road, Ghatkopar'],
  ['sample-pothole.svg', 'pothole', 'Pothole', 'Sion-Panvel Highway'],
  ['sample-garbage.svg', 'garbage', 'Garbage accumulation', 'Shivaji Nagar, Govandi'],
  ['sample-garbage-after.svg', 'check', 'After-evidence', 'Shivaji Nagar - cleared', true],
  ['sample-sewage.svg', 'sewage', 'Manhole overflow', 'Mankhurd Link Road'],
  ['sample-sewage-after.svg', 'sewage', 'After-evidence', 'Mankhurd - rejected'],
];

function svg(glyph, title, sub, tone) {
  const stroke = tone === true ? OK : MARK;
  const lines = [];
  for (let x = 40; x < 640; x += 40) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="420"/>`);
  for (let y = 40; y < 420; y += 40) lines.push(`<line x1="0" y1="${y}" x2="640" y2="${y}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420" role="img" aria-label="${title} placeholder">
  <rect width="640" height="420" fill="${BG}"/>
  <g stroke="${GRID}" stroke-width="1" opacity="0.7">${lines.join('')}</g>
  <rect x="0.5" y="0.5" width="639" height="419" fill="none" stroke="#D5CEC3"/>
  <g transform="translate(320,170)" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${glyphs[glyph]}</g>
  <text x="320" y="296" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12" letter-spacing="2" fill="${LABEL}">EVIDENCE PLACEHOLDER</text>
  <text x="320" y="324" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="17" font-weight="500" fill="${TITLE}">${title}</text>
  <text x="320" y="348" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13" fill="${LABEL}">${sub}</text>
</svg>`;
}

await mkdir(OUT, { recursive: true });
for (const [name, glyph, title, sub, tone] of files) {
  await writeFile(path.join(OUT, name), svg(glyph, title, sub, tone), 'utf8');
}
console.log(`Wrote ${files.length} placeholders to public/uploads`);
