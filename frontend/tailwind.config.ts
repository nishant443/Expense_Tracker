import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        background: token('background'),
        foreground: token('foreground'),
        surface: token('surface'),
        elevated: token('elevated'),
        border: token('border'),
        input: token('border'),
        ring: token('primary'),
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground'), soft: token('primary-soft') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        // shadcn aliases
        card: { DEFAULT: token('surface'), foreground: token('foreground') },
        popover: { DEFAULT: token('elevated'), foreground: token('foreground') },
        accent: { DEFAULT: token('muted'), foreground: token('foreground') },
        destructive: { DEFAULT: token('danger'), foreground: '255 255 255' },
        secondary: { DEFAULT: token('muted'), foreground: token('foreground') },
      },
      borderRadius: {
        sm: '10px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.04)',
        lift: '0 8px 24px -8px rgb(16 24 40 / 0.12), 0 2px 6px rgb(16 24 40 / 0.04)',
        fab: '0 10px 25px -5px rgb(37 99 235 / 0.45), 0 4px 10px -4px rgb(37 99 235 / 0.4)',
      },
      fontSize: {
        display: ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.03em', fontWeight: '700' }],
        title: ['1.125rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em', fontWeight: '600' }],
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
      },
      screens: { xs: '380px' },
    },
  },
  plugins: [animate],
} satisfies Config;
