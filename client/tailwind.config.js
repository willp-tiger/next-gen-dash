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
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        healthy: '#10b981',
        warning: '#f59e0b',
        critical: '#ef4444',
      },
    },
  },
  plugins: [],
};
