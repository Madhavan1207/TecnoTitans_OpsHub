/** Colours read CSS variables so ONE codebase can wear a different theme per site. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}', '../shared/**/*.js'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)', bg: 'var(--bg)', surface: 'var(--surface)', muted: 'var(--muted)', line: 'var(--line)',
        primary: 'var(--primary)', 'primary-ink': 'var(--primary-ink)', accent: 'var(--accent)', soft: 'var(--soft)',
        navy: '#0D1621', volt: '#FFDD0A', cobalt: '#1D4FB5', paper: '#F4F1E8',
        ok: '#16A34A', warn: '#D97706', bad: '#DC2626',
      },
      fontFamily: { display: 'var(--font-display)', body: 'var(--font-body)', mono: 'var(--font-mono)' },
      borderRadius: { theme: 'var(--radius)' },
    },
  },
  plugins: [],
};
