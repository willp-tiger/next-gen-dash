/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  safelist: [
    'grid-cols-2',
    'grid-cols-3',
    'grid-cols-4',
    'md:grid-cols-2',
    'md:grid-cols-3',
    'md:grid-cols-4',
    'lg:grid-cols-2',
    'lg:grid-cols-3',
    'lg:grid-cols-4',
    'lg:ml-60',
    'lg:ml-[68px]',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        navy: {
          DEFAULT: 'hsl(210, 50%, 16%)',
          50: 'hsl(210, 40%, 96%)',
          100: 'hsl(210, 35%, 91%)',
          200: 'hsl(210, 30%, 80%)',
          300: 'hsl(210, 30%, 65%)',
          400: 'hsl(210, 35%, 45%)',
          500: 'hsl(210, 40%, 30%)',
          600: 'hsl(210, 45%, 22%)',
          700: 'hsl(210, 50%, 16%)',
          800: 'hsl(210, 55%, 12%)',
          900: 'hsl(210, 60%, 8%)',
        },
        accent: {
          DEFAULT: 'hsl(200, 85%, 40%)',
          light: 'hsl(200, 85%, 55%)',
          dark: 'hsl(200, 85%, 30%)',
        },
        healthy: '#10b981',
        warning: '#f59e0b',
        critical: '#ef4444',
      },
    },
  },
  plugins: [],
};
