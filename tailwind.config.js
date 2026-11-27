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
        heading: 'rgb(var(--heading) / <alpha-value>)',
        section: 'rgb(var(--section) / <alpha-value>)',
        chart: { DEFAULT: 'rgb(var(--chart) / <alpha-value>)', current: 'rgb(var(--chart-current) / <alpha-value>)' },
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
        nav: { DEFAULT: 'rgb(var(--nav) / <alpha-value>)', hover: 'rgb(var(--nav-hover) / <alpha-value>)', active: 'rgb(var(--nav-active) / <alpha-value>)' },
        offer: 'rgb(var(--offer) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', '"IBM Plex Sans"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      // Larger and calmer than before (body was 13px). The A- / A+ control in the top bar scales all of it.
      fontSize: { xs: ['12px', '16px'], sm: ['13px', '18px'], base: ['14px', '20px'], lg: ['16px', '24px'], xl: ['18px', '26px'], '2xl': ['22px', '28px'], '3xl': ['28px', '34px'] },
      borderRadius: { DEFAULT: '6px', md: '8px', lg: '10px', xl: '14px' },
      boxShadow: { float: '0 12px 36px rgb(64 90 121 / 0.14), 0 2px 6px rgb(64 90 121 / 0.06)', card: '0 2px 8px rgb(64 90 121 / 0.035)' },
    },
  },
  plugins: [],
}
