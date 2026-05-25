/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f2f0eb',
        'canvas-2': '#edebe9',
        'house-green': '#1e3932',
        'brand-green': '#006241',
        'accent-green': '#00754a',
        gold: '#cba258',
        danger: '#c82014',
        card: '#ffffff',
        panel: '#fbfaf7'
      }
    }
  },
  plugins: []
}
