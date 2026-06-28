/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 博思人才评荐网 - 深海军蓝 + 金色主题
        bg: {
          base: '#0B1B2B',
          card: '#142840',
          elevated: '#1A3050',
          input: '#0F2238',
        },
        fg: {
          DEFAULT: '#E8EEF5',
          muted: '#94A3B8',
          subtle: '#64748B',
        },
        accent: {
          gold: '#C9A961',
          goldDim: '#A88B4A',
          goldGlow: 'rgba(201, 169, 97, 0.15)',
        },
        status: {
          red: '#EF4444',
          green: '#10B981',
          yellow: '#F59E0B',
          gray: '#6B7280',
        },
        border: {
          DEFAULT: 'rgba(201, 169, 97, 0.15)',
          strong: 'rgba(201, 169, 97, 0.3)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        serif: ['"Noto Serif SC"', 'Source Han Serif SC', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 4px 16px rgba(0, 0, 0, 0.25)',
        glow: '0 0 24px rgba(201, 169, 97, 0.2)',
        ring: '0 0 0 1px rgba(201, 169, 97, 0.3)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(-8px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #C9A961 0%, #E8D4A0 50%, #C9A961 100%)',
        'card-gradient': 'linear-gradient(135deg, #142840 0%, #0F2238 100%)',
      },
    },
  },
  plugins: [],
}