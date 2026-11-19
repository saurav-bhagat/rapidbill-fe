/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        sunken: 'rgb(var(--sunken) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: {
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          hover: 'rgb(var(--primary-hover) / <alpha-value>)',
          soft: 'rgb(var(--primary-soft) / <alpha-value>)',
        },
        warn: { DEFAULT: 'rgb(var(--warn) / <alpha-value>)', soft: 'rgb(var(--warn-soft) / <alpha-value>)' },
        danger: { DEFAULT: 'rgb(var(--danger) / <alpha-value>)', soft: 'rgb(var(--danger-soft) / <alpha-value>)' },
        ok: { DEFAULT: 'rgb(var(--ok) / <alpha-value>)', soft: 'rgb(var(--ok-soft) / <alpha-value>)' },
        highlight: 'rgb(var(--highlight) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: { xs: ['11px', '16px'], sm: ['12px', '16px'], base: ['13px', '20px'], lg: ['15px', '22px'], xl: ['18px', '24px'], '2xl': ['24px', '30px'], '3xl': ['32px', '38px'] },
      borderRadius: { DEFAULT: '4px', md: '6px', lg: '8px' },
      boxShadow: { float: '0 8px 24px rgb(28 27 24 / 0.14), 0 1px 3px rgb(28 27 24 / 0.1)' },
    },
  },
  plugins: [],
}
