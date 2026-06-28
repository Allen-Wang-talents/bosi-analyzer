/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 博思人才评荐网 - 铂金银金属质感主题 (Platinum Silver)
        bg: {
          base: '#F5F7FA',     // 主背景 - 浅金属灰
          card: '#FFFFFF',      // 卡片背景 - 纯白微反光
          elevated: '#FAFBFC',  // 高亮 UI - 微深
          input: '#FFFFFF',     // 输入框 - 纯白
        },
        fg: {
          DEFAULT: '#0F172A',   // 主文字 - 深石板色
          muted: '#64748B',     // 次要文字 - 中灰
          subtle: '#94A3B8',    // 弱化文字 - 浅灰
        },
        accent: {
          gold: '#C9A961',      // 金色 - 保留
          goldDim: '#A88B4A',
          goldGlow: 'rgba(201, 169, 97, 0.18)',
        },
        status: {
          red: '#EF4444',
          green: '#10B981',
          yellow: '#F59E0B',
          gray: '#6B7280',
        },
        border: {
          DEFAULT: 'rgba(15, 23, 42, 0.08)',   // 深色透明边框
          strong: 'rgba(15, 23, 42, 0.16)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        serif: ['"Noto Serif SC"', 'Source Han Serif SC', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 4px 16px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04)',  // 浅色背景下的柔和阴影
        glow: '0 0 24px rgba(201, 169, 97, 0.25)',
        ring: '0 0 0 1px rgba(201, 169, 97, 0.3)',
        metallic: '0 8px 32px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)',  // 金属光泽阴影
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
        'metallic-shine': {  // 金属光泽微动效
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'metallic-shine': 'metallic-shine 8s ease-in-out infinite',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #C9A961 0%, #E8D4A0 50%, #C9A961 100%)',
        'card-gradient': 'linear-gradient(135deg, #FFFFFF 0%, #FAFBFC 100%)',  // 卡片金属反光
        // 金属质感背景 - 多层渐变模拟拉丝金属
        'metallic-gradient': 'linear-gradient(135deg, #F5F7FA 0%, #E8EBF0 25%, #F5F7FA 50%, #DDE1E8 75%, #F5F7FA 100%)',
        'metallic-soft': 'linear-gradient(180deg, #F5F7FA 0%, #E8EBF0 100%)',
      },
    },
  },
  plugins: [],
}