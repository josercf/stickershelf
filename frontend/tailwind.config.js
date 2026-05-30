/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Rubik', 'system-ui', 'sans-serif'],
        body: ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        trait: {
          openness: '#3b82f6',      // Blue
          conscientiousness: '#10b981', // Green
          extraversion: '#f59e0b',   // Yellow/Orange
          agreeableness: '#f97316',  // Orange
          neuroticism: '#ef4444',    // Red
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in',
        'slide-up': 'slideUp 0.5s ease-out',
        'audioBar1': 'audioBar1 0.8s ease-in-out infinite',
        'audioBar2': 'audioBar2 0.6s ease-in-out infinite 0.2s',
        'audioBar3': 'audioBar3 0.7s ease-in-out infinite 0.1s',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        audioBar1: {
          '0%, 100%': { height: '30%' },
          '50%': { height: '100%' },
        },
        audioBar2: {
          '0%, 100%': { height: '50%' },
          '50%': { height: '80%' },
        },
        audioBar3: {
          '0%, 100%': { height: '40%' },
          '50%': { height: '90%' },
        },
      }
    },
  },
  plugins: [],
}

