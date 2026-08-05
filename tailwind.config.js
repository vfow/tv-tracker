/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './templates/**/*.html',
    './static/js/**/*.js'
  ],
  prefix: 'tw-',
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      colors: {
        tt: {
          bg: '#000000',
          surface: '#080808',
          panel: '#0b0b0b',
          panelEnd: '#070707',
          line: '#222222',
          control: '#111111',
          controlHover: '#181818',
          controlText: '#888888',
          raised: '#111111',
          hover: '#141414',
          border: '#242424',
          borderStrong: '#383838',
          text: '#ffffff',
          muted: '#9a9a9a',
          subtle: '#777777',
          dim: '#555555',
          success: '#22c55e',
          gold: '#FFD400',
          blue: '#0b4a8f',
          blueHover: '#1262b8',
          blueBorder: '#1d6fd1',
          blueText: '#dbeafe',
          danger: '#ffb8b8',
          dangerBg: '#210d0d',
          dangerBorder: '#632626',
          notice: '#b8ffd0',
          noticeBg: '#0d2114',
          noticeBorder: '#285c39'
        }
      },
      fontFamily: {
        league: ['"League Gothic"', 'Arial', 'sans-serif'],
        sans: ['Arial', 'Helvetica', 'sans-serif']
      },
      spacing: {
        sidebar: '160px',
        'mobile-nav': '64px'
      },
      boxShadow: {
        'tt-elevated': '0 25px 70px rgba(0,0,0,.62)'
      }
    }
  },
  plugins: []
};
