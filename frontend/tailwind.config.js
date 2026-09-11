/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        maroon: '#7A0C1A',
        haldi: '#FFB300',
        teal: { DEFAULT: '#0B6E5F' },
        night: '#0F0510',
        gulal: '#E91E63',
      },
      fontFamily: { display: ['Poppins', 'system-ui', 'sans-serif'] },
      animation: {
        sway: 'sway 4s ease-in-out infinite',
        floaty: 'floaty 6s ease-in-out infinite',
        diya: 'diya 2.4s ease-in-out infinite',
      },
      keyframes: {
        sway: { '0%,100%': { transform: 'rotate(-2deg)' }, '50%': { transform: 'rotate(2deg)' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
        diya: { '0%,100%': { opacity: 0.7 }, '50%': { opacity: 1 } },
      },
    },
  },
  plugins: [],
};
