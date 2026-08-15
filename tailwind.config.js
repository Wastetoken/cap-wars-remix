/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
          'void': '#0b0906',
          'stone': '#181209',
          'stone-panel': '#211a10',
          'stone-input': '#2b2114',
          'stone-border': '#3c2f1c',
          'ember': '#e6923f',
          'spell': '#8cff5c',
          'spell-dim': '#4f8a2e',
          'parchment': '#ece3d2',
          'ash': '#948a76',
      },
      fontFamily: {
          'display': ['Cinzel', 'serif'],
          'body': ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
