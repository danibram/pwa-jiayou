/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: token('paper'),
        surface: token('surface'),
        raised: token('raised'),
        ink: {
          DEFAULT: token('ink'),
          soft: token('ink-soft'),
          faint: token('ink-faint'),
        },
        line: token('line'),
        seal: {
          DEFAULT: token('seal'),
          soft: token('seal-soft'),
        },
        jade: {
          DEFAULT: token('jade'),
          soft: token('jade-soft'),
        },
        gold: token('gold'),
        tone: {
          1: token('tone-1'),
          2: token('tone-2'),
          3: token('tone-3'),
          4: token('tone-4'),
          5: token('tone-5'),
        },
      },
      fontFamily: {
        // Kai matches the handwritten stroke shapes learners copy; Song does not.
        hanzi: ['"WenKai HSK"', '"Kaiti SC"', 'STKaiti', 'KaiTi', 'serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Figtree', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        card: '1.75rem',
        tile: '1.125rem',
      },
      boxShadow: {
        card: 'inset 0 1px 0 rgb(255 255 255 / 0.04), 0 1px 0 rgb(var(--ink) / 0.04), 0 12px 32px -12px rgb(var(--shadow) / 0.28), 0 2px 6px -2px rgb(var(--shadow) / 0.12)',
        lift: '0 1px 0 rgb(var(--ink) / 0.04), 0 6px 18px -8px rgb(var(--shadow) / 0.3)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        rise: 'rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        pop: 'pop 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
        fade: 'fade 0.3s ease-out both',
        nudge: 'nudge 1.2s ease-in-out 2',
        shake: 'shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
      },
      keyframes: {
        rise: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pop: {
          '0%': { transform: 'scale(0.98)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        nudge: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.08)' },
        },
        shake: {
          '10%, 90%': { transform: 'translateX(-1px)' },
          '20%, 80%': { transform: 'translateX(3px)' },
          '30%, 50%, 70%': { transform: 'translateX(-5px)' },
          '40%, 60%': { transform: 'translateX(5px)' },
        },
      },
    },
  },
  plugins: [],
};
