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
          primary: '#070F2B',
          secondary: '#1B1A55',
          accent: '#535C91',
          accentLight: '#9290C3',
        },
        'brand-primary': '#070F2B',
        'brand-secondary': '#1B1A55',
        'brand-accent': '#535C91',
        'brand-accent-light': '#9290C3',
      },
      fontFamily: {
        heading: ['Inter', 'sans-serif'],
        body: ['"Noto Sans"', 'sans-serif'],
        sans: ['"Noto Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
