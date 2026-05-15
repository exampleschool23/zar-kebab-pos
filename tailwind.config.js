/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#ff5a00',
          light: '#ff7a30',
          dark: '#cc4800',
        }
      }
    },
  },
  plugins: [],
}
