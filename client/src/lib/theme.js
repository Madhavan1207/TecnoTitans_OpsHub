import { DEFAULT_THEME } from '@shared/registry.js';

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const parse = (hex) => { const h = (hex || '#000000').replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0); };
const toHex = (rgb) => `#${rgb.map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
/** mix(a, b, pct) -> pct% of a over b */
export const mix = (a, b, pct) => { const A = parse(a); const B = parse(b); return toHex(A.map((v, i) => v * (pct / 100) + B[i] * (1 - pct / 100))); };
export const luminance = (hex) => { const [r, g, b] = parse(hex).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const readableOn = (hex) => (luminance(hex) > 0.42 ? '#0D1621' : '#FFFFFF');

const FONTS = {
  grotesk: "'Space Grotesk', system-ui, sans-serif",
  serif: "'Fraunces', Georgia, serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

/** Turn a site theme object into CSS custom properties. This is the whole "theme engine". */
export function themeVars(theme) {
  const t = { ...DEFAULT_THEME, ...(theme || {}) };
  const hard = t.shadow === 'hard';
  const soft = t.shadow === 'soft';
  const lineStrong = hard ? t.ink : mix(t.ink, t.surface, 22);
  const body = FONTS[t.font] || FONTS.grotesk;
  const display = t.heading === 'display' ? "'Staatliches', 'Arial Narrow', Impact, sans-serif" : body;
  return {
    '--bg': t.bg, '--surface': t.surface, '--ink': t.ink,
    '--muted': mix(t.ink, t.bg, 58), '--line': mix(t.ink, t.surface, 14), '--line-strong': lineStrong,
    '--primary': t.primary, '--primary-ink': readableOn(t.primary), '--accent': t.accent, '--soft': mix(t.primary, t.surface, 13),
    '--radius': `${t.radius}px`, '--bw': hard ? '2px' : '1px',
    '--shadow': hard ? `4px 4px 0 ${t.accent}` : soft ? '0 8px 28px rgba(16,40,36,.09)' : 'none',
    '--shadow-sm': hard ? `2px 2px 0 ${lineStrong}` : soft ? '0 1px 2px rgba(16,40,36,.10)' : 'none',
    '--font-body': body, '--font-display': display,
    '--heading-tracking': t.heading === 'display' ? '0.04em' : '-0.01em',
    '--heading-transform': t.heading === 'display' ? 'uppercase' : 'none',
    '--heading-weight': t.heading === 'display' ? 400 : 700,
    '--pad': t.density === 'compact' ? '.75rem' : '1rem',
    colorScheme: luminance(t.bg) < 0.3 ? 'dark' : 'light',
  };
}

export const THEME_PRESETS = [
  { name: 'Electrolyte', theme: { mode: 'light', primary: '#FFDD0A', accent: '#1D4FB5', bg: '#F4F1E8', surface: '#FFFFFF', ink: '#0D1621', radius: 4, shadow: 'hard', font: 'grotesk', heading: 'display' } },
  { name: 'Clinic teal', theme: { mode: 'light', primary: '#0E9F8E', accent: '#E4572E', bg: '#F2F7F6', surface: '#FFFFFF', ink: '#10302C', radius: 14, shadow: 'soft', font: 'serif', heading: 'normal' } },
  { name: 'Night violet', theme: { mode: 'dark', primary: '#8B5CF6', accent: '#22D3EE', bg: '#12101F', surface: '#1C1930', ink: '#EDEBFA', radius: 10, shadow: 'flat', font: 'mono', heading: 'normal' } },
  { name: 'Forest', theme: { mode: 'light', primary: '#16A34A', accent: '#CA8A04', bg: '#F3F6F0', surface: '#FFFFFF', ink: '#14281B', radius: 8, shadow: 'soft', font: 'grotesk', heading: 'normal' } },
  { name: 'Slate dark', theme: { mode: 'dark', primary: '#F59E0B', accent: '#38BDF8', bg: '#0F172A', surface: '#1E293B', ink: '#E2E8F0', radius: 8, shadow: 'flat', font: 'grotesk', heading: 'display' } },
  { name: 'Crimson', theme: { mode: 'light', primary: '#DC2626', accent: '#0D1621', bg: '#FAF5F4', surface: '#FFFFFF', ink: '#2A1210', radius: 2, shadow: 'hard', font: 'grotesk', heading: 'display' } },
];
