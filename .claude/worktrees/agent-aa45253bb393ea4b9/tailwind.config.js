/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'app-bg': '#0A0A0F',
        surface: '#13131A',
        'surface-raised': '#1C1C26',
        'app-border': '#2A2A38',
        primary: '#E8E8F0',
        secondary: '#8888A0',
        accent: '#4F6EF7',
        'confidence-high': '#22C55E',
        'confidence-medium': '#F59E0B',
        'confidence-low': '#6B7280',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
